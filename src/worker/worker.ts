import { rm } from "node:fs/promises";
import { Worker } from "bullmq";
import { SubmissionStatus } from "../../generated/prisma/index.js";
import {
  getDeadLetterQueue,
  getQueueConnectionOptions,
  SUBMISSION_QUEUE_NAME,
  type JobData,
  type RunJobData,
} from "../lib/queue.js";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_GLOBAL_TIMEOUT_MS,
  DEFAULT_PER_TEST_TIMEOUT_MS,
  compileCppInDocker,
  executeInSandbox,
  runCompiledCppInDocker,
  type ExecutionLanguage,
} from "../services/execution.service";
import { evaluateSubmission } from "../services/evaluation.service";

const STALE_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_RECOVERY_INTERVAL_MS = 60 * 1000;
const WORKER_PER_TEST_TIMEOUT_MS = Math.max(DEFAULT_PER_TEST_TIMEOUT_MS, 15000);

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
        throw new Error(`Submission ${submissionId} is not QUEUED or does not exist`);
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

void recoverStaleRunningSubmissions();

const staleRecoveryTimer = setInterval(() => {
  void recoverStaleRunningSubmissions();
}, STALE_RECOVERY_INTERVAL_MS);

staleRecoveryTimer.unref();

worker.on("ready", () => {
  logEvent("info", "Submission worker is ready");
});

worker.on("failed", async (job, error) => {
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
  logEvent("error", "Worker runtime error", { error: error.message });
});

async function shutdown() {
  clearInterval(staleRecoveryTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
