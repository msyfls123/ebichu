# @ebichu-cc/login

Astro SSR worker for `login.ebichu.cc`. Writes the shared session cookie and
delegates all auth logic to `@ebichu-cc/auth`.

## Endpoints

| Route | Description |
| --- | --- |
| `GET /` | Session status for the current cookie. |
| `GET /login?return_to=…` | Login form (redirects when already signed in). |
| `GET /register?return_to=…` | Registration form. |
| `POST /api/register` | `{ email, password }` → 201 + session cookie. |
| `POST /api/login` | `{ email, password }` → 200 + session cookie. |
| `POST /api/logout` | Revokes the session and clears the cookie. |
| `GET /api/me` | `{ user, session }` for the current cookie, or 401. |

`return_to` must resolve to `login.ebichu.cc` or an allow-listed Ebichu host
(see `src/lib/origin.ts`); anything else falls back to `/`. Unsafe methods are
rejected when the `Origin` header is missing or foreign.

## Local development

```sh
pnpm install
pnpm --filter @ebichu-cc/auth build
pnpm --filter @ebichu-cc/login db:migrate   # applies ../packages/ebichu-auth/migrations
pnpm --filter @ebichu-cc/login dev          # http://localhost:4321
```

`astro dev` runs on `workerd` via the Cloudflare Vite plugin, so `AUTH_DB` is a
real local D1 binding. In dev the cookie is host-scoped, unprefixed and
non-secure (`ebichu_session`) because `__Secure-` requires HTTPS.

Production cookies use `@ebichu-cc/auth`'s defaults:
`__Secure-ebichu_session; Domain=<COOKIE_DOMAIN>; Path=/; HttpOnly; Secure;
SameSite=Lax; Max-Age=30d`. Set `COOKIE_DOMAIN=""` in `wrangler.jsonc` vars to
scope the cookie to the current host (e.g. a preview deployment).

`PASSWORD_ITERATIONS` (also a `vars` entry) controls the PBKDF2 work factor for
new password hashes. workerd rejects counts above 100000; raise it up to that
cap when your Workers CPU budget allows.

## Deployment

```sh
pnpm --filter @ebichu-cc/login types   # regenerate worker-configuration.d.ts
pnpm --filter @ebichu-cc/login deploy  # astro build && wrangler deploy
```

`wrangler.jsonc` declares the `AUTH_DB` D1 binding (database `auth`, id
already configured), the `login.ebichu.cc` custom domain and `migrations_dir`,
so `wrangler d1 migrations apply auth --remote` can be run from this worker.

CI (`.github/workflows/release.yml`) runs this on every push to `main` after
the SDK is published.

## Smoke test

```sh
pnpm --filter @ebichu-cc/login smoke
```

Builds the worker, applies migrations to local D1, boots `wrangler dev`, then
exercises register → `/api/me` → wrong password → login → logout → origin
guard against the real runtime.
