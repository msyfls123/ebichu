import { AuthError } from "@ebichu-cc/auth";
import type { AuthErrorCode } from "@ebichu-cc/auth";

const STATUS_BY_CODE: Record<AuthErrorCode, number> = {
  "invalid-email": 400,
  "weak-password": 400,
  "email-taken": 409,
  "invalid-credentials": 401,
  "invalid-session": 401,
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) {
    return json(
      { error: error.message, code: error.code },
      STATUS_BY_CODE[error.code],
    );
  }
  console.error("auth endpoint failed", error);
  return json({ error: "Internal error" }, 500);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
