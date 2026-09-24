/**
 * The role a boundary gets when its file does not name one: init writes it,
 * and the map derives it for a boundary that leaves it out.
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
// Shell scripts are code a part runs, though Atlas does not parse them.
const SCRIPT_EXT = new Set(['sh', 'bash', 'zsh', 'ps1']);
// What a part holds as data: records, schemas, tables and images a program
// reads, as against the settings a tool reads.
const DATA_EXT = new Set(['json', 'jsonl', 'ndjson', 'yaml', 'yml', 'csv', 'tsv', 'geojson', 'xml']);
// A tool's settings, whatever the extension: a dotfile, a *.config.* file, a
// tsconfig, a lockfile or a compose file.
const SETTINGS_NAME = /^\.|(^|[.-])config([.-]|$)|^tsconfig|^jsconfig|(^|[.-])lock(\.|$)|^(docker-)?compose\./i;
const MANIFEST_NAME = new Set(['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'setup.cfg']);
const SETTINGS_DIRS = new Set(['config', 'configs', 'conf', 'settings', '.config']);
const DOCS_EXT = new Set(['md', 'mdx', 'rst', 'txt']);
// A pinned dependency list is a .txt file a tool reads, not prose.
const DEPENDENCY_LIST = /^(requirements|constraints)([-_.].*)?\.txt$/i;
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
  if (DEPENDENCY_LIST.test(base)) return 'other';
  if (DOCS_EXT.has(ext)) return 'docs';
  if (CONFIG_EXT.has(ext) || isConfigName(base)) return 'config';
  if (CODE_EXT.has(ext) || SCRIPT_EXT.has(ext)) return 'code';
  if (base === '.gitkeep' || IMAGE_EXT.has(ext) || FONT_EXT.has(ext) || BINARY_EXT.has(ext)) return 'other';
  return 'other';
}

const SITE_CONFIG = /(^|\/)astro\.config\.[cm]?[jt]s$/;
const SITE_CONTENT = /(^|\/)src\/content\/docs\//;
const WORKFLOW = /(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/;

// The deepest directory every path is under, with a trailing slash, or ''.
function commonDirectory(paths) {
  const dirs = paths.map((path) => String(path).replaceAll('\\', '/').split('/').slice(0, -1));
  if (dirs.length === 0) return '';
  let length = 0;
  while (dirs.every((parts) => parts.length > length && parts[length] === dirs[0][length])) length += 1;
  return length === 0 ? '' : `${dirs[0].slice(0, length).join('/')}/`;
}

/**
 * Some parts are what their files are, whatever the counts say. A part
 * holding an Astro config or Starlight content is the site, a role of its
 * own: its pages are prose and its components code, and neither count says
 * what it is. A part holding a workflow is configuration however many
 * release notes sit beside it. A part whose own src/ or lib/ holds code is
 * code however many pages document it.
 */
function roleByFiles(paths, kinds) {
  if (paths.some((path) => SITE_CONFIG.test(path) || SITE_CONTENT.test(path))) return 'site';
  if (paths.some((path) => WORKFLOW.test(path))) return 'config';
  const root = commonDirectory(paths);
  const source = paths.some((path, index) => kinds[index] === 'code' && (path.startsWith(`${root}src/`) || path.startsWith(`${root}lib/`)));
  return source ? 'code' : null;
}

export function isImagePath(path) {
  return IMAGE_EXT.has(extensionOf(baseName(path)));
}

/**
 * A part that is mostly data (images, JSON, JSON Lines, YAML, CSV) and holds
 * no manifest and no code: logos, fixtures, schemas, a game's world. A tool's
 * settings are configuration however they are written, so they are not data,
 * and neither is a directory named for them (config/, settings/). A .gitkeep
 * holds a directory open and counts for nothing.
 *
 * A manifest does not make a part of mostly images configuration: a sprite
 * pack published as a package is its images, with a package.json beside them
 * that says how to install them.
 */
function isData(paths) {
  const kept = paths.filter((path) => baseName(path) !== '.gitkeep');
  if (kept.length === 0) return false;
  const bases = kept.map(baseName);
  if (bases.some((base) => CODE_EXT.has(extensionOf(base)) || SCRIPT_EXT.has(extensionOf(base)))) return false;
  if (bases.some((base) => MANIFEST_NAME.has(base))) return bases.filter((base) => IMAGE_EXT.has(extensionOf(base))).length * 2 > kept.length;
  const home = commonDirectory(kept).replace(/\/$/, '');
  if (SETTINGS_DIRS.has(home.slice(home.lastIndexOf('/') + 1).toLowerCase())) return false;
  const data = bases.filter((base) => !SETTINGS_NAME.test(base) && (DATA_EXT.has(extensionOf(base)) || IMAGE_EXT.has(extensionOf(base))));
  return data.length * 2 > kept.length;
}

/**
 * Other casts no vote. Test is reserved for a boundary whose code-shaped
 * files are all tests. A boundary with no voting files is config. A boundary
 * with code is code while its code, tests included, is at least a third of
 * its code and prose together: a docs site with a few scripts beside a
 * hundred pages is docs, and a package with a README and a changelog beside
 * one module is code. Configuration is left out of that ratio, since every
 * package carries a manifest whatever its size. Otherwise docs or config win
 * by majority of the voting files.
 *
 * The part that holds the repository's own manifest is the exception: its
 * READMEs, translated into eight languages, are the front door to a project
 * whose package.json, pyproject.toml and Dockerfile configure the whole of it,
 * so it is config unless code, tests included, is a third of its voting files.
 *
 * A part of mostly data with no manifest and no code is data, a role that
 * reads as data and is expected to have no test (isData), and so is a part of
 * mostly images with no code, manifest or not.
 *
 * @param {string[]} paths
 * @param {{ manifest?: boolean }} [options] manifest: the part holds the
 *   repository's manifest (core/index.js repositoryManifest)
 */
export function roleFor(paths, { manifest = false } = {}) {
  const kinds = paths.map((path) => fileKind(path));
  const byFiles = roleByFiles(paths, kinds);
  if (byFiles) return byFiles;
  if (!manifest && isData(paths)) return 'data';
  const voting = kinds.filter((kind) => kind === 'code' || kind === 'docs' || kind === 'config');
  const docs = voting.filter((kind) => kind === 'docs').length;
  const code = voting.filter((kind) => kind === 'code').length;
  const tests = paths.filter((path, index) => kinds[index] === 'test' && CODE_EXT.has(extensionOf(baseName(path)))).length;
  if (manifest && (code + tests) * 3 < voting.length + tests) return 'config';
  if (code > 0) {
    if ((code + tests) * 3 >= code + tests + docs) return 'code';
    return docs > voting.length / 2 ? 'docs' : 'config';
  }
  if (voting.length === 0) return kinds.some((kind) => kind === 'test') ? 'test' : 'config';
  const config = voting.filter((kind) => kind === 'config').length;
  if (docs > voting.length / 2) return 'docs';
  if (config > voting.length / 2) return 'config';
  return 'code';
}
