// src/app/api/problems/[id]/route.ts
// Returns a single problem by ID for the solve page.

import { listProblems } from "@/services/problem.service";
import { errorResponse } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Next.js 15: params is a Promise and must be awaited.
    // Next.js 14: awaiting a plain object is a no-op — backward compatible.
    const { id } = await params;

    if (!id || typeof id !== "string") {
      return errorResponse("Invalid problem ID", "INVALID_ID", 400);
    }

    // If you have getProblemById, use it here for efficiency.
    const problems = await listProblems();
    const all = Array.isArray(problems) ? problems : [];
    const problem = all.find((p: any) => p.id === id) ?? null;

    if (!problem) {
      return errorResponse("Problem not found", "PROBLEM_NOT_FOUND", 404);
    }

    return Response.json(problem, { status: 200 });
  } catch {
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
