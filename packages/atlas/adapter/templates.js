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

const CODE_EXT = new Set(['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts', 'py', 'pyi']);
const DOCS_EXT = new Set(['md', 'mdx', 'rst']);
const CONFIG_EXT = new Set(['json', 'yaml', 'yml', 'toml', 'jsonl', 'lock']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
const FONT_EXT = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
const BINARY_EXT = new Set(['wasm', 'exe', 'dll', 'so', 'dylib', 'bin']);

function baseName(path) {
  const name = String(path).replaceAll('\\', '/');
  return name.slice(name.lastIndexOf('/') + 1);
}

function extensionOf(base) {
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

function isConfigName(base) {
  if (base === 'CODEOWNERS' || base === '.editorconfig') return true;
  if (base === '.gitkeep') return false;
  if (base.startsWith('.git') || /(^|\/)\..*ignore$/.test(base) || base.endsWith('ignore')) {
    if (base.startsWith('.') && base !== '.gitkeep') return true;
  }
  return false;
}

export function fileKind(path) {
  if (isTestPath(path)) return 'test';
  const base = baseName(path);
  const ext = extensionOf(base);
  if (DOCS_EXT.has(ext)) return 'docs';
  if (CONFIG_EXT.has(ext) || isConfigName(base)) return 'config';
  if (CODE_EXT.has(ext)) return 'code';
  if (base === '.gitkeep' || IMAGE_EXT.has(ext) || FONT_EXT.has(ext) || BINARY_EXT.has(ext)) return 'other';
  return 'other';
}

/**
 * Other casts no vote. Test is reserved for a boundary whose code-shaped
 * files are all tests. A boundary with no voting files is config. Any
 * voting code file makes the boundary code; otherwise docs or config win
 * by majority of the voting files.
 */
export function roleFor(paths) {
  const kinds = paths.map((path) => fileKind(path));
  const codeShaped = kinds.filter((kind) => kind === 'code' || kind === 'test');
  if (codeShaped.length > 0 && codeShaped.every((kind) => kind === 'test')) return 'test';
  const voting = kinds.filter((kind) => kind === 'code' || kind === 'docs' || kind === 'config');
  if (voting.length === 0) return 'config';
  if (voting.some((kind) => kind === 'code')) return 'code';
  const docs = voting.filter((kind) => kind === 'docs').length;
  const config = voting.filter((kind) => kind === 'config').length;
  if (docs > voting.length / 2) return 'docs';
  if (config > voting.length / 2) return 'config';
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
