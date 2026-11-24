export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cross-origin targets we allow unsafe requests from. Same-origin requests are
 * always allowed. Keep this list in sync with the deployed subdomains.
 */
const ALLOWED_ORIGINS = new Set([
  "https://ebichu.cc",
  "https://login.ebichu.cc",
  "https://editor.ebichu.cc",
]);

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * `SameSite=Lax` treats every `*.ebichu.cc` host as the same site, so it does
 * not stop cross-subdomain CSRF. Unsafe requests must therefore carry an
 * acceptable `Origin`.
 */
export function isAllowedOrigin(request: Request, self: URL): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return false;
  }
  const normalized = origin.toLowerCase();
  if (normalized === self.origin.toLowerCase()) {
    return true;
  }
  if (ALLOWED_ORIGINS.has(normalized)) {
    return true;
  }
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && isLocalHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Only same-origin paths or explicitly allow-listed Ebichu hosts are valid
 * post-login destinations, which prevents open redirects.
 */
export function safeReturnTo(value: string | null, fallback = "/"): string {
  if (!value) {
    return fallback;
  }
  try {
    const url = new URL(value, "https://login.ebichu.cc");
    if (url.origin === "https://login.ebichu.cc") {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (url.protocol === "https:" && ALLOWED_ORIGINS.has(url.origin)) {
      return url.toString();
    }
    return fallback;
  } catch {
    return fallback;
  }
}
