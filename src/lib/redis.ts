import Redis from "ioredis";
import { env } from "@/lib/env";

export const redis = new Redis({
  host: env.redisHost,
  port: env.redisPort,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});

let redisWasReady = false;
let lastRedisErrorKey: string | null = null;
let lastRedisErrorLoggedAt = 0;
let suppressedRedisErrors = 0;

redis.on("ready", () => {
  if (!redisWasReady) {
    console.log("Redis connected");
  }
  redisWasReady = true;
  lastRedisErrorKey = null;
  lastRedisErrorLoggedAt = 0;
  suppressedRedisErrors = 0;
});

redis.on("end", () => {
  redisWasReady = false;
});

redis.on("error", (err) => {
  const message = err instanceof Error ? err.message : String(err);
  const key = message;
  const now = Date.now();
  const throttleWindowMs = 5000;

  if (key === lastRedisErrorKey && now - lastRedisErrorLoggedAt < throttleWindowMs) {
    suppressedRedisErrors += 1;
    return;
  }

  const suffix = suppressedRedisErrors > 0 ? ` (suppressed ${suppressedRedisErrors} repeats)` : "";
  console.error(`Redis error${suffix}:`, err);
  lastRedisErrorKey = key;
  lastRedisErrorLoggedAt = now;
  suppressedRedisErrors = 0;
});