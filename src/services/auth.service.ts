import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "1h";

export class AuthServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "AuthServiceError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export type AuthTokenPayload = {
  userId: string;
  email: string;
};

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
};

export type AuthSuccess = {
  token: string;
  user: PublicUser;
};

type RegisterInput = {
  email: string;
  username: string;
  password: string;
};

type LoginInput = {
  email: string;
  password: string;
};

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidEmail(email: string) {
  const trimmed = sanitizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    throw new AuthServiceError("Invalid email format", 400, "INVALID_EMAIL");
  }
}

function assertValidUsername(username: string) {
  const trimmed = username.trim();

  if (trimmed.length < 3 || trimmed.length > 32) {
    throw new AuthServiceError("Username must be between 3 and 32 characters", 400, "INVALID_USERNAME");
  }
}

function assertValidPassword(password: string) {
  if (password.length < 8) {
    throw new AuthServiceError("Password must be at least 8 characters", 400, "WEAK_PASSWORD");
  }
}

export function generateToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

export function verifyToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;

    if (!decoded.userId || !decoded.email) {
      throw new AuthServiceError("Invalid token payload", 401, "INVALID_TOKEN_PAYLOAD");
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
    };
  } catch {
    throw new AuthServiceError("Invalid or expired token", 401, "INVALID_OR_EXPIRED_TOKEN");
  }
}

export async function verifyPassword(rawPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(rawPassword, passwordHash);
}

function toPublicUser(user: {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
  };
}

export async function registerUser(input: RegisterInput): Promise<AuthSuccess> {
  if (!input || typeof input.email !== "string" || typeof input.username !== "string" || typeof input.password !== "string") {
    throw new AuthServiceError("email, username and password are required", 400, "INVALID_AUTH_INPUT");
  }

  assertValidEmail(input.email);
  assertValidUsername(input.username);
  assertValidPassword(input.password);

  const email = sanitizeEmail(input.email);
  const username = input.username.trim();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw new AuthServiceError("Email or username already exists", 409, "USER_ALREADY_EXISTS");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
    },
  });

  const token = generateToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: toPublicUser(user),
  };
}

export async function loginUser(input: LoginInput): Promise<AuthSuccess> {
  if (!input || typeof input.email !== "string" || typeof input.password !== "string") {
    throw new AuthServiceError("email and password are required", 400, "INVALID_AUTH_INPUT");
  }

  assertValidEmail(input.email);

  if (!input.password) {
    throw new AuthServiceError("Password is required", 400, "MISSING_PASSWORD");
  }

  const email = sanitizeEmail(input.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      createdAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new AuthServiceError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  const passwordMatch = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatch) {
    throw new AuthServiceError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: toPublicUser(user),
  };
}
