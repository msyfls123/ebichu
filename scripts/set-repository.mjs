#!/usr/bin/env node
/**
 * Points the package's `repository` metadata at the GitHub repo running this
 * workflow. npm requires `repository.url` to match the repo exactly when
 * publishing with Trusted Publishing.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [packageJsonPath] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;

if (!packageJsonPath || !repository) {
  console.error(
    "usage: GITHUB_REPOSITORY=owner/repo node scripts/set-repository.mjs <package.json>",
  );
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
pkg.repository = {
  type: "git",
  url: `https://github.com/${repository}.git`,
};
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`${pkg.name}: repository -> ${pkg.repository.url}`);
