/**
 * Submission builder
 *
 * Tiny helper that assembles a canonical submission JSON from structured inputs.
 * Prevents formatting drift across pilot repos. Not a framework.
 *
 * Usage:
 *   node build-submission.js --output submission.json \
 *     --repo org/repo \
 *     --branch main \
 *     --commit abc123... \
 *     --workflow dogfood.yml \
 *     --provider-run-id 12345 \
 *     --run-url https://github.com/... \
 *     --actor ci-bot \
 *     --scenario-file results.json
 *
 * Or as a module:
 *   import { buildSubmission } from './build-submission.js'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// ULID-like sortable ID (timestamp prefix + random suffix)
function generateRunId() {
  const ts = Date.now().toString(36).padStart(10, '0');
  const rand = randomBytes(10).toString('base64url').slice(0, 16);
  return `${ts}-${rand}`;
}

const VERIFIER_OWNED_FIELDS = ['policy_version', 'verification'];

/**
 * Build a canonical submission object.
 *
 * @param {object} params
 * @param {string} params.repo - Full org/repo
 * @param {string} params.commitSha - 40-char hex SHA
 * @param {string} [params.branch] - Branch name
 * @param {string} [params.version] - Release version tag
 * @param {string} params.workflow - Workflow filename
 * @param {string} params.providerRunId - GitHub Actions run ID
 * @param {string} params.runUrl - Full URL to the workflow run
 * @param {number} [params.attempt=1] - Workflow attempt number
 * @param {string} [params.actor] - GitHub username that triggered
 * @param {string} params.startedAt - ISO datetime
 * @param {string} params.finishedAt - ISO datetime
 * @param {object[]} params.scenarioResults - Array of scenario result objects
 * @param {object[]} [params.ciChecks] - Array of CI check objects
 * @param {string} params.overallVerdict - Proposed verdict string
 * @param {string} [params.notes]
 * @returns {object} Canonical submission object
 */
export function buildSubmission(params) {
  const {
    repo,
    commitSha,
    branch,
    version,
    workflow,
    providerRunId,
    runUrl,
    attempt = 1,
    actor,
    startedAt,
    finishedAt,
    scenarioResults,
    ciChecks,
    overallVerdict,
    notes
  } = params;

  const required = { repo, commitSha, startedAt, finishedAt, scenarioResults };
  for (const [name, value] of Object.entries(required)) {
    if (value == null) throw new Error(`buildSubmission: missing required param "${name}"`);
  }

  if (typeof overallVerdict !== 'string') {
    throw new Error('overallVerdict must be a string, not ' + typeof overallVerdict);
  }

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(finishedAt).getTime();
  const durationMs = (isNaN(endMs - startMs) || (endMs - startMs) < 0) ? null : endMs - startMs;

  const submission = {
    schema_version: '1.0.0',
    run_id: generateRunId(),
    repo,
    ref: {
      commit_sha: commitSha,
      ...(branch ? { branch } : {}),
      ...(version ? { version } : {})
    },
    source: {
      provider: 'github',
      workflow,
      provider_run_id: String(providerRunId),
      attempt,
      run_url: runUrl,
      ...(actor ? { actor } : {})
    },
    timing: {
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs
    },
    ...(ciChecks && ciChecks.length > 0 ? { ci_checks: ciChecks } : {}),
    scenario_results: scenarioResults,
    overall_verdict: overallVerdict,
    ...(notes ? { notes } : {})
  };

  return submission;
}

/**
 * Validate a submission for obvious issues before dispatch.
 * This is a fast local precheck, not a replacement for the central verifier.
 *
 * @param {object} submission
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function precheckSubmission(submission) {
  const errors = [];

  if (!submission.schema_version) errors.push('missing schema_version');
  if (!submission.run_id) errors.push('missing run_id');
  if (!submission.repo) errors.push('missing repo');
  if (!submission.ref?.commit_sha) errors.push('missing ref.commit_sha');
  if (!submission.source?.provider_run_id) errors.push('missing source.provider_run_id');
  if (!submission.source?.run_url) errors.push('missing source.run_url');
  if (!submission.timing?.started_at) errors.push('missing timing.started_at');
  if (!submission.timing?.finished_at) errors.push('missing timing.finished_at');

  if (!submission.scenario_results || submission.scenario_results.length === 0) {
    errors.push('scenario_results must have at least one entry');
  }

  if (!submission.overall_verdict || typeof submission.overall_verdict !== 'string') {
    errors.push('overall_verdict must be a string');
  }

  // Block verifier-owned fields
  for (const field of VERIFIER_OWNED_FIELDS) {
    if (field in submission) {
      errors.push(`submission must not contain verifier-owned field: ${field}`);
    }
  }
  if (typeof submission.overall_verdict === 'object') {
    errors.push('overall_verdict must be a string, not an object (verifier-owned shape)');
  }

  return { valid: errors.length === 0, errors };
}

// --- CLI entrypoint ---

const isMain = process.argv[1]?.endsWith('build-submission.js');

if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : null;
  };

  const scenarioFile = get('--scenario-file');
  if (!scenarioFile) {
    console.error('Usage: node build-submission.js --scenario-file <path> [--output <path>] ...');
    process.exit(1);
  }

  const scenarioResults = JSON.parse(readFileSync(resolve(scenarioFile), 'utf-8'));

  const submission = buildSubmission({
    repo: get('--repo') || process.env.GITHUB_REPOSITORY,
    commitSha: get('--commit') || process.env.GITHUB_SHA,
    branch: get('--branch') || process.env.GITHUB_REF_NAME,
    workflow: get('--workflow') || process.env.GITHUB_WORKFLOW,
    providerRunId: get('--provider-run-id') || process.env.GITHUB_RUN_ID,
    runUrl: get('--run-url') || `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    attempt: Number(get('--attempt') || process.env.GITHUB_RUN_ATTEMPT || 1),
    actor: get('--actor') || process.env.GITHUB_ACTOR,
    startedAt: get('--started-at') || new Date().toISOString(),
    finishedAt: get('--finished-at') || new Date().toISOString(),
    scenarioResults: Array.isArray(scenarioResults) ? scenarioResults : [scenarioResults],
    overallVerdict: get('--verdict') || 'pass',
    notes: get('--notes')
  });

  const precheck = precheckSubmission(submission);
  if (!precheck.valid) {
    console.error('Precheck failed:');
    for (const e of precheck.errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const output = get('--output') || '-';
  const json = JSON.stringify(submission, null, 2) + '\n';

  if (output === '-') {
    process.stdout.write(json);
  } else {
    writeFileSync(resolve(output), json, 'utf-8');
    console.error(`Wrote submission to ${output}`);
  }
}
