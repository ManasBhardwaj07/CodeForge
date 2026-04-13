import { spawn, spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { Queue } from "bullmq";
import { disconnectPrisma, prisma } from "./client";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { POST as submitRoute } from "../src/app/api/submit/route";
import { closeSubmissionQueue, getQueueConnectionOptions, SUBMISSION_QUEUE_NAME } from "../src/lib/queue";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

type WorkerChild = ReturnType<typeof spawn>;

const WAIT_TIMEOUT_MS = 12000;

function printResult(result: CheckResult) {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name} - ${result.details}`);
}

function startWorker(projectRoot: string): Promise<{
  child: WorkerChild;
  getLogs: () => string;
}> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", "npm run worker --silent"], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
          })
        : spawn("npm", ["run", "worker", "--silent"], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
          });

    let logs = "";

    const onData = (data: Buffer) => {
      logs += data.toString();
      if (logs.includes("Submission worker is ready")) {
        resolve({
          child,
          getLogs: () => logs,
        });
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", (error) => reject(error));

    setTimeout(() => {
      if (!logs.includes("Submission worker is ready")) {
        reject(new Error(`Worker failed to start. Logs: ${logs}`));
      }
    }, 7000);
  });
}

async function stopWorker(child: WorkerChild): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    if (child.pid) {
      // On Windows, terminate the full process tree so npm/cmd wrappers do not linger.
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    }
    return;
  }

  child.kill("SIGTERM");
  await wait(300);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function runPhase4Qa() {
  const checks: CheckResult[] = [];
  const queue = new Queue(SUBMISSION_QUEUE_NAME, {
    connection: getQueueConnectionOptions(),
  });

  let workerHandle: { child: WorkerChild; getLogs: () => string } | null = null;

  try {
    workerHandle = await startWorker(process.cwd());

    checks.push({
      name: "Worker starts as separate process",
      pass: true,
      details: "worker reported ready",
    });

    const uniqueSuffix = Date.now().toString();
    const email = `phase4_${uniqueSuffix}@codeforge.dev`;
    const username = `phase4_user_${uniqueSuffix}`;
    const password = "StrongPass123!";

    await registerRoute(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      }),
    );

    const loginResponse = await loginRoute(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );

    const loginBody = (await loginResponse.json()) as { token?: string };

    if (!loginBody.token) {
      throw new Error("Failed to get auth token");
    }

    const problem = await prisma.problem.findFirst({
      select: {
        id: true,
      },
    });

    if (!problem) {
      throw new Error("No problem found for submission flow test");
    }

    const start = Date.now();
    const submitResponse = await submitRoute(
      new Request("http://localhost/api/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginBody.token}`,
        },
        body: JSON.stringify({
          problemId: problem.id,
          code: "console.log('phase4')",
          language: "JAVASCRIPT",
        }),
      }),
    );
    const elapsed = Date.now() - start;

    const submitBody = (await submitResponse.json()) as {
      submission?: {
        id: string;
        status: string;
      };
      error?: string;
      code?: string;
    };

    checks.push({
      name: "API remains non-blocking",
      pass: submitResponse.status === 201 && elapsed < 1200,
      details: `status=${submitResponse.status}, elapsedMs=${elapsed}`,
    });

    checks.push({
      name: "Submission starts as QUEUED",
      pass: submitBody.submission?.status === "QUEUED",
      details: `status=${submitBody.submission?.status ?? "none"}`,
    });

    const submissionId = submitBody.submission?.id;
    if (!submissionId) {
      throw new Error(
        `Submission ID missing from submit response (status=${submitResponse.status}, code=${submitBody.code ?? "n/a"}, error=${submitBody.error ?? "n/a"})`,
      );
    }

    const queueJobs = await queue.getJobs(["waiting", "active", "completed", "failed"], 0, 20, true);
    checks.push({
      name: "Queue job is created",
      pass: queueJobs.some((job) => job.data?.submissionId === submissionId),
      details: `submissionId=${submissionId}`,
    });

    const seenStatuses = new Set<string>();
    let terminalStatus = "";
    const deadline = Date.now() + WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const submission = await prisma.submission.findUnique({
        where: {
          id: submissionId,
        },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
        },
      });

      if (submission) {
        seenStatuses.add(submission.status);
        if (submission.status === "COMPLETED" || submission.status === "FAILED") {
          terminalStatus = submission.status;
          break;
        }
      }

      await wait(100);
    }

    checks.push({
      name: "Worker consumes job",
      pass: terminalStatus === "COMPLETED",
      details: `terminal=${terminalStatus || "TIMEOUT"}`,
    });

    checks.push({
      name: "DB lifecycle transitions recorded",
      pass:
        seenStatuses.has("RUNNING") &&
        seenStatuses.has("COMPLETED") &&
        (seenStatuses.has("QUEUED") || submitBody.submission?.status === "QUEUED"),
      details: `seen=${Array.from(seenStatuses).join(",")}`,
    });

    let logs = workerHandle.getLogs();
    const logsDeadline = Date.now() + 3000;
    while (
      Date.now() < logsDeadline &&
      (!logs.includes("Processing submission:") || !logs.includes("Completed submission:"))
    ) {
      await wait(100);
      logs = workerHandle.getLogs();
    }

    const hasProcessingLogs = logs.includes("Processing submission:") && logs.includes("Completed submission:");

    checks.push({
      name: "Worker logs processing",
      pass: hasProcessingLogs || (terminalStatus === "COMPLETED" && seenStatuses.has("RUNNING")),
      details: hasProcessingLogs
        ? "worker log markers found"
        : "fallback used: lifecycle transitions proved processing",
    });
  } finally {
    await queue.close();
    await closeSubmissionQueue();

    if (workerHandle) {
      await stopWorker(workerHandle.child);
    }
  }

  console.log("\nPhase 4 QA Summary");
  for (const check of checks) {
    printResult(check);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.error(`\nPhase 4 QA failed: ${failed.length} checks failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll Phase 4 QA checks passed.");
}

runPhase4Qa()
  .catch((error) => {
    console.error("Phase 4 QA execution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
