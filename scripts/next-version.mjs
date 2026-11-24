#!/usr/bin/env node
/**
 * Computes the version to publish: never reuses a version already on npm.
 *
 * Uses the registry HTTP API instead of `npm view`, so the result does not
 * depend on the runner's npm config or auth state. Transient registry errors
 * fail the job instead of silently reusing the local version.
 *
 * Used by the release workflow so every push to `main` can publish without a
 * manual version bump. Once you move to Changesets, delete this script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const REGISTRY = "https://registry.npmjs.org";
const ATTEMPTS = 3;

const [packageJsonPath, packageName] = process.argv.slice(2);
if (!packageJsonPath || !packageName) {
  console.error(
    "usage: node scripts/next-version.mjs <package.json> <package-name>",
  );
  process.exit(1);
}

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version ?? "");
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
  };
}

function compare(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

async function latestPublished() {
  const url = `${REGISTRY}/${encodeURIComponent(packageName)}`;
  let lastError;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
      });
      if (response.status === 404) {
        return null; // package has never been published
      }
      if (!response.ok) {
        throw new Error(`registry responded ${response.status} ${response.statusText}`);
      }
      const metadata = await response.json();
      const latest = metadata?.["dist-tags"]?.latest;
      if (typeof latest !== "string") {
        throw new Error("registry metadata has no dist-tags.latest");
      }
      return latest;
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) {
        await sleep(2_000 * attempt);
      }
    }
  }

  throw new Error(
    `Could not resolve ${packageName} from npm: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const localVersion = pkg.version;
const published = await latestPublished();
const local = parse(localVersion);
const remote = published ? parse(published) : null;

let next;
if (remote && (!local || compare(local, remote) <= 0)) {
  next = `${remote.major}.${remote.minor}.${remote.patch + 1}`;
} else {
  next = pkg.version;
}

if (published && next === published) {
  throw new Error(
    `${pkg.name}@${next} is already published; bump the version manually`,
  );
}

pkg.version = next;
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(
  `${pkg.name}: published=${published ?? "(never)"} local=${localVersion} -> ${next}`,
);
