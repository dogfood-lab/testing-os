#!/usr/bin/env node

/**
 * findings-digest.js — read-only helper
 *
 * Flattens all per-domain wave outputs into one markdown findings table.
 * Purely additive — reads the same *.output.json files `swarm collect` wrote.
 * Does not touch the DB, does not modify any swarm state.
 *
 * Usage:
 *   node findings-digest.js <run-id> [wave-number]
 *
 * Defaults to the highest-numbered wave directory under the run.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SWARMS_DIR = resolve(import.meta.dirname, '../../../swarms');

export function findLatestWave(runDir) {
  const entries = readdirSync(runDir);
  const waves = entries
    .filter((e) => /^wave-\d+$/.test(e) && statSync(join(runDir, e)).isDirectory())
    .map((e) => parseInt(e.replace('wave-', ''), 10))
    .sort((a, b) => b - a);
  if (waves.length === 0) throw new Error(`No wave directories in ${runDir}`);
  return waves[0];
}

export function loadDomainOutputs(waveDir) {
  const entries = readdirSync(waveDir).filter((e) => e.endsWith('.output.json'));
  const outputs = [];
  for (const entry of entries) {
    const domain = entry.replace('.output.json', '');
    const raw = readFileSync(join(waveDir, entry), 'utf8');
    try {
      const parsed = JSON.parse(raw);
      outputs.push({ domain, parsed });
    } catch (err) {
      outputs.push({ domain, parseError: err.message });
    }
  }
  return outputs;
}

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const SEV_SHORT = { CRITICAL: 'CRIT', HIGH: 'HIGH', MEDIUM: 'MED', LOW: 'LOW' };

function truncate(s, n) {
  if (!s) return '';
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > n ? flat.slice(0, n - 1) + '…' : flat;
}

export function render(runId, waveNumber, outputs) {
  const lines = [];
  lines.push(`# Findings Digest — ${runId} wave ${waveNumber}`);
  lines.push('');

  const allFindings = [];
  const noFindingSummaries = [];
  const parseErrors = [];

  for (const { domain, parsed, parseError } of outputs) {
    if (parseError) {
      parseErrors.push({ domain, parseError });
      continue;
    }
    const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
    if (findings.length === 0) {
      noFindingSummaries.push({ domain, summary: parsed?.summary || '(no summary)' });
      continue;
    }
    for (const f of findings) {
      allFindings.push({ domain, ...f });
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of allFindings) {
    if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  }

  lines.push(
    `**Total:** ${allFindings.length} | ` +
      `CRIT ${counts.CRITICAL} | HIGH ${counts.HIGH} | MED ${counts.MEDIUM} | LOW ${counts.LOW}`
  );
  lines.push('');

  allFindings.sort((a, b) => {
    const sa = SEV_ORDER[a.severity] ?? 9;
    const sb = SEV_ORDER[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    return (a.id || '').localeCompare(b.id || '');
  });

  lines.push('| Sev | ID | Domain | File:Line | Description |');
  lines.push('|-----|-----|--------|-----------|-------------|');
  for (const f of allFindings) {
    const sev = SEV_SHORT[f.severity] || f.severity || '?';
    const loc = f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : '—';
    lines.push(
      `| ${sev} | ${f.id || '—'} | ${f.domain} | ${loc} | ${truncate(f.description, 140)} |`
    );
  }

  if (noFindingSummaries.length > 0) {
    lines.push('');
    lines.push('## Clean domains (0 findings)');
    lines.push('');
    for (const { domain, summary } of noFindingSummaries) {
      lines.push(`- **${domain}** — ${truncate(summary, 240)}`);
    }
  }

  if (parseErrors.length > 0) {
    lines.push('');
    lines.push('## Parse errors');
    lines.push('');
    for (const { domain, parseError } of parseErrors) {
      lines.push(`- **${domain}** — ${parseError}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build a digest for the given run + wave (defaults to latest wave).
 * Returns { runId, waveNumber, output } — `output` is the rendered markdown string.
 * Throws on missing run/wave.
 */
export function buildDigest({ runId, waveNumber, swarmsDir = SWARMS_DIR }) {
  const runDir = join(swarmsDir, runId);
  if (!existsSync(runDir)) {
    throw new Error(`Run directory not found: ${runDir}`);
  }
  const resolvedWave = waveNumber ?? findLatestWave(runDir);
  const waveDir = join(runDir, `wave-${resolvedWave}`);
  if (!existsSync(waveDir)) {
    throw new Error(`Wave directory not found: ${waveDir}`);
  }
  const outputs = loadDomainOutputs(waveDir);
  return {
    runId,
    waveNumber: resolvedWave,
    output: render(runId, resolvedWave, outputs),
  };
}

// Only run as a CLI when invoked directly (not when imported by cli.js).
const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
               process.argv[1]?.endsWith('findings-digest.js');

if (isMain) {
  const [runId, waveArg] = process.argv.slice(2);
  if (!runId) {
    console.error('Usage: node findings-digest.js <run-id> [wave-number]');
    process.exit(1);
  }
  try {
    const { output } = buildDigest({
      runId,
      waveNumber: waveArg ? parseInt(waveArg, 10) : undefined,
    });
    console.log(output);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
