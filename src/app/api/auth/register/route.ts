import { AuthServiceError, registerUser } from "@/services/auth.service";
import { errorResponse } from "@/lib/http";

type RegisterRequestBody = {
  email: string;
  username: string;
  password: string;
};

export async function POST(request: Request) {
  let payload: RegisterRequestBody;

  try {
    payload = (await request.json()) as RegisterRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", "INVALID_JSON", 400);
  }

  try {
    const result = await registerUser(payload);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
