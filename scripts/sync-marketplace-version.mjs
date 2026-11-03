#!/usr/bin/env node
/**
 * Keep .omp-plugin/marketplace.json in step with package.json.
 *
 * The marketplace catalog declares the plugin version, and `marketplace.autoUpdate`
 * only upgrades plugins whose catalog entry declares a version. A catalog left behind
 * by a release therefore stops automatic updates silently.
 *
 * Usage:
 *   node scripts/sync-marketplace-version.mjs           # write the current version
 *   node scripts/sync-marketplace-version.mjs --check   # exit 1 when out of date
 */
import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = ".omp-plugin/marketplace.json";
const check = process.argv.includes("--check");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

const entry = catalog.plugins?.find((plugin) => plugin.name === pkg.name);
if (!entry) {
  console.error(`${CATALOG}: no plugin entry named ${pkg.name}`);
  process.exit(1);
}

const stale = catalog.metadata?.version !== pkg.version || entry.version !== pkg.version;
if (!stale) {
  console.log(`${CATALOG}: ${pkg.version} (up to date)`);
  process.exit(0);
}

if (check) {
  console.error(`${CATALOG}: expected ${pkg.version}, found ${entry.version}. Run: npm run release:sync-marketplace`);
  process.exit(1);
}

catalog.metadata = { ...catalog.metadata, version: pkg.version };
entry.version = pkg.version;
writeFileSync(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`${CATALOG}: updated to ${pkg.version}`);
