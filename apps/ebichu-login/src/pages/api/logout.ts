import type { APIRoute } from "astro";
import { getAuth } from "../../lib/auth";
import { json } from "../../lib/http";
import { clearSessionCookie, readSessionToken } from "../../lib/session";

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = readSessionToken(cookies);
  if (token) {
    await getAuth().logout(token);
  }
  clearSessionCookie(cookies);

  // Progressive enhancement: plain <form> submitters get a redirect, fetch
  // callers get JSON.
  if (request.headers.get("accept")?.includes("text/html")) {
    return new Response(null, { status: 303, headers: { location: "/" } });
  }
  return json({ success: true });
};
