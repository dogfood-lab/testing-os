/**
 * Stable ID generation and dedupe key computation for derived findings.
 *
 * ID law: same record + same rule + same lesson slug = same finding ID.
 * No timestamp noise in IDs.
 */

/**
 * Generate a stable finding ID from derivation context.
 * Format: dfind-<repo-slug>-<lesson-slug>
 *
 * @param {string} repoSlug - e.g. "repo-crawler-mcp"
 * @param {string} lessonSlug - e.g. "surface-misclassification"
 * @returns {string}
 */
export function generateFindingId(repoSlug, lessonSlug) {
  const normalized = `dfind-${sanitize(repoSlug)}-${sanitize(lessonSlug)}`;
  return normalized;
}

/**
 * Compute a dedupe key for collision detection.
 * Two findings with the same dedupe key are considered the same lesson.
 *
 * @param {{ repo: string, issue_kind: string, root_cause_kind: string, journey_stage: string, slug: string }} fields
 * @returns {string}
 */
export function computeDedupeKey(fields) {
  return [
    fields.repo,
    fields.issue_kind,
    fields.root_cause_kind,
    fields.journey_stage,
    fields.slug
  ].join('::');
}

/**
 * Sanitize a string for use in finding IDs.
 * Lowercase, replace non-alphanumeric with hyphens, collapse runs, trim.
 */
function sanitize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
