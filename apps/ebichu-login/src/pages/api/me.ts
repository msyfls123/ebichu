import type { APIRoute } from "astro";
import { getAuth } from "../../lib/auth";
import { json } from "../../lib/http";
import { readSessionToken } from "../../lib/session";

export const GET: APIRoute = async ({ cookies }) => {
  const token = readSessionToken(cookies);
  const verified = token ? await getAuth().verify(token) : null;
  if (!verified) {
    return json({ error: "Unauthorized" }, 401);
  }
  return json({
    user: verified.user,
    session: { expiresAt: verified.session.expiresAt },
  });
};
