import { AuthServiceError, verifyToken } from "@/services/auth.service";
import { cookies } from "next/headers";

export class AuthorizationError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, code = "UNAUTHORIZED", statusCode = 401) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type AuthContext = {
  userId: string;
  email: string;
  username: string;
};

async function getToken(): Promise<string> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) {
    throw new AuthorizationError("Missing authentication token", "AUTH_TOKEN_MISSING", 401);
  }

  return token;
}

export async function requireAuth(request?: Request): Promise<AuthContext> {
  const token = await getToken();

  try {
    return verifyToken(token);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      throw new AuthorizationError(error.message, error.code, error.statusCode);
    }

    throw new AuthorizationError("Unauthorized", "UNAUTHORIZED", 401);
  }
}
