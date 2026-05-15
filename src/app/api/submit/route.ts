import { AuthorizationError, requireAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { resolveRequestId } from "@/lib/request-id";
import { createQueuedSubmission, SubmissionServiceError } from "@/services/submission.service";

const SUPPORTED_LANGUAGES = ["CPP", "JAVASCRIPT", "PYTHON", "JAVA", "C"];
const CODE_MAX_LENGTH = 20000;

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

  // Validate language
  if (!payload.language || !SUPPORTED_LANGUAGES.includes(payload.language.toUpperCase())) {
    return errorResponse(
      `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(", ")}`,
      "UNSUPPORTED_LANGUAGE",
      400
    );
  }

  // Validate code size
  if (!payload.code || payload.code.length > CODE_MAX_LENGTH) {
    return errorResponse(
      `Code must be between 1 and ${CODE_MAX_LENGTH} characters`,
      "CODE_TOO_LARGE",
      413
    );
  }

  try {
    const requestId = resolveRequestId(request.headers);
    const submission = await createQueuedSubmission({
      userId: user.userId,
      problemId: payload.problemId,
      code: payload.code,
      language: payload.language.toUpperCase(),
      requestId,
    });

    return Response.json(
      {
        requestId,
        // Legacy field for frontend compatibility
        submissionId: submission.id,
        // Structured field for QA compatibility
        submission: {
          id: submission.id,
          status: submission.status,
          userId: submission.userId,
        },
      },
      { status: 201, headers: { "x-request-id": requestId } }
    );
  } catch (error) {
    if (error instanceof SubmissionServiceError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
