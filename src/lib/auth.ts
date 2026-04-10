import { AuthServiceError, verifyToken } from "@/services/auth.service";

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
};

function getBearerToken(request: Request): string {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    throw new AuthorizationError("Missing Authorization header", "AUTH_HEADER_MISSING", 401);
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AuthorizationError("Malformed Authorization header", "AUTH_HEADER_MALFORMED", 401);
  }

  return token;
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const token = getBearerToken(request);

  try {
    return verifyToken(token);
  } catch (error) {
    if (error instanceof AuthServiceError) {
      throw new AuthorizationError(error.message, error.code, error.statusCode);
    }

    throw new AuthorizationError("Unauthorized", "UNAUTHORIZED", 401);
  }
}
