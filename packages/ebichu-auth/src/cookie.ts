/**
 * Session cookie configuration shared by all framework integrations.
 *
 * Deliberately free of framework imports so non-Hono apps (Astro, Express, …)
 * can import it straight from the package root.
 *
 * `__Secure-` allows a parent `Domain`, unlike `__Host-`, which is why the
 * cookie can be shared by every `*.ebichu.cc` worker.
 */

export const SESSION_COOKIE_NAME = "__Secure-ebichu_session";

export interface SessionCookieConfig {
  /** Cookie name. Defaults to {@link SESSION_COOKIE_NAME}. */
  name?: string;
  /**
   * Parent domain, e.g. `ebichu.cc`, so every subdomain shares the cookie.
   * Leave `undefined` in local development to scope it to the current host.
   */
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export type ResolvedSessionCookie = {
  name: string;
  domain: string | undefined;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None";
};

export const DEFAULT_SESSION_COOKIE: Readonly<ResolvedSessionCookie> = {
  name: SESSION_COOKIE_NAME,
  domain: "ebichu.cc",
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "Lax",
};
