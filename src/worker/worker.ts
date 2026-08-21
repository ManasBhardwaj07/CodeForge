import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import { Worker } from "bullmq";
import { SubmissionStatus } from "../../generated/prisma/index.js";
import {
  getDeadLetterQueue,
  getQueueConnectionOptions,
  SUBMISSION_QUEUE_NAME,
  type JobData,
  type RunJobData,
} from "../lib/queue.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_GLOBAL_TIMEOUT_MS,
  DEFAULT_PER_TEST_TIMEOUT_MS,
  compileCppInDocker,
  executeInSandbox,
  runCompiledCppInDocker,
  type ExecutionLanguage,
  forceCleanupActiveExecutionContainers,
} from "../services/execution.service";
import { evaluateSubmission } from "../services/evaluation.service";

const STALE_RUNNING_TIMEOUT_MS = Number.parseInt(
  process.env.CODEFORGE_STALE_RUNNING_TIMEOUT_MS ?? String(5 * 60 * 1000),
  10,
);
const STALE_RECOVERY_INTERVAL_MS = Number.parseInt(
  process.env.CODEFORGE_STALE_RECOVERY_INTERVAL_MS ?? String(60 * 1000),
  10,
);
const WORKER_PER_TEST_TIMEOUT_MS = Math.max(DEFAULT_PER_TEST_TIMEOUT_MS, 15000);

const HEARTBEAT_INTERVAL_MS = Number.parseInt(
  process.env.CODEFORGE_WORKER_HEARTBEAT_INTERVAL_MS ?? "10000",
  10,
);
const HEARTBEAT_TTL_MS = Number.parseInt(process.env.CODEFORGE_WORKER_HEARTBEAT_TTL_MS ?? "30000", 10);

const workerId =
  process.env.CODEFORGE_WORKER_ID ??
  `${os.hostname()}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;

const heartbeatKey = `codeforge:worker-heartbeat:${workerId}`;
let workerStatus: "starting" | "healthy" | "shutting_down" = "starting";
let activeJobs = 0;

let redisConnectInFlight: Promise<void> | null = null;

async function ensureRedisConnected() {
  if (redis.status === "ready") {
    return;
  }

  if (redisConnectInFlight) {
    await redisConnectInFlight;
    return;
  }

  redisConnectInFlight = redis
    .connect()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      redisConnectInFlight = null;
    });

  await redisConnectInFlight;
}

async function publishHeartbeat() {
  const now = new Date().toISOString();
  const ttlSeconds = Math.max(1, Math.ceil(HEARTBEAT_TTL_MS / 1000));

  const payload = {
    workerId,
    lastHeartbeat: now,
    activeJobs,
    status: workerStatus,
  };

  try {
    await ensureRedisConnected();
    await redis.set(heartbeatKey, JSON.stringify(payload), "EX", ttlSeconds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // If we raced Redis connection (lazyConnect + offlineQueue=false), retry once.
    if (message.toLowerCase().includes("stream isn't writeable")) {
      try {
        await ensureRedisConnected();
        await redis.set(heartbeatKey, JSON.stringify(payload), "EX", ttlSeconds);
        return;
      } catch {
        // fall through
      }
    }

    logEvent("warn", "Failed to publish worker heartbeat", { workerId, error: message });
  }
}

type LogLevel = "info" | "warn" | "error";

function logEvent(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.info(JSON.stringify(payload));
}

function isFinalAttempt(attemptsMade: number, attempts: number | undefined) {
  const total = attempts ?? 1;
  return attemptsMade >= total;
}

function categorizeFailure(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "EXECUTION_TIMEOUT";
  }

  if (normalized.includes("compile") || normalized.includes("compilation")) {
    return "COMPILATION_ERROR";
  }

  if (normalized.includes("sandbox") || normalized.includes("docker") || normalized.includes("container")) {
    return "SANDBOX_ERROR";
  }

  if (normalized.includes("redis")) {
    return "REDIS_ERROR";
  }

  return "INFRA_FAILURE";
}

async function recoverStaleRunningSubmissions() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_TIMEOUT_MS);

  const recovered = await prisma.submission.updateMany({
    where: {
      status: SubmissionStatus.RUNNING,
      startedAt: {
        lt: cutoff,
      },
    },
    data: {
      status: SubmissionStatus.FAILED,
      failedAt: new Date(),
    },
  });

  if (recovered.count > 0) {
    logEvent("warn", "Recovered stale RUNNING submissions", { recovered: recovered.count });
  }
}

function normalizeOutput(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd();
}

function formatErrorForPersistence(errorType: string | null, stderr: string) {
  if (!errorType) {
    return stderr.length > 0 ? stderr : null;
  }

  if (stderr.length === 0) {
    return `[${errorType}]`;
  }

  return `[${errorType}] ${stderr}`;
}

async function createExecutionResultRecord(params: {
  submissionId: string;
  testCaseId: string;
  inputSnapshot: string;
  expectedOutputSnapshot: string;
  actualOutput: string;
  stderr: string | null;
  exitCode: number | null;
  executionTimeMs: number | null;
  passed: boolean;
}) {
  await prisma.executionResult.create({
    data: {
      submissionId: params.submissionId,
      testCaseId: params.testCaseId,
      inputSnapshot: params.inputSnapshot,
      expectedOutputSnapshot: params.expectedOutputSnapshot,
      actualOutput: params.actualOutput,
      stderr: params.stderr,
      exitCode: params.exitCode,
      executionTimeMs: params.executionTimeMs,
      passed: params.passed,
    },
  });
}

async function executeSubmission(submissionId: string, requestId?: string | null) {
  const submission = await prisma.submission.findUnique({
    where: {
      id: submissionId,
    },
    select: {
      id: true,
      language: true,
      code: true,
      problem: {
        select: {
          testCases: {
            orderBy: {
              orderIndex: "asc",
            },
            select: {
              id: true,
              input: true,
              expectedOutput: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found`);
  }

  const testCases = submission.problem.testCases;

  if (testCases.length === 0) {
    throw new Error(`Problem has no test cases for submission ${submissionId}`);
  }

  await prisma.executionResult.deleteMany({
    where: {
      submissionId,
    },
  });

  const submissionDeadline = Date.now() + DEFAULT_GLOBAL_TIMEOUT_MS;
  let infrastructureFailure: string | null = null;

  if (submission.language === "CPP") {
    const compileRemainingMs = submissionDeadline - Date.now();
    if (compileRemainingMs <= 0) {
      for (const testCase of testCases) {
        if (!testCase) {
          continue;
        }
        await createExecutionResultRecord({
          submissionId,
          testCaseId: testCase.id,
          inputSnapshot: testCase.input,
          expectedOutputSnapshot: testCase.expectedOutput,
          actualOutput: "",
          stderr: "[TIMEOUT] Global submission timeout exceeded",
          exitCode: null,
          executionTimeMs: null,
          passed: false,
        });
      }
      return;
    }

    const compilePolicy = {
      perTestTimeoutMs: Math.min(WORKER_PER_TEST_TIMEOUT_MS, compileRemainingMs),
      globalTimeoutMs: compileRemainingMs,
    };

    const { outcome: compileOutcome, artifact } = await compileCppInDocker({
      code: submission.code,
      policy: compilePolicy,
      context: { submissionId },
    });

    if (!artifact || !compileOutcome.success) {
      for (const testCase of testCases) {
        if (!testCase) {
          continue;
        }
        await createExecutionResultRecord({
          submissionId,
          testCaseId: testCase.id,
          inputSnapshot: testCase.input,
          expectedOutputSnapshot: testCase.expectedOutput,
          actualOutput: "",
          stderr: formatErrorForPersistence(compileOutcome.errorType, compileOutcome.stderr) ?? "[COMPILE_ERROR]",
          exitCode: compileOutcome.exitCode,
          executionTimeMs: compileOutcome.executionTimeMs,
          passed: false,
        });
      }
      return;
    }

    try {
      for (let index = 0; index < testCases.length; index += 1) {
        const testCase = testCases[index];
        if (!testCase) {
          continue;
        }
        const remainingMs = submissionDeadline - Date.now();

        if (remainingMs <= 0) {
          for (let pendingIndex = index; pendingIndex < testCases.length; pendingIndex += 1) {
            const pendingCase = testCases[pendingIndex];
            if (!pendingCase) {
              continue;
            }
            await createExecutionResultRecord({
              submissionId,
              testCaseId: pendingCase.id,
              inputSnapshot: pendingCase.input,
              expectedOutputSnapshot: pendingCase.expectedOutput,
              actualOutput: "",
              stderr: `[TIMEOUT] Global submission timeout exceeded (${DEFAULT_GLOBAL_TIMEOUT_MS}ms)` ,
              exitCode: null,
              executionTimeMs: null,
              passed: false,
            });
          }
          break;
        }

        const runPolicy = {
          perTestTimeoutMs: Math.min(WORKER_PER_TEST_TIMEOUT_MS, remainingMs),
          globalTimeoutMs: remainingMs,
        };

        const runOutcome = await runCompiledCppInDocker({
          artifact,
          input: testCase.input,
          policy: runPolicy,
          context: { submissionId, testCaseId: testCase.id },
        });

        const passed =
          runOutcome.success && !runOutcome.timedOut &&
          normalizeOutput(runOutcome.stdout) === normalizeOutput(testCase.expectedOutput);

        const executionTimeMs = index === 0
          ? runOutcome.executionTimeMs + artifact.compileExecutionTimeMs
          : runOutcome.executionTimeMs;

        await createExecutionResultRecord({
          submissionId,
          testCaseId: testCase.id,
          inputSnapshot: testCase.input,
          expectedOutputSnapshot: testCase.expectedOutput,
          actualOutput: runOutcome.stdout,
          stderr: formatErrorForPersistence(runOutcome.errorType, runOutcome.stderr),
          exitCode: runOutcome.exitCode,
          executionTimeMs,
          passed,
        });
      }
    } finally {
      await rm(artifact.workspaceDir, { recursive: true, force: true });
    }

    return;
  }

  for (let index = 0; index < testCases.length; index += 1) {
    const testCase = testCases[index];

    if (!testCase) {
      continue;
    }

    const remainingMs = submissionDeadline - Date.now();

    if (remainingMs <= 0) {
      for (let pendingIndex = index; pendingIndex < testCases.length; pendingIndex += 1) {
        const pendingCase = testCases[pendingIndex];

        if (!pendingCase) {
          continue;
        }

        await createExecutionResultRecord({
          submissionId,
          testCaseId: pendingCase.id,
          inputSnapshot: pendingCase.input,
          expectedOutputSnapshot: pendingCase.expectedOutput,
          actualOutput: "",
          stderr: `[TIMEOUT] Global submission timeout exceeded (${DEFAULT_GLOBAL_TIMEOUT_MS}ms)`,
          exitCode: null,
          executionTimeMs: null,
          passed: false,
        });
      }

      break;
    }

    try {
      const perTestTimeoutMs = Math.min(WORKER_PER_TEST_TIMEOUT_MS, remainingMs);
      const outcome = await executeInSandbox({
        language: submission.language,
        code: submission.code,
        input: testCase.input,
        policy: {
          perTestTimeoutMs,
          globalTimeoutMs: remainingMs,
        },
        context: {
          submissionId,
          testCaseId: testCase.id,
        },
      });

      const passed =
        outcome.success && !outcome.timedOut &&
        normalizeOutput(outcome.stdout) === normalizeOutput(testCase.expectedOutput);

      logEvent("info", "Execution metadata", {
        submissionId,
        requestId: requestId ?? null,
        testCaseId: testCase.id,
        errorType: outcome.errorType ?? "NONE",
        durationMs: outcome.executionTimeMs,
        containerId: outcome.metadata.containerId ?? "n/a",
        compileContainerId: outcome.metadata.compileContainerId ?? "n/a",
        runContainerId: outcome.metadata.runContainerId ?? "n/a",
        outputTruncated: outcome.metadata.outputTruncated,
      });

      await createExecutionResultRecord({
        submissionId,
        testCaseId: testCase.id,
        inputSnapshot: testCase.input,
        expectedOutputSnapshot: testCase.expectedOutput,
        actualOutput: outcome.stdout,
        stderr: formatErrorForPersistence(outcome.errorType, outcome.stderr),
        exitCode: outcome.exitCode,
        executionTimeMs: outcome.executionTimeMs,
        passed,
      });

      if (outcome.errorType === "COMPILE_ERROR") {
        for (let pendingIndex = index + 1; pendingIndex < testCases.length; pendingIndex += 1) {
          const pendingCase = testCases[pendingIndex];

          if (!pendingCase) {
            continue;
          }

          await createExecutionResultRecord({
            submissionId,
            testCaseId: pendingCase.id,
            inputSnapshot: pendingCase.input,
            expectedOutputSnapshot: pendingCase.expectedOutput,
            actualOutput: "",
            stderr: "[COMPILE_ERROR] Skipped due to compilation failure on an earlier test case",
            exitCode: null,
            executionTimeMs: null,
            passed: false,
          });
        }

        break;
      }
    } catch (error) {
      infrastructureFailure = error instanceof Error ? error.message : "Unknown execution infrastructure failure";

      await createExecutionResultRecord({
        submissionId,
        testCaseId: testCase.id,
        inputSnapshot: testCase.input,
        expectedOutputSnapshot: testCase.expectedOutput,
        actualOutput: "",
        stderr: `[INFRA_ERROR] ${infrastructureFailure}`,
        exitCode: null,
        executionTimeMs: null,
        passed: false,
      });

      break;
    }
  }

  if (infrastructureFailure) {
    throw new Error(infrastructureFailure);
  }
}

async function handleRunJob(language: string, code: string, customInput: string, requestId?: string | null) {
  // Execute code with custom input
  // Result is STORED IN JOB RETURN VALUE (ephemeral, no DB)
  const runPolicy = {
    perTestTimeoutMs: 15000,
    globalTimeoutMs: 45000,
  };
  
  const outcome = await executeInSandbox({
    language: language as ExecutionLanguage,
    code,
    input: customInput,
    policy: runPolicy,
  });

  logEvent("info", "Run execution completed", {
    language,
    requestId: requestId ?? null,
    success: outcome.success,
    errorType: outcome.errorType ?? "NONE",
    durationMs: outcome.executionTimeMs,
    outputTruncated: outcome.metadata.outputTruncated,
  });

  // Return result (stored in job.returnValue by Bull)
  return {
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    exitCode: outcome.exitCode,
    executionTimeMs: outcome.executionTimeMs,
    errorType: outcome.errorType,
    outputTruncated: outcome.metadata.outputTruncated,
  };
}

async function handleSubmissionJob(submissionId: string, requestId?: string | null) {
  // Execute submission with all test cases
  // Result is PERSISTED TO DATABASE (official verdict)

  await executeSubmission(submissionId, requestId);
  const evaluation = await evaluateSubmission(submissionId);

  const completed = await prisma.submission.updateMany({
    where: {
      id: submissionId,
      status: SubmissionStatus.RUNNING,
    },
    data: {
      status: SubmissionStatus.COMPLETED,
      verdict: evaluation.verdict,
      totalTests: evaluation.totalTests,
      passedTests: evaluation.passedTests,
      failedTests: evaluation.failedTests,
      completedAt: new Date(),
      failedAt: null,
    },
  });

  if (completed.count === 0) {
    throw new Error(`Submission ${submissionId} is not RUNNING when completing`);
  }

  logEvent("info", "Submission completed", { submissionId, requestId: requestId ?? null });
}

const worker = new Worker<JobData>(
  SUBMISSION_QUEUE_NAME,
  async (job) => {
    const data = job.data;

    // Dispatch based on job type
    if (data.type === 'submission') {
      // Submission job: persist results
      const submissionId = data.submissionId;
      logEvent("info", "Processing submission", { submissionId, jobId: job.id, requestId: data.requestId ?? null });

      const attemptsMade = job.attemptsMade ?? 0;
      const isRetryAttempt = attemptsMade > 0;

      const started = await prisma.submission.updateMany({
        where: {
          id: submissionId,
          status: SubmissionStatus.QUEUED,
        },
        data: {
          status: SubmissionStatus.RUNNING,
          startedAt: new Date(),
          verdict: null,
          totalTests: 0,
          passedTests: 0,
          failedTests: 0,
          completedAt: null,
          failedAt: null,
        },
      });

      if (started.count === 0) {
        const current = await prisma.submission.findUnique({
          where: { id: submissionId },
          select: { status: true, startedAt: true },
        });

        if (!current) {
          // No DB record; nothing to do. Avoid endless retries.
          logEvent("warn", "Submission job has no DB record; skipping", {
            submissionId,
            jobId: job.id,
            requestId: data.requestId ?? null,
          });
          return;
        }

        // Idempotency: if stale recovery already moved this to terminal, or another worker is handling it,
        // do not fail the job (which would trigger retries).
        if (current.status === SubmissionStatus.FAILED || current.status === SubmissionStatus.COMPLETED) {
          logEvent("info", "Submission already terminal; skipping job", {
            submissionId,
            status: current.status,
            jobId: job.id,
            requestId: data.requestId ?? null,
          });
          return;
        }

        if (current.status === SubmissionStatus.RUNNING) {
          // Coordination rule:
          // - If this is a retry, assume the previous worker died mid-execution. Take over.
          // - If this is the first attempt and it's RUNNING, another worker is likely executing it.
          if (!isRetryAttempt) {
            logEvent("warn", "Submission already RUNNING on first attempt; skipping job", {
              submissionId,
              jobId: job.id,
              requestId: data.requestId ?? null,
            });
            return;
          }

          logEvent("warn", "Retry takeover for RUNNING submission", {
            submissionId,
            jobId: job.id,
            requestId: data.requestId ?? null,
            attemptsMade,
            startedAt: current.startedAt?.toISOString() ?? null,
          });

          // Clear partial results to avoid unique constraint collisions on (submissionId, testCaseId).
          await prisma.executionResult.deleteMany({
            where: { submissionId },
          });

          // Refresh startedAt and reset counters/verdict so the retry produces a clean final state.
          await prisma.submission.updateMany({
            where: {
              id: submissionId,
              status: SubmissionStatus.RUNNING,
            },
            data: {
              startedAt: new Date(),
              verdict: null,
              totalTests: 0,
              passedTests: 0,
              failedTests: 0,
              completedAt: null,
              failedAt: null,
            },
          });

          await handleSubmissionJob(submissionId, data.requestId ?? null);
          return;
        }

        throw new Error(`Submission ${submissionId} is not QUEUED when starting (status=${current.status})`);
      }

      await handleSubmissionJob(submissionId, data.requestId ?? null);
    } else if (data.type === 'run') {
      // Run job: return ephemeral result
      const runData = data as RunJobData;
      logEvent("info", "Processing run", { jobId: runData.jobId, requestId: runData.requestId ?? null });

      const result = await handleRunJob(runData.language, runData.code, runData.customInput, runData.requestId ?? null);
      
      // Return result (stored in job.returnValue by Bull)
      return result;
    } else {
      throw new Error("Invalid job type");
    }
  },
  {
    connection: getQueueConnectionOptions(),
    concurrency: 2,
  },
);

let lastJobActivityAt = Date.now();

function updateJobActivity() {
  lastJobActivityAt = Date.now();
}

worker.on("active", () => {
  activeJobs += 1;
  updateJobActivity();
});

worker.on("completed", () => {
  activeJobs = Math.max(0, activeJobs - 1);
  updateJobActivity();
});

void recoverStaleRunningSubmissions();

const staleRecoveryTimer = setInterval(() => {
  if (Date.now() - lastJobActivityAt > 15 * 60 * 1000) {
    return;
  }
  void recoverStaleRunningSubmissions();
}, STALE_RECOVERY_INTERVAL_MS);

staleRecoveryTimer.unref();

worker.on("ready", () => {
  if (workerStatus === "shutting_down") {
    return;
  }
  logEvent("info", "Submission worker is ready");
  workerStatus = "healthy";
  void publishHeartbeat();
});

worker.on("failed", async (job, error) => {
  activeJobs = Math.max(0, activeJobs - 1);
  updateJobActivity();
  if (!job) {
    logEvent("error", "Failed job with no data", { error: error.message });
    return;
  }

  const data = job.data;
  const attemptsMade = job.attemptsMade ?? 0;
  const attempts = job.opts.attempts ?? 1;
  const finalAttempt = isFinalAttempt(attemptsMade, attempts);
  const failureCategory = categorizeFailure(error.message);

  if (data.type === 'submission') {
    // Only fail submission if it's still QUEUED or RUNNING
    const submissionId = data.submissionId;

    if (finalAttempt) {
      await prisma.submission.updateMany({
        where: {
          id: submissionId,
          status: {
            in: [SubmissionStatus.QUEUED, SubmissionStatus.RUNNING],
          },
        },
        data: {
          status: SubmissionStatus.FAILED,
          failedAt: new Date(),
        },
      });
    }
  }
  // Run jobs don't need special handling - they're ephemeral and will expire

  logEvent(finalAttempt ? "error" : "warn", "Job failed", {
    jobId: job.id,
    jobName: job.name,
    attemptsMade,
    attempts,
    finalAttempt,
    error: error.message,
    requestId: data?.requestId ?? null,
    failureCategory,
  });

  if (finalAttempt) {
    await getDeadLetterQueue().add(
      "dead-letter",
      {
        originalQueue: SUBMISSION_QUEUE_NAME,
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        failedReason: error.message,
        failureCategory,
        attemptsMade,
        timestamp: new Date().toISOString(),
      },
      {
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
});

worker.on("error", (error) => {
  const now = Date.now();
  const message = error?.message ?? "Unknown worker error";
  const key = message;

  // BullMQ/ioredis can emit repeated connection errors while Redis is down.
  // Throttle identical errors to keep logs usable.
  const throttleWindowMs = 5000;
  type WorkerErrorThrottleState = {
  lastKey: string | null;
  lastAt: number;
  suppressed: number;
};

const globalWithWorkerState = globalThis as typeof globalThis & {
  __codeforgeWorkerErrorState?: WorkerErrorThrottleState;
};

globalWithWorkerState.__codeforgeWorkerErrorState ??= {
  lastKey: null,
  lastAt: 0,
  suppressed: 0,
};

const state = globalWithWorkerState.__codeforgeWorkerErrorState;
  if (state.lastKey === key && now - state.lastAt < throttleWindowMs) {
    state.suppressed += 1;
    return;
  }

  const suffix = state.suppressed > 0 ? ` (suppressed ${state.suppressed} repeats)` : "";
  logEvent("error", `Worker runtime error${suffix}`, { error: message });
  state.lastKey = key;
  state.lastAt = now;
  state.suppressed = 0;
});

const heartbeatTimer = setInterval(() => {
  void publishHeartbeat();
}, Math.max(1000, Number.isFinite(HEARTBEAT_INTERVAL_MS) ? HEARTBEAT_INTERVAL_MS : 10000));

heartbeatTimer.unref();

function cleanupExitedCodeforgeContainersOnStartup() {
  const executionNamePrefixes = [
    "codeforge-js-",
    "codeforge-py-",
    "codeforge-cpp-",
    "codeforge-c-",
    "codeforge-java-",
  ];

  try {
    const res = spawnSync("docker", ["ps", "-a", "--format", "{{.ID}} {{.Names}} {{.Status}}"], {
      encoding: "utf8",
      timeout: 10_000,
    });

    if (res.status !== 0 || !res.stdout) {
      return;
    }

    const lines = res.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const parts = line.split(/\s+/);
      const id = parts[0];
      const name = parts[1] ?? "";
      if (!id) {
        continue;
      }

      if (!executionNamePrefixes.some((prefix) => name.startsWith(prefix))) {
        continue;
      }

      // Only clean up non-running containers.
      if (!line.toLowerCase().includes("exited") && !line.toLowerCase().includes("created") && !line.toLowerCase().includes("dead")) {
        continue;
      }

      spawnSync("docker", ["rm", "-f", id], { stdio: "ignore", timeout: 5000 });
    }
  } catch {
    // Best-effort cleanup only.
  }
}

cleanupExitedCodeforgeContainersOnStartup();

let shutdownInFlight: Promise<void> | null = null;

async function shutdown(reason: string) {
  if (shutdownInFlight) {
    return shutdownInFlight;
  }

  shutdownInFlight = (async () => {
    workerStatus = "shutting_down";
    logEvent("warn", "Worker shutdown initiated", { reason, activeJobs });

    // Stop heartbeat first so liveness reflects reality quickly.
    clearInterval(heartbeatTimer);

    // Stop taking new jobs.
    try {
      await worker.pause();
    } catch {
      // ignore
    }

    // Wait for active jobs to drain with timeout.
    const GRACEFUL_SHUTDOWN_TIMEOUT_MS = Number.parseInt(
      process.env.CODEFORGE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? "30000",
      10,
    );
    const start = Date.now();
    while (activeJobs > 0 && Date.now() - start < GRACEFUL_SHUTDOWN_TIMEOUT_MS) {
      logEvent("info", "Waiting for active jobs to finish", { activeJobs });
      await new Promise((r) => setTimeout(r, 500));
    }

    if (activeJobs > 0) {
      logEvent("warn", "Graceful shutdown timeout reached; forcing cleanup", { activeJobs });
    }

    // Best-effort: kill any containers still tracked as active.
    try {
      forceCleanupActiveExecutionContainers();
    } catch {
      // ignore
    }

    clearInterval(staleRecoveryTimer);

    try {
      await worker.close();
    } catch {
      // ignore
    }

    // Remove heartbeat key so health flips offline immediately.
    try {
      await ensureRedisConnected();
      await redis.del(heartbeatKey);
    } catch {
      // ignore
    }

    try {
      await prisma.$disconnect();
    } catch {
      // ignore
    }

    try {
      await redis.quit();
    } catch {
      // ignore
    }

    process.exit(0);
  })();

  return shutdownInFlight;
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

const SELF_SHUTDOWN_AFTER_MS = Number.parseInt(process.env.CODEFORGE_SELF_SHUTDOWN_AFTER_MS ?? "0", 10);
if (Number.isFinite(SELF_SHUTDOWN_AFTER_MS) && SELF_SHUTDOWN_AFTER_MS > 0) {
  const timer = setTimeout(() => {
    void shutdown("self_shutdown");
  }, SELF_SHUTDOWN_AFTER_MS);
  timer.unref();
}

process.on("uncaughtException", (error) => {
  logEvent("error", "Uncaught exception", { error: error.message });
  void shutdown("uncaughtException");
});

process.on("unhandledRejection", (error) => {
  const message = error instanceof Error ? error.message : String(error);
  logEvent("error", "Unhandled rejection", { error: message });
  void shutdown("unhandledRejection");
});
