import { fromBase64Url, toBase64Url } from "./encoding.js";

/**
 * PBKDF2-HMAC-SHA-256 on top of WebCrypto, which keeps the package free of
 * native dependencies (bcrypt/argon2 are unavailable in Workers).
 *
 * `password_hash` is stored as `pbkdf2-sha256$<iterations>$<hash>` while the
 * salt lives in its own column. Embedding the work factor means it can be
 * raised later without invalidating existing rows.
 */

const ALGORITHM = "pbkdf2-sha256";
const SALT_BYTES = 16;
const HASH_BITS = 256;

/**
 * Default work factor. Kept low because workerd's WebCrypto rejects PBKDF2
 * iteration counts above 100_000, and Workers Free CPU budgets are small.
 * Raise it via `createAuth({ passwordIterations })` (up to 100_000) when your
 * plan allows; the count is embedded in each hash, so existing rows stay valid.
 */
export const DEFAULT_PBKDF2_ITERATIONS = 10_000;

/** Upper bound accepted by workerd's WebCrypto implementation. */
export const MAX_PBKDF2_ITERATIONS = 100_000;

const encoder = new TextEncoder();

/** Creates a random salt, base64url encoded. */
export function createSalt(byteLength: number = SALT_BYTES): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function deriveBits(
  password: string,
  salt: string,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations,
    },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

/** Hashes a plaintext password for storage. */
export async function hashPassword(
  password: string,
  salt: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  const hash = await deriveBits(password, salt, iterations);
  return `${ALGORITHM}$${iterations}$${toBase64Url(hash)}`;
}

/**
 * Verifies a password against a stored hash in constant time. Malformed
 * hashes never match.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 3) {
    return false;
  }
  const [algorithm, iterationsRaw, hashRaw] = parts;
  if (algorithm !== ALGORITHM || !iterationsRaw || !hashRaw) {
    return false;
  }
  const iterations = Number.parseInt(iterationsRaw, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  let expected: Uint8Array;
  try {
    expected = fromBase64Url(hashRaw);
  } catch {
    return false;
  }

  const actual = await deriveBits(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}
