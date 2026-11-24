import { env } from "cloudflare:test";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import type { Auth } from "../src/index.js";
import { createAuth } from "../src/index.js";
import {
  createD1SessionRepository,
  createD1UserRepository,
} from "../src/d1/index.js";
import type { AuthVariables } from "../src/hono/index.js";
import { createHonoAuth, SESSION_COOKIE_NAME } from "../src/hono/index.js";

type TestEnv = {
  Bindings: { AUTH_DB: D1Database };
  Variables: AuthVariables;
};

const ALLOWED_ORIGIN = "https://login.ebichu.cc";

function authFor(c: Context<TestEnv>): Auth {
  return createAuth({
    users: createD1UserRepository(c.env.AUTH_DB),
    sessions: createD1SessionRepository(c.env.AUTH_DB),
    passwordIterations: 1_000,
  });
}

function createApp(options: { domain?: string } = {}) {
  const sdk = createHonoAuth<TestEnv>({
    getAuth: authFor,
    cookie: { domain: options.domain ?? "localhost" },
    allowedOrigins: [ALLOWED_ORIGIN],
  });

  const app = new Hono<TestEnv>();
  app.use("/api/*", sdk.attach);

  app.post("/api/register", sdk.csrf, async (c) => {
    const session = await authFor(c).register(await c.req.json());
    sdk.setSessionCookie(c, session);
    return c.json({ user: session.user });
  });

  app.post("/api/login", sdk.csrf, async (c) => {
    const session = await authFor(c).login(await c.req.json());
    sdk.setSessionCookie(c, session);
    return c.json({ user: session.user });
  });

  app.post("/api/logout", sdk.csrf, async (c) => {
    const token = getCookie(c, SESSION_COOKIE_NAME);
    if (token) {
      await authFor(c).logout(token);
    }
    sdk.clearSessionCookie(c);
    return c.json({ success: true });
  });

  app.get("/api/me", sdk.require, (c) => c.json({ user: c.get("user") ?? null }));
  app.get("/api/optional", (c) => c.json({ user: c.get("user") ?? null }));

  return app;
}

function sessionTokenFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(header);
  if (!match?.[1]) {
    throw new Error(`Missing session cookie in: ${header}`);
  }
  return match[1];
}

async function signUp(
  app: ReturnType<typeof createApp>,
  email = "hono@example.com",
  password = "correct horse",
): Promise<Response> {
  return app.request(
    "/api/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ALLOWED_ORIGIN },
      body: JSON.stringify({ email, password }),
    },
    env,
  );
}

describe("session cookie", () => {
  it("is shared with subdomains using the secure defaults", async () => {
    const app = createApp({ domain: "ebichu.cc" });
    const response = await signUp(app);
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toMatch(/Domain=ebichu\.cc/);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Lax/);

    const maxAge = Number(/Max-Age=(\d+)/.exec(header)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThan(30 * 24 * 60 * 60 - 5);
    expect(header).not.toMatch(/Max-Age=0/);
  });

  it("is cleared with the same scope on logout", async () => {
    const app = createApp({ domain: "ebichu.cc" });
    const response = await app.request(
      "/api/logout",
      {
        method: "POST",
        headers: { Origin: ALLOWED_ORIGIN },
      },
      env,
    );
    const header = response.headers.get("set-cookie") ?? "";

    expect(header).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(header).toMatch(/Domain=ebichu\.cc/);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/Secure/);
    expect(header).toMatch(/SameSite=Lax/);
    expect(header).toMatch(/Max-Age=0/);
  });
});

describe("middlewares", () => {
  it("exposes the user to routes behind `require`", async () => {
    const app = createApp();
    const registered = await signUp(app, "require@example.com");
    const token = sessionTokenFrom(registered);

    const me = await app.request(
      "/api/me",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } },
      env,
    );
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      user: { email: "require@example.com" },
    });
  });

  it("returns 401 from `require` without a session", async () => {
    const app = createApp();
    const response = await app.request("/api/me", undefined, env);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("attaches the user without requiring one", async () => {
    const app = createApp();
    const anonymous = await app.request("/api/optional", undefined, env);
    await expect(anonymous.json()).resolves.toEqual({ user: null });

    const registered = await signUp(app, "attach@example.com");
    const token = sessionTokenFrom(registered);
    const signedIn = await app.request(
      "/api/optional",
      { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } },
      env,
    );
    await expect(signedIn.json()).resolves.toMatchObject({
      user: { email: "attach@example.com" },
    });
  });

  it("rejects unsafe requests from unknown or missing origins", async () => {
    const app = createApp();

    const missing = await app.request(
      "/api/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "csrf@example.com", password: "correct horse" }),
      },
      env,
    );
    expect(missing.status).toBe(403);

    const foreign = await app.request(
      "/api/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.ebichu.cc",
        },
        body: JSON.stringify({ email: "csrf@example.com", password: "correct horse" }),
      },
      env,
    );
    expect(foreign.status).toBe(403);
  });

  it("ignores the origin guard for safe methods", async () => {
    const app = createApp();
    expect((await app.request("/api/optional", undefined, env)).status).toBe(200);
  });
});
