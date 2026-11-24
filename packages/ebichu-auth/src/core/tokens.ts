import { toBase64Url, toHex } from "./encoding.js";

const TOKEN_BYTES = 32;

/** Generates a 256-bit opaque session token, safe to hand to a client. */
export function generateToken(byteLength: number = TOKEN_BYTES): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * Hashes a token for storage, so a database leak cannot be replayed as a live
 * session. SHA-256 is sufficient because tokens are high-entropy.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return toHex(new Uint8Array(digest));
}
