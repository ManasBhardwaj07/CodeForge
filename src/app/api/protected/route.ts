import { AuthorizationError, requireAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);

    return Response.json(
      {
        message: "Access granted",
        user,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
