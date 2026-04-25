#!/usr/bin/env node
/**
 * build.mjs — wave-tolerant root builder.
 *
 * During the migration from `mcp-tool-shop-org/dogfood-labs`, this repo will
 * spend a few commits with no `packages/*` populated. `tsc --build` errors out
 * when both `files` and `references` are empty, so this wrapper checks for at
 * least one real package before invoking it. Once Wave 2 lands, this becomes
 * an unconditional `tsc --build`.
 */
import { readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const packagesDir = resolve(repoRoot, 'packages');

const hasRealPackage =
  existsSync(packagesDir) &&
  readdirSync(packagesDir).some((entry) => {
    if (entry.startsWith('.')) return false;
    const p = resolve(packagesDir, entry);
    if (!statSync(p).isDirectory()) return false;
    return existsSync(resolve(p, 'package.json'));
  });

if (!hasRealPackage) {
  console.log('[testing-os build] No packages yet — skipping tsc --build until Wave 2.');
  process.exit(0);
}

execSync('tsc --build', { stdio: 'inherit', cwd: repoRoot });
