#!/usr/bin/env node
/**
 * Computes the version to publish: never reuses a version already on npm.
 *
 * Used by the release workflow so every push to `main` can publish without a
 * manual version bump. Once you move to Changesets, delete this script.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

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

function latestPublished() {
  try {
    const output = execFileSync("npm", ["view", packageName, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const parsed = JSON.parse(output || "null");
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const published = latestPublished();
const local = parse(pkg.version);
const remote = published ? parse(published) : null;

let next;
if (remote && (!local || compare(local, remote) <= 0)) {
  next = `${remote.major}.${remote.minor}.${remote.patch + 1}`;
} else {
  next = pkg.version;
}

pkg.version = next;
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`${packageName}: ${published ?? "(never published)"} -> ${next}`);
