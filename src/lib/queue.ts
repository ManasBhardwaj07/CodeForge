import { Queue } from "bullmq";
import { env } from "@/lib/env";

export const SUBMISSION_QUEUE_NAME = "submission-queue";

const queueConnection = {
  host: env.redisHost,
  port: env.redisPort,
  maxRetriesPerRequest: null,
};

const globalForQueue = globalThis as unknown as {
  submissionQueue: Queue | undefined;
};

export const submissionQueue =
  globalForQueue.submissionQueue ??
  new Queue(SUBMISSION_QUEUE_NAME, {
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

if (process.env.NODE_ENV !== "production") {
  globalForQueue.submissionQueue = submissionQueue;
}

export function getQueueConnectionOptions() {
  return queueConnection;
}

export type SubmissionJobData = {
  submissionId: string;
};
