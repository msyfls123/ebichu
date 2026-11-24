import { DEFAULT_SESSION_COOKIE } from "@ebichu-cc/auth";
import type { AuthSession, ResolvedSessionCookie } from "@ebichu-cc/auth";
import type { AstroCookies } from "astro";
import { env } from "cloudflare:workers";

/**
 * The `__Secure-` prefix requires the `Secure` attribute, so local development
 * (plain HTTP on localhost) uses a host-scoped, unprefixed cookie instead.
 */
const DEV_COOKIE: ResolvedSessionCookie = {
  ...DEFAULT_SESSION_COOKIE,
  name: "ebichu_session",
  domain: undefined,
  secure: false,
};

function sessionCookie(): ResolvedSessionCookie {
  if (import.meta.env.DEV) {
    return DEV_COOKIE;
  }
  // `COOKIE_DOMAIN=""` scopes the cookie to the current host, which is handy
  // for preview deployments.
  const domain = env.COOKIE_DOMAIN?.trim();
  return {
    ...DEFAULT_SESSION_COOKIE,
    domain: domain === undefined || domain === "" ? undefined : domain,
  };
}

function attributes(cookie: ResolvedSessionCookie) {
  return {
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite.toLowerCase() as "lax" | "strict" | "none",
    ...(cookie.domain === undefined ? {} : { domain: cookie.domain }),
  };
}

export function setSessionCookie(
  cookies: AstroCookies,
  session: AuthSession,
): void {
  const cookie = sessionCookie();
  cookies.set(cookie.name, session.token, {
    ...attributes(cookie),
    maxAge: Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000)),
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  const cookie = sessionCookie();
  cookies.delete(cookie.name, attributes(cookie));
}

export function readSessionToken(cookies: AstroCookies): string | undefined {
  return cookies.get(sessionCookie().name)?.value;
}
