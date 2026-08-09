import { AuthServiceError, loginUser } from "@/services/auth.service";
import { errorResponse } from "@/lib/http";
import { cookies } from "next/headers";

type LoginRequestBody = {
  email?: string;
  username?: string;
  password: string;
};

export async function POST(request: Request) {
  let payload: LoginRequestBody;
  try {
    payload = (await request.json()) as LoginRequestBody;
  } catch {
    return errorResponse("Invalid JSON body", "INVALID_JSON", 400);
  }

  // Require at least one identifier (email or username)
  if (!payload.email && !payload.username) {
    return errorResponse("Either email or username is required", "INVALID_AUTH_INPUT", 400);
  }
  if (!payload.password) {
    return errorResponse("Password is required", "MISSING_PASSWORD", 400);
  }

  try {
    let result;
    if (payload.email) {
      result = await loginUser({ email: payload.email, password: payload.password });
    } else {
      result = await loginUser({ username: payload.username!, password: payload.password });
    }

    const cookieStore = await cookies();
    cookieStore.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    return Response.json({ user: result.user }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }
    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
