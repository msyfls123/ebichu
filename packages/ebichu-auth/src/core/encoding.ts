/**
 * Base64url/hex helpers.
 *
 * Implemented on top of `btoa`/`atob` so the package runs unchanged in
 * Workers, Node, Deno and browsers.
 */

const BASE64_TO_URL = /\+/g;
const BASE64_TO_STANDARD = /-/g;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(BASE64_TO_URL, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const standard = value.replace(BASE64_TO_STANDARD, "+").replace(/_/g, "/");
  const padding = (4 - (standard.length % 4)) % 4;
  const binary = atob(standard.padEnd(standard.length + padding, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
