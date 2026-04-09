import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export type HealthStatus = "up" | "down";

export type HealthCheckResult = {
  ok: boolean;
  status: "ok" | "degraded";
  services: {
    database: HealthStatus;
    redis: HealthStatus;
  };
  timestamp: string;
};

export async function checkHealth(): Promise<HealthCheckResult> {
  let database: HealthStatus = "up";
  let cache: HealthStatus = "up";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  try {
    await redis.ping();
  } catch {
    cache = "down";
  }

  const ok = database === "up" && cache === "up";

  return {
    ok,
    status: ok ? "ok" : "degraded",
    services: {
      database,
      redis: cache,
    },
    timestamp: new Date().toISOString(),
  };
}
