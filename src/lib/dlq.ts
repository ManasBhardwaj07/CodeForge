export type FailureCategory =
  | "INFRA_FAILURE"
  | "EXECUTION_TIMEOUT"
  | "SANDBOX_ERROR"
  | "REDIS_ERROR"
  | "COMPILATION_ERROR"
  | "WRONG_ANSWER";

export type DlqEnvelope = {
  originalQueue?: string;
  jobId?: string;
  jobName?: string;
  data?: unknown;
  failedReason?: string;
  attemptsMade?: number;
  timestamp?: string;
  failureCategory?: FailureCategory | string;
  replayedAt?: string;
  replayedBy?: {
    userId: string;
    email: string;
  };
  replayAttempt?: number;
};

export type OriginalJobData = {
  type?: "submission" | "run";
  requestId?: string;
  language?: string;
  submissionId?: string;
  jobId?: string;
};

export function asDlqEnvelope(value: unknown): DlqEnvelope {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as DlqEnvelope;
}

export function asOriginalJobData(value: unknown): OriginalJobData {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as OriginalJobData;
}

export function isReplayAllowed(
  category: string | null,
  opts?: { allowSandbox?: boolean },
): { allowed: boolean; reason?: string } {
  if (!category) {
    return { allowed: false, reason: "Missing failureCategory" };
  }

  if (category === "REDIS_ERROR" || category === "INFRA_FAILURE") {
    return { allowed: true };
  }

  if (category === "SANDBOX_ERROR") {
    if (opts?.allowSandbox) {
      return { allowed: true };
    }
    return { allowed: false, reason: "SANDBOX_ERROR replay requires allowSandbox=true" };
  }

  if (category === "COMPILATION_ERROR" || category === "WRONG_ANSWER") {
    return { allowed: false, reason: `${category} is not replayable` };
  }

  return { allowed: false, reason: `Replay not enabled for category ${category}` };
}
