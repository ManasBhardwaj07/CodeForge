import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue } from "@/lib/queue";
import { asDlqEnvelope, asOriginalJobData } from "@/lib/dlq";
import { NextRequest, NextResponse } from "next/server";

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
    const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "20") || 20, 1), 100);
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const queue = getDeadLetterQueue();
    const total = await queue.getJobCounts("waiting");
    const jobs = await queue.getJobs(["waiting"], start, end, true);

    return NextResponse.json({
      page,
      limit,
      total: total.waiting ?? 0,
      jobs: jobs.map((job) => ({
        id: job.id, // DLQ entry id
        status: "FAILED",
        jobId: asDlqEnvelope(job.data).jobId ?? null, // original queue job id
        jobName: asDlqEnvelope(job.data).jobName ?? null,
        requestId: asOriginalJobData(asDlqEnvelope(job.data).data).requestId ?? null,
        failureCategory: asDlqEnvelope(job.data).failureCategory ?? null,
        failedReason: asDlqEnvelope(job.data).failedReason ?? job.failedReason ?? null,
        retryCount: asDlqEnvelope(job.data).attemptsMade ?? job.attemptsMade ?? 0,
        failedAt: job.timestamp ? new Date(job.timestamp).toISOString() : null,
        language: asOriginalJobData(asDlqEnvelope(job.data).data).language ?? null,
        replayedAt: asDlqEnvelope(job.data).replayedAt ?? null,
        replayedBy: asDlqEnvelope(job.data).replayedBy ?? null,
        replayAttempt: asDlqEnvelope(job.data).replayAttempt ?? null,
      })),
    });
  } catch (error) {
    console.error("DLQ list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}