import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { redis } from "@/lib/redis";

type Heartbeat = {
  workerId: string;
  lastHeartbeat: string;
  activeJobs?: number;
  status?: string;
};

const HEARTBEAT_PATTERN = "codeforge:worker-heartbeat:*";

function projectRoot() {
  return process.env.npm_config_local_prefix ?? process.cwd();
}

function spawnNpmRun(script: string, opts: { cwd: string; env: NodeJS.ProcessEnv; stdio: "inherit" }): ChildProcess {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/d", "/s", "/c", `npm run ${script}`], {
      cwd: opts.cwd,
      env: opts.env,
      stdio: opts.stdio,
      shell: false,
    });
  }

  return spawn("npm", ["run", script], {
    cwd: opts.cwd,
    env: opts.env,
    stdio: opts.stdio,
    shell: false,
  });
}

function spawnNpmRunSync(script: string, opts: { cwd: string; stdio: "inherit" }) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/s", "/c", `npm run ${script}`], {
      cwd: opts.cwd,
      stdio: opts.stdio,
      shell: false,
    });
  }

  return spawnSync("npm", ["run", script], {
    cwd: opts.cwd,
    stdio: opts.stdio,
    shell: false,
  });
}

async function ensureRedisConnected() {
  if (redis.status === "ready") return;
  await redis.connect();
}

async function scanHeartbeatKeys(limit = 10): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];

  for (let i = 0; i < 10; i += 1) {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", HEARTBEAT_PATTERN, "COUNT", "200");
    cursor = nextCursor;
    for (const key of batch) {
      keys.push(key);
      if (keys.length >= limit) return keys;
    }
    if (cursor === "0") break;
  }

  return keys;
}

async function readHeartbeat(key: string): Promise<{ key: string; ttl: number; parsed: Heartbeat } | null> {
  const [raw, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Heartbeat;
    if (!parsed.workerId || !parsed.lastHeartbeat) return null;
    return { key, ttl, parsed };
  } catch {
    return null;
  }
}

async function waitFor<T>(label: string, timeoutMs: number, fn: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (e) {
      lastError = e;
    }

    await delay(500);
  }

  throw new Error(`${label} timed out${lastError ? ` (lastError=${String(lastError)})` : ""}`);
}

function startWorker(): ChildProcess {
  const workerId = `recovery-redis-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const env = {
    ...process.env,
    CODEFORGE_WORKER_ID: workerId,
    // Ensure the worker doesn't run forever if the script gets stuck.
    CODEFORGE_SELF_SHUTDOWN_AFTER_MS: process.env.CODEFORGE_SELF_SHUTDOWN_AFTER_MS ?? "120000",
  };

  const child = spawnNpmRun("worker", {
    cwd: projectRoot(),
    env,
    stdio: "inherit",
  });

  (child as unknown as { _codeforgeWorkerId?: string })._codeforgeWorkerId = workerId;

  return child;
}

async function stopWorker(child: ChildProcess) {
  if (child.exitCode !== null) return;

  try {
    child.kill("SIGINT");
  } catch {
    // ignore
  }

  const deadline = Date.now() + 10_000;
  while (child.exitCode === null && Date.now() < deadline) {
    await delay(250);
  }

  if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}

function restartRedisContainer() {
  const res = spawnSync("docker", ["restart", "codeforge-redis"], { encoding: "utf8", timeout: 60_000 });
  if (res.status !== 0) {
    throw new Error(`docker restart codeforge-redis failed: ${res.stderr || res.stdout || "unknown"}`);
  }
}

async function waitForRedisPing(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (redis.status !== "ready") {
        await redis.connect();
      }
      const pong = await redis.ping();
      if (pong === "PONG") return;
    } catch {
      // ignore
    }
    await delay(500);
  }
  throw new Error("Redis did not become ready after restart");
}

function runCleanupAudit() {
  const res = spawnNpmRunSync("ops:audit-cleanup", {
    stdio: "inherit",
    cwd: projectRoot(),
  });
  if (res.status !== 0) {
    throw new Error("Cleanup audit failed after recovery test");
  }
}

async function main() {
  await ensureRedisConnected();

  const worker = startWorker();

  const workerId = (worker as unknown as { _codeforgeWorkerId?: string })._codeforgeWorkerId;
  if (!workerId) {
    throw new Error("Failed to determine recovery workerId");
  }

  const heartbeatKey = `codeforge:worker-heartbeat:${workerId}`;

  // Also keep an eye on other keys for debugging only.
  const seenKeys = await scanHeartbeatKeys(25);
  if (seenKeys.length > 0) {
    console.log("Heartbeat keys present before test:", seenKeys.slice(0, 10));
  }

  const before = await waitFor("heartbeat appear", 20_000, async () => {
    const hb = await readHeartbeat(heartbeatKey);
    if (!hb) return null;
    if (hb.ttl <= 0) return null;
    return hb;
  });

  console.log("Heartbeat before restart:", {
    key: before.key,
    ttlSeconds: before.ttl,
    workerId: before.parsed.workerId,
    status: before.parsed.status,
    lastHeartbeat: before.parsed.lastHeartbeat,
  });

  const restartAt = Date.now();
  restartRedisContainer();

  // Redis container restart will drop the connection.
  try {
    await redis.quit();
  } catch {
    // ignore
  }

  await waitForRedisPing(30_000);

  const after = await waitFor("heartbeat recover", 30_000, async () => {
    const hb = await readHeartbeat(heartbeatKey);
    if (!hb) return null;
    if (hb.ttl <= 1) return null;

    // require that lastHeartbeat is after restartAt (best-effort monotonic)
    const t = Date.parse(hb.parsed.lastHeartbeat);
    if (!Number.isFinite(t) || t <= restartAt) {
      return null;
    }

    return hb;
  });

  // Ensure the heartbeat advances at least once post-restart.
  await delay(1500);
  const after2 = await waitFor("heartbeat advance", 20_000, async () => {
    const hb = await readHeartbeat(heartbeatKey);
    if (!hb) return null;
    const t1 = Date.parse(after.parsed.lastHeartbeat);
    const t2 = Date.parse(hb.parsed.lastHeartbeat);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
    if (t2 <= t1) return null;
    return hb;
  });

  console.log("Heartbeat after restart:", {
    key: after.key,
    ttlSeconds: after.ttl,
    workerId: after.parsed.workerId,
    status: after.parsed.status,
    lastHeartbeat: after.parsed.lastHeartbeat,
  });

  console.log("Heartbeat advanced:", {
    ttlSeconds: after2.ttl,
    lastHeartbeat: after2.parsed.lastHeartbeat,
  });

  await stopWorker(worker);
  runCleanupAudit();

  console.log("OK: recovery redis restart passed.");
}

main()
  .catch((err) => {
    console.error("recoveryRedisRestart failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  });
