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

redis.on("connect", () => {
  console.log("Redis connected");
});

redis.on("error", (err) => {
  console.error("Redis error:", err);
});