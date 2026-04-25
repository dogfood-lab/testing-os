/**
 * dogfood-labs verifier
 *
 * Central law engine. Takes a submission payload and produces a persisted record.
 * Validates schema, policy, provenance. Sets verifier-owned fields.
 * Never upgrades a proposed verdict.
 */

import { validateSubmissionSchema } from './validators/schema.js';
import { validatePolicy } from './validators/policy.js';
import { validateStepResults } from './validators/steps.js';
import { computeVerdict } from './validators/verdict.js';

/**
 * Verify a dogfood submission and produce a persisted record.
 *
 * @param {object} submission - Source-authored submission payload
 * @param {object} options
 * @param {object} options.globalPolicy - Parsed global policy
 * @param {object|null} options.repoPolicy - Parsed repo policy (null if none)
 * @param {object} options.provenance - Provenance adapter { confirm(source) => Promise<boolean> }
 * @param {string} options.policyVersion - Semver of the policy set being applied
 * @returns {Promise<object>} Persisted record (accepted or rejected)
 */
export async function verify(submission, options) {
  if (!submission || typeof submission !== 'object') {
    const now = new Date().toISOString();
    return {
      schema_version: '1.0.0',
      verification: {
        status: 'rejected',
        verified_at: now,
        rejection_reasons: ['submission is null or not an object']
      }
    };
  }

  const { globalPolicy, repoPolicy, provenance, policyVersion } = options;
  const now = new Date().toISOString();
  const reasons = [];

  // 1. Schema validation
  let schemaResult = { valid: false, errors: [] };
  try {
    schemaResult = validateSubmissionSchema(submission);
    if (!schemaResult.valid) {
      reasons.push(...schemaResult.errors.map(e => `schema: ${e}`));
    }
  } catch (e) {
    reasons.push('validator error: ' + e.message);
  }

  // 2. Reject if submission includes verifier-owned fields
  const verifierFields = ['policy_version', 'verification'];
  for (const field of verifierFields) {
    if (field in submission) {
      reasons.push(`submission-contains-verifier-field: ${field}`);
    }
  }
  if (typeof submission.overall_verdict === 'object') {
    reasons.push('submission-contains-verifier-field: overall_verdict must be a string in submissions');
  }

  // 3. Provenance check
  let provenanceConfirmed = false;
  if (schemaResult.valid && submission.source) {
    try {
      provenanceConfirmed = await provenance.confirm(submission.source);
    } catch (err) {
      reasons.push(`provenance: verification failed: ${err.message}`);
    }
    if (!provenanceConfirmed && !reasons.some(r => r.startsWith('provenance:'))) {
      reasons.push('provenance: source run could not be confirmed');
    }
  }

  // 4. Step results validation (only if schema passed)
  if (schemaResult.valid && submission.scenario_results) {
    for (const scenario of submission.scenario_results) {
      try {
        const stepErrors = validateStepResults(scenario);
        reasons.push(...stepErrors.map(e => `steps[${scenario.scenario_id}]: ${e}`));
      } catch (e) {
        reasons.push('validator error: ' + e.message);
      }
    }
  }

  // 5. Policy evaluation (only if schema passed)
  let policyValid = false;
  if (schemaResult.valid) {
    try {
      const policyResult = validatePolicy(submission, { globalPolicy, repoPolicy });
      policyValid = policyResult.valid;
      reasons.push(...policyResult.errors.map(e => `policy: ${e}`));
    } catch (e) {
      reasons.push('validator error: ' + e.message);
    }
  }

  // 6. Compute verdict
  const proposedVerdict = typeof submission.overall_verdict === 'string'
    ? submission.overall_verdict
    : null;

  const hasErrors = reasons.length > 0;
  const status = hasErrors ? 'rejected' : 'accepted';

  const verdictResult = computeVerdict(proposedVerdict, {
    schemaValid: schemaResult.valid,
    policyValid,
    provenanceConfirmed,
    scenarioResults: schemaResult.valid ? submission.scenario_results : [],
    reasons
  });

  // 7. Assemble persisted record
  const persisted = {
    schema_version: '1.0.0',
    policy_version: policyVersion,
    run_id: submission.run_id,
    repo: submission.repo,
    ref: submission.ref,
    source: submission.source,
    timing: submission.timing,
    ...(submission.ci_checks ? { ci_checks: submission.ci_checks } : {}),
    scenario_results: submission.scenario_results || [],
    overall_verdict: {
      proposed: proposedVerdict,
      verified: verdictResult.verified,
      downgraded: verdictResult.downgraded,
      ...(verdictResult.downgrade_reasons.length > 0
        ? { downgrade_reasons: verdictResult.downgrade_reasons }
        : {})
    },
    verification: {
      status,
      verified_at: now,
      provenance_confirmed: provenanceConfirmed,
      schema_valid: schemaResult.valid,
      policy_valid: policyValid,
      rejection_reasons: reasons
    },
    ...(submission.notes ? { notes: submission.notes } : {})
  };

  return persisted;
}
