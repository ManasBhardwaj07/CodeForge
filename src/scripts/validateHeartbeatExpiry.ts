import { setTimeout as delay } from "node:timers/promises";
import { redis } from "@/lib/redis";

async function main() {
  try {
    if (redis.status !== "ready") {
      await redis.connect();
    }
  } catch {
    // continue
  }

  const key = `codeforge:validate:heartbeat:${Date.now()}`;
  await redis.set(key, JSON.stringify({ ts: new Date().toISOString() }), "EX", 2);

  const ttl1 = await redis.ttl(key);
  if (ttl1 <= 0) {
    throw new Error(`Expected TTL > 0 immediately after set, got ${ttl1}`);
  }

  await delay(3000);

  const exists = await redis.exists(key);
  if (exists !== 0) {
    throw new Error("Expected key to expire but it still exists");
  }

  console.log("OK: TTL expiration works (control key expired).");
}

main()
  .catch((error) => {
    console.error("validateHeartbeatExpiry failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await redis.quit();
    } catch {
      // ignore
    }
  });
