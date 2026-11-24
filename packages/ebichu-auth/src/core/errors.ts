/** Machine-readable reasons an auth operation can fail. */
export type AuthErrorCode =
  | "invalid-email"
  | "weak-password"
  | "email-taken"
  | "invalid-credentials"
  | "invalid-session";

/** Error thrown by auth operations, carrying a stable {@link AuthErrorCode}. */
export class AuthError extends Error {
  override readonly name = "AuthError";

  constructor(
    /** Stable code callers can branch on. */
    readonly code: AuthErrorCode,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message ?? code, options);
  }
}

/**
 * Thrown by repositories when a unique constraint is violated (for example a
 * duplicate e-mail). Database adapters translate their native error into this
 * so the core can stay database-agnostic.
 */
export class UniqueViolationError extends Error {
  override readonly name = "UniqueViolationError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
