/**
 * Deterministic default avatars derived from an e-mail address.
 *
 * Kept framework-agnostic and synchronous: the UI decides how to draw the
 * circle, this module only answers "which background color" and "which
 * initial". The same e-mail always maps to the same color on every surface,
 * so login, main site and editor render identical avatars.
 */

/**
 * Pastel palette. Every entry keeps black text well above WCAG AA contrast,
 * which is why initials are always rendered in black.
 */
export const AVATAR_PALETTE = [
  "#FCA5A5",
  "#FDBA74",
  "#FCD34D",
  "#BEF264",
  "#86EFAC",
  "#6EE7B7",
  "#67E8F9",
  "#93C5FD",
  "#C4B5FD",
  "#F0ABFC",
] as const;

export interface DefaultAvatar {
  /** Background color from {@link AVATAR_PALETTE}. */
  bgColor: string;
  /** Single uppercase character shown in the center. */
  initial: string;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** FNV-1a (32-bit): stable across runtimes and cheap enough for render paths. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** Background color for an e-mail address, stable for the same address. */
export function avatarBgColor(email: string): string {
  const index = hash(normalize(email)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index] ?? AVATAR_PALETTE[0];
}

/**
 * First letter or digit of the address, uppercased, skipping punctuation such
 * as a leading `.` or `+`. Falls back to `?`.
 */
export function avatarInitial(email: string): string {
  for (const character of email.trim()) {
    if (/[\p{L}\p{N}]/u.test(character)) {
      return character.toUpperCase();
    }
  }
  return "?";
}

/** Convenience helper for rendering: color and initial in one call. */
export function avatarFor(email: string): DefaultAvatar {
  return {
    bgColor: avatarBgColor(email),
    initial: avatarInitial(email),
  };
}
