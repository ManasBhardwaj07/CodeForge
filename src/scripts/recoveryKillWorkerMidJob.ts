import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { QueueEvents } from "bullmq";
import { getQueueConnectionOptions, getSubmissionQueue, SUBMISSION_QUEUE_NAME } from "@/lib/queue";

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

function startWorker(envOverrides?: Record<string, string>): ChildProcess {
  const env = {
    ...process.env,
    ...envOverrides,
  };

  return spawnNpmRun("worker", {
    cwd: projectRoot(),
    env,
    stdio: "inherit",
  });
}

async function killHard(child: ChildProcess) {
  if (!child.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  try {
    child.kill("SIGKILL");
  } catch {
    // ignore
  }
}

async function stopGracefully(child: ChildProcess) {
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

  if (child.exitCode === null) {
    await killHard(child);
  }
}

async function waitForJobActive(queue: ReturnType<typeof getSubmissionQueue>, jobId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (!job) {
      await delay(500);
      continue;
    }

    const state = await job.getState();
    if (state === "active") return;
    await delay(500);
  }

  throw new Error(`Timeout waiting for job ${jobId} to become active.`);
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
  const queue = getSubmissionQueue();
  const queueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
    connection: getQueueConnectionOptions(),
  });
  await queueEvents.waitUntilReady();

  try {

  const runId = `recovery-${Date.now()}`;
  const job = await queue.add(
    "run",
    {
      type: "run",
      jobId: runId,
      userId: "test-user-id",
      language: "JAVASCRIPT",
      // ~8s busy loop. First attempt will be killed mid-run; retry should finish under 15s per-test timeout.
      code: `const end = Date.now() + 8000; while (Date.now() < end) {}\nconsole.log('done');`,
      customInput: "",
      requestId: runId,
    },
    {
      attempts: 2,
      backoff: { type: "fixed", delay: 0 },
      // Keep the job so state inspection remains possible; we'll remove it manually.
      removeOnComplete: false,
      removeOnFail: false,
    },
  );

  if (!job.id) {
    throw new Error("Failed to enqueue run job");
  }

  console.log("Enqueued run job:", { jobId: job.id, requestId: runId });

  const worker1 = startWorker({ CODEFORGE_SELF_SHUTDOWN_AFTER_MS: "0" });

  await waitForJobActive(queue, String(job.id), 20_000);
  // Ensure we interrupt mid-execution, not just after the job is marked active.
  await delay(1500);
  console.log("Job is active; hard-killing worker now.");

  await killHard(worker1);

  // Start replacement worker.
  const worker2 = startWorker({ CODEFORGE_SELF_SHUTDOWN_AFTER_MS: "240000" });

  // Wait for completion via events (more reliable than polling, especially on retries).
  const result = await job.waitUntilFinished(queueEvents, 180_000);
  console.log("Job finished (returnValue):", result);

  await stopGracefully(worker2);
  runCleanupAudit();

  try {
    await job.remove();
  } catch {
    // ignore
  }

  console.log("OK: recovery kill worker mid-job passed.");

  } finally {
    try {
      await queueEvents.close();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error("recoveryKillWorkerMidJob failed:", err);
  process.exitCode = 1;
});
