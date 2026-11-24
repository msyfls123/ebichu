import { UniqueViolationError } from "../core/errors.js";
import type { SessionRepository, UserRepository } from "../core/repositories.js";
import type { AuthSessionRecord, UserRecord } from "../core/types.js";

/**
 * Cloudflare D1 adapters for the core repository ports.
 *
 * All values are bound, never interpolated. `users.email` and
 * `sessions.token_hash` carry unique indexes (see `migrations/`).
 */

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_used_at: number;
}

const USER_COLUMNS =
  "id, email, password_hash, password_salt, created_at, updated_at";
const SESSION_COLUMNS =
  "id, user_id, token_hash, expires_at, created_at, last_used_at";

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSessionRecord(row: SessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

/** D1 surfaces SQLite constraint violations as errors with informative text. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}

export function createD1UserRepository(db: D1Database): UserRepository {
  return {
    async create(user) {
      try {
        await db
          .prepare(
            `INSERT INTO users (${USER_COLUMNS})
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            user.id,
            user.email,
            user.passwordHash,
            user.passwordSalt,
            user.createdAt,
            user.updatedAt,
          )
          .run();
      } catch (cause) {
        if (isUniqueViolation(cause)) {
          throw new UniqueViolationError("E-mail is already registered", {
            cause,
          });
        }
        throw cause;
      }
    },

    async findByEmail(email) {
      const row = await db
        .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ? LIMIT 1`)
        .bind(email)
        .first<UserRow>();
      return row ? toUserRecord(row) : null;
    },

    async findById(id) {
      const row = await db
        .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`)
        .bind(id)
        .first<UserRow>();
      return row ? toUserRecord(row) : null;
    },

    async updatePassword(userId, passwordHash, passwordSalt, updatedAt) {
      await db
        .prepare(
          `UPDATE users
              SET password_hash = ?, password_salt = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(passwordHash, passwordSalt, updatedAt, userId)
        .run();
    },
  };
}

export function createD1SessionRepository(db: D1Database): SessionRepository {
  return {
    async create(session) {
      await db
        .prepare(
          `INSERT INTO sessions (${SESSION_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          session.id,
          session.userId,
          session.tokenHash,
          session.expiresAt,
          session.createdAt,
          session.lastUsedAt,
        )
        .run();
    },

    async findByTokenHash(tokenHash) {
      const row = await db
        .prepare(
          `SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = ? LIMIT 1`,
        )
        .bind(tokenHash)
        .first<SessionRow>();
      return row ? toSessionRecord(row) : null;
    },

    async touch(id, lastUsedAt) {
      await db
        .prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?")
        .bind(lastUsedAt, id)
        .run();
    },

    async deleteByTokenHash(tokenHash) {
      await db
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(tokenHash)
        .run();
    },

    async deleteByUserId(userId) {
      await db
        .prepare("DELETE FROM sessions WHERE user_id = ?")
        .bind(userId)
        .run();
    },

    async deleteExpired(now) {
      await db
        .prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .bind(now)
        .run();
    },
  };
}
