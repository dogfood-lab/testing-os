/**
 * Scripts that are tests by what they do, not by a runner's naming
 * (testing-os#158). role-os keeps test_*.mjs scripts that check a tool and
 * exit 1 when it is wrong; no runner's discovery collects the name, and no
 * workflow ran them, so Atlas read them as code.
 *
 * A name is not enough, since a helper carries it too. A test_* file in the
 * JavaScript and TypeScript family is marked a test (`scriptTest`) when it
 * fails by itself and no file imports it: a helper is imported, a script is
 * run. For a Python test by its name, failing by itself is what decides
 * whether a file no runner covers can be run on its own (adapter/test-gaps.js).
 */
import { isScriptTestName, isTestFile } from './test-names.js';

// Importing one of these is a check that throws, and so fails the script.
const ASSERT_MODULES = new Set(['assert', 'node:assert', 'assert/strict', 'node:assert/strict']);
// The JavaScript test frameworks adapter/artifact.js names (TEST_FRAMEWORKS);
// a script that imports one is written as a test. A test pins the two lists.
export const SCRIPT_FRAMEWORKS = [/^vitest(?:\/|$)/, /^@playwright\/test$/, /^node:test$/, /^@jest\/globals$/, /^mocha$/, /^bun:test$/, /^ava$/, /^uvu(?:\/|$)/, /^tap$/];
// A test-shaped file among fixtures is data a test reads.
const FIXTURE_DIRS = /(^|\/)(fixtures|__fixtures__|testdata)\//;
const SCRIPT_LANGUAGES = new Set(['javascript', 'typescript', 'tsx']);

/** Whether a file's failing by itself is read: a test_ script, or a Python test by its name. */
export function readsSelfFail(language, path) {
  if (language === 'python') return isTestFile(path);
  return SCRIPT_LANGUAGES.has(language) && isScriptTestName(path);
}

/**
 * Whether a script ends itself with a failing status. JavaScript and
 * TypeScript: `process.exit` with a value that is not 0, or
 * `process.exitCode` set to one. Python: `sys.exit` with a value that is not
 * 0 or None, or `raise SystemExit` with one, in a file with a `__main__`
 * guard or at module level. An assert import is read from the file's
 * imports (markScriptTests).
 */
export function selfFails(language, root) {
  if (language === 'python') {
    // A script either guards its run with __main__ or runs at module level
    // (ai-jam-sessions' test_tools_local.py ends with sys.exit there).
    const guarded = root.descendantsOfType('if_statement').some((node) => /^__name__\s*==\s*['"]__main__['"]$/.test(node.childForFieldName('condition')?.text ?? ''));
    for (const node of root.descendantsOfType('call')) {
      const callee = node.childForFieldName('function')?.text;
      if (callee !== 'sys.exit' && callee !== 'SystemExit') continue;
      if (callee === 'SystemExit' && node.parent?.type !== 'raise_statement') continue;
      if (!failingValue(firstArgument(node), ['0', 'None'])) continue;
      if (guarded || !insideFunction(node)) return true;
    }
    return false;
  }
  for (const node of root.descendantsOfType('call_expression')) {
    if (node.childForFieldName('function')?.text !== 'process.exit') continue;
    if (failingValue(firstArgument(node), ['0'])) return true;
  }
  for (const node of root.descendantsOfType('assignment_expression')) {
    if (node.childForFieldName('left')?.text !== 'process.exitCode') continue;
    if (failingValue(node.childForFieldName('right'), ['0'])) return true;
  }
  return false;
}

function insideFunction(node) {
  for (let at = node.parent; at != null; at = at.parent) {
    if (at.type === 'function_definition' || at.type === 'lambda') return true;
  }
  return false;
}

function firstArgument(call) {
  const args = call.childForFieldName('arguments');
  return args?.namedChildren?.find((child) => child.type !== 'comment') ?? null;
}

// No value is a passing exit; neither is a literal the language reads as 0.
function failingValue(node, passing) {
  return node != null && !passing.includes(node.text.trim());
}

/**
 * Mark each test_ script that fails by itself, or imports an assert module
 * or a test framework, and that no file imports: a test, run where a step
 * names it. Each, and each Python test that fails by itself, gets how to run
 * it on its own (`selfRun`): from its own folder, since a script may read
 * beside it by a relative path (ai-jam-sessions' test_tools_local.py opens
 * app.py so), and that is safe for one that resolves from its own location.
 *
 * @param {Map<string, object>} files the import graph's files, by path
 * @param {(path: string) => object|null} readJson a tracked JSON file, parsed, or null
 */
export function markScriptTests(files, readJson) {
  const imported = new Set();
  for (const file of files.values()) {
    for (const site of Array.isArray(file.imports) ? file.imports : []) {
      if (site.resolved?.outcome === 'file') imported.add(site.resolved.path);
    }
  }
  for (const [path, file] of files) {
    if (FIXTURE_DIRS.test(path)) continue;
    if (file.language === 'python') {
      if (file.selfFails) file.selfRun = fromItsFolder(path, 'python');
      continue;
    }
    if (!isScriptTestName(path) || imported.has(path)) continue;
    const specifiers = (Array.isArray(file.imports) ? file.imports : []).map((site) => site.specifier).filter((name) => typeof name === 'string');
    const checks = specifiers.some((name) => ASSERT_MODULES.has(name) || SCRIPT_FRAMEWORKS.some((pattern) => pattern.test(name)));
    if (!file.selfFails && !checks) continue;
    file.scriptTest = true;
    const program = scriptProgram(path, readJson);
    if (program) file.selfRun = fromItsFolder(path, program);
  }
}

// A run from the file's own folder: the folder (none at the root) and the
// command there.
function fromItsFolder(path, program) {
  const at = path.lastIndexOf('/');
  return { ...(at > 0 ? { in: path.slice(0, at) } : {}), run: `${program} ${path.slice(at + 1)}` };
}

// Node strips TypeScript types by default from 22.18.0 and 23.6.0, for .ts,
// .mts and .cts; it reads no JSX.
const STRIPPED = /\.[cm]?ts$/;
const NEEDS_RUNNER = /\.(tsx|jsx)$/;

/**
 * The program that runs a test_ script on its own. JavaScript runs on node.
 * TypeScript runs on the runner the nearest manifest lists (tsx, ts-node),
 * else on node where that manifest's engines guarantee type stripping; with
 * neither, no program is given and the rule says so.
 */
export function scriptProgram(path, readJson) {
  if (!STRIPPED.test(path) && !NEEDS_RUNNER.test(path)) return 'node';
  const manifest = nearestManifest(path, readJson);
  const declared = { ...(manifest?.dependencies ?? {}), ...(manifest?.devDependencies ?? {}) };
  if (declared.tsx != null) return 'npx tsx';
  if (declared['ts-node'] != null && !NEEDS_RUNNER.test(path)) return 'npx ts-node';
  if (STRIPPED.test(path) && stripsTypes(manifest?.engines?.node)) return 'node';
  return null;
}

function nearestManifest(path, readJson) {
  for (let at = path.lastIndexOf('/'); ; at = path.lastIndexOf('/', at - 1)) {
    const dir = at > 0 ? path.slice(0, at) : '';
    const manifest = readJson(dir ? `${dir}/package.json` : 'package.json');
    if (manifest) return manifest;
    if (at <= 0) return null;
  }
}

// Whether every Node an engines range admits strips types: its lowest
// version is 22.18.0 or later in 22, or 23.6.0 or later.
export function stripsTypes(range) {
  if (typeof range !== 'string' || /\|\|/.test(range)) return false;
  const lowest = /(?:>=|\^|~)?\s*v?(\d+)(?:\.(\d+))?/.exec(range.trim());
  if (!lowest || /^\s*(<|\*|x)/i.test(range)) return false;
  const major = Number(lowest[1]);
  const minor = Number(lowest[2] ?? 0);
  return major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
}
