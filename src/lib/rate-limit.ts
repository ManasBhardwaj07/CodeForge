import { redis } from "@/lib/redis";

export async function checkRateLimit(userId: string, action: "run" | "submit"): Promise<boolean> {
  const limit = action === "run" ? 5 : 3;
  const windowSeconds = 10;
  
  const key = `ratelimit:${action}:${userId}`;
  
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    
    return count <= limit;
  } catch (error) {
    // If Redis is unavailable, we fail open.
    // The immediate next step in both execution endpoints is pushing to BullMQ,
    // which fundamentally relies on Redis and will fail natively if Redis is down.
    // Failing open here prevents false rejections during transient Redis stutters.
    console.error(`Rate limiter redis error for ${key}:`, error);
    return true; 
  }
}
