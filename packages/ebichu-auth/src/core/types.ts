/** A verified identity, normalized across auth providers. */
export interface AuthUser {
  /** Stable, provider-agnostic identifier. */
  id: string;
  /** Primary e-mail address, lower-cased and trimmed. */
  email: string;
  /** Creation time in seconds since the Unix epoch. */
  createdAt: number;
}

/** A freshly issued session. The raw token is never persisted. */
export interface AuthSession {
  user: AuthUser;
  /** Opaque bearer token. Store it in the shared cookie. */
  token: string;
  /** Expiry time in seconds since the Unix epoch. */
  expiresAt: number;
}

/** Persisted user row. */
export interface UserRecord {
  id: string;
  email: string;
  /** `pbkdf2-sha256$<iterations>$<hash>`, base64url encoded. */
  passwordHash: string;
  /** Salt used for {@link passwordHash}, base64url encoded. */
  passwordSalt: string;
  createdAt: number;
  updatedAt: number;
}

/** Persisted session row. `tokenHash` is `sha256(token)`. */
export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
}

/** Result of successfully verifying a session token. */
export interface VerifiedSession {
  user: AuthUser;
  session: AuthSessionRecord;
}
