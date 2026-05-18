import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "@/lib/prisma";
import { createQueuedSubmission } from "@/services/submission.service";

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

function startWorker(params: { workerId: string; staleTimeoutMs: number; staleIntervalMs: number; selfShutdownAfterMs: number }) {
  const env = {
    ...process.env,
    CODEFORGE_WORKER_ID: params.workerId,
    CODEFORGE_STALE_RUNNING_TIMEOUT_MS: String(params.staleTimeoutMs),
    CODEFORGE_STALE_RECOVERY_INTERVAL_MS: String(params.staleIntervalMs),
    CODEFORGE_SELF_SHUTDOWN_AFTER_MS: String(params.selfShutdownAfterMs),
    CODEFORGE_SANDBOX_USE_HOST_MOUNT: "0",
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

function runCleanupAudit() {
  const res = spawnNpmRunSync("ops:audit-cleanup", {
    stdio: "inherit",
    cwd: projectRoot(),
  });
  if (res.status !== 0) {
    throw new Error("Cleanup audit failed after recovery test");
  }
}

async function waitForSubmissionStatus(submissionId: string, wanted: string[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await prisma.submission.findUnique({ where: { id: submissionId }, select: { status: true, startedAt: true } });
    const status = s?.status;
    if (status && wanted.includes(status)) {
      return s;
    }
    await delay(500);
  }

  throw new Error(`Timeout waiting for submission ${submissionId} status in [${wanted.join(", ")}].`);
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true, email: true } });
  if (!user) {
    throw new Error("No users found. Seed the DB first (npm run db:seed).");
  }

  const problem = await prisma.problem.findFirst({
    where: { testCases: { some: {} } },
    select: { id: true, slug: true, title: true, testCases: { select: { id: true }, take: 1 } },
  });

  if (!problem) {
    throw new Error("No problems with testcases found. Seed the DB first (npm run db:seed).");
  }

  const requestId = `recovery-submission-${Date.now()}`;

  // Long-ish code so we can kill mid-execution. It will likely be WRONG_ANSWER, which is fine.
  // Must be < per-test timeout (~15s) so a retry can finish.
  const code = `const end = Date.now() + 8000; while (Date.now() < end) {}\nconsole.log('done');`;

  // Keep stale recovery slow enough that BullMQ retries can re-run the submission first.
  // (BullMQ stalled-job detection is typically on the order of ~30s by default.)
  const staleTimeoutMs = 60_000;
  const staleIntervalMs = 5_000;

  const worker1 = startWorker({
    workerId: `recovery-sub-1-${Date.now()}`,
    staleTimeoutMs,
    staleIntervalMs,
    selfShutdownAfterMs: 0,
  });

  const submission = await createQueuedSubmission({
    userId: user.id,
    problemId: problem.id,
    code,
    language: "JAVASCRIPT",
    requestId,
  });

  console.log("Enqueued submission:", {
    submissionId: submission.id,
    userId: user.id,
    problemId: problem.id,
    requestId,
  });

  const running = await waitForSubmissionStatus(submission.id, ["RUNNING"], 30_000);
  console.log("Submission is RUNNING; killing worker now.", {
    submissionId: submission.id,
    startedAt: running.startedAt?.toISOString() ?? null,
  });

  // Ensure we interrupt mid-execution.
  await delay(1500);
  await killHard(worker1);

  const worker2 = startWorker({
    workerId: `recovery-sub-2-${Date.now()}`,
    staleTimeoutMs,
    staleIntervalMs,
    selfShutdownAfterMs: 180_000,
  });

  // Expect reconciliation to eliminate zombie RUNNING (either via final-attempt failure or stale recovery).
  const terminal = await waitForSubmissionStatus(submission.id, ["COMPLETED", "FAILED"], 180_000);

  console.log("Submission reached terminal state:", {
    submissionId: submission.id,
    status: terminal.status,
  });

  await stopGracefully(worker2);
  runCleanupAudit();

  console.log("OK: recovery kill worker mid-submission passed.");
}

main()
  .catch((err) => {
    console.error("recoveryKillWorkerMidSubmission failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }
  });
