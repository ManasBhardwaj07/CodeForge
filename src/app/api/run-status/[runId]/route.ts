import { AuthorizationError, requireAuth } from '@/lib/auth';
import { getSubmissionQueue } from '@/lib/queue';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { runId } = await params;
    const queue = getSubmissionQueue();

    // Fetch job by ID
    const job = await queue.getJob(runId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });
    }

    // Check job state
    const state = await job.getState();

    if (state === 'completed') {
      // Return result from job.returnvalue (ephemeral)
      const result = job.returnvalue;
      return NextResponse.json(
        {
          jobId: job.id,
          status: 'COMPLETED',
          ...result, // { stdout, stderr, exitCode, executionTimeMs, errorType }
        },
        { status: 200 }
      );
    }

    if (state === 'failed') {
      return NextResponse.json(
        {
          jobId: job.id,
          status: 'FAILED',
          error: job.failedReason || 'Execution failed',
        },
        { status: 200 }
      );
    }

    // Still queued or running
    return NextResponse.json(
      {
        jobId: job.id,
        status: state === 'active' ? 'RUNNING' : 'QUEUED',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Run status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
