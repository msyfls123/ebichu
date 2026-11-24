import { AuthError, UniqueViolationError } from "./errors.js";
import {
  createSalt,
  DEFAULT_PBKDF2_ITERATIONS,
  hashPassword,
  verifyPassword,
} from "./password.js";
import type { SessionRepository, UserRepository } from "./repositories.js";
import { generateToken, hashToken } from "./tokens.js";
import type {
  AuthSession,
  AuthSessionRecord,
  AuthUser,
  UserRecord,
  VerifiedSession,
} from "./types.js";

const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Avoid a write on every request when refreshing `last_used_at`. */
const LAST_USED_UPDATE_INTERVAL_SECONDS = 5 * 60;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthOptions {
  users: UserRepository;
  sessions: SessionRepository;
  /** Session lifetime in seconds. Defaults to 30 days. */
  sessionTtlSeconds?: number;
  /** PBKDF2 work factor used for new password hashes. */
  passwordIterations?: number;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  /** Raw session token of the caller. */
  token: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Framework-, HTTP- and database-agnostic auth service. Cookie handling lives
 * in the Hono integration, storage lives in the D1 adapter.
 */
export interface Auth {
  /** Creates a user and immediately issues a session. */
  register(input: RegisterInput): Promise<AuthSession>;
  /** Verifies credentials and issues a session. */
  login(input: LoginInput): Promise<AuthSession>;
  /** Resolves the user and session behind a token, or `null`. */
  verify(token: string): Promise<VerifiedSession | null>;
  /** Revokes a session. Safe to call with an unknown token. */
  logout(token: string): Promise<void>;
  /** Rotates the password, revokes every session and issues a fresh one. */
  changePassword(input: ChangePasswordInput): Promise<AuthSession>;
  /** Revokes every session of a user (forced sign-out). */
  revokeAllSessions(userId: string): Promise<void>;
  /** Deletes expired sessions; suitable for a scheduled/cron handler. */
  pruneExpiredSessions(): Promise<void>;
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(record: UserRecord): AuthUser {
  return {
    id: record.id,
    email: record.email,
    createdAt: record.createdAt,
  };
}

function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError("invalid-email", "A valid e-mail address is required");
  }
}

function assertValidPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      "weak-password",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

export function createAuth(options: AuthOptions): Auth {
  const { users, sessions } = options;
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const iterations = options.passwordIterations ?? DEFAULT_PBKDF2_ITERATIONS;

  async function issueSession(user: AuthUser): Promise<AuthSession> {
    const now = nowInSeconds();
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = now + sessionTtlSeconds;

    // Opportunistic cleanup keeps the sessions table from growing forever.
    await sessions.deleteExpired(now);
    await sessions.create({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt,
      createdAt: now,
      lastUsedAt: now,
    });

    return { user, token, expiresAt };
  }

  async function resolveSession(
    token: string,
  ): Promise<{ record: AuthSessionRecord; user: UserRecord } | null> {
    const tokenHash = await hashToken(token);
    const session = await sessions.findByTokenHash(tokenHash);
    if (!session) {
      return null;
    }

    const now = nowInSeconds();
    if (session.expiresAt <= now) {
      await sessions.deleteByTokenHash(tokenHash);
      return null;
    }

    const user = await users.findById(session.userId);
    if (!user) {
      await sessions.deleteByTokenHash(tokenHash);
      return null;
    }

    if (now - session.lastUsedAt >= LAST_USED_UPDATE_INTERVAL_SECONDS) {
      await sessions.touch(session.id, now);
      session.lastUsedAt = now;
    }

    return { record: session, user };
  }

  return {
    async register(input) {
      const email = normalizeEmail(input.email);
      assertValidEmail(email);
      assertValidPassword(input.password);

      const now = nowInSeconds();
      const salt = createSalt();
      const passwordHash = await hashPassword(input.password, salt, iterations);
      const user: AuthUser = {
        id: crypto.randomUUID(),
        email,
        createdAt: now,
      };

      try {
        await users.create({
          ...user,
          passwordHash,
          passwordSalt: salt,
          updatedAt: now,
        });
      } catch (cause) {
        if (cause instanceof UniqueViolationError) {
          throw new AuthError("email-taken", "E-mail is already registered", {
            cause,
          });
        }
        throw cause;
      }

      return issueSession(user);
    },

    async login(input) {
      const email = normalizeEmail(input.email);
      if (!EMAIL_PATTERN.test(email)) {
        throw new AuthError("invalid-credentials", "Invalid e-mail or password");
      }

      const user = await users.findByEmail(email);
      if (!user) {
        // Burn an equivalent PBKDF2 computation so response times do not
        // reveal whether the e-mail exists.
        await hashPassword(input.password, createSalt(), iterations);
        throw new AuthError("invalid-credentials", "Invalid e-mail or password");
      }

      const matches = await verifyPassword(
        input.password,
        user.passwordHash,
        user.passwordSalt,
      );
      if (!matches) {
        throw new AuthError("invalid-credentials", "Invalid e-mail or password");
      }

      return issueSession(toAuthUser(user));
    },

    async verify(token) {
      const resolved = await resolveSession(token);
      if (!resolved) {
        return null;
      }
      return {
        user: toAuthUser(resolved.user),
        session: resolved.record,
      };
    },

    async logout(token) {
      await sessions.deleteByTokenHash(await hashToken(token));
    },

    async changePassword(input) {
      const resolved = await resolveSession(input.token);
      if (!resolved) {
        throw new AuthError("invalid-session", "Session is missing or expired");
      }

      const matches = await verifyPassword(
        input.currentPassword,
        resolved.user.passwordHash,
        resolved.user.passwordSalt,
      );
      if (!matches) {
        throw new AuthError(
          "invalid-credentials",
          "Current password is incorrect",
        );
      }

      assertValidPassword(input.newPassword);

      const salt = createSalt();
      await users.updatePassword(
        resolved.user.id,
        await hashPassword(input.newPassword, salt, iterations),
        salt,
        nowInSeconds(),
      );
      // Password changes invalidate every existing session, including the
      // caller's; a fresh one is issued so the current device stays signed in.
      await sessions.deleteByUserId(resolved.user.id);

      return issueSession(toAuthUser(resolved.user));
    },

    async revokeAllSessions(userId) {
      await sessions.deleteByUserId(userId);
    },

    async pruneExpiredSessions() {
      await sessions.deleteExpired(nowInSeconds());
    },
  };
}
