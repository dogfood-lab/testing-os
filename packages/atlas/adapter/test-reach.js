import { isCodePath } from '../core/languages.js';
import { isTestFile } from '../core/landings.js';
import { isSmokeTest } from '../core/test-names.js';

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
 * A fourth fact is weaker than all three: names, when a test names the file
 * in a string by a way the map cannot follow to an import or a run (a
 * conftest helper that runs tools by name, a path joined to a root another
 * file sets), so Atlas cannot tell whether the test runs it (text). What the
 * named file imports is named with it. A named file is not one no test
 * reaches, and none of the three is said of it.
 *
 * A smoke test by its name (scripts/smoke.mjs) is a test, and so is what a
 * workflow's test step runs on its way to the tests: the script a step
 * named Smoke-test the CLI runs, and the CLI that script starts, are run by
 * that step, and the fact names it.
 *
 * Reach is not proof that a test exercises the file: a test that mocks a
 * module still imports it. So a file with no fact is one no test imports or
 * runs, never one said to be untested; that word is kept for measured
 * coverage (docs/atlas-test-gaps.spec.md).
 */

const KIND_ORDER = ['imports', 'runs', 'discovers', 'names'];
const BASIS_ORDER = ['parsed', 'declared', 'text'];

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

/** Whether a path lies among fixtures, material a test reads. */
export function isFixture(path) {
  return FIXTURE_DIRS.test(path);
}

/** Whether a file is a test: named as one, a suite a runner finds, or a smoke test. */
export function isTest(file) {
  return isTestFile(file.path) || file.testSuite === true || isSmokeTest(file.path);
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
 * @returns {{ files: Map<string, object>, parts: Map<string, object>, ran: Map<string, object> }}
 *   files holds each file's strongest fact; ran holds, apart, every file a
 *   test runs, whether or not a test also imports it, since a command a test
 *   imports is not a command a test runs end to end.
 */
export function testReachOf(structure, { tests = null } = {}) {
  const listed = mapFiles(structure);
  const byPath = new Map(listed.map(({ file }) => [file.path, file]));
  const sources = (tests ?? listed.filter(({ file }) => isSource(file)).map(({ file }) => file.path))
    .filter((path) => byPath.has(path))
    .sort();
  const files = new Map();
  const ran = new Map();
  const chunks = new Map();
  const counted = (path) => {
    const file = byPath.get(path);
    return file != null && !isTest(file) && isCodePath(path);
  };
  const reach = (path, fact) => {
    if (!files.has(path) && counted(path)) files.set(path, fact);
  };
  const run = (path, fact) => {
    reach(path, fact);
    if (!ran.has(path) && counted(path)) ran.set(path, fact);
  };

  // Breadth first from all the starts at once, so each file is reached by
  // its shortest chain and, among chains as short, from the first test in
  // path order. A file a stronger kind reached first keeps that fact.
  const walk = (starts, kind, sink) => {
    const visited = new Set();
    const queue = [];
    for (const start of starts) {
      if (visited.has(start.path)) continue;
      visited.add(start.path);
      if (start.reached) sink(start.path, fact(kind, start.basis, start.test, start.through, start.step));
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
        sink(target, fact(kind, at.basis, at.test, through, at.step));
        queue.push({ path: target, test: at.test, step: at.step, basis: at.basis, through, reached: true });
      }
    }
  };

  walk(sources.map((path) => ({ path, test: path, basis: 'parsed', through: [], reached: false })), 'imports', reach);
  const spawned = [];
  for (const test of sources) {
    const file = byPath.get(test);
    const installed = new Set(file.spawnsInstalled ?? []);
    for (const target of file.spawns ?? []) spawned.push({ path: target, test, basis: installed.has(target) ? 'declared' : 'parsed', through: [], reached: true });
  }
  walk(spawned, 'runs', run);
  if (tests == null) {
    for (const { file } of listed) if (file.testsInside && !isTest(file)) reach(file.path, { kind: 'discovers', basis: 'parsed' });
    // What a workflow's test step runs on its way: each file of its chain,
    // run by the step, the later ones through the earlier; and each file a
    // step whose runner Atlas cannot name runs.
    for (const door of structure.doors ?? []) {
      if (door.kind || door.parseError) continue;
      for (const entry of door.tests ?? []) {
        const chain = (entry.through ?? []).filter((hop) => byPath.has(hop));
        const ran = (entry.ran ?? []).filter((path) => byPath.has(path) && !chain.includes(path));
        if (chain.length + ran.length === 0) continue;
        const step = `${door.file} › ${entry.job} › ${entry.step}`;
        walk([
          ...chain.map((path, index) => ({ path, test: null, step, basis: 'parsed', through: chain.slice(0, index), reached: true })),
          ...ran.map((path) => ({ path, test: null, step, basis: 'parsed', through: [], reached: true })),
        ], 'runs', run);
      }
    }
  }
  // What a test names in a string and the map cannot follow, last, so any
  // stronger fact about a file stands.
  const named = [];
  for (const test of sources) for (const target of byPath.get(test).names ?? []) named.push({ path: target, test, basis: 'text', through: [], reached: true });
  walk(named, 'names', reach);

  const parts = new Map();
  for (const boundary of structure.boundaries ?? []) {
    const code = (boundary.files ?? []).filter((file) => !isTest(file) && isCodePath(file.path));
    const facts = code.map((file) => files.get(file.path)).filter(Boolean);
    const chunk = chunks.get(boundary.name);
    if (code.length === 0 || (facts.length === 0 && !chunk)) continue;
    const best = [...facts, ...(chunk ? [chunk] : [])].sort(strongerFirst)[0];
    parts.set(boundary.name, { kind: best.kind, basis: best.basis, reached: facts.length, files: code.length });
  }
  return { files, parts, ran };
}

function fact(kind, basis, test, through, step = null) {
  return { kind, basis, ...(test != null ? { test } : {}), ...(step != null ? { step } : {}), ...(through.length > 0 ? { through } : {}) };
}

function strongerFirst(a, b) {
  return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || BASIS_ORDER.indexOf(a.basis) - BASIS_ORDER.indexOf(b.basis);
}
