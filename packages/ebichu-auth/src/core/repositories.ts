import type { AuthSessionRecord, UserRecord } from "./types.js";

/**
 * Storage ports. The core only talks to these interfaces, so alternative
 * backends (PostgreSQL, SQLite, KV, tests) can be plugged in later.
 */

export interface UserRepository {
  create(user: UserRecord): Promise<void>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  updatePassword(
    userId: string,
    passwordHash: string,
    passwordSalt: string,
    updatedAt: number,
  ): Promise<void>;
}

export interface SessionRepository {
  create(session: AuthSessionRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null>;
  /** Updates `last_used_at`; called sparingly to avoid write amplification. */
  touch(id: string, lastUsedAt: number): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
  deleteExpired(now: number): Promise<void>;
}
