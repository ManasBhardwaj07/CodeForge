import { redis } from "@/lib/redis";

type Heartbeat = {
  workerId: string;
  lastHeartbeat: string;
  activeJobs?: number;
  status?: string;
};

async function main() {
  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
  } catch {
    // continue; commands below will fail with a clearer error
  }

  const pattern = "codeforge:worker-heartbeat:*";

  let cursor = "0";
  const keys: string[] = [];

  for (let i = 0; i < 20; i += 1) {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", "200");
    cursor = nextCursor;
    for (const key of batch) {
      keys.push(key);
    }
    if (cursor === "0") {
      break;
    }
  }

  if (keys.length === 0) {
    console.log("No worker heartbeat keys found.");
    return;
  }

  const values = await redis.mget(...keys);
  const ttls = await Promise.all(keys.map((k) => redis.ttl(k)));

  const rows = keys
    .map((key, idx) => {
      const raw = values[idx];
      const ttl = ttls[idx] ?? -1;
      let parsed: Heartbeat | null = null;

      if (raw) {
        try {
          parsed = JSON.parse(raw) as Heartbeat;
        } catch {
          parsed = null;
        }
      }

      return {
        key,
        ttlSeconds: ttl,
        workerId: parsed?.workerId ?? "(unparseable)",
        status: parsed?.status ?? "unknown",
        activeJobs: typeof parsed?.activeJobs === "number" ? parsed.activeJobs : 0,
        lastHeartbeat: parsed?.lastHeartbeat ?? "",
      };
    })
    .sort((a, b) => a.workerId.localeCompare(b.workerId));

  console.table(rows);
} 

main()
  .catch((error) => {
    console.error("checkHeartbeats failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  });
