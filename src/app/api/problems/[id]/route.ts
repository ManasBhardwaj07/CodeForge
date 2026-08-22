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
    const all = Array.isArray(problems) ? problems : [];
    const index = all.findIndex((p) => p.id === id);

    if (index === -1) {
      return errorResponse("Problem not found", "PROBLEM_NOT_FOUND", 404);
    }

    const problem = all[index];
    const serialNumber = index + 1;
    const nextProblemId = index + 1 < all.length ? all[index + 1]?.id ?? null : null;

    return Response.json({ ...problem, serialNumber, nextProblemId }, { status: 200 });
  } catch {
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
