import { Queue } from "bullmq";
import { env } from "@/lib/env";

export const SUBMISSION_QUEUE_NAME = "submission-queue";

export type SubmissionJobData = {
  type: 'submission';
  submissionId: string;
};

export type RunJobData = {
  type: 'run';
  jobId: string;
  language: string;
  code: string;
  customInput: string;
};

export type JobData = SubmissionJobData | RunJobData;

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number | null;
  errorType: string | null;
};

const queueConnection = {
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
};

const globalForQueue = globalThis as unknown as {
  submissionQueue: Queue<JobData> | undefined;
};

function createSubmissionQueue() {
  return new Queue<JobData>(SUBMISSION_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });
}

export function getSubmissionQueue() {
  if (!globalForQueue.submissionQueue) {
    globalForQueue.submissionQueue = createSubmissionQueue();
  }

  return globalForQueue.submissionQueue;
}

export async function closeSubmissionQueue() {
  if (!globalForQueue.submissionQueue) {
    return;
  }

  await globalForQueue.submissionQueue.close();
  globalForQueue.submissionQueue = undefined;
}

export function getQueueConnectionOptions() {
  return queueConnection;
}
