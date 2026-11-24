import type { APIRoute } from "astro";
import { getAuth } from "../../lib/auth";
import { authErrorResponse, json, readJson } from "../../lib/http";
import { setSessionCookie } from "../../lib/session";

interface Body {
  email?: unknown;
  password?: unknown;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await readJson<Body>(request);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return json({ error: "Invalid input" }, 400);
  }

  try {
    const session = await getAuth().register({
      email: body.email,
      password: body.password,
    });
    setSessionCookie(cookies, session);
    return json({ user: session.user }, 201);
  } catch (error) {
    return authErrorResponse(error);
  }
};
