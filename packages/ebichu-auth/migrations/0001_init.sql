-- Initial schema for the shared `auth` D1 database.
--
-- Times are Unix *seconds*. E-mails are stored lower-cased and trimmed, so the
-- unique index doubles as the account lookup. Cookies only carry a random
-- 256-bit token; `sessions.token_hash` stores its SHA-256, never the token.
--
-- Owned by ebichu-auth: apply migrations from the login worker (or with
-- `pnpm --filter ebichu-auth db:migrate`). Other workers only read.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX sessions_user_id_index ON sessions (user_id);
CREATE INDEX sessions_expires_at_index ON sessions (expires_at);
