import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue, getSubmissionQueue } from "@/lib/queue";
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

    const submissionQueue = getSubmissionQueue();
    const [submissionCounts, stalledCounts, dlqCounts] = await Promise.all([
      submissionQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
      (submissionQueue as unknown as { getJobCounts: (...types: string[]) => Promise<Record<string, number>> })
        .getJobCounts("stalled"),
      getDeadLetterQueue().getJobCounts("failed", "waiting", "active", "completed"),
    ]);

    return NextResponse.json({
      status: "ok",
      queues: {
        submission: {
          ...submissionCounts,
          stalled: stalledCounts.stalled ?? 0,
        },
        dlq: dlqCounts,
      },
    });
  } catch (error) {
    console.error("Queue health error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}