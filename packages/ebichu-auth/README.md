# @ebichu-cc/auth

Authentication SDK for the ebichu workspace: **centralized login + a session
cookie shared across `*.ebichu.cc` + a single D1 database**.

- `login.ebichu.cc` (see `apps/ebichu-login`) owns register/login/logout and is
  the only worker that writes the cookie.
- `ebichu.cc`, `editor.ebichu.cc`, … only read the cookie and verify it against
  the same D1 database — no HTTP call to the login worker, no JWT exchange.
- D1 database: **`auth`**. Sessions are opaque random tokens; D1 only stores
  `sha256(token)`.

ESM-only, zero runtime dependencies apart from an optional `hono` peer.

## Layers

| Entry | Contents | Framework/DB coupling |
| --- | --- | --- |
| `@ebichu-cc/auth` | core: register/login/verify/sessions, PBKDF2, tokens, repository ports, shared cookie config | none |
| `@ebichu-cc/auth/d1` | D1 implementations of the repository ports | Cloudflare D1 |
| `@ebichu-cc/auth/hono` | `attach` / `require` / `csrf` middlewares | Hono 4 |

The core never touches HTTP, cookies or `D1Database`, so the same logic can be
reused with another framework or database adapter later.

## Setup

```sh
# Once per Cloudflare account: create the shared database, then paste the id
# into wrangler.jsonc (`d1_databases[0].database_id`).
pnpm --filter @ebichu-cc/auth db:create

# Apply the schema owned by this package.
pnpm --filter @ebichu-cc/auth db:migrate          # local
pnpm --filter @ebichu-cc/auth db:migrate:remote   # remote
```

Migrations live in `migrations/` and are the single source of truth for
`users` / `sessions`. Other workers apply them but must not edit them.

## Usage (any runtime)

```ts
import { createAuth } from "@ebichu-cc/auth";
import {
  createD1SessionRepository,
  createD1UserRepository,
} from "@ebichu-cc/auth/d1";

const auth = createAuth({
  users: createD1UserRepository(env.AUTH_DB),
  sessions: createD1SessionRepository(env.AUTH_DB),
});

const session = await auth.login({ email, password });
const verified = await auth.verify(session.token); // { user, session } | null
```

### Cookies

Cookie configuration lives at the package root (no Hono dependency):

```ts
import { DEFAULT_SESSION_COOKIE, SESSION_COOKIE_NAME } from "@ebichu-cc/auth";
// __Secure-ebichu_session, Domain=ebichu.cc, Path=/, HttpOnly, Secure,
// SameSite=Lax, 30 days.
```

The Astro login app uses these constants directly with `Astro.cookies`; Hono
apps get them through `@ebichu-cc/auth/hono`.

## Usage (Hono)

```ts
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { createAuth } from "@ebichu-cc/auth";
import { createD1SessionRepository, createD1UserRepository } from "@ebichu-cc/auth/d1";
import { createHonoAuth, SESSION_COOKIE_NAME } from "@ebichu-cc/auth/hono";

type Env = {
  Bindings: { AUTH_DB: D1Database };
  Variables: import("@ebichu-cc/auth/hono").AuthVariables;
};

const app = new Hono<Env>();

const getAuth = (c: { env: Env["Bindings"] }) =>
  createAuth({
    users: createD1UserRepository(c.env.AUTH_DB),
    sessions: createD1SessionRepository(c.env.AUTH_DB),
  });

const sdk = createHonoAuth<Env>({
  getAuth,
  allowedOrigins: [
    "https://login.ebichu.cc",
    "https://ebichu.cc",
    "https://editor.ebichu.cc",
  ],
});

app.post("/api/login", sdk.csrf, async (c) => {
  const session = await getAuth(c).login(await c.req.json());
  sdk.setSessionCookie(c, session); // Domain=ebichu.cc, HttpOnly, Secure, Lax
  return c.json({ user: session.user });
});

app.post("/api/logout", sdk.csrf, async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) await getAuth(c).logout(token);
  sdk.clearSessionCookie(c);
  return c.json({ success: true });
});
```

Read-only workers (`ebichu.cc`, `editor.ebichu.cc`) skip cookie writes:

```ts
app.use("*", sdk.attach);                       // public route, user if present
app.get("/api/me", sdk.require, (c) => c.json({ user: c.get("user") }));
```

## API

### Core

| Member | Description |
| --- | --- |
| `createAuth({ users, sessions, sessionTtlSeconds?, passwordIterations? })` | Builds an `Auth` from repository ports. |
| `auth.register({ email, password })` | Creates the user and returns an `AuthSession`. |
| `auth.login({ email, password })` | Verifies credentials and returns an `AuthSession`. |
| `auth.verify(token)` | Returns `{ user, session }`, or `null` when unknown/expired. |
| `auth.logout(token)` | Revokes one session; safe to repeat. |
| `auth.changePassword({ token, currentPassword, newPassword })` | Rotates the hash, revokes all sessions, returns a fresh session. |
| `auth.revokeAllSessions(userId)` | Forced sign-out for every device. |
| `auth.pruneExpiredSessions()` | Cleanup for a cron handler. |
| `hashPassword` / `verifyPassword` / `generateToken` / `hashToken` | Building blocks. |

Failures throw `AuthError` with a stable `code`: `invalid-email`,
`weak-password`, `email-taken`, `invalid-credentials`, `invalid-session`.

### D1 (`@ebichu-cc/auth/d1`)

`createD1UserRepository(db)` and `createD1SessionRepository(db)` implement the
core ports and translate SQLite constraint errors into
`UniqueViolationError`.

### Hono (`@ebichu-cc/auth/hono`)

| Member | Description |
| --- | --- |
| `createHonoAuth({ getAuth, cookie?, allowedOrigins? })` | Returns `attach`, `require`, `csrf`, `setSessionCookie`, `clearSessionCookie`. |
| `attach` | Sets `user`/`session` when a valid cookie exists; never rejects. |
| `require` | Same, but responds `401 {"error":"Unauthorized"}` without a session. |
| `csrf` | Rejects unsafe methods whose `Origin` is not in `allowedOrigins`. |

## Schema

```sql
users(id, email UNIQUE, password_hash, password_salt, created_at, updated_at)
sessions(id, user_id, token_hash UNIQUE, expires_at, created_at, last_used_at)
```

Times are Unix **seconds**. E-mails are lower-cased and trimmed. Sessions carry
a random 256-bit token in the cookie; `token_hash` stores its SHA-256, so a
database leak cannot be replayed. `last_used_at` is refreshed at most every
five minutes to limit writes.

## Security notes

- `__Secure-` allows `Domain=ebichu.cc`; `__Host-` does not, so it cannot be
  used for a shared cookie.
- `SameSite=Lax` does **not** stop cross-subdomain CSRF: `evil.ebichu.cc` is
  the same site as `editor.ebichu.cc`. Always guard mutating routes (Hono:
  `sdk.csrf`; Astro: `src/middleware.ts`), never mutate state on GET, and keep
  every subdomain HTTPS-only and free of third-party-controlled content.
- Passwords use PBKDF2-SHA-256; the default 600k iterations costs a few hundred
  milliseconds, so lower `passwordIterations` if you are CPU-limited. The work
  factor is embedded in each hash, so it can be raised without invalidating
  rows.
- Login performs an equivalent hash for unknown e-mails to avoid account
  enumeration through timing.
- Password changes revoke every session and issue a new one.

## Testing

```sh
pnpm --filter @ebichu-cc/auth test
```

Tests run inside `workerd` against a real local D1 instance
(`@cloudflare/vitest-plugin`), applying `migrations/` before each file.
