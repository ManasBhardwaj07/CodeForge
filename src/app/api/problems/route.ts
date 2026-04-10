import { listProblems } from "@/services/problem.service";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const problems = await listProblems();
    return Response.json({ problems }, { status: 200 });
  } catch {
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
