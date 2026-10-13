// A test file by the repository's own naming, the convention test runners
// discover by: a .test or .spec marker, test_*.py or *_test.py, or a place
// under a directory named for tests. Fixture directories are not in it; what
// lives there is material a test reads, not a test.
//
// It lives apart from landings.js, which reads doors and so the commands
// they run, because the command reader counts the tests a runner runs with it.
const TEST_NAMED = /(\.(test|spec)\.[^/]+|^test_[^/]*\.py|_test\.py)$/;
const TEST_NAMED_DIRS = new Set(['test', 'tests', '__tests__']);

export function isTestFile(path) {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((part) => TEST_NAMED_DIRS.has(part))) return true;
  return TEST_NAMED.test(parts[parts.length - 1]);
}

// A script named as a test in the JavaScript and TypeScript family
// (test_gate.mjs). No runner's default discovery collects the name: node
// --test, vitest and jest match .test., .spec., -test, _test, test- and test/
// names. So the name alone is not a test, since helpers carry it too; the
// map counts such a file a test only when it fails by itself and nothing
// imports it (adapter/artifact.js, testing-os#158).
const SCRIPT_TEST_NAMED = /^test_[^/]*\.[cm]?[jt]sx?$/;

export function isScriptTestName(path) {
  return SCRIPT_TEST_NAMED.test(path.slice(path.lastIndexOf('/') + 1));
}

// A smoke test by its name (smoke.mjs, pack-install-smoke.mjs,
// smoke_test_binary.py): a script that runs the product and fails when it
// breaks. It is a test for what reaches the code, though no runner
// discovers it by that name.
const SMOKE_NAMED = /(^|[-_.])smoke([-_.]|$)/i;

export function isSmokeTest(path) {
  return SMOKE_NAMED.test(path.slice(path.lastIndexOf('/') + 1));
}
