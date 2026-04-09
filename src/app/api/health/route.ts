import { checkHealth } from "@/services/health.service";

export async function GET() {
  const result = await checkHealth();

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 503,
    headers: {
      "content-type": "application/json",
    },
  });
}
