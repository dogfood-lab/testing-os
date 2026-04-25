/**
 * output-schema.js — JSON Schema validation for agent outputs.
 *
 * Two schemas: audit output and feature output.
 * Validates before merging into the control plane.
 */

const SEVERITY_ENUM = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const AUDIT_CATEGORIES = [
  'bug', 'security', 'quality', 'types', 'tests', 'docs',
  'defensive', 'observability', 'degradation', 'future-proofing',
  'ux', 'accessibility',
];

const FEATURE_CATEGORIES = [
  'missing-feature', 'ux', 'performance', 'integration', 'production-readiness',
];

const FINDING_SHAPE = {
  required: ['id', 'severity', 'category', 'description'],
  properties: {
    id: 'string',
    severity: SEVERITY_ENUM,
    category: null, // set per schema type
    file: 'string',
    line: 'number',
    symbol: 'string',
    description: 'string',
    recommendation: 'string',
    rule_id: 'string',
  },
};

/**
 * Validate a single finding object.
 * @param {object} finding
 * @param {string[]} validCategories
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFinding(finding, validCategories) {
  const errors = [];

  if (!finding || typeof finding !== 'object') {
    return { valid: false, errors: ['Finding must be an object'] };
  }

  for (const field of FINDING_SHAPE.required) {
    if (!finding[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (finding.severity && !SEVERITY_ENUM.includes(finding.severity)) {
    errors.push(`Invalid severity "${finding.severity}", must be one of: ${SEVERITY_ENUM.join(', ')}`);
  }

  if (finding.category && !validCategories.includes(finding.category)) {
    errors.push(`Invalid category "${finding.category}", must be one of: ${validCategories.join(', ')}`);
  }

  if (finding.line != null && typeof finding.line !== 'number') {
    errors.push(`"line" must be a number, got ${typeof finding.line}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an audit output from an agent.
 *
 * Expected shape:
 * {
 *   domain: string,
 *   stage: "A" | "B" | "C",
 *   findings: Finding[],
 *   summary: string
 * }
 */
export function validateAuditOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'] };
  }

  if (!output.domain || typeof output.domain !== 'string') {
    errors.push('Missing or invalid "domain" field');
  }

  if (!output.stage || !['A', 'B', 'C'].includes(output.stage)) {
    errors.push('Missing or invalid "stage" field (must be A, B, or C)');
  }

  if (!Array.isArray(output.findings)) {
    errors.push('"findings" must be an array');
  } else {
    for (let i = 0; i < output.findings.length; i++) {
      const result = validateFinding(output.findings[i], AUDIT_CATEGORIES);
      if (!result.valid) {
        errors.push(`findings[${i}]: ${result.errors.join('; ')}`);
      }
    }
  }

  if (!output.summary || typeof output.summary !== 'string') {
    errors.push('Missing or invalid "summary" field');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a feature output from an agent.
 *
 * Expected shape:
 * {
 *   domain: string,
 *   features: Feature[],
 *   summary: string
 * }
 *
 * Feature shape:
 * {
 *   id: string,
 *   priority: SEVERITY,
 *   category: string,
 *   description: string,
 *   scope: string[],
 *   effort: "small" | "medium" | "large",
 *   recommendation: string
 * }
 */
export function validateFeatureOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'] };
  }

  if (!output.domain || typeof output.domain !== 'string') {
    errors.push('Missing or invalid "domain" field');
  }

  if (!Array.isArray(output.features)) {
    errors.push('"features" must be an array');
  } else {
    for (let i = 0; i < output.features.length; i++) {
      const f = output.features[i];
      if (!f.id) errors.push(`features[${i}]: missing "id"`);
      if (!f.priority || !SEVERITY_ENUM.includes(f.priority)) {
        errors.push(`features[${i}]: invalid "priority"`);
      }
      if (!f.category || !FEATURE_CATEGORIES.includes(f.category)) {
        errors.push(`features[${i}]: invalid "category"`);
      }
      if (!f.description) errors.push(`features[${i}]: missing "description"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate an amend output from an agent.
 *
 * Expected shape:
 * {
 *   domain: string,
 *   fixes: Array<{ finding_id: string, file: string, description: string }>,
 *   files_changed: string[],
 *   summary: string
 * }
 */
export function validateAmendOutput(output) {
  const errors = [];

  if (!output || typeof output !== 'object') {
    return { valid: false, errors: ['Output must be an object'] };
  }

  if (!output.domain || typeof output.domain !== 'string') {
    errors.push('Missing or invalid "domain" field');
  }

  if (!Array.isArray(output.fixes)) {
    errors.push('"fixes" must be an array');
  } else {
    for (let i = 0; i < output.fixes.length; i++) {
      if (!output.fixes[i].finding_id) errors.push(`fixes[${i}]: missing "finding_id"`);
    }
  }

  if (!Array.isArray(output.files_changed)) {
    errors.push('"files_changed" must be an array');
  }

  return { valid: errors.length === 0, errors };
}

export { SEVERITY_ENUM, AUDIT_CATEGORIES, FEATURE_CATEGORIES };
