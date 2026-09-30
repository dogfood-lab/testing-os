/**
 * Where a repository pins Atlas, read from its workflow files as text.
 *
 * The forms are the ones measured on the fleet (2026-09-30, 79 clones at
 * their default branches): every pin is `npx --yes @dogfood-lab/atlas@x.y.z`
 * on a workflow line, and no package.json names Atlas. Any other mention of
 * @dogfood-lab/atlas, and a run of Atlas from a path, is reported as a form
 * the tool does not move, so a person looks at it; nothing is guessed.
 */

/** An exact published version: no range, tag or prerelease. */
export const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const PACKAGE = '@dogfood-lab/atlas';

// The one form the fleet uses. The version is taken up to the first space or
// quote so that `@${VERSION}` or `@latest` is read, and then refused.
const NPX_YES = /\bnpx --yes @dogfood-lab\/atlas@([^\s"'`]+)(?:\s+([a-z][\w-]*))?/g;

// Atlas run from a checkout rather than a published version, as the engine's
// own repository does (`node packages/atlas/cli.js check`).
const LOCAL_CHECK = /(?:^|[\s/])atlas(?:\/cli\.js|\.js)?\s+check\b/;

/**
 * @param {Array<{ path: string, text: string }>} files the workflow files
 * @returns {{
 *   pins: Array<{ file: string, line: number, form: string, version: string, command: string | null }>,
 *   others: Array<{ file: string, line: number, text: string, why: string, check: boolean }>,
 * }}
 */
export function findPins(files) {
  const pins = [];
  const others = [];
  for (const { path, text } of files) {
    linesOf(text).forEach((line, index) => {
      const seen = scanLine(line);
      if (seen == null) return;
      for (const pin of seen.pins) pins.push({ file: path, line: index + 1, ...pin });
      for (const other of seen.others) others.push({ file: path, line: index + 1, text: line.trim(), ...other });
    });
  }
  return { pins, others };
}

/**
 * The text with every pin moved to `version`, line endings and everything
 * else left as they are. It reads lines exactly as findPins does, so the two
 * cannot disagree about what a pin is.
 *
 * @param {string} text
 * @param {string} version
 */
export function rewritePins(text, version) {
  return text
    .split('\n')
    .map((line) => {
      if (scanLine(line.replace(/\r$/, '')) == null) return line;
      return line.replace(NPX_YES, (whole, found) => (EXACT_VERSION.test(found) ? whole.replace(`${PACKAGE}@${found}`, `${PACKAGE}@${version}`) : whole));
    })
    .join('\n');
}

/**
 * Orders two exact versions: negative when a is older than b.
 * @param {string} a
 * @param {string} b
 */
export function compareVersions(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function scanLine(line) {
  const trimmed = line.trim();
  // A comment is not a pin, and a step's name is not a command.
  if (trimmed.startsWith('#') || /^-?\s*name:/.test(trimmed)) return null;
  const pins = [];
  const others = [];
  let rest = line;
  for (const match of line.matchAll(NPX_YES)) {
    const [whole, version, command = null] = match;
    rest = rest.replace(whole, '');
    if (EXACT_VERSION.test(version)) pins.push({ form: 'npx --yes', version, command });
    else others.push({ why: `the version ${version} is not an exact one`, check: command === 'check' });
  }
  if (rest.includes(PACKAGE)) others.push({ why: `${PACKAGE} is named outside the npx --yes form`, check: /\bcheck\b/.test(rest) });
  else if (pins.length === 0 && others.length === 0 && LOCAL_CHECK.test(line)) others.push({ why: 'Atlas runs from a path, not a published version', check: true });
  return pins.length === 0 && others.length === 0 ? null : { pins, others };
}

function linesOf(text) {
  return text.split('\n').map((line) => line.replace(/\r$/, ''));
}
