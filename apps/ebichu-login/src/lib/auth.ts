import type { Auth } from "@ebichu-cc/auth";
import { createAuth } from "@ebichu-cc/auth";
import {
  createD1SessionRepository,
  createD1UserRepository,
} from "@ebichu-cc/auth/d1";
import { env } from "cloudflare:workers";

/** Builds the auth service around the shared `auth` D1 database. */
export function getAuth(): Auth {
  return createAuth({
    users: createD1UserRepository(env.AUTH_DB),
    sessions: createD1SessionRepository(env.AUTH_DB),
  });
}
