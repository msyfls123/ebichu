// Temporary end-to-end smoke test for the built login worker.
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE;
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

const child = spawn(
  "pnpm",
  ["exec", "wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1"],
  { cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe"], shell: true },
);

let logs = "";
child.stdout.on("data", (chunk) => (logs += chunk));
child.stderr.on("data", (chunk) => (logs += chunk));

function stop() {
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
}
process.on("exit", stop);

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/login`);
      if (response.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`wrangler dev did not start:\n${logs}`);
}

function expect(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}\n${logs}`);
}

function sessionToken(response) {
  const header = response.headers.get("set-cookie") ?? "";
  const match = /([^=;]+)=([^;]+)/.exec(header);
  expect(match, `missing set-cookie: ${header}`);
  return { name: match[1], token: match[2], header };
}

try {
  await waitForServer();

  const email = `smoke-${Date.now()}@example.com`;
  const password = "correct horse battery";

  const denied = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(denied.status === 403, `missing Origin should be rejected, got ${denied.status}`);

  const registered = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const registeredBody = await registered.json();
  expect(registered.status === 201, `register failed: ${registered.status} ${JSON.stringify(registeredBody)}`);
  expect(registeredBody.user.email === email, "register returned wrong user");

  const cookie = sessionToken(registered);
  expect(cookie.header.includes("Domain=ebichu.cc"), `cookie not shared: ${cookie.header}`);
  expect(cookie.header.includes("HttpOnly"), "cookie not HttpOnly");

  const me = await fetch(`${BASE}/api/me`, {
    headers: { cookie: `${cookie.name}=${cookie.token}` },
  });
  const meBody = await me.json();
  expect(me.status === 200, `me failed: ${me.status}`);
  expect(meBody.user.email === email, "me returned wrong user");

  const wrongPassword = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "wrong password" }),
  });
  expect(wrongPassword.status === 401, `wrong password should be 401, got ${wrongPassword.status}`);

  const relogged = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  expect(relogged.status === 200, `login failed: ${relogged.status}`);

  const logout = await fetch(`${BASE}/api/logout`, {
    method: "POST",
    headers: { Origin: ORIGIN, cookie: `${cookie.name}=${cookie.token}` },
  });
  expect(logout.status === 200, `logout failed: ${logout.status}`);

  const afterLogout = await fetch(`${BASE}/api/me`, {
    headers: { cookie: `${cookie.name}=${cookie.token}` },
  });
  expect(afterLogout.status === 401, `session should be revoked, got ${afterLogout.status}`);

  const page = await fetch(`${BASE}/login`);
  const html = await page.text();
  expect(html.includes("Sign in to Ebichu"), "login page did not render");

  console.log("SMOKE OK: register, shared cookie, me, login, logout, origin guard");
} finally {
  stop();
}
process.exit(0);
