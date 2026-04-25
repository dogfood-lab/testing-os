#!/usr/bin/env node

/**
 * Portfolio generator.
 *
 * Reads indexes/latest-by-repo.json + policies/repos/ to produce
 * reports/dogfood-portfolio.json — a queryable org-level summary
 * of dogfood coverage, freshness, and enforcement state.
 *
 * Usage:
 *   node tools/portfolio/generate.js
 *   node tools/portfolio/generate.js --output /tmp/portfolio.json
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const INDEX_PATH = join(ROOT, 'indexes', 'latest-by-repo.json');
const POLICIES_DIR = join(ROOT, 'policies', 'repos', 'mcp-tool-shop-org');
const DEFAULT_OUTPUT = join(ROOT, 'reports', 'dogfood-portfolio.json');

const ALL_SURFACES = ['cli', 'desktop', 'web', 'api', 'mcp-server', 'npm-package', 'plugin', 'library'];
const DEFAULT_MAX_AGE = 30;

// --- Policy parsing (regex, no yaml dep) ---

function parsePolicy(rawText) {
  const text = rawText.replace(/\r\n/g, '\n');
  const enforcement = {};
  const modeMatch = text.match(/enforcement:\s*\n\s+mode:\s*(\S+)/);
  enforcement.mode = modeMatch ? modeMatch[1] : 'required';

  const reasonMatch = text.match(/enforcement:[\s\S]*?reason:\s*(.+)/);
  enforcement.reason = reasonMatch ? reasonMatch[1].trim() : null;

  const reviewMatch = text.match(/enforcement:[\s\S]*?review_after:\s*(\S+)/);
  enforcement.review_after = reviewMatch ? reviewMatch[1] : null;

  // Parse surfaces (normalize CRLF → LF for regex reliability)
  const normalized = text.replace(/\r\n/g, '\n');
  const surfaces = {};
  const surfaceBlocks = normalized.matchAll(/^ {2}(\S+):\s*\n((?:^ {4}.+\n)*)/gm);
  for (const match of surfaceBlocks) {
    const name = match[1];
    if (!ALL_SURFACES.includes(name)) continue;
    const block = match[2];

    const scenarioMatch = block.match(/required_scenarios:\s*\n\s+- (.+)/);
    const maxAgeMatch = block.match(/max_age_days:\s*(\d+)/);
    const warnAgeMatch = block.match(/warn_age_days:\s*(\d+)/);

    surfaces[name] = {
      scenario: scenarioMatch ? scenarioMatch[1].trim() : null,
      max_age_days: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : DEFAULT_MAX_AGE,
      warn_age_days: warnAgeMatch ? parseInt(warnAgeMatch[1], 10) : 14,
    };
  }

  return { enforcement, surfaces };
}

function loadPolicies(policiesDir) {
  const policies = {};
  if (!existsSync(policiesDir)) return policies;

  for (const file of readdirSync(policiesDir)) {
    if (!file.endsWith('.yaml')) continue;
    const text = readFileSync(join(policiesDir, file), 'utf-8');
    const repoMatch = text.match(/^repo:\s*(.+)/m);
    if (!repoMatch) continue;
    const repo = repoMatch[1].trim();
    policies[repo] = parsePolicy(text);
  }
  return policies;
}

// --- Freshness ---

export function computeFreshnessDays(finishedAt) {
  const ts = new Date(finishedAt).getTime();
  if (isNaN(ts)) return Infinity;
  return Math.floor((Date.now() - ts) / 86400000);
}

// --- Main generation ---

export function generatePortfolio(index, policies) {
  const repos = [];
  const stale = [];
  const surfacesSeen = new Set();

  // Process index entries
  for (const [repo, surfaces] of Object.entries(index)) {
    for (const [surface, record] of Object.entries(surfaces)) {
      surfacesSeen.add(surface);

      const policy = policies[repo];
      const surfacePolicy = policy?.surfaces?.[surface];
      const maxAge = surfacePolicy?.max_age_days ?? DEFAULT_MAX_AGE;
      const freshnessDays = computeFreshnessDays(record.finished_at);

      const entry = {
        repo,
        surface,
        verified: record.verified,
        enforcement: policy?.enforcement?.mode ?? 'required',
        freshness_days: freshnessDays,
        scenario: surfacePolicy?.scenario ?? null,
        run_id: record.run_id,
        finished_at: record.finished_at,
      };

      repos.push(entry);

      if (freshnessDays > maxAge) {
        stale.push({ repo, surface, freshness_days: freshnessDays, max_age_days: maxAge });
      }
    }
  }

  // Find missing: repos with policies but no index entry
  const missing = [];
  for (const [repo, policy] of Object.entries(policies)) {
    for (const surface of Object.keys(policy.surfaces)) {
      const inIndex = index[repo]?.[surface];
      if (!inIndex) {
        missing.push({ repo, surface, enforcement: policy.enforcement.mode });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      total_repos: new Set(repos.map(r => r.repo)).size,
      surfaces_covered: surfacesSeen.size,
      surfaces_total: ALL_SURFACES.length,
    },
    repos: repos.sort((a, b) => a.repo.localeCompare(b.repo)),
    stale,
    missing,
  };
}

// --- CLI ---

function main() {
  const args = process.argv.slice(2);
  let outputPath = DEFAULT_OUTPUT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) outputPath = args[++i];
  }

  if (!existsSync(INDEX_PATH)) {
    console.error(`Index not found: ${INDEX_PATH}`);
    process.exit(1);
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  const policies = loadPolicies(POLICIES_DIR);
  const portfolio = generatePortfolio(index, policies);

  const outputDir = join(outputPath, '..');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  writeFileSync(outputPath, JSON.stringify(portfolio, null, 2) + '\n');

  console.log(`Portfolio generated: ${outputPath}`);
  console.log(`  Repos: ${portfolio.coverage.total_repos}`);
  console.log(`  Surfaces: ${portfolio.coverage.surfaces_covered}/${portfolio.coverage.surfaces_total}`);
  console.log(`  Stale: ${portfolio.stale.length}`);
  console.log(`  Missing: ${portfolio.missing.length}`);
}

main();
