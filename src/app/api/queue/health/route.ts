import { requireAuth, AuthorizationError } from "@/lib/auth";
import { getDeadLetterQueue, getSubmissionQueue } from "@/lib/queue";
import { redis } from "@/lib/redis";
import { NextRequest, NextResponse } from "next/server";

type WorkerHeartbeat = {
  workerId: string;
  lastHeartbeat: string;
  activeJobs: number;
  status: string;
};

async function ensureRedisConnected() {
  if (redis.status === "ready") {
    return;
  }

  try {
    await redis.connect();
  } catch {
    // ignore - callers can decide how to handle lack of Redis connectivity
  }
}

async function listWorkerHeartbeats(limit = 25) {
  const pattern = "codeforge:worker-heartbeat:*";

  await ensureRedisConnected();

  let cursor = "0";
  const keys: string[] = [];

  try {
    // bounded SCAN so we don't walk the entire keyspace
    for (let i = 0; i < 5 && keys.length < limit; i += 1) {
      const result = await redis.scan(cursor, "MATCH", pattern, "COUNT", "100");
      cursor = result[0] ?? "0";
      const batch = result[1] ?? [];
      for (const key of batch) {
        keys.push(key);
        if (keys.length >= limit) {
          break;
        }
      }
      if (cursor === "0") {
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Worker heartbeat scan failed:", message);
    return { total: 0, online: 0, workers: [] as Array<WorkerHeartbeat & { ttlSeconds: number }> };
  }

  if (keys.length === 0) {
    return { total: 0, online: 0, workers: [] as Array<WorkerHeartbeat & { ttlSeconds: number }> };
  }

  let values: Array<string | null>;
  let ttlValues: number[];
  try {
    values = await redis.mget(...keys);
    ttlValues = await Promise.all(keys.map((key) => redis.ttl(key)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Worker heartbeat fetch failed:", message);
    return { total: 0, online: 0, workers: [] as Array<WorkerHeartbeat & { ttlSeconds: number }> };
  }

  const workers: Array<WorkerHeartbeat & { ttlSeconds: number }> = [];

  for (let i = 0; i < keys.length; i += 1) {
    const raw = values[i];
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<WorkerHeartbeat>;
      if (typeof parsed.workerId !== "string" || typeof parsed.lastHeartbeat !== "string") {
        continue;
      }

      const ttlSecondsValue = ttlValues[i];

      workers.push({
        workerId: parsed.workerId,
        lastHeartbeat: parsed.lastHeartbeat,
        activeJobs: typeof parsed.activeJobs === "number" ? parsed.activeJobs : 0,
        status: typeof parsed.status === "string" ? parsed.status : "unknown",
        ttlSeconds: typeof ttlSecondsValue === "number" ? ttlSecondsValue : -1,
      });
    } catch {
      continue;
    }
  }

  const online = workers.filter((worker) => worker.ttlSeconds > 0).length;
  return { total: workers.length, online, workers };
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

    const submissionQueue = getSubmissionQueue();
    const [submissionCounts, stalledCounts, dlqCounts] = await Promise.all([
      submissionQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused"),
      (submissionQueue as unknown as { getJobCounts: (...types: string[]) => Promise<Record<string, number>> })
        .getJobCounts("stalled"),
      getDeadLetterQueue().getJobCounts("failed", "waiting", "active", "completed"),
    ]);

    const workers = await listWorkerHeartbeats();

    return NextResponse.json({
      status: "ok",
      workers,
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