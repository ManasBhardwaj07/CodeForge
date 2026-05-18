import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { redis } from "@/lib/redis";

function makeValidationWorkerId() {
  return `validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
  } catch {
    // continue
  }

  const validationWorkerId = makeValidationWorkerId();
  const heartbeatKey = `codeforge:worker-heartbeat:${validationWorkerId}`;

  const child = spawn(process.execPath, ["--import", "tsx", "src/worker/worker.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEFORGE_WORKER_ID: validationWorkerId,
      CODEFORGE_WORKER_HEARTBEAT_INTERVAL_MS: process.env.CODEFORGE_WORKER_HEARTBEAT_INTERVAL_MS ?? "1000",
      CODEFORGE_WORKER_HEARTBEAT_TTL_MS: process.env.CODEFORGE_WORKER_HEARTBEAT_TTL_MS ?? "4000",
      CODEFORGE_GRACEFUL_SHUTDOWN_TIMEOUT_MS: process.env.CODEFORGE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? "5000",
      CODEFORGE_SELF_SHUTDOWN_AFTER_MS: process.env.CODEFORGE_SELF_SHUTDOWN_AFTER_MS ?? "3000",
    },
  });

  try {
    // Give the worker time to connect and publish at least one heartbeat.
    await delay(3500);

    const ttl = await redis.ttl(heartbeatKey);
    if (ttl <= 0) {
      throw new Error(`Heartbeat key TTL is not positive (ttl=${ttl}) for key=${heartbeatKey}`);
    }

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code ?? 0));
    });

    if (exitCode !== 0) {
      throw new Error(`Worker exited with non-zero code: ${exitCode}`);
    }

    // Allow a moment for heartbeat DEL to propagate.
    await delay(1500);

    const exists = await redis.exists(heartbeatKey);
    if (exists !== 0) {
      throw new Error(`Expected heartbeat key to be deleted on shutdown: ${heartbeatKey}`);
    }

    console.log(`OK: worker heartbeat key removed on shutdown (${heartbeatKey}).`);
  } finally {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }
}

main()
  .catch((error) => {
    console.error("validateWorkerShutdown failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  });
