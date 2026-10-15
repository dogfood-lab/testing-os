import { isValidPackageName } from '../core/package-facts.js';
import { git, isShallow } from './git.js';

/**
 * Which commit a package version was published from, as far as this clone's
 * own tags say (docs/atlas-buildup.spec.md, slice AP). The version is read
 * from a consumer's lockfile and the name from the producer's manifest, both
 * data from a repository the asker does not control, so each is held to a
 * strict shape before git sees it, a value that begins with "-" is refused
 * before git is started, the tag is named in full as refs/tags/<name> (a
 * branch of the same name cannot stand in for it) and checked with
 * `git check-ref-format`, and the ref is passed after --end-of-options.
 *
 * Only local tags are read. A shallow clone, or one whose tags were never
 * fetched, finds none, and the answer is unknown, never a match.
 */

// A release version: major.minor.patch, with a pre-release and build
// metadata when it has them. A lockfile can hold anything else (a range, a
// URL, a path), and none of those names a tag.
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?:\+[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const MAX_VALUE = 214;

/** The tag forms tried, in this order; the answer names them. */
export const TAG_FORM_NAMES = Object.freeze(['v<version>', '<version>', '<name>@<version>', '<name>-v<version>']);

/**
 * Whether a value read from another repository may be put into a git
 * command's arguments: non-empty, not long, no control character or space,
 * and never beginning with "-".
 */
export function mayBeGivenToGit(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_VALUE
    && !value.startsWith('-')
    // eslint-disable-next-line no-control-regex
    && !/[\u0000- \u007f]/.test(value);
}

/**
 * The tags to try for a name at a version, in order, each with its form
 * name; the name forms are left out when the name is no package name this
 * code will give git.
 *
 * @returns {{ forms: Array<{ form: string, tag: string }>, left: string[] }}
 */
export function tagsFor(name, version) {
  const forms = [{ form: TAG_FORM_NAMES[0], tag: `v${version}` }, { form: TAG_FORM_NAMES[1], tag: version }];
  const left = [];
  if (mayBeGivenToGit(name) && isValidPackageName(name)) {
    forms.push({ form: TAG_FORM_NAMES[2], tag: `${name}@${version}` }, { form: TAG_FORM_NAMES[3], tag: `${name}-v${version}` });
  } else {
    left.push(TAG_FORM_NAMES[2], TAG_FORM_NAMES[3]);
  }
  return { forms, left };
}

/**
 * The commit a version of a package was tagged at in this clone.
 *
 * @param {string} root the producer's checkout
 * @param {string} name the package, as its manifest names it
 * @param {string|null} version the version a consumer resolved, or null
 * @returns {{ state: 'found'|'none'|'unknown', tried: string[], tag?: string, form?: string, commit?: string, reason?: string }}
 */
export function publishedAt(root, name, version) {
  if (typeof version !== 'string' || version === '') return { state: 'unknown', tried: [], reason: 'the consumer\'s lock names no resolved version' };
  if (!mayBeGivenToGit(version) || !VERSION.test(version)) {
    return { state: 'unknown', tried: [], reason: 'the resolved version is not a release version a tag can name' };
  }
  const { forms, left } = tagsFor(name, version);
  const tried = [];
  for (const { form, tag } of forms) {
    tried.push(form);
    const ref = `refs/tags/${tag}`;
    // The tag is a ref git may name; anything else is skipped, not passed on.
    if (!git(root, ['check-ref-format', ref]).ok) continue;
    const found = git(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
    if (found.ok) return { state: 'found', tried, tag, form, commit: String(found.stdout).trim(), ...(left.length > 0 ? { left } : {}) };
  }
  const shallow = isShallow(root);
  return {
    state: shallow ? 'unknown' : 'none',
    tried,
    ...(left.length > 0 ? { left } : {}),
    reason: shallow ? 'this clone is shallow, so its tags may be missing' : `no local tag for ${version}`,
  };
}
