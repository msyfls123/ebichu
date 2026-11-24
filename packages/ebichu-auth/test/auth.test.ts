import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AuthError, createAuth, hashToken } from "../src/index.js";
import {
  createD1SessionRepository,
  createD1UserRepository,
} from "../src/d1/index.js";

// Cheap work factor keeps the suite fast; production uses the 600k default.
const auth = createAuth({
  users: createD1UserRepository(env.AUTH_DB),
  sessions: createD1SessionRepository(env.AUTH_DB),
  passwordIterations: 1_000,
});

async function register(email = "user@example.com", password = "correct horse") {
  return auth.register({ email, password });
}

async function expectAuthError(
  promise: Promise<unknown>,
  code: AuthError["code"],
) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AuthError);
  expect((error as AuthError).code).toBe(code);
}

function countSessions(userId: string): Promise<{ count: number } | null> {
  return env.AUTH_DB.prepare(
    "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ count: number }>();
}

describe("register", () => {
  it("creates a user and issues a usable session", async () => {
    const session = await register();

    expect(session.user.email).toBe("user@example.com");
    expect(session.token).toMatch(/^[\w-]+$/);
    expect(session.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verified = await auth.verify(session.token);
    expect(verified?.user).toEqual(session.user);
    expect(verified?.session.userId).toBe(session.user.id);
    expect(verified?.session.expiresAt).toBe(session.expiresAt);
  });

  it("normalizes the e-mail address", async () => {
    const session = await register("  Mixed@Example.COM ");
    expect(session.user.email).toBe("mixed@example.com");

    const viaLogin = await auth.login({
      email: "MIXED@example.com",
      password: "correct horse",
    });
    expect(viaLogin.user.id).toBe(session.user.id);
  });

  it("stores only password and token hashes", async () => {
    const session = await register("hash@example.com", "super secret");

    const user = await env.AUTH_DB.prepare(
      "SELECT password_hash, password_salt FROM users WHERE email = ?",
    )
      .bind("hash@example.com")
      .first<{ password_hash: string; password_salt: string }>();
    expect(user?.password_hash).toMatch(/^pbkdf2-sha256\$1000\$[\w-]+$/);
    expect(user?.password_hash).not.toContain("super secret");
    expect(user?.password_salt).toMatch(/^[\w-]{16,}$/);

    const stored = await env.AUTH_DB.prepare(
      "SELECT id, token_hash FROM sessions WHERE user_id = ?",
    )
      .bind(session.user.id)
      .first<{ id: string; token_hash: string }>();
    expect(stored?.token_hash).toBe(await hashToken(session.token));
    expect(stored?.token_hash).not.toBe(session.token);
    expect(stored?.id).not.toBe(stored?.token_hash);
  });

  it("rejects a duplicate e-mail regardless of case", async () => {
    await register("dupe@example.com");
    await expectAuthError(register("DUPE@example.com"), "email-taken");
  });

  it("rejects malformed e-mails and short passwords", async () => {
    await expectAuthError(register("not-an-email"), "invalid-email");
    await expectAuthError(register("short@example.com", "short"), "weak-password");
  });
});

describe("login", () => {
  it("issues a new session for valid credentials", async () => {
    const created = await register("login@example.com", "correct horse");
    const session = await auth.login({
      email: "login@example.com",
      password: "correct horse",
    });

    expect(session.user.id).toBe(created.user.id);
    expect(session.token).not.toBe(created.token);
    // Both sessions remain valid until revoked.
    expect(await auth.verify(created.token)).not.toBeNull();
    expect(await auth.verify(session.token)).not.toBeNull();
  });

  it("fails identically for unknown users and wrong passwords", async () => {
    await register("known@example.com", "correct horse");
    await expectAuthError(
      auth.login({ email: "known@example.com", password: "wrong horse" }),
      "invalid-credentials",
    );
    await expectAuthError(
      auth.login({ email: "nobody@example.com", password: "correct horse" }),
      "invalid-credentials",
    );
  });
});

describe("sessions", () => {
  it("rejects unknown tokens", async () => {
    expect(await auth.verify("not-a-real-token")).toBeNull();
  });

  it("revokes the token on logout", async () => {
    const session = await register("logout@example.com");
    await auth.logout(session.token);
    expect(await auth.verify(session.token)).toBeNull();
    // Logging out twice is a no-op.
    await auth.logout(session.token);
  });

  it("does not verify expired sessions and deletes them", async () => {
    const shortLived = createAuth({
      users: createD1UserRepository(env.AUTH_DB),
      sessions: createD1SessionRepository(env.AUTH_DB),
      passwordIterations: 1_000,
      sessionTtlSeconds: -1,
    });
    const session = await shortLived.register({
      email: "expired@example.com",
      password: "correct horse",
    });

    expect(await shortLived.verify(session.token)).toBeNull();
    expect((await countSessions(session.user.id))?.count).toBe(0);
  });

  it("refreshes last_used_at when a session is used", async () => {
    const session = await register("touch@example.com");
    const tokenHash = await hashToken(session.token);
    await env.AUTH_DB.prepare(
      "UPDATE sessions SET last_used_at = 0 WHERE token_hash = ?",
    )
      .bind(tokenHash)
      .run();

    const verified = await auth.verify(session.token);
    expect(verified?.session.lastUsedAt).toBeGreaterThan(0);

    const stored = await env.AUTH_DB.prepare(
      "SELECT last_used_at FROM sessions WHERE token_hash = ?",
    )
      .bind(tokenHash)
      .first<{ last_used_at: number }>();
    expect(stored?.last_used_at).toBe(Math.floor(Date.now() / 1000));
  });

  it("revokes every session of a user", async () => {
    const first = await register("revoke@example.com");
    const second = await auth.login({
      email: "revoke@example.com",
      password: "correct horse",
    });

    await auth.revokeAllSessions(first.user.id);

    expect(await auth.verify(first.token)).toBeNull();
    expect(await auth.verify(second.token)).toBeNull();
  });

  it("prunes expired sessions", async () => {
    const shortLived = createAuth({
      users: createD1UserRepository(env.AUTH_DB),
      sessions: createD1SessionRepository(env.AUTH_DB),
      passwordIterations: 1_000,
      sessionTtlSeconds: -1,
    });
    const expired = await shortLived.register({
      email: "prune@example.com",
      password: "correct horse",
    });

    await auth.pruneExpiredSessions();

    expect((await countSessions(expired.user.id))?.count).toBe(0);
  });
});

describe("changePassword", () => {
  it("rotates the hash, revokes all sessions and returns a fresh one", async () => {
    const first = await register("rotate@example.com", "correct horse");
    const second = await auth.login({
      email: "rotate@example.com",
      password: "correct horse",
    });

    const rotated = await auth.changePassword({
      token: second.token,
      currentPassword: "correct horse",
      newPassword: "battery staple",
    });

    expect(await auth.verify(first.token)).toBeNull();
    expect(await auth.verify(second.token)).toBeNull();
    expect((await auth.verify(rotated.token))?.user.id).toBe(first.user.id);

    await expectAuthError(
      auth.login({ email: "rotate@example.com", password: "correct horse" }),
      "invalid-credentials",
    );
    const relogged = await auth.login({
      email: "rotate@example.com",
      password: "battery staple",
    });
    expect(relogged.user.id).toBe(first.user.id);
  });

  it("rejects a wrong current password and unknown sessions", async () => {
    const session = await register("rotate2@example.com", "correct horse");

    await expectAuthError(
      auth.changePassword({
        token: session.token,
        currentPassword: "nope",
        newPassword: "battery staple",
      }),
      "invalid-credentials",
    );
    await expectAuthError(
      auth.changePassword({
        token: "unknown",
        currentPassword: "correct horse",
        newPassword: "battery staple",
      }),
      "invalid-session",
    );
    expect(await auth.verify(session.token)).not.toBeNull();
  });
});
