import { applyD1Migrations, env } from "cloudflare:test";

// Runs before every test file; `applyD1Migrations` is idempotent, so this is
// safe even when setup is evaluated more than once.
await applyD1Migrations(env.AUTH_DB, env.TEST_MIGRATIONS);
