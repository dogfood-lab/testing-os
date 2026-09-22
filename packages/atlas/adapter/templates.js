/**
 * Derived sentences. The acceptance ladder compares an accepted boundary
 * against these strings, so a wording change is a test change.
 */

export function isTestPath(path) {
  const normalized = String(path).replaceAll('\\', '/');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === 'tests' || segment === '__tests__' || segment === 'test')) return true;
  if (name.includes('.test.') || name.includes('.spec.')) return true;
  if (name.startsWith('test_') && name.endsWith('.py')) return true;
  if (name.endsWith('_test.py')) return true;
  return false;
}

function extensionKind(path) {
  const name = String(path).replaceAll('\\', '/');
  const base = name.slice(name.lastIndexOf('/') + 1);
  if (/\.(md|mdx|rst)$/i.test(base)) return 'docs';
  if (/\.(json|yaml|yml|toml)$/i.test(base)) return 'config';
  return 'code';
}

export function fileKind(path) {
  if (isTestPath(path)) return 'test';
  return extensionKind(path);
}

/**
 * Colocated tests stay out of the count. A boundary is test only when every
 * code-shaped file in it matches the test conventions. Otherwise the non-test
 * files decide: any of them that is code-shaped makes the boundary code, and
 * docs or config win only by majority when no such file exists.
 */
export function roleFor(paths) {
  const nonTest = paths.filter((path) => !isTestPath(path));
  if (nonTest.some((path) => extensionKind(path) === 'code')) return 'code';
  if (nonTest.length === 0) return paths.some((path) => isTestPath(path)) ? 'test' : 'code';
  const docs = nonTest.filter((path) => extensionKind(path) === 'docs').length;
  const config = nonTest.filter((path) => extensionKind(path) === 'config').length;
  if (docs > nonTest.length / 2) return 'docs';
  if (config > nonTest.length / 2) return 'config';
  return 'code';
}

export function coveredBy(name, paths, testImporters) {
  const names = new Set(testImporters);
  if (paths.some((path) => isTestPath(path))) names.add(name);
  return [...names].sort();
}

function show(items) {
  if (!items || items.length === 0) return 'none';
  return [...items].sort().join(', ');
}

export function reasonTemplate({ count, role, entryPoints, imports, importedBy }) {
  const noun = count === 1 ? 'file' : 'files';
  return `${count} ${noun}, role ${role}; entry points ${show(entryPoints)}; imports ${show(imports)}; imported by ${show(importedBy)}`;
}

export function willBreakTemplate({ fanIn, coveredBy: covered }) {
  const breaks = !fanIn || fanIn.length === 0 ? 'nothing that imports it' : [...fanIn].sort().join(', ');
  const tests = !covered || covered.length === 0
    ? 'not covered by any test boundary'
    : `covered by tests in ${[...covered].sort().join(', ')}`;
  return `Changing this breaks ${breaks}; ${tests}`;
}
