import { Queue } from "bullmq";
import { env } from "@/lib/env";

export const SUBMISSION_QUEUE_NAME = "submission-queue";
export const DEAD_LETTER_QUEUE_NAME = "submission-dead-letter";

export type SubmissionJobData = {
  type: 'submission';
  submissionId: string;
  language: string;
  requestId?: string;
};

export type RunJobData = {
  type: 'run';
  jobId: string;
  requestId?: string;
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
  deadLetterQueue: Queue<unknown> | undefined;
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

function createDeadLetterQueue() {
  return new Queue(DEAD_LETTER_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

export function getDeadLetterQueue() {
  if (!globalForQueue.deadLetterQueue) {
    globalForQueue.deadLetterQueue = createDeadLetterQueue();
  }

  return globalForQueue.deadLetterQueue;
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
