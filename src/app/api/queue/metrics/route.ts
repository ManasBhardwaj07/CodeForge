import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue, getSubmissionQueue } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

type JobSample = {
  state: string;
  language: string;
  attemptsMade: number;
  timestamp: number | null;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason?: string | null;
};

type AvgBucket = {
  count: number;
  totalMs: number;
};

function addAvg(map: Record<string, AvgBucket>, key: string, value: number | null | undefined) {
  if (value === null || value === undefined) {
    return;
  }

  if (!map[key]) {
    map[key] = { count: 0, totalMs: 0 };
  }

  map[key].count += 1;
  map[key].totalMs += value;
}

function finalizeAvg(map: Record<string, AvgBucket>) {
  return Object.fromEntries(
    Object.entries(map).map(([key, bucket]) => [
      key,
      {
        count: bucket.count,
        avgMs: bucket.count > 0 ? Math.round(bucket.totalMs / bucket.count) : null,
      },
    ])
  );
}

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "200") || 200, 1), 500);

    const submissionQueue = getSubmissionQueue();
    const deadLetterQueue = getDeadLetterQueue();
    const [submissionCounts, stalledCounts, dlqCounts, waitingJobs, activeJobs, completedJobs, failedJobs] = await Promise.all([
      submissionQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
      (submissionQueue as unknown as { getJobCounts: (...types: string[]) => Promise<Record<string, number>> })
        .getJobCounts("stalled"),
      deadLetterQueue.getJobCounts("failed", "waiting", "active", "completed"),
      submissionQueue.getJobs(["waiting"], 0, Math.max(limit - 1, 0), true),
      submissionQueue.getJobs(["active"], 0, Math.max(limit - 1, 0), true),
      submissionQueue.getJobs(["completed"], 0, Math.max(limit - 1, 0), true),
      submissionQueue.getJobs(["failed"], 0, Math.max(limit - 1, 0), true),
    ]);

    const jobSamples: JobSample[] = [
      ...waitingJobs.map((job) => ({
        state: "waiting",
        language: job.data?.language ?? "UNKNOWN",
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
      })),
      ...activeJobs.map((job) => ({
        state: "active",
        language: job.data?.language ?? "UNKNOWN",
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
      })),
      ...completedJobs.map((job) => ({
        state: "completed",
        language: job.data?.language ?? "UNKNOWN",
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
      })),
      ...failedJobs.map((job) => ({
        state: "failed",
        language: job.data?.language ?? "UNKNOWN",
        attemptsMade: job.attemptsMade ?? 0,
        timestamp: job.timestamp ?? null,
        processedOn: job.processedOn ?? null,
        finishedOn: job.finishedOn ?? null,
        failedReason: job.failedReason ?? null,
      })),
    ];

    const oldestWaitingJob = waitingJobs[0];
    const oldestWaitingAgeMs = oldestWaitingJob?.timestamp ? Date.now() - oldestWaitingJob.timestamp : null;

    const activeJob = activeJobs[0];
    const activeAgeMs = activeJob?.processedOn ? Date.now() - activeJob.processedOn : null;

    const runtimeByLanguage: Record<string, AvgBucket> = {};
    const runtimeByStatus: Record<string, AvgBucket> = {};
    const runtimeByState: Record<string, AvgBucket> = {};
    const waitByLanguage: Record<string, AvgBucket> = {};
    const waitByState: Record<string, AvgBucket> = {};
    const retryTotalsByLanguage: Record<string, { count: number; retries: number; retried: number }> = {};
    const failureByLanguage: Record<string, number> = {};
    const failureByReason: Record<string, number> = {};

    for (const sample of jobSamples) {
      const status = sample.state === "failed" ? "failed" : sample.state === "completed" ? "completed" : "inflight";
      const waitMs = sample.processedOn && sample.timestamp
        ? sample.processedOn - sample.timestamp
        : null;
      const runtimeMs = sample.finishedOn && sample.processedOn
        ? sample.finishedOn - sample.processedOn
        : null;

      addAvg(runtimeByLanguage, sample.language, runtimeMs);
      addAvg(runtimeByStatus, status, runtimeMs);
      addAvg(runtimeByState, sample.state, runtimeMs);
      addAvg(waitByLanguage, sample.language, waitMs);
      addAvg(waitByState, sample.state, waitMs);

      const languageKey = sample.language;
      let retryBucket = retryTotalsByLanguage[languageKey];

      if (!retryBucket) {
        retryBucket = { count: 0, retries: 0, retried: 0 };
        retryTotalsByLanguage[languageKey] = retryBucket;
      }

      retryBucket.count += 1;
      retryBucket.retries += sample.attemptsMade;
      if (sample.attemptsMade > 0) {
        retryBucket.retried += 1;
      }

      if (sample.state === "failed") {
        failureByLanguage[sample.language] = (failureByLanguage[sample.language] ?? 0) + 1;
        const reason = sample.failedReason && sample.failedReason.length > 0
          ? sample.failedReason
          : "Unknown";
        failureByReason[reason] = (failureByReason[reason] ?? 0) + 1;
      }
    }

    const retryByLanguage = Object.fromEntries(
      Object.entries(retryTotalsByLanguage).map(([language, totals]) => [
        language,
        {
          count: totals.count,
          retryRate: totals.count > 0 ? totals.retried / totals.count : 0,
          avgAttemptsMade: totals.count > 0 ? totals.retries / totals.count : 0,
        },
      ])
    );

    return NextResponse.json({
      status: "ok",
      sampleSize: jobSamples.length,
      sampleLimit: limit,
      retryPolicy: {
        attempts: 3,
        backoffMs: 1000,
      },
      queueBacklog: {
        waiting: submissionCounts.waiting ?? 0,
        active: submissionCounts.active ?? 0,
        delayed: submissionCounts.delayed ?? 0,
        failed: submissionCounts.failed ?? 0,
        stalled: stalledCounts.stalled ?? 0,
      },
      workerFlow: {
        activeAgeMs,
        oldestWaitingAgeMs,
      },
      aggregates: {
        runtimeAvgMs: {
          byLanguage: finalizeAvg(runtimeByLanguage),
          byStatus: finalizeAvg(runtimeByStatus),
          byQueueState: finalizeAvg(runtimeByState),
        },
        queueWaitAvgMs: {
          byLanguage: finalizeAvg(waitByLanguage),
          byQueueState: finalizeAvg(waitByState),
        },
        retryFrequency: {
          byLanguage: retryByLanguage,
        },
        failureDistribution: {
          byLanguage: failureByLanguage,
          byReason: failureByReason,
        },
      },
      dlq: {
        size: dlqCounts.failed ?? 0,
        recentFailedJobs: failedJobs.length,
      },
    });
  } catch (error) {
    console.error("Queue metrics error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}