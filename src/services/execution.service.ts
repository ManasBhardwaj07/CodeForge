import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const SUPPORTED_EXECUTION_LANGUAGES = ["JAVASCRIPT", "CPP"] as const;

export type ExecutionLanguage = (typeof SUPPORTED_EXECUTION_LANGUAGES)[number];

export const MAX_EXECUTION_CODE_LENGTH = 20_000;
export const MAX_EXECUTION_INPUT_LENGTH = 100_000;

export const DEFAULT_PER_TEST_TIMEOUT_MS = 2_000;
export const DEFAULT_GLOBAL_TIMEOUT_MS = 30_000;

export type ExecutionResourceLimits = {
  memoryMb: number;
  cpuCount: number;
  pids: number;
};

export type ExecutionPolicy = {
  perTestTimeoutMs: number;
  globalTimeoutMs: number;
  limits: ExecutionResourceLimits;
  disableNetwork: boolean;
  readOnlyRootFs: boolean;
  runAsNonRoot: boolean;
};

export type ExecutionPolicyOverrides = Partial<Omit<ExecutionPolicy, "limits">> & {
  limits?: Partial<ExecutionResourceLimits>;
};

export type ExecutionRequest = {
  language: ExecutionLanguage;
  code: string;
  input: string;
  policy?: ExecutionPolicyOverrides;
  context?: {
    submissionId?: string;
    testCaseId?: string;
  };
};

export type ExecutionOutcome = {
  stdout: string;
  stderr: string;
  success: boolean;
  executionTimeMs: number;
  exitCode: number | null;
  timedOut: boolean;
  compileError: boolean;
  errorType: "COMPILE_ERROR" | "RUNTIME_ERROR" | "TIMEOUT" | "INFRA_ERROR" | null;
  metadata: {
    containerId?: string;
    compileContainerId?: string;
    runContainerId?: string;
    outputTruncated: boolean;
  };
};

export type ExecutionServiceErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_LANGUAGE"
  | "NOT_IMPLEMENTED"
  | "INFRA_ERROR";

export class ExecutionServiceError extends Error {
  code: ExecutionServiceErrorCode;

  constructor(message: string, code: ExecutionServiceErrorCode) {
    super(message);
    this.name = "ExecutionServiceError";
    this.code = code;
  }
}

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

type RunProcessOptions = {
  timeoutMs?: number;
  onTimeout?: () => void;
};

const ensuredDockerImages = new Set<string>();
const TEMP_WORKSPACE_PREFIXES = ["codeforge-js-", "codeforge-cpp-"] as const;
const TEMP_WORKSPACE_STALE_AGE_MS = 60 * 60 * 1000;
const MAX_PROCESS_STDOUT_CHARS = 64_000;
const MAX_PROCESS_STDERR_CHARS = 64_000;

let lastTempWorkspaceJanitorRunAt = 0;

export const DEFAULT_EXECUTION_POLICY: ExecutionPolicy = {
  perTestTimeoutMs: DEFAULT_PER_TEST_TIMEOUT_MS,
  globalTimeoutMs: DEFAULT_GLOBAL_TIMEOUT_MS,
  limits: {
    memoryMb: 256,
    cpuCount: 0.5,
    pids: 64,
  },
  disableNetwork: true,
  readOnlyRootFs: true,
  runAsNonRoot: true,
};

function assertFinitePositiveNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ExecutionServiceError(`${field} must be a positive number`, "INVALID_REQUEST");
  }
}

function assertFinitePositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ExecutionServiceError(`${field} must be a positive integer`, "INVALID_REQUEST");
  }
}

export function isExecutionLanguage(value: string): value is ExecutionLanguage {
  return (SUPPORTED_EXECUTION_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeExecutionPolicy(overrides?: ExecutionPolicyOverrides): ExecutionPolicy {
  const normalized: ExecutionPolicy = {
    perTestTimeoutMs: overrides?.perTestTimeoutMs ?? DEFAULT_EXECUTION_POLICY.perTestTimeoutMs,
    globalTimeoutMs: overrides?.globalTimeoutMs ?? DEFAULT_EXECUTION_POLICY.globalTimeoutMs,
    limits: {
      memoryMb: overrides?.limits?.memoryMb ?? DEFAULT_EXECUTION_POLICY.limits.memoryMb,
      cpuCount: overrides?.limits?.cpuCount ?? DEFAULT_EXECUTION_POLICY.limits.cpuCount,
      pids: overrides?.limits?.pids ?? DEFAULT_EXECUTION_POLICY.limits.pids,
    },
    disableNetwork: overrides?.disableNetwork ?? DEFAULT_EXECUTION_POLICY.disableNetwork,
    readOnlyRootFs: overrides?.readOnlyRootFs ?? DEFAULT_EXECUTION_POLICY.readOnlyRootFs,
    runAsNonRoot: overrides?.runAsNonRoot ?? DEFAULT_EXECUTION_POLICY.runAsNonRoot,
  };

  assertFinitePositiveInteger(normalized.perTestTimeoutMs, "perTestTimeoutMs");
  assertFinitePositiveInteger(normalized.globalTimeoutMs, "globalTimeoutMs");

  if (normalized.globalTimeoutMs < normalized.perTestTimeoutMs) {
    throw new ExecutionServiceError(
      "globalTimeoutMs must be greater than or equal to perTestTimeoutMs",
      "INVALID_REQUEST",
    );
  }

  assertFinitePositiveInteger(normalized.limits.memoryMb, "limits.memoryMb");
  assertFinitePositiveNumber(normalized.limits.cpuCount, "limits.cpuCount");
  assertFinitePositiveInteger(normalized.limits.pids, "limits.pids");

  return normalized;
}

export function validateExecutionRequest(request: ExecutionRequest): ExecutionPolicy {
  if (!isExecutionLanguage(request.language)) {
    throw new ExecutionServiceError("Unsupported execution language", "UNSUPPORTED_LANGUAGE");
  }

  if (typeof request.code !== "string" || request.code.trim().length === 0) {
    throw new ExecutionServiceError("Code is required", "INVALID_REQUEST");
  }

  if (request.code.length > MAX_EXECUTION_CODE_LENGTH) {
    throw new ExecutionServiceError(
      `Code exceeds max length of ${MAX_EXECUTION_CODE_LENGTH}`,
      "INVALID_REQUEST",
    );
  }

  if (typeof request.input !== "string") {
    throw new ExecutionServiceError("Input must be a string", "INVALID_REQUEST");
  }

  if (request.input.length > MAX_EXECUTION_INPUT_LENGTH) {
    throw new ExecutionServiceError(
      `Input exceeds max length of ${MAX_EXECUTION_INPUT_LENGTH}`,
      "INVALID_REQUEST",
    );
  }

  return normalizeExecutionPolicy(request.policy);
}

function terminateProcessTree(pid: number | undefined) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Ignore if process is already gone.
  }
}

function forceRemoveContainer(containerName: string) {
  spawnSync("docker", ["rm", "-f", containerName], {
    stdio: "ignore",
  });
}

function makeContainerName(request: ExecutionRequest): string {
  const submissionPart = (request.context?.submissionId ?? "sub")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .slice(0, 16);

  const testCasePart = (request.context?.testCaseId ?? "tc")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "-")
    .slice(0, 16);

  const randomPart = Math.random().toString(36).slice(2, 8);
  return `codeforge-js-${submissionPart}-${testCasePart}-${Date.now()}-${randomPart}`;
}

function normalizeDockerMountPath(localPath: string): string {
  return localPath.replace(/\\/g, "/");
}

async function cleanupStaleTempWorkspaces() {
  const baseTempDir = tmpdir();
  const entries = await readdir(baseTempDir, { withFileTypes: true });
  const cutoff = Date.now() - TEMP_WORKSPACE_STALE_AGE_MS;

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) {
        return;
      }

      if (!TEMP_WORKSPACE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
        return;
      }

      const workspacePath = path.join(baseTempDir, entry.name);

      try {
        const metadata = await stat(workspacePath);
        if (metadata.mtimeMs < cutoff) {
          await rm(workspacePath, { recursive: true, force: true });
        }
      } catch {
        // Ignore races where temp dirs disappear between list and stat/remove.
      }
    }),
  );
}

async function runTempWorkspaceJanitorIfDue() {
  const now = Date.now();

  if (now - lastTempWorkspaceJanitorRunAt < 5 * 60 * 1000) {
    return;
  }

  lastTempWorkspaceJanitorRunAt = now;

  try {
    await cleanupStaleTempWorkspaces();
  } catch {
    // Cleanup is best-effort and should not block execution.
  }
}

function buildBaseDockerRunArgs(options: {
  containerName: string;
  workspacePath: string;
  policy: ExecutionPolicy;
  userArg: string;
  cidFilePath?: string;
}): string[] {
  const { containerName, workspacePath, policy, userArg, cidFilePath } = options;

  const dockerArgs = [
    "run",
    "--pull",
    "never",
    "--rm",
    "--interactive",
    "--name",
    containerName,
    "--workdir",
    "/workspace",
    "--volume",
    `${workspacePath}:/workspace`,
    "--memory",
    `${policy.limits.memoryMb}m`,
    "--cpus",
    `${policy.limits.cpuCount}`,
    "--pids-limit",
    `${policy.limits.pids}`,
    "--user",
    userArg,
  ];

  if (cidFilePath) {
    dockerArgs.push("--cidfile", cidFilePath);
  }

  if (policy.disableNetwork) {
    dockerArgs.push("--network", "none");
  }

  if (policy.readOnlyRootFs) {
    dockerArgs.push("--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");
  }

  return dockerArgs;
}

function appendWithCap(current: string, incoming: string, cap: number) {
  if (current.length >= cap) {
    return {
      value: current,
      truncated: true,
    };
  }

  const remaining = cap - current.length;
  if (incoming.length <= remaining) {
    return {
      value: `${current}${incoming}`,
      truncated: false,
    };
  }

  return {
    value: `${current}${incoming.slice(0, remaining)}`,
    truncated: true,
  };
}

async function readContainerIdFromCidFile(cidFilePath: string) {
  try {
    const cid = (await readFile(cidFilePath, "utf8")).trim();
    return cid.length > 0 ? cid : undefined;
  } catch {
    return undefined;
  }
}

function addOutputTruncationNote(stderr: string, processResult: ProcessResult) {
  if (!processResult.stdoutTruncated && !processResult.stderrTruncated) {
    return stderr;
  }

  const notes: string[] = [];
  if (processResult.stdoutTruncated) {
    notes.push(`stdout capped at ${MAX_PROCESS_STDOUT_CHARS} chars`);
  }

  if (processResult.stderrTruncated) {
    notes.push(`stderr capped at ${MAX_PROCESS_STDERR_CHARS} chars`);
  }

  const suffix = `Output truncated (${notes.join(", ")}).`;
  if (stderr.length === 0) {
    return suffix;
  }

  return `${stderr}\n${suffix}`;
}

async function ensureDockerImageAvailable(image: string) {
  if (ensuredDockerImages.has(image)) {
    return;
  }

  const inspectResult = await runProcess("docker", ["image", "inspect", image], "", {
    timeoutMs: 5000,
  });

  if (inspectResult.exitCode !== 0) {
    const pullResult = await runProcess("docker", ["pull", image], "", {
      timeoutMs: 120000,
    });

    if (pullResult.timedOut || pullResult.exitCode !== 0) {
      throw new ExecutionServiceError(
        `Failed to pull required image ${image}: ${pullResult.stderr || "unknown pull failure"}`,
        "INFRA_ERROR",
      );
    }
  }

  ensuredDockerImages.add(image);
}

async function runProcess(
  command: string,
  args: string[],
  stdinData: string,
  options?: RunProcessOptions,
): Promise<ProcessResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const timeoutHandle =
      options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }

            timedOut = true;
            stderr += `\nExecution timed out after ${options.timeoutMs}ms.`;

            try {
              options.onTimeout?.();
            } catch {
              // Ignore timeout hook errors and continue termination.
            }

            terminateProcessTree(child.pid);
          }, options.timeoutMs)
        : undefined;

    child.on("error", (error) => {
      if (settled || timedOut) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      reject(new ExecutionServiceError(`Failed to start process: ${error.message}`, "INFRA_ERROR"));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      const appended = appendWithCap(stdout, chunk.toString(), MAX_PROCESS_STDOUT_CHARS);
      stdout = appended.value;
      stdoutTruncated = stdoutTruncated || appended.truncated;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const appended = appendWithCap(stderr, chunk.toString(), MAX_PROCESS_STDERR_CHARS);
      stderr = appended.value;
      stderrTruncated = stderrTruncated || appended.truncated;
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? null : exitCode,
        executionTimeMs: Date.now() - startedAt,
        timedOut,
        stdoutTruncated,
        stderrTruncated,
      });
    });

    try {
      if (stdinData.length > 0) {
        child.stdin.write(stdinData);
      }

      child.stdin.end();
    } catch {
      // Process may have already closed.
    }
  });
}

async function executeJavaScriptInDocker(
  request: ExecutionRequest,
  policy: ExecutionPolicy,
): Promise<ExecutionOutcome> {
  await ensureDockerImageAvailable("node:18");

  const workspaceDir = await mkdtemp(path.join(tmpdir(), "codeforge-js-"));
  const sourceFilePath = path.join(workspaceDir, "main.js");
  const cidFilePath = path.join(workspaceDir, "container.cid");
  const containerName = makeContainerName(request);
  const timeoutMs = Math.min(policy.perTestTimeoutMs, policy.globalTimeoutMs);
  const normalizedWorkspaceDir = normalizeDockerMountPath(workspaceDir);

  try {
    await writeFile(sourceFilePath, request.code, "utf8");

    const dockerArgs = buildBaseDockerRunArgs({
      containerName,
      workspacePath: normalizedWorkspaceDir,
      policy,
      userArg: policy.runAsNonRoot ? "node" : "0:0",
      cidFilePath: normalizeDockerMountPath(cidFilePath),
    });

    dockerArgs.push("node:18", "node", "/workspace/main.js");

    const processResult = await runProcess("docker", dockerArgs, request.input, {
      timeoutMs,
      onTimeout: () => forceRemoveContainer(containerName),
    });

    const containerId = await readContainerIdFromCidFile(cidFilePath);
    const stderrWithNotes = addOutputTruncationNote(processResult.stderr, processResult);
    const outputTruncated = processResult.stdoutTruncated || processResult.stderrTruncated;

    if (processResult.timedOut) {
      return {
        stdout: processResult.stdout,
        stderr: stderrWithNotes,
        success: false,
        executionTimeMs: processResult.executionTimeMs,
        exitCode: null,
        timedOut: true,
        compileError: false,
        errorType: "TIMEOUT",
        metadata: {
          containerId,
          outputTruncated,
        },
      };
    }

    if (processResult.exitCode === 125) {
      throw new ExecutionServiceError(
        `Docker runtime error: ${processResult.stderr || "docker returned exit code 125"}`,
        "INFRA_ERROR",
      );
    }

    return {
      stdout: processResult.stdout,
      stderr: stderrWithNotes,
      success: processResult.exitCode === 0,
      executionTimeMs: processResult.executionTimeMs,
      exitCode: processResult.exitCode,
      timedOut: processResult.timedOut,
      compileError: false,
      errorType: processResult.exitCode === 0 ? null : "RUNTIME_ERROR",
      metadata: {
        containerId,
        outputTruncated,
      },
    };
  } finally {
    forceRemoveContainer(containerName);
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

async function executeCppInDocker(
  request: ExecutionRequest,
  policy: ExecutionPolicy,
): Promise<ExecutionOutcome> {
  await ensureDockerImageAvailable("gcc:13");

  const workspaceDir = await mkdtemp(path.join(tmpdir(), "codeforge-cpp-"));
  const sourceFilePath = path.join(workspaceDir, "main.cpp");
  const compileCidFilePath = path.join(workspaceDir, "compile.cid");
  const runCidFilePath = path.join(workspaceDir, "run.cid");
  const baseContainerName = makeContainerName(request).replace("codeforge-js", "codeforge-cpp");
  const compileContainerName = `${baseContainerName}-compile`;
  const runContainerName = `${baseContainerName}-run`;
  const normalizedWorkspaceDir = normalizeDockerMountPath(workspaceDir);
  const deadline = Date.now() + Math.min(policy.perTestTimeoutMs, policy.globalTimeoutMs);

  try {
    await writeFile(sourceFilePath, request.code, "utf8");

    const compileRemainingMs = deadline - Date.now();
    if (compileRemainingMs <= 0) {
      return {
        stdout: "",
        stderr: `Execution timed out after ${Math.min(policy.perTestTimeoutMs, policy.globalTimeoutMs)}ms.`,
        success: false,
        executionTimeMs: 0,
        exitCode: null,
        timedOut: true,
        compileError: false,
        errorType: "TIMEOUT",
        metadata: {
          outputTruncated: false,
        },
      };
    }

    const compileArgs = buildBaseDockerRunArgs({
      containerName: compileContainerName,
      workspacePath: normalizedWorkspaceDir,
      policy,
      userArg: policy.runAsNonRoot ? "1000:1000" : "0:0",
      cidFilePath: normalizeDockerMountPath(compileCidFilePath),
    });

    compileArgs.push(
      "gcc:13",
      "sh",
      "-lc",
      "g++ -std=c++17 /workspace/main.cpp -O2 -o /workspace/main.out",
    );

    const compileResult = await runProcess("docker", compileArgs, "", {
      timeoutMs: compileRemainingMs,
      onTimeout: () => forceRemoveContainer(compileContainerName),
    });

    const compileContainerId = await readContainerIdFromCidFile(compileCidFilePath);
    const compileStderrWithNotes = addOutputTruncationNote(compileResult.stderr, compileResult);
    const compileOutputTruncated = compileResult.stdoutTruncated || compileResult.stderrTruncated;

    if (compileResult.timedOut) {
      return {
        stdout: compileResult.stdout,
        stderr: compileStderrWithNotes,
        success: false,
        executionTimeMs: compileResult.executionTimeMs,
        exitCode: null,
        timedOut: true,
        compileError: false,
        errorType: "TIMEOUT",
        metadata: {
          compileContainerId,
          outputTruncated: compileOutputTruncated,
        },
      };
    }

    if (compileResult.exitCode === 125) {
      throw new ExecutionServiceError(
        `Docker runtime error during compile: ${compileResult.stderr || "docker returned exit code 125"}`,
        "INFRA_ERROR",
      );
    }

    if (compileResult.exitCode !== 0) {
      return {
        stdout: compileResult.stdout,
        stderr: compileStderrWithNotes,
        success: false,
        executionTimeMs: compileResult.executionTimeMs,
        exitCode: compileResult.exitCode,
        timedOut: false,
        compileError: true,
        errorType: "COMPILE_ERROR",
        metadata: {
          compileContainerId,
          outputTruncated: compileOutputTruncated,
        },
      };
    }

    const runRemainingMs = deadline - Date.now();
    if (runRemainingMs <= 0) {
      return {
        stdout: "",
        stderr: `Execution timed out after ${Math.min(policy.perTestTimeoutMs, policy.globalTimeoutMs)}ms.`,
        success: false,
        executionTimeMs: compileResult.executionTimeMs,
        exitCode: null,
        timedOut: true,
        compileError: false,
        errorType: "TIMEOUT",
        metadata: {
          compileContainerId,
          outputTruncated: compileOutputTruncated,
        },
      };
    }

    const runArgs = buildBaseDockerRunArgs({
      containerName: runContainerName,
      workspacePath: normalizedWorkspaceDir,
      policy,
      userArg: policy.runAsNonRoot ? "1000:1000" : "0:0",
      cidFilePath: normalizeDockerMountPath(runCidFilePath),
    });

    runArgs.push("gcc:13", "/workspace/main.out");

    const runResult = await runProcess("docker", runArgs, request.input, {
      timeoutMs: runRemainingMs,
      onTimeout: () => forceRemoveContainer(runContainerName),
    });

    const runContainerId = await readContainerIdFromCidFile(runCidFilePath);
    const runStderrWithNotes = addOutputTruncationNote(runResult.stderr, runResult);
    const runOutputTruncated = runResult.stdoutTruncated || runResult.stderrTruncated;

    if (runResult.timedOut) {
      return {
        stdout: runResult.stdout,
        stderr: runStderrWithNotes,
        success: false,
        executionTimeMs: compileResult.executionTimeMs + runResult.executionTimeMs,
        exitCode: null,
        timedOut: true,
        compileError: false,
        errorType: "TIMEOUT",
        metadata: {
          compileContainerId,
          runContainerId,
          outputTruncated: compileOutputTruncated || runOutputTruncated,
        },
      };
    }

    if (runResult.exitCode === 125) {
      throw new ExecutionServiceError(
        `Docker runtime error during run: ${runResult.stderr || "docker returned exit code 125"}`,
        "INFRA_ERROR",
      );
    }

    return {
      stdout: runResult.stdout,
      stderr: runStderrWithNotes,
      success: runResult.exitCode === 0,
      executionTimeMs: compileResult.executionTimeMs + runResult.executionTimeMs,
      exitCode: runResult.exitCode,
      timedOut: false,
      compileError: false,
      errorType: runResult.exitCode === 0 ? null : "RUNTIME_ERROR",
      metadata: {
        compileContainerId,
        runContainerId,
        outputTruncated: compileOutputTruncated || runOutputTruncated,
      },
    };
  } finally {
    forceRemoveContainer(compileContainerName);
    forceRemoveContainer(runContainerName);
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

export async function executeInSandbox(request: ExecutionRequest): Promise<ExecutionOutcome> {
  await runTempWorkspaceJanitorIfDue();

  const policy = validateExecutionRequest(request);

  if (request.language === "JAVASCRIPT") {
    return executeJavaScriptInDocker(request, policy);
  }

  if (request.language === "CPP") {
    return executeCppInDocker(request, policy);
  }

  throw new ExecutionServiceError("Execution language is not implemented yet", "NOT_IMPLEMENTED");
}
