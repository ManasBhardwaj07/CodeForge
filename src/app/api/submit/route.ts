console.log("SUBMIT ROUTE ACTIVE VERSION 999");
import { AuthorizationError, requireAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { createQueuedSubmission, SubmissionServiceError } from "@/services/submission.service";

type SubmitRequestBody = {
  problemId: string;
  code: string;
  language: string;
};

export async function POST(request: Request) {
  let user;

  try {
    user = await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }

  let payload: SubmitRequestBody;

  try {
    payload = (await request.json()) as SubmitRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", "INVALID_JSON", 400);
  }

  try {
    const submission = await createQueuedSubmission({
      userId: user.userId,
      problemId: payload.problemId,
      code: payload.code,
      language: payload.language,
    });
    console.log("ROUTE RETURNING:", submission.id);
return Response.json(
  {
    submissionId: submission.id,
    status: submission.status
  },
  { status: 201 }
);
  } catch (error) {
    if (error instanceof SubmissionServiceError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
