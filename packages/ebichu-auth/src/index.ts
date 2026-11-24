/**
 * ebichu-auth
 *
 * Framework-, HTTP- and database-agnostic authentication core. Database
 * adapters live in `ebichu-auth/d1`, Hono integration in `ebichu-auth/hono`.
 */

export { createAuth } from "./core/auth.js";
export type {
  Auth,
  AuthOptions,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from "./core/auth.js";
export { AuthError, UniqueViolationError } from "./core/errors.js";
export type { AuthErrorCode } from "./core/errors.js";
export { DEFAULT_SESSION_COOKIE, SESSION_COOKIE_NAME } from "./cookie.js";
export type {
  ResolvedSessionCookie,
  SessionCookieConfig,
} from "./cookie.js";
export {
  createSalt,
  DEFAULT_PBKDF2_ITERATIONS,
  hashPassword,
  verifyPassword,
} from "./core/password.js";
export type { SessionRepository, UserRepository } from "./core/repositories.js";
export { generateToken, hashToken } from "./core/tokens.js";
export type {
  AuthSession,
  AuthSessionRecord,
  AuthUser,
  UserRecord,
  VerifiedSession,
} from "./core/types.js";
