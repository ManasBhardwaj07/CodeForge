import net from "node:net";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { Queue } from "bullmq";
import { disconnectPrisma, prisma } from "./client";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { POST as submitRoute } from "../src/app/api/submit/route";
import { closeSubmissionQueue, getQueueConnectionOptions, SUBMISSION_QUEUE_NAME } from "../src/lib/queue";
import { executeInSandbox } from "../src/services/execution.service";

type CheckResult = {
  name: string;
  pass: boolean;
  details: string;
};

type WorkerChild = ReturnType<typeof spawn>;

const WAIT_TIMEOUT_MS = 20000;

function printResult(result: CheckResult) {
  const status = result.pass ? "PASS" : "FAIL";
  console.log(`[${status}] ${result.name} - ${result.details}`);
}

async function ensureRedisAvailable() {
  const connection = getQueueConnectionOptions();

  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({
      host: connection.host,
      port: connection.port,
    });

    const timeoutHandle = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `Redis is unreachable at ${connection.host}:${connection.port}. Start Redis first (for example: docker start codeforge-redis).`,
        ),
      );
    }, 1000);

    socket.once("connect", () => {
      clearTimeout(timeoutHandle);
      socket.end();
      resolve();
    });

    socket.once("error", () => {
      clearTimeout(timeoutHandle);
      reject(
        new Error(
          `Redis is unreachable at ${connection.host}:${connection.port}. Start Redis first (for example: docker start codeforge-redis).`,
        ),
      );
    });
  });
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

async function countExecutionTempDirs(prefix: string): Promise<number> {
  const entries = await readdir(tmpdir(), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).length;
}

async function runQa() {
  const checks: CheckResult[] = [];

  await ensureRedisAvailable();

  const beforeJsTempDirs = await countExecutionTempDirs("codeforge-js-");
  const beforeCppTempDirs = await countExecutionTempDirs("codeforge-cpp-");

  const jsEchoResult = await executeInSandbox({
    language: "JAVASCRIPT",
    code: [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => {",
      "  console.log(input.trim().toUpperCase());",
      "});",
    ].join("\n"),
    input: "phase5",
  });

  checks.push({
    name: "JS execution works",
    pass: jsEchoResult.success && jsEchoResult.stdout.trim() === "PHASE5",
    details: `success=${jsEchoResult.success}, stdout=${JSON.stringify(jsEchoResult.stdout.trim())}`,
  });

  const jsLargeOutputResult = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "process.stdout.write('A'.repeat(100000));",
    input: "",
  });

  checks.push({
    name: "Output size is capped",
    pass:
      jsLargeOutputResult.success &&
      jsLargeOutputResult.metadata.outputTruncated &&
      jsLargeOutputResult.stdout.length <= 64000,
    details: `len=${jsLargeOutputResult.stdout.length}, outputTruncated=${jsLargeOutputResult.metadata.outputTruncated}`,
  });

  const jsTimeoutResult = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "while (true) {}",
    input: "",
    policy: {
      perTestTimeoutMs: 800,
      globalTimeoutMs: 5000,
    },
  });

  checks.push({
    name: "JS timeout enforcement",
    pass: !jsTimeoutResult.success && jsTimeoutResult.timedOut && jsTimeoutResult.exitCode === null,
    details: `timedOut=${jsTimeoutResult.timedOut}, exitCode=${jsTimeoutResult.exitCode}`,
  });

  const nonRootResult = await executeInSandbox({
    language: "JAVASCRIPT",
    code: "console.log(String(process.getuid && process.getuid()));",
    input: "",
  });

  const uid = Number.parseInt(nonRootResult.stdout.trim(), 10);
  checks.push({
    name: "Runs as non-root user",
    pass: nonRootResult.success && Number.isInteger(uid) && uid !== 0,
    details: `uid=${nonRootResult.stdout.trim() || "unknown"}`,
  });

  const cppSuccessResult = await executeInSandbox({
    language: "CPP",
    code: [
      "#include <iostream>",
      "int main() {",
      "  long long a = 0, b = 0;",
      "  std::cin >> a >> b;",
      "  std::cout << (a + b);",
      "  return 0;",
      "}",
    ].join("\n"),
    input: "11 31",
    policy: {
      perTestTimeoutMs: 5000,
      globalTimeoutMs: 10000,
    },
  });

  checks.push({
    name: "CPP execution works",
    pass: cppSuccessResult.success && cppSuccessResult.stdout.trim() === "42" && !cppSuccessResult.compileError,
    details: `success=${cppSuccessResult.success}, stdout=${JSON.stringify(cppSuccessResult.stdout.trim())}`,
  });

  const cppCompileErrorResult = await executeInSandbox({
    language: "CPP",
    code: [
      "#include <iostream>",
      "int main() {",
      "  std::cout << \"broken\"",
      "  return 0;",
      "}",
    ].join("\n"),
    input: "",
    policy: {
      perTestTimeoutMs: 5000,
      globalTimeoutMs: 10000,
    },
  });

  checks.push({
    name: "CPP compile errors are captured",
    pass: !cppCompileErrorResult.success && cppCompileErrorResult.compileError,
    details: `success=${cppCompileErrorResult.success}, compileError=${cppCompileErrorResult.compileError}`,
  });

  const cppTimeoutResult = await executeInSandbox({
    language: "CPP",
    code: [
      "int main() {",
      "  while (true) {}",
      "  return 0;",
      "}",
    ].join("\n"),
    input: "",
    policy: {
      perTestTimeoutMs: 800,
      globalTimeoutMs: 5000,
    },
  });

  checks.push({
    name: "CPP timeout enforcement",
    pass: !cppTimeoutResult.success && cppTimeoutResult.timedOut,
    details: `timedOut=${cppTimeoutResult.timedOut}, exitCode=${cppTimeoutResult.exitCode}`,
  });

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

    const problem = await prisma.problem.findUnique({
      where: {
        slug: "two-sum-variant",
      },
      select: {
        id: true,
        testCases: {
          orderBy: {
            orderIndex: "asc",
          },
          select: {
            id: true,
          },
        },
      },
    });

    if (!problem || problem.testCases.length === 0) {
      throw new Error("two-sum-variant problem with test cases is required");
    }

    const uniqueSuffix = Date.now().toString();
    const email = `phase5_${uniqueSuffix}@codeforge.dev`;
    const username = `phase5_user_${uniqueSuffix}`;
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

    const jsTwoSumCode = [
      "let input = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => {",
      "  const nums = input.trim().split(/\\s+/).filter(Boolean).map(Number);",
      "  const total = nums.reduce((acc, value) => acc + value, 0);",
      "  process.stdout.write(String(total));",
      "});",
    ].join("\n");

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
          code: jsTwoSumCode,
          language: "JAVASCRIPT",
        }),
      }),
    );
    const elapsedMs = Date.now() - start;

    const submitBody = (await submitResponse.json()) as {
      submission?: {
        id: string;
      };
      error?: string;
      code?: string;
    };

    checks.push({
      name: "Submit API remains non-blocking",
      pass: submitResponse.status === 201 && elapsedMs < 1200,
      details: `status=${submitResponse.status}, elapsedMs=${elapsedMs}`,
    });

    const submissionId = submitBody.submission?.id;
    if (!submissionId) {
      throw new Error(
        `Submission ID missing (status=${submitResponse.status}, code=${submitBody.code ?? "n/a"}, error=${submitBody.error ?? "n/a"})`,
      );
    }

    const queueJobs = await queue.getJobs(["waiting", "active", "completed", "failed"], 0, 50, true);
    checks.push({
      name: "Queue job created",
      pass: queueJobs.some((job) => job.data?.submissionId === submissionId),
      details: `submissionId=${submissionId}`,
    });

    let terminalSubmission:
      | {
          status: string;
          startedAt: Date | null;
          completedAt: Date | null;
          executionResults: Array<{
            passed: boolean;
          }>;
        }
      | null = null;

    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const current = await prisma.submission.findUnique({
        where: {
          id: submissionId,
        },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          executionResults: {
            select: {
              passed: true,
            },
          },
        },
      });

      if (current && (current.status === "COMPLETED" || current.status === "FAILED")) {
        terminalSubmission = current;
        break;
      }

      await wait(100);
    }

    checks.push({
      name: "Worker reaches terminal status",
      pass: terminalSubmission?.status === "COMPLETED",
      details: `status=${terminalSubmission?.status ?? "TIMEOUT"}`,
    });

    checks.push({
      name: "Execution results persisted per test case",
      pass: (terminalSubmission?.executionResults.length ?? 0) === problem.testCases.length,
      details: `results=${terminalSubmission?.executionResults.length ?? 0}, expected=${problem.testCases.length}`,
    });

    checks.push({
      name: "All two-sum test cases pass",
      pass: terminalSubmission?.executionResults.every((result) => result.passed) === true,
      details: `allPassed=${terminalSubmission?.executionResults.every((result) => result.passed) ?? false}`,
    });
  } finally {
    await queue.close();
    await closeSubmissionQueue();

    if (workerHandle) {
      await stopWorker(workerHandle.child);
    }
  }

  await wait(100);

  const afterJsTempDirs = await countExecutionTempDirs("codeforge-js-");
  const afterCppTempDirs = await countExecutionTempDirs("codeforge-cpp-");

  checks.push({
    name: "Temp workspaces are cleaned up",
    pass: afterJsTempDirs <= beforeJsTempDirs && afterCppTempDirs <= beforeCppTempDirs,
    details: `js(before=${beforeJsTempDirs}, after=${afterJsTempDirs}), cpp(before=${beforeCppTempDirs}, after=${afterCppTempDirs})`,
  });

  console.log("\nPhase 5 QA Summary");
  for (const check of checks) {
    printResult(check);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) {
    console.error(`\nPhase 5 QA failed: ${failed.length} checks failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll Phase 5 QA checks passed.");
}

void runQa()
  .catch((error) => {
    console.error("Phase 5 QA execution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSubmissionQueue();
    await disconnectPrisma();
  });
