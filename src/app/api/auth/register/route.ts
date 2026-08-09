import { AuthServiceError, registerUser } from "@/services/auth.service";
import { errorResponse } from "@/lib/http";
import { cookies } from "next/headers";

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
    
    const cookieStore = await cookies();
    cookieStore.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthServiceError) {
      return errorResponse(error.message, error.code, error.statusCode);
    }

    return errorResponse("Internal server error", "INTERNAL_SERVER_ERROR", 500);
  }
}
