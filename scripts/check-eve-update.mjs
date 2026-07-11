#!/usr/bin/env node
// Weekly "is there a new Eve?" check for the curated-update pipeline.
//
// Compares the Eve version AIQY pins (in lib/generator.ts) against the latest on npm and
// emits GitHub Actions outputs (pinned, latest, update). The workflow then runs the smoke
// test against the new version and opens an issue so a human decides whether to bump.

import { execSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

const src = readFileSync(join(ROOT, "lib", "generator.ts"), "utf8");
const pinnedMatch = src.match(/EVE_VERSION\s*=\s*"([^"]+)"/);
if (!pinnedMatch) {
  console.error("Could not find EVE_VERSION in lib/generator.ts");
  process.exit(1);
}
const pinned = pinnedMatch[1];

let latest;
try {
  latest = execSync("npm view eve version", { encoding: "utf8" }).trim();
} catch (e) {
  console.error("Failed to query npm for the latest eve version:", e.message);
  process.exit(1);
}

const update = latest !== pinned;
console.log(`pinned=${pinned} latest=${latest} update=${update}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `pinned=${pinned}\nlatest=${latest}\nupdate=${update}\n`);
}
