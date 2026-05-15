import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue } from "@/lib/queue";
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
    const total = await queue.getJobCounts("failed");
    const jobs = await queue.getJobs(["failed"], start, end, true);

    return NextResponse.json({
      page,
      limit,
      total: total.failed ?? 0,
      jobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        failureCategory: (job.data as { failureCategory?: string } | undefined)?.failureCategory ?? null,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        stacktrace: job.stacktrace,
      })),
    });
  } catch (error) {
    console.error("DLQ list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}