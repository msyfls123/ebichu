# ebichu

pnpm workspace for the Ebichu auth stack.

```
packages/ebichu-auth   @ebichu-cc/auth  – ESM auth SDK (core / D1 adapter / Hono)
apps/ebichu-login      @ebichu-cc/login – Astro SSR worker for login.ebichu.cc
scripts/               release helpers
.github/workflows/     verify → publish → deploy
```

All apps share one D1 database (`auth`) and one session cookie
(`__Secure-ebichu_session`, `Domain=ebichu.cc`). See
[`packages/ebichu-auth/README.md`](packages/ebichu-auth/README.md) for the
architecture and security notes.

## Commands

```sh
pnpm install
pnpm build       # SDK (tsc) + login (astro build)
pnpm typecheck   # SDK tests project + astro check
pnpm test        # SDK tests in workerd + local D1

pnpm dev:login   # astro dev on http://localhost:4321

# Database (schema owned by @ebichu-cc/auth; database `auth` already exists)
pnpm --filter @ebichu-cc/auth db:migrate         # local
pnpm --filter @ebichu-cc/auth db:migrate:remote  # remote

pnpm --filter @ebichu-cc/login smoke             # build + local D1 + end-to-end check
```

## CI/CD

`.github/workflows/release.yml` runs on every push to `main`:

1. **verify** – build, typecheck, tests.
2. **publish** – bumps `@ebichu-cc/auth` to the next patch version (never
   reusing a version already on npm) and publishes it with
   [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers): GitHub's
   OIDC token replaces `NPM_TOKEN`, and provenance is generated automatically.
   The workflow also writes `repository.url` to match the repo, which npm
   requires for OIDC publishing.
3. **deploy** – applies pending D1 migrations, builds, and deploys
   `@ebichu-cc/login` with `wrangler deploy`.

Repository secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | apply migrations + deploy the worker |
| `CLOUDFLARE_ACCOUNT_ID` | target Cloudflare account |

### First publish (bootstrap)

Trusted publishing is configured on an existing package, so publish the first
version (0.1.0) locally:

```sh
pnpm --filter @ebichu-cc/auth build
npm login                       # account that owns the @ebichu-cc scope
cd packages/ebichu-auth
npm publish --access public
```

Then, on npmjs.com → package → **Settings → Trusted publishing**, add a GitHub
Actions publisher:

- Organization/user + repository: this repo
- Workflow filename: `release.yml` (filename only, with extension)
- Environment: leave empty
- Allowed actions: enable **npm publish** (new connections default to
  `npm stage publish` only)

Finish the first CI publish within **2 days** of creating the connection, or
it expires and must be recreated. `repository.url` is injected by
`scripts/set-repository.mjs` during the workflow, so it always matches.

Notes:

- Trusted publishing needs npm ≥ 11.5.1 (the workflow upgrades npm) and
  GitHub-hosted runners.
- Provenance (automatic with trusted publishing) is only generated for
  **public** repositories; private repos can still publish this way, just
  without provenance.
- After the first successful CI publish, consider Settings → Publishing access
  → “Require two-factor authentication and disallow tokens”.
- The D1 database `auth` is already created; its id lives in
  `apps/ebichu-login/wrangler.jsonc` and `packages/ebichu-auth/wrangler.jsonc`.

### Note on workspace linking

Inside this monorepo, `@ebichu-cc/login` resolves `@ebichu-cc/auth` through
`workspace:^`, so the worker always builds against the local SDK sources. The
npm package exists for consumers outside this repository; a change to
`packages/ebichu-auth` therefore ships to the login worker immediately on push,
independently of the published version.

When versioning needs become stricter, switch the publish step to
[Changesets](https://github.com/changesets/changesets) and delete
`scripts/next-version.mjs`. If you prefer Cloudflare Workers Builds over this
workflow, use watch paths `apps/ebichu-login/**` + `packages/ebichu-auth/**` +
`pnpm-lock.yaml` so SDK changes redeploy the login worker.
