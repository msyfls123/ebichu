import type { Context, Env, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

import type { Auth } from "../core/auth.js";
import type { AuthSessionRecord, AuthUser, VerifiedSession } from "../core/types.js";
import {
  DEFAULT_SESSION_COOKIE,
  SESSION_COOKIE_NAME,
} from "../cookie.js";
import type {
  ResolvedSessionCookie,
  SessionCookieConfig,
} from "../cookie.js";

/**
 * Hono integration: session cookie handling plus middlewares that resolve the
 * caller. Only the login worker writes the cookie; every other worker reads it.
 *
 * Because the cookie is scoped to the parent domain (`Domain=ebichu.cc`), all
 * `*.ebichu.cc` workers receive it and can verify the session against the same
 * D1 database without calling the login worker.
 */

export { DEFAULT_SESSION_COOKIE, SESSION_COOKIE_NAME };
export type { ResolvedSessionCookie, SessionCookieConfig };

/** Variables the middlewares set on the Hono context. */
export interface AuthVariables {
  user?: AuthUser;
  session?: AuthSessionRecord;
}

export interface HonoAuthOptions<E extends Env = Env> {
  /** Returns (or builds) the `Auth` service for the current request. */
  getAuth: (c: Context<E>) => Auth;
  /** Overrides for the shared session cookie. */
  cookie?: SessionCookieConfig;
  /**
   * When provided, unsafe methods (POST/PUT/PATCH/DELETE) must carry a matching
   * `Origin`. `SameSite=Lax` alone does not stop cross-subdomain CSRF.
   */
  allowedOrigins?: Iterable<string>;
}

export interface HonoAuth<E extends Env = Env> {
  /**
   * Attaches `user`/`session` when a valid cookie is present and always
   * continues the chain. Use it on routes that render both states.
   */
  attach: MiddlewareHandler<E>;
  /** Requires a valid session; responds `401` otherwise. */
  require: MiddlewareHandler<E>;
  /** Rejects unsafe requests from unknown origins; no-op without `allowedOrigins`. */
  csrf: MiddlewareHandler<E>;
  /** Writes the session cookie (login worker only). */
  setSessionCookie(c: Context<E>, session: { token: string; expiresAt: number }): void;
  /** Clears the session cookie. */
  clearSessionCookie(c: Context<E>): void;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type VariablesContext = Context<{ Variables: AuthVariables }>;

function cookieAttributes(config: ResolvedSessionCookie) {
  return {
    path: config.path,
    secure: config.secure,
    httpOnly: config.httpOnly,
    sameSite: config.sameSite,
    ...(config.domain === undefined ? {} : { domain: config.domain }),
  };
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function createHonoAuth<E extends Env = Env>(
  options: HonoAuthOptions<E>,
): HonoAuth<E> {
  const cookie: ResolvedSessionCookie = { ...DEFAULT_SESSION_COOKIE, ...options.cookie };
  const allowedOrigins = options.allowedOrigins
    ? new Set(options.allowedOrigins)
    : null;

  function asVariables(c: Context<E>): VariablesContext {
    return c as unknown as VariablesContext;
  }

  async function resolve(c: Context<E>): Promise<VerifiedSession | null> {
    const token = getCookie(c, cookie.name);
    if (!token) {
      return null;
    }
    return options.getAuth(c).verify(token);
  }

  function remember(c: Context<E>, verified: VerifiedSession): void {
    const variables = asVariables(c);
    variables.set("user", verified.user);
    variables.set("session", verified.session);
  }

  const attach = createMiddleware<E>(async (c, next) => {
    const verified = await resolve(c);
    if (verified) {
      remember(c, verified);
    }
    await next();
  });

  const require = createMiddleware<E>(async (c, next) => {
    if (!asVariables(c).get("user")) {
      const verified = await resolve(c);
      if (!verified) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      remember(c, verified);
    }
    await next();
  });

  const csrf = createMiddleware<E>(async (c, next) => {
    if (allowedOrigins && UNSAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header("Origin");
      if (!origin || !allowedOrigins.has(origin)) {
        return c.json({ error: "Forbidden origin" }, 403);
      }
    }
    await next();
  });

  return {
    attach,
    require,
    csrf,

    setSessionCookie(c, session) {
      setCookie(c, cookie.name, session.token, {
        ...cookieAttributes(cookie),
        maxAge: Math.max(0, session.expiresAt - nowInSeconds()),
      });
    },

    clearSessionCookie(c) {
      deleteCookie(c, cookie.name, cookieAttributes(cookie));
    },
  };
}
