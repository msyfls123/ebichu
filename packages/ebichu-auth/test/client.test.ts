import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthRequestError,
  authFetch,
  authJson,
} from "../src/client/index.js";
import type { AuthFetchInit } from "../src/client/index.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(
  handler: (input: RequestInfo | URL, init?: AuthFetchInit) => Response,
) {
  const spy = vi.fn(handler);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("authFetch", () => {
  it("sends cookies by default", async () => {
    const spy = stubFetch(() => jsonResponse({}));

    await authFetch("/api/me");

    expect(spy).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("lets the caller override credentials", async () => {
    const spy = stubFetch(() => jsonResponse({}));

    await authFetch("/api/me", { credentials: "omit" });

    const init = spy.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("omit");
  });
});

describe("authJson", () => {
  it("parses successful payloads", async () => {
    stubFetch(() => jsonResponse({ user: { id: "u1" } }));

    const payload = await authJson<{ user: { id: string } }>("/api/me");

    expect(payload).toEqual({ user: { id: "u1" } });
  });

  it("only sets content-type when a body is present", async () => {
    const spy = stubFetch(() => jsonResponse({}));

    await authJson("/api/me");
    const getInit = spy.mock.calls[0]?.[1];
    expect(new Headers(getInit?.headers).has("content-type")).toBe(false);

    await authJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.com" }),
    });
    const postInit = spy.mock.calls[1]?.[1];
    expect(new Headers(postInit?.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("throws AuthRequestError with the server code", async () => {
    stubFetch(() => jsonResponse({ error: "Unauthorized", code: "invalid-session" }, 401));

    const error = await authJson("/api/me").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AuthRequestError);
    expect((error as AuthRequestError).status).toBe(401);
    expect((error as AuthRequestError).code).toBe("invalid-session");
    expect((error as AuthRequestError).message).toBe("Unauthorized");
  });

  it("falls back to a status message for non-JSON failures", async () => {
    stubFetch(() => new Response("oops", { status: 500 }));

    const error = await authJson("/api/me").then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AuthRequestError);
    expect((error as AuthRequestError).message).toBe("Request failed (500)");
    expect((error as AuthRequestError).payload).toBeNull();
  });
});
