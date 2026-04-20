import { AuthorizationError, requireAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { listSubmissionsForUser } from "@/services/submission.service";

function isCodedException(e: unknown): e is { message: string; code: string; statusCode: number } {
  return (
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    "code" in e &&
    "statusCode" in e
  );
}

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireAuth>>;
  try {
    user = await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    return errorResponse("Unknown error", "UNKNOWN", 500);
  }

  try {
    const submissions = await listSubmissionsForUser(user.userId);
    return Response.json(Array.isArray(submissions) ? submissions : [], { status: 200 });
  } catch (error) {
    if (isCodedException(error)) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
