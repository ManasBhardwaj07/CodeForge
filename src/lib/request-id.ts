import { randomUUID } from "node:crypto";

export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get("x-request-id")?.trim();

  if (incoming) {
    return incoming;
  }

  return randomUUID();
}