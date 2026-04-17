// src/app/api/my-submissions/route.ts
//
// REASON THIS FILE WAS MISSING: Was never created.
// IMPACT: src/app/submissions/page.tsx calls this endpoint to populate
// SubmissionTable. Without it every request returned 404 → the page caught
// the error and redirected to /login (misleading) or showed an empty table.
//
// WHAT THIS DOES:
//   GET /api/my-submissions
//   • Requires a valid Bearer token (401/403 if missing or invalid).
//   • Returns only submissions that belong to the requesting user.
//   • Response is a JSON array shaped to match SubmissionTable's Submission type:
//       [
//         {
//           id: string;
//           problem: { title: string };
//           verdict: string;
//           createdAt: string;   // ISO 8601
//         }
//       ]
//   • Results are ordered newest-first so the table shows recent work at the top.
//
// SERVICE DEPENDENCY:
//   Assumes submission.service exports:
//     listSubmissionsForUser(userId: string): Promise<Submission[]>
//
//   If it doesn't yet, add it — the query is a findMany filtered by userId,
//   ordered by createdAt desc, with `include: { problem: { select: { title: true } } }`.

import { AuthorizationError, requireAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { listSubmissionsForUser } from "@/services/submission.service";

export async function GET(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error instanceof Error) {
        return errorResponse(error.message, (error as any).code, (error as any).statusCode);
      }
      return errorResponse("Unknown error", "UNKNOWN", 500);
    }
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  try {
    const submissions = await listSubmissionsForUser(user.userId);

    // Defensive: always return an array so the frontend never has to guard
    // against null or undefined from this endpoint.
    return Response.json(Array.isArray(submissions) ? submissions : [], {
      status: 200,
    });
  } catch (error) {
    if (error instanceof Error) {
      return errorResponse(error.message, (error as any).code ?? "INTERNAL_SERVER_ERROR", (error as any).statusCode ?? 500);
    }
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}