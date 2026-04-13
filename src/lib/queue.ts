import { Queue } from "bullmq";
import { env } from "@/lib/env";

export const SUBMISSION_QUEUE_NAME = "submission-queue";

export type SubmissionJobData = {
  submissionId: string;
};

const queueConnection = {
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
};

const globalForQueue = globalThis as unknown as {
  submissionQueue: Queue<SubmissionJobData> | undefined;
};

function createSubmissionQueue() {
  return new Queue<SubmissionJobData>(SUBMISSION_QUEUE_NAME, {
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
