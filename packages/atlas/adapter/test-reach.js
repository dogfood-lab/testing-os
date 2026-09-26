import { isCodePath } from '../core/languages.js';
import { isTestFile } from '../core/landings.js';

/**
 * What tests reach, read from a map (structure.json). A test reaches a file
 * three ways, and each fact says which and how it was known:
 *
 * - imports: the test imports it, directly or through the files it imports
 *   (parsed). A test that mocks a module still imports it, so a mocked
 *   import is an import.
 * - runs: the test runs it as a child process by its path (parsed), or by
 *   the name a manifest installs it as (declared), and what that file
 *   imports is run with it.
 * - discovers: the file holds tests of its own that a runner finds, as
 *   cargo test finds a #[cfg(test)] module (parsed).
 *
 * Reach is not proof that a test exercises the file: a test that mocks a
 * module still imports it. So a file with no fact is one no test imports or
 * runs, never one said to be untested; that word is kept for measured
 * coverage (docs/atlas-test-gaps.spec.md).
 */

const KIND_ORDER = ['imports', 'runs', 'discovers'];
const BASIS_ORDER = ['parsed', 'declared'];

// A file a test runner runs as a test by its name: a .test or .spec marker,
// test_*.py or *_test.py, a Rust integration test under tests/, or a GDScript
// suite a runner finds by what it extends. A helper under tests/ is imported,
// not run, so it is none.
const NAMED_TEST = /(\.(test|spec)\.[cm]?[jt]sx?|(^|\/)test_[^/]*\.py|_test\.py|(^|\/)tests\/[^/]+\.rs)$/;
// A test-shaped file among fixtures is data a test reads.
const FIXTURE_DIRS = /(^|\/)(fixtures|__fixtures__|testdata)\//;

export function isNamedTest(file) {
  return (NAMED_TEST.test(file.path) || file.testSuite === true) && !FIXTURE_DIRS.test(file.path);
}

function isTest(file) {
  return isTestFile(file.path) || file.testSuite === true;
}

// A test a test starts from: a test, and not one of a repository kept among
// fixtures, whose tests are data a test reads.
function isSource(file) {
  return isTest(file) && !FIXTURE_DIRS.test(file.path);
}

// Every file the map lists, with the part it is in (none for a file in no
// part or in several).
function mapFiles(structure) {
  const out = [];
  for (const boundary of structure.boundaries ?? []) for (const file of boundary.files ?? []) out.push({ file, part: boundary.name });
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) out.push({ file, part: null });
  return out;
}

/**
 * The reach of the given tests (every test the map holds, by default): a
 * fact for each code file they reach and each part they reach into, and the
 * parts a chunk import reaches as a whole.
 *
 * @param {object} structure a map, as structure.json holds it
 * @param {{ tests?: string[] }} [options] the test files to start from
 * @returns {{ files: Map<string, object>, parts: Map<string, object> }}
 */
export function testReachOf(structure, { tests = null } = {}) {
  const listed = mapFiles(structure);
  const byPath = new Map(listed.map(({ file }) => [file.path, file]));
  const sources = (tests ?? listed.filter(({ file }) => isSource(file)).map(({ file }) => file.path))
    .filter((path) => byPath.has(path))
    .sort();
  const files = new Map();
  const chunks = new Map();
  const reach = (path, fact) => {
    if (files.has(path)) return;
    const file = byPath.get(path);
    if (file && !isTest(file) && isCodePath(path)) files.set(path, fact);
  };

  // Breadth first from all the starts at once, so each file is reached by
  // its shortest chain and, among chains as short, from the first test in
  // path order. A file a stronger kind reached first keeps that fact.
  const walk = (starts, kind) => {
    const visited = new Set();
    const queue = [];
    for (const start of starts) {
      if (visited.has(start.path)) continue;
      visited.add(start.path);
      if (start.reached) reach(start.path, fact(kind, start.basis, start.test, []));
      queue.push(start);
    }
    for (let i = 0; i < queue.length; i += 1) {
      const at = queue[i];
      const through = at.reached ? [...at.through, at.path] : at.through;
      for (const target of byPath.get(at.path)?.importsFiles ?? []) {
        if (target.startsWith('@')) {
          const part = target.slice(1);
          if (!chunks.has(part)) chunks.set(part, { kind, basis: at.basis });
          continue;
        }
        if (visited.has(target)) continue;
        visited.add(target);
        reach(target, fact(kind, at.basis, at.test, through));
        queue.push({ path: target, test: at.test, basis: at.basis, through, reached: true });
      }
    }
  };

  walk(sources.map((path) => ({ path, test: path, basis: 'parsed', through: [], reached: false })), 'imports');
  const spawned = [];
  for (const test of sources) {
    const file = byPath.get(test);
    const installed = new Set(file.spawnsInstalled ?? []);
    for (const target of file.spawns ?? []) spawned.push({ path: target, test, basis: installed.has(target) ? 'declared' : 'parsed', through: [], reached: true });
  }
  walk(spawned, 'runs');
  if (tests == null) {
    for (const { file } of listed) if (file.testsInside && !isTest(file)) reach(file.path, { kind: 'discovers', basis: 'parsed' });
  }

  const parts = new Map();
  for (const boundary of structure.boundaries ?? []) {
    const code = (boundary.files ?? []).filter((file) => !isTest(file) && isCodePath(file.path));
    const facts = code.map((file) => files.get(file.path)).filter(Boolean);
    const chunk = chunks.get(boundary.name);
    if (code.length === 0 || (facts.length === 0 && !chunk)) continue;
    const best = [...facts, ...(chunk ? [chunk] : [])].sort(strongerFirst)[0];
    parts.set(boundary.name, { kind: best.kind, basis: best.basis, reached: facts.length, files: code.length });
  }
  return { files, parts };
}

function fact(kind, basis, test, through) {
  return { kind, basis, test, ...(through.length > 0 ? { through } : {}) };
}

function strongerFirst(a, b) {
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || BASIS_ORDER.indexOf(a.basis) - BASIS_ORDER.indexOf(b.basis);
}
