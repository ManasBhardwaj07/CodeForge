import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue } from "@/lib/queue";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const job = await getDeadLetterQueue().getJob(id);

    if (!job) {
      return NextResponse.json({ error: "DLQ job not found" }, { status: 404 });
    }

    await job.retry("failed");

    return NextResponse.json({ status: "requeued", jobId: job.id });
  } catch (error) {
    console.error("DLQ requeue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }

      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const job = await getDeadLetterQueue().getJob(id);

    if (!job) {
      return NextResponse.json({ error: "DLQ job not found" }, { status: 404 });
    }

    await job.remove();

    return NextResponse.json({ status: "deleted", jobId: id });
  } catch (error) {
    console.error("DLQ delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}