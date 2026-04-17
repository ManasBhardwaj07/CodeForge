import "dotenv/config";
function getEnvVar(name: "DATABASE_URL" | "REDIS_HOST" | "REDIS_PORT" | "JWT_SECRET"): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const redisPortValue = getEnvVar("REDIS_PORT");
const redisPort = Number.parseInt(redisPortValue, 10);

if (Number.isNaN(redisPort)) {
  throw new Error("REDIS_PORT must be a valid number");
}

export const env = {
  databaseUrl: getEnvVar("DATABASE_URL"),
  redisHost: getEnvVar("REDIS_HOST"),
  redisPort,
  jwtSecret: getEnvVar("JWT_SECRET"),
};
