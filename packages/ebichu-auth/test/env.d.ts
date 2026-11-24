// Minimal ambient types for the `cloudflare:test` module used by the suite.
// Declared here (rather than pulled from `@cloudflare/vitest-plugin/types`) so
// the test project only needs the Workers runtime globals.
declare module "cloudflare:test" {
  import type { D1Migration } from "@cloudflare/vitest-plugin";

  interface ProvidedEnv {
    AUTH_DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }

  export const env: ProvidedEnv;
  export function applyD1Migrations(
    database: D1Database,
    migrations: D1Migration[],
  ): Promise<void>;
}
