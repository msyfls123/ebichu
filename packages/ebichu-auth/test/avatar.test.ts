import { describe, expect, it } from "vitest";
import {
  AVATAR_PALETTE,
  avatarBgColor,
  avatarFor,
  avatarInitial,
} from "../src/index.js";

describe("avatarBgColor", () => {
  it("is deterministic and ignores case and surrounding whitespace", () => {
    expect(avatarBgColor("user@example.com")).toBe(
      avatarBgColor("  User@Example.COM "),
    );
  });

  it("always returns a palette entry", () => {
    for (const email of ["a@b.co", "another@example.com", "x@y.z"]) {
      expect(AVATAR_PALETTE).toContain(avatarBgColor(email));
    }
  });

  it("spreads addresses across the palette", () => {
    const colors = new Set(
      Array.from({ length: 64 }, (_, index) =>
        avatarBgColor(`user${index}@example.com`),
      ),
    );
    expect(colors.size).toBeGreaterThan(3);
  });
});

describe("avatarInitial", () => {
  it("uppercases the first letter", () => {
    expect(avatarInitial("kim@example.com")).toBe("K");
    expect(avatarInitial("ZOE@example.com")).toBe("Z");
  });

  it("skips leading punctuation", () => {
    expect(avatarInitial(".hidden@example.com")).toBe("H");
    expect(avatarInitial("+tag@example.com")).toBe("T");
    expect(avatarInitial("42@example.com")).toBe("4");
  });

  it("supports non-ASCII letters", () => {
    expect(avatarInitial("émile@example.com")).toBe("É");
  });

  it("falls back to a question mark", () => {
    expect(avatarInitial("   ")).toBe("?");
  });
});

describe("avatarFor", () => {
  it("combines both values", () => {
    const avatar = avatarFor("kim@example.com");
    expect(avatar).toEqual({
      bgColor: avatarBgColor("kim@example.com"),
      initial: "K",
    });
  });
});
