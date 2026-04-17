import { requireAuth, AuthorizationError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { getSubmissionById } from "@/services/submission.service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await context.params;

    const submission = await getSubmissionById(id);

    if (!submission) {
      return errorResponse(
        "Submission not found",
        "SUBMISSION_NOT_FOUND",
        404
      );
    }

    if (submission.userId !== user.userId) {
      return errorResponse(
        "Forbidden",
        "FORBIDDEN",
        403
      );
    }

    return Response.json(submission);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(
        error.message,
        error.code,
        error.statusCode
      );
    }

    return errorResponse(
      "Internal server error",
      "INTERNAL_SERVER_ERROR",
      500
    );
  }
}