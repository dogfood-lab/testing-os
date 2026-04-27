/**
 * unsafe-segment.js — central path-segment safety helper.
 *
 * Three callsites previously defined or duplicated this regex (F-916867-005):
 *   - packages/ingest/persist.js (canonical instance)
 *   - packages/ingest/load-context.js (loadRepoPolicy + githubScenarioFetcher)
 *   - packages/findings/derive/load-records.js (the missing third callsite)
 *
 * The check rejects path-traversal substrings (`..`) and any path separator
 * (`/`, `\`). Single dots remain legal because GitHub permits dotted org/repo
 * names like `next.js`, `mcp-tool-shop.github.io`, `repo.io`. The submission
 * schema's repo pattern `^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$` agrees.
 *
 * F-375053-006 regression — an earlier `/[.\/]/` was over-broad and crashed
 * legitimate submissions inside writeRecord. The narrower `/\.\.|[/\\]/` has
 * stood since wave 9; this helper is the productized form.
 */

/**
 * Regex matching unsafe substrings in a single path segment.
 * Use `.test(segment)` — returns true if the segment is unsafe.
 *
 * @type {RegExp}
 */
export const UNSAFE_SEGMENT = /\.\.|[/\\]/;

/**
 * Predicate form: returns true when the given segment contains a path-traversal
 * substring or a path separator.
 *
 * @param {string} segment - A single path-segment candidate (e.g. an org or repo name).
 * @returns {boolean}
 */
export function isUnsafeSegment(segment) {
  return UNSAFE_SEGMENT.test(segment);
}
