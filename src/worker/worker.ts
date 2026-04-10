import { Worker } from "bullmq";
import { SubmissionStatus } from "../../generated/prisma";
import { getQueueConnectionOptions, SUBMISSION_QUEUE_NAME, type SubmissionJobData } from "../lib/queue";
import { prisma } from "../lib/prisma";

const STALE_RUNNING_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_RECOVERY_INTERVAL_MS = 60 * 1000;

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
    console.warn(`Recovered stale RUNNING submissions: ${recovered.count}`);
  }
}

const worker = new Worker<SubmissionJobData>(
  SUBMISSION_QUEUE_NAME,
  async (job) => {
    const { submissionId } = job.data;

    console.log(`Processing submission: ${submissionId}`);

    const started = await prisma.submission.updateMany({
      where: {
        id: submissionId,
        status: SubmissionStatus.QUEUED,
      },
      data: {
        status: SubmissionStatus.RUNNING,
        startedAt: new Date(),
        completedAt: null,
        failedAt: null,
      },
    });

    if (started.count === 0) {
      throw new Error(`Submission ${submissionId} is not QUEUED or does not exist`);
    }

    // Placeholder execution delay for Phase 4; real execution engine lands in Phase 5.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const completed = await prisma.submission.updateMany({
      where: {
        id: submissionId,
        status: SubmissionStatus.RUNNING,
      },
      data: {
        status: SubmissionStatus.COMPLETED,
        completedAt: new Date(),
        failedAt: null,
      },
    });

    if (completed.count === 0) {
      throw new Error(`Submission ${submissionId} is not RUNNING when completing`);
    }

    console.log(`Completed submission: ${submissionId}`);
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
  console.log("Submission worker is ready");
});

worker.on("failed", async (job, error) => {
  const submissionId = job?.data?.submissionId;

  if (submissionId) {
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

  console.error(`Failed job ${job?.id ?? "unknown"}:`, error.message);
});

worker.on("error", (error) => {
  console.error("Worker runtime error:", error);
});

async function shutdown() {
  clearInterval(staleRecoveryTimer);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
