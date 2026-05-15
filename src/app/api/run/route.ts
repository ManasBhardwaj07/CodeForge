import { AuthorizationError, requireAuth } from '@/lib/auth';
import { getSubmissionQueue } from '@/lib/queue';
import { resolveRequestId } from '@/lib/request-id';
import { NextRequest, NextResponse } from 'next/server';

const SUPPORTED_LANGUAGES = ['JAVASCRIPT', 'CPP', 'PYTHON', 'JAVA', 'C'];
const CODE_MAX_LENGTH = 100000;
const INPUT_MAX_LENGTH = 100000;

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { language, code, customInput } = await req.json();
    const requestId = resolveRequestId(req.headers);

    if (!language || !code || customInput === undefined) {
      return NextResponse.json(
        { error: 'Language, code, and customInput are required' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_LANGUAGES.includes(language)) {
      return NextResponse.json(
        { error: `Language ${language} is not supported` },
        { status: 400 }
      );
    }

    if (code.length > CODE_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Code exceeds maximum length of ${CODE_MAX_LENGTH} bytes` },
        { status: 413 }
      );
    }

    if (customInput.length > INPUT_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Custom input exceeds maximum length of ${INPUT_MAX_LENGTH} bytes` },
        { status: 413 }
      );
    }

    // Enqueue run job (no DB persistence)
    // Result stored in job.returnValue (ephemeral, expires with job)
    try {
      const queue = getSubmissionQueue();
      const jobId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      
      const job = await queue.add(
        'execute-run',
        {
          type: 'run',
          jobId,
          requestId,
          language,
          code,
          customInput,
        },
        {
          jobId,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          // Keep result for 5 minutes, then auto-cleanup
          removeOnComplete: {
            age: 300,
          },
          removeOnFail: {
            age: 60,
          },
        }
      );

      return NextResponse.json(
        {
          requestId,
          jobId: job.id,
          status: 'QUEUED',
        },
        { status: 202, headers: { 'x-request-id': requestId } }
      );
    } catch (queueError) {
      console.error('Queue error:', queueError);
      return NextResponse.json(
        { error: 'Failed to queue execution' },
        { status: 503 }
      );
    }
  } catch (error) {
    console.error('Run execution error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
