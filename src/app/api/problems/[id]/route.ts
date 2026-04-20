import { listProblems } from "@/services/problem.service";
import { errorResponse } from "@/lib/http";

type Problem = {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return errorResponse("Invalid problem ID", "INVALID_ID", 400);
    }

    const problems = await listProblems();
    const all: Problem[] = Array.isArray(problems) ? (problems as Problem[]) : [];
    const problem = all.find((p) => p.id === id) ?? null;

    if (!problem) {
      return errorResponse("Problem not found", "PROBLEM_NOT_FOUND", 404);
    }

    return Response.json(problem, { status: 200 });
  } catch {
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
