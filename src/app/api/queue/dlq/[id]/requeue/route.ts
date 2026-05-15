import { AuthorizationError, requireAuth } from "@/lib/auth";
import { asDlqEnvelope, asOriginalJobData, isReplayAllowed } from "@/lib/dlq";
import { getDeadLetterQueue, getSubmissionQueue } from "@/lib/queue";
import type { JobData, ReplayMetadata } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function buildReplayPayload(originalJobData: unknown, replay: ReplayMetadata): JobData | null {
  if (!isRecord(originalJobData)) {
    return null;
  }

  const type = originalJobData.type;
  if (type === "submission") {
    if (typeof originalJobData.submissionId !== "string" || typeof originalJobData.language !== "string") {
      return null;
    }

    return {
      ...(originalJobData as JobData),
      replay,
    };
  }

  if (type === "run") {
    if (
      typeof originalJobData.jobId !== "string" ||
      typeof originalJobData.language !== "string" ||
      typeof originalJobData.code !== "string" ||
      typeof originalJobData.customInput !== "string"
    ) {
      return null;
    }

    return {
      ...(originalJobData as JobData),
      replay,
    };
  }

  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    let user;
    try {
      user = await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const dlqQueue = getDeadLetterQueue();
    const dlqJob = await dlqQueue.getJob(id);

    if (!dlqJob) {
      return NextResponse.json({ error: "DLQ job not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const allowSandbox = url.searchParams.get("allowSandbox") === "true";

    const envelope = asDlqEnvelope(dlqJob.data);
    const category = envelope.failureCategory ?? null;
    const replayDecision = isReplayAllowed(category ? String(category) : null, { allowSandbox });

    if (!replayDecision.allowed) {
      return NextResponse.json(
        {
          error: "Replay not allowed",
          failureCategory: category,
          reason: replayDecision.reason ?? "Not replayable",
        },
        { status: 409 },
      );
    }

    const originalJobData = envelope.data;
    const original = asOriginalJobData(originalJobData);

    const replayAttempt = (envelope.replayAttempt ?? 0) + 1;
    const replayedAt = new Date().toISOString();

    // Update DLQ job with audit metadata (kept for inspection)
    await dlqJob.updateData({
      ...envelope,
      replayedAt,
      replayAttempt,
      replayedBy: { userId: user.userId, email: user.email },
    });

    // Re-enqueue original job into the submission queue with a new jobId
    const submissionQueue = getSubmissionQueue();
    const originalJobName = envelope.jobName ?? "process-submission";
    const originalQueueJobId = envelope.jobId ?? `unknown-${id}`;
    const newJobId = `${originalQueueJobId}:replay:${replayAttempt}`;

    const replay: ReplayMetadata = {
      dlqId: id,
      replayAttempt,
      replayedAt,
      replayedBy: { userId: user.userId, email: user.email },
    };

    const payload = buildReplayPayload(originalJobData, replay);
    if (!payload) {
      return NextResponse.json(
        { error: "DLQ entry contains invalid original job data", dlqId: id },
        { status: 400 },
      );
    }

    const queuedJob = await submissionQueue.add(
      originalJobName,
      payload,
      {
        jobId: newJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    return NextResponse.json({
      status: "requeued",
      dlqId: id,
      failureCategory: category,
      requestId: original.requestId ?? null,
      jobId: queuedJob.id,
      replayAttempt,
      replayedAt,
    });
  } catch (error) {
    console.error("DLQ requeue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
