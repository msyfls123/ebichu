#!/usr/bin/env node
/**
 * Prints Cloudflare credential diagnostics without exposing secret values.
 *
 * Run locally:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/diagnose-cloudflare.mjs
 * Or from GitHub Actions: "Diagnose Cloudflare credentials" → Run workflow.
 *
 * Fingerprints are sha256 halves: identical values produce identical hashes,
 * so the same script run locally can be compared against the CI output.
 */
import { createHash } from "node:crypto";

const API = "https://api.cloudflare.com/client/v4";
const DATABASE_ID =
  process.env.D1_DATABASE_ID ?? "c587dd5f-964d-49c4-8175-c6f2904a1e03";

const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function summarize(body) {
  const json = JSON.stringify(body);
  return json.length > 700 ? `${json.slice(0, 700)}…` : json;
}

async function call(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

if (!token) {
  console.error("✘ CLOUDFLARE_API_TOKEN is not set");
  process.exit(1);
}
if (!accountId) {
  console.error("✘ CLOUDFLARE_ACCOUNT_ID is not set");
  process.exit(1);
}

console.log("== credentials ==");
console.log(
  `CLOUDFLARE_ACCOUNT_ID length=${accountId.length} sha256-16=${fingerprint(accountId)}`,
);
console.log(
  `CLOUDFLARE_API_TOKEN   length=${token.length} sha256-16=${fingerprint(token)}`,
);
console.log(`configured D1 database: ${DATABASE_ID}`);

console.log("\n== token verify ==");
const verify = await call("/user/tokens/verify");
const tokenInfo = verify.body?.result;
if (tokenInfo) {
  console.log(
    `token id=${tokenInfo.id} status=${tokenInfo.status} not_before=${tokenInfo.not_before ?? "-"} expires_on=${tokenInfo.expires_on ?? "(never)"}`,
  );
} else {
  console.log(`status=${verify.status} ${summarize(verify.body)}`);
}

console.log("\n== accounts visible to the token ==");
const accounts = await call("/accounts");
if (accounts.body?.success) {
  const list = accounts.body.result ?? [];
  for (const account of list) {
    const matches = account.id === accountId;
    console.log(
      `- name=${account.name} id=${account.id} sha256-16=${fingerprint(account.id)}${matches ? "  <== matches CLOUDFLARE_ACCOUNT_ID" : ""}`,
    );
  }
  if (!list.some((account) => account.id === accountId)) {
    console.log("✘ CLOUDFLARE_ACCOUNT_ID is NOT among the token's accounts");
  }
} else {
  console.log(`status=${accounts.status} ${summarize(accounts.body)}`);
}

console.log("\n== d1 databases for CLOUDFLARE_ACCOUNT_ID ==");
const databases = await call(`/accounts/${accountId}/d1/database`);
if (databases.body?.success) {
  for (const database of databases.body.result ?? []) {
    const matches = database.uuid === DATABASE_ID;
    console.log(
      `- name=${database.name} uuid=${database.uuid}${matches ? "  <== configured database" : ""}`,
    );
  }
} else {
  console.log(`status=${databases.status} ${summarize(databases.body)}`);
  console.log(
    "  (code 10000 here means the token has no D1 permission for this account)",
  );
}

console.log("\n== d1 query (same call wrangler makes) ==");
const query = await call(
  `/accounts/${accountId}/d1/database/${DATABASE_ID}/query`,
  { method: "POST", body: JSON.stringify({ sql: "SELECT 1 AS ok" }) },
);
console.log(`status=${query.status} ${summarize(query.body)}`);

console.log("\n== workers scripts (deploy permission) ==");
const scripts = await call(`/accounts/${accountId}/workers/scripts`);
if (scripts.body?.success) {
  const names = (scripts.body.result ?? []).map((script) => script.id);
  console.log(`ok: ${names.length} script(s): ${names.join(", ") || "(none)"}`);
} else {
  console.log(`status=${scripts.status} ${summarize(scripts.body)}`);
}

console.log("\n== zone workers routes (custom domain permission) ==");
const zones = await call("/zones?name=ebichu.cc");
if (zones.body?.success && zones.body.result?.[0]) {
  const zoneId = zones.body.result[0].id;
  console.log(`zone=ebichu.cc id=${zoneId}`);
  const routes = await call(`/zones/${zoneId}/workers/routes`);
  if (routes.body?.success) {
    const patterns = (routes.body.result ?? []).map((route) => route.pattern);
    console.log(`routes ok: ${patterns.join(", ") || "(none)"}`);
  } else {
    console.log(`routes status=${routes.status} ${summarize(routes.body)}`);
  }

  console.log("\n== dns record for login.ebichu.cc ==");
  const dns = await call(`/zones/${zoneId}/dns_records?name=login.ebichu.cc`);
  if (dns.body?.success) {
    const records = dns.body.result ?? [];
    console.log(
      records.length === 0
        ? "none (custom domain can be created)"
        : records.map((record) => `${record.type} ${record.name} -> ${record.content}`).join(" | "),
    );
  } else {
    console.log(`status=${dns.status} ${summarize(dns.body)}`);
  }
} else {
  console.log(`status=${zones.status} ${summarize(zones.body)}`);
}
