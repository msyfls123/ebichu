/**
 * Browser helpers for calling auth-protected endpoints.
 *
 * This entry point must stay free of server imports (D1, Hono, password
 * hashing) so bundlers never pull them into client bundles.
 *
 * The session cookie is `HttpOnly`, so JavaScript can never read it. Instead
 * every request relies on the browser attaching it automatically: that only
 * happens for same-origin requests, or for same-site subdomains when
 * `credentials: "include"` is set (and the server answers with an exact CORS
 * origin plus `Access-Control-Allow-Credentials: true`).
 */

/** Credentials mode for the browser `fetch` API. */
export type AuthCredentials = "omit" | "same-origin" | "include";

/**
 * `RequestInit` with browser credentials support. Plain Workers typings omit
 * `credentials`, so the browser entry declares it explicitly.
 */
export type AuthFetchInit = Omit<RequestInit, "credentials"> & {
  credentials?: AuthCredentials;
};

/** Error thrown by {@link authJson} for non-2xx responses. */
export class AuthRequestError extends Error {
  override readonly name = "AuthRequestError";

  constructor(
    readonly status: number,
    /** `code` from the auth API payload, when present. */
    readonly code: string | undefined,
    message: string,
    readonly payload: unknown,
  ) {
    super(message);
  }
}

/**
 * `fetch` with credentials enabled.
 *
 * Same-origin requests behave normally; cross-subdomain requests such as
 * `editor.ebichu.cc` → `login.ebichu.cc` now send the shared cookie.
 * `credentials` can still be overridden by the caller.
 */
export function authFetch(
  input: RequestInfo | URL,
  init: AuthFetchInit = {},
): Promise<Response> {
  const request: AuthFetchInit = { credentials: "include", ...init };
  // The Workers typings have no `credentials`, but this module targets browsers.
  return fetch(input, request as RequestInit);
}

/**
 * JSON-flavoured variant of {@link authFetch}:
 * - adds `content-type: application/json` only when a body is present
 *   (avoids a needless CORS preflight for GETs),
 * - parses the payload,
 * - throws {@link AuthRequestError} with the server's `error`/`code` on failure.
 */
export async function authJson<T>(
  input: RequestInfo | URL,
  init: AuthFetchInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await authFetch(input, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = payload as { error?: unknown; code?: unknown } | null;
    const message =
      typeof body?.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    const code = typeof body?.code === "string" ? body.code : undefined;
    throw new AuthRequestError(response.status, code, message, payload);
  }

  return payload as T;
}
