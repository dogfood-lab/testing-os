import { readFileSync } from 'node:fs';
import { join as joinFs, posix } from 'node:path';
import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';
import { cargoProject, owningCrate } from './cargo.js';
import { godotProjects, projectOf, resPath } from './godot.js';
import { isCodePath } from './languages.js';
import { wheelPackages } from './python-manifest.js';
import { storedText } from './text.js';
import {
  tscEmits,
  eslintTargets,
  jestTargets,
  makeRecipes,
  mochaTargets,
  NODE_TEST_DEFAULTS,
  PYTEST_DEFAULTS,
  pytestTargets,
  tscTargets,
  vitestTargets,
} from './tool-configs.js';

/**
 * What a door's command text executes.
 *
 * A command runs a tracked file when the file is the command, or when a tool
 * that executes files is handed it: an interpreter's script, a test runner's
 * test paths, a checker's targets. Each tool is read by its own conventions,
 * so a flag that takes a value never passes for a path. A tool that names no
 * file reads its configuration, and the files that configuration selects are
 * runs too, marked `matched` and carrying `via`, the tool and the file it
 * read. A directory a tool is handed is one run with `directory: true`; the
 * reach walk stands it for the code files under it.
 *
 * Text is read at two levels. Level 0 is a workflow step and the npm scripts
 * it starts, followed through nested invocations. A shell script, a makefile
 * target or a JavaScript file that level 0 runs is read once more as command
 * text, at level 1, and what it runs carries `via` naming it. Level 1 reads no
 * further file, so a chain of scripts stops after one.
 */

export const RUNS_RECORDED = 200;

const RUN_ALIASES = new Set(['run', 'run-script', 'rum', 'urn']);
const TEST_ALIASES = new Set(['test', 't', 'tst']);
const LIFECYCLE = new Set(['start', 'stop', 'restart']);
const NPM_VALUE_FLAGS = new Set(['-w', '--workspace', '--prefix']);
// Words that can open a shell command line without being the command.
const PREFIX_WORDS = new Set(['if', 'elif', 'then', 'else', 'while', 'until', 'do', 'exec', 'time', '!']);
// A command that only prints, installs or inspects: a tool named among its
// arguments (pip install pytest, echo vitest) is not run.
const NON_EXECUTING = new Set([
  '[', '[[', 'act', 'apk', 'apt', 'apt-get', 'awk', 'brew', 'cat', 'cd', 'choco', 'chmod', 'command', 'cp', 'curl', 'declare', 'docker', 'kubectl', 'podman', 'ssh',
  'echo', 'export', 'gh', 'git', 'grep', 'hash', 'head', 'jq', 'local', 'ls', 'mkdir', 'mv', 'npm', 'pip', 'pip3',
  'pnpm', 'printf', 'read', 'rm', 'sed', 'set', 'sort', 'tail', 'tee', 'test', 'touch', 'type', 'unset', 'wc',
  'wget', 'which', 'yarn', 'uv',
]);
const PACKAGE_RUNNERS = new Set(['npm', 'pnpm', 'yarn']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'source', '.']);
const PY_TOOLS = new Set(['pytest', 'py.test', 'mypy', 'black', 'flake8', 'pylint', 'bandit', 'ruff', 'coverage']);
// The tools that read the files they are handed, to lint, format, type-check
// or compile them, and run none of them. A file one of these reaches is
// checked, not executed: what it would write when run is not written by the
// door (core/index.js walks landings from executed runs alone). tsc is one
// when it only checks; a tsc that emits, like tsup and a library's vite
// build, builds the code, which it still does not run (built runs).
const CHECKERS = new Set(['ruff', 'mypy', 'checker', 'tsc', 'eslint']);
// Python modules that only compile what they are handed.
const PY_COMPILERS = new Set(['py_compile', 'compileall']);

// The flags each tool takes a value after, written apart ("-c pyproject.toml").
// A value is never a path the tool runs, even when it names a tracked file.
const VALUES = {
  node: ['--loader', '--experimental-loader', '--import', '--require', '-r', '--test-reporter', '--test-reporter-destination', '--test-concurrency', '--test-name-pattern', '--test-skip-pattern', '--test-timeout', '--env-file', '--input-type', '--conditions', '-C', '--test-shard'],
  python: ['-W', '-X', '-Q'],
  tsx: ['--tsconfig', '--env-file', '--import', '--require'],
  'ts-node': ['-P', '--project', '-r', '--require', '-O', '--compiler-options', '--compiler', '-C', '--cwd'],
  deno: ['-c', '--config', '--import-map', '--lock', '--cert', '--location', '--seed', '--reload', '--inspect', '--env-file'],
  bun: ['--cwd', '--preload', '-r', '--require', '--env-file', '--config', '-c', '--timeout'],
  shell: ['-o', '+o', '-O', '+O'],
  npx: ['-p', '--package', '-w', '--workspace'],
  'uv run': ['--with', '--with-editable', '--with-requirements', '--extra', '--group', '--only-group', '--no-group', '--python', '-p', '--package', '--project', '--directory', '--env-file', '--index', '--index-url', '--extra-index-url', '--script', '-C', '--config-setting'],
  uvx: ['--from', '--with', '--with-editable', '--with-requirements', '--python', '-p', '--index', '--index-url'],
  'poetry run': ['-C', '--directory', '-P', '--project'],
  'pipx run': ['--spec', '--python', '--index-url', '--pip-args'],
  'hatch run': [],
  coverage: ['--source', '--rcfile', '--include', '--omit', '--data-file', '--context', '--concurrency'],
  pytest: ['-c', '-m', '-k', '-n', '-p', '-o', '-W', '-r', '--rootdir', '--confcutdir', '--basetemp', '--deselect', '--ignore', '--ignore-glob', '--cov', '--cov-report', '--cov-config', '--cov-fail-under', '--junitxml', '--junit-xml', '--dist', '--tb', '--maxfail', '--durations', '--timeout', '--log-level', '--log-cli-level', '--log-file', '--color', '--import-mode', '--override-ini', '--capture', '--reruns', '--html', '--numprocesses', '--maxprocesses', '--randomly-seed', '--asyncio-mode'],
  ruff: ['--config', '--select', '--ignore', '--extend-select', '--extend-ignore', '--exclude', '--extend-exclude', '--output-format', '--target-version', '--line-length', '--per-file-ignores', '--fixable', '--unfixable', '--cache-dir', '--stdin-filename', '--output-file', '-o'],
  mypy: ['-p', '--package', '-m', '--module', '--config-file', '--python-version', '--exclude', '--cache-dir', '--junit-xml', '--html-report', '--txt-report', '--linecount-report', '--any-exprs-report', '--xml-report', '--python-executable', '--platform', '--custom-typeshed-dir', '--shadow-file', '-c', '--command'],
  black: ['--config', '-l', '--line-length', '-t', '--target-version', '--exclude', '--extend-exclude', '--include', '--force-exclude', '--stdin-filename', '-W', '--workers', '--python-cell-magics', '--required-version'],
  flake8: ['--config', '--exclude', '--extend-exclude', '--select', '--extend-select', '--ignore', '--extend-ignore', '--max-line-length', '--max-complexity', '--format', '--output-file', '--per-file-ignores', '--filename', '--append-config', '-j', '--jobs'],
  pylint: ['--rcfile', '--disable', '-d', '--enable', '-e', '-j', '--jobs', '--output-format', '-f', '--ignore', '--ignore-paths', '--ignore-patterns', '--load-plugins', '--output', '--fail-under', '--max-line-length', '--init-hook'],
  bandit: ['-c', '--configfile', '-f', '--format', '-o', '--output', '-x', '--exclude', '-p', '--profile', '-t', '--tests', '-s', '--skip', '-b', '--baseline', '--ini', '--msg-template', '-a', '--aggregate', '--severity-level', '--confidence-level'],
  tsc: ['-p', '--project', '--outDir', '--rootDir', '--target', '-t', '--module', '-m', '--lib', '--jsx', '--declarationDir', '--tsBuildInfoFile', '--moduleResolution', '--types', '--baseUrl', '--outFile', '--generateTrace', '--locale'],
  next: ['-p', '--port', '-H', '--hostname', '--experimental-debug-memory-usage', '-d', '--dir'],
  turbo: ['--filter', '-F', '--concurrency', '--cache-dir', '--log-order', '--output-logs', '--env-mode', '--ui', '--log-prefix'],
  tsup: ['--format', '-d', '--out-dir', '--target', '--config', '--external', '--tsconfig', '--platform', '--global-name', '--inject', '--onSuccess'],
  vite: ['-c', '--config', '--base', '-m', '--mode', '--outDir', '--assetsDir', '-l', '--logLevel', '--ssr', '--target', '--port'],
  vitest: ['-c', '--config', '-r', '--root', '--dir', '--project', '-t', '--testNamePattern', '--reporter', '--outputFile', '--environment', '--pool', '--shard', '--mode', '--exclude', '--silent', '--maxWorkers', '--minWorkers', '--testTimeout', '--hookTimeout', '--bail', '--retry', '--changed'],
  jest: ['-c', '--config', '--rootDir', '--roots', '-t', '--testNamePattern', '--testPathPattern', '--testPathIgnorePatterns', '--reporters', '--outputFile', '-w', '--maxWorkers', '--selectProjects', '--shard', '--coverageDirectory', '--testMatch', '--testRegex', '--testEnvironment', '--testTimeout', '--env', '--changedSince'],
  mocha: ['--config', '--package', '-r', '--require', '-R', '--reporter', '-O', '--reporter-option', '--reporter-options', '-t', '--timeout', '-g', '--grep', '-f', '--fgrep', '-u', '--ui', '--spec', '--extension', '--file', '--ignore', '--exclude', '-j', '--jobs', '-s', '--slow', '--retries'],
  eslint: ['-c', '--config', '--ext', '--ignore-path', '--ignore-pattern', '-f', '--format', '-o', '--output-file', '--rule', '--parser', '--parser-options', '--resolve-plugins-relative-to', '--max-warnings', '--cache-location', '--cache-strategy', '--env', '--global', '--plugin', '--rulesdir', '--report-unused-disable-directives-severity', '--stdin-filename', '--flag'],
  make: ['-C', '--directory', '-f', '--file', '--makefile', '-I', '--include-dir', '-o', '--old-file', '-W', '--what-if', '-l', '--load-average'],
  timeout: ['-s', '--signal', '-k', '--kill-after'],
  env: ['-u', '--unset', '-C', '--chdir', '-S', '--split-string'],
  sudo: ['-u', '--user', '-g', '--group', '-C', '-D', '--chdir', '-h', '--host', '-p', '--prompt'],
  xargs: ['-n', '-I', '-P', '-d', '-L', '-s', '-E', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file', '--replace'],
  nice: ['-n', '--adjustment'],
  pyinstaller: ['--name', '-n', '--distpath', '--workpath', '--specpath', '-p', '--paths', '--hidden-import', '--collect-submodules', '--collect-data', '--collect-binaries', '--collect-all', '--copy-metadata', '--add-data', '--add-binary', '--exclude-module', '--runtime-hook', '--additional-hooks-dir', '--icon', '-i', '--upx-dir', '--target-arch', '--version-file', '--splash', '--log-level', '--key', '--runtime-tmpdir', '--contents-directory'],
  build: ['-o', '--outdir', '-C', '--config-setting', '--installer'],
  docker: ['-f', '--file', '-t', '--tag', '--target', '--build-arg', '--platform', '--label', '--cache-from', '--cache-to', '--secret', '--ssh', '--output', '-o', '--network', '--progress', '--iidfile', '--metadata-file', '--build-context', '--builder', '--provenance', '--sbom', '--shm-size', '--ulimit', '--add-host', '--cgroup-parent', '--isolation', '--memory', '-m', '--cpu-shares', '--annotation', '--attest', '--allow', '--call', '--format'],
};
// The configs vite reads from the root it builds, first found first.
const VITE_CONFIGS = ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.ts', 'vite.config.mts', 'vite.config.cts'];
const VALUE_SETS = Object.fromEntries(Object.entries(VALUES).map(([tool, flags]) => [tool, new Set(flags)]));

/**
 * The tracked files and directories a repository holds, the files each
 * directory holds, and the package manifests, read once per map.
 *
 * builtFrom, when given, is the tracked source a path a build emits is
 * compiled from (core/resolve.js resolveDeclaredPath), or null: a command
 * that runs dist/cli.js runs the CLI src/cli.ts is built into. emitted is
 * every path the build emits, with its source (core/resolve.js
 * emittedFiles), which a glob over the build's output is matched against.
 * unitTests is every Rust file that holds its own unit tests, which cargo
 * test runs with the crate's test targets.
 */
export function repositoryView({ repoPath, tracked, spawned = new Map(), commands = [], builtFrom = () => null, emitted = () => new Map(), unitTests = new Set(), discovered = new Map() }) {
  const dirs = new Set(['']);
  // The commands the repository installs, by the name a step types.
  const installed = new Map();
  for (const command of commands) if (command.kind === 'command' && command.path != null && !installed.has(command.name)) installed.set(command.name, command.path);
  for (const path of tracked) {
    for (let at = path.indexOf('/'); at !== -1; at = path.indexOf('/', at + 1)) dirs.add(path.slice(0, at));
  }
  const sorted = [...tracked].sort();
  const texts = new Map();
  const manifests = new Map();
  const under = new Map();
  let members = null;
  const view = {
    repoPath,
    tracked,
    dirs,
    spawned,
    installed,
    commands,
    builtFrom,
    unitTests,
    // The scripts a runner finds and runs at run time, by the runner.
    discovered,
    text(path) {
      if (!tracked.has(path)) return null;
      if (!texts.has(path)) {
        let text = null;
        try {
          text = storedText(readFileSync(joinFs(repoPath, path), 'utf8'));
        } catch {
          text = null;
        }
        texts.set(path, text);
      }
      return texts.get(path);
    },
    manifest(dir) {
      if (manifests.has(dir)) return manifests.get(dir);
      let pkg = null;
      try {
        pkg = JSON.parse(view.text(dir ? `${dir}/package.json` : 'package.json') ?? 'null');
      } catch {
        pkg = null;
      }
      if (pkg == null || typeof pkg !== 'object' || Array.isArray(pkg)) pkg = null;
      manifests.set(dir, pkg);
      return pkg;
    },
    // Every tracked file under a directory, the root included.
    filesUnder(dir) {
      if (!under.has(dir)) under.set(dir, dir === '' ? sorted : sorted.filter((path) => path.startsWith(`${dir}/`)));
      return under.get(dir);
    },
    workspaces() {
      if (!members) members = readWorkspaces(view);
      return members;
    },
    directoriesMatching(pattern) {
      if (!/[*?[{]/.test(pattern)) return dirs.has(pattern) && pattern !== '' ? [pattern] : pattern === '' ? [''] : [];
      const isMatch = picomatch(pattern);
      return [...dirs].filter((dir) => dir !== '' && isMatch(dir)).sort();
    },
    // The sources of the built files under base whose path relative to base
    // matches a glob: what a glob over dist/ runs, since dist/ is not tracked.
    builtMatching(base, globs) {
      if (globs.length === 0) return [];
      const isMatch = picomatch(globs.map(stripDot), { dot: false });
      const out = [];
      for (const [path, source] of emitted()) {
        if (base !== '' && !path.startsWith(`${base}/`)) continue;
        if (isMatch(base ? path.slice(base.length + 1) : path)) out.push(source);
      }
      return [...new Set(out)].sort();
    },
    // Tracked files under base whose path relative to base matches a glob and
    // no ignore pattern. An ignore pattern also ignores what is under it.
    filesMatching(base, globs, ignore = []) {
      if (globs.length === 0) return [];
      const isMatch = picomatch(globs.map(stripDot), { dot: false });
      const ignored = ignore.length > 0 ? picomatch(ignore.flatMap((pattern) => [stripDot(pattern), `${stripDot(pattern).replace(/\/+$/, '')}/**`]), { dot: true }) : null;
      const out = [];
      for (const path of view.filesUnder(base)) {
        const rel = base ? path.slice(base.length + 1) : path;
        if (rel.startsWith('node_modules/') || rel.includes('/node_modules/')) continue;
        if (isMatch(rel) && !(ignored && ignored(rel))) out.push(path);
      }
      return out;
    },
    /**
     * What sh hands a program for an unquoted glob run from `dir`: the
     * tracked files and directories whose path, segment by segment, matches
     * the glob's, where ** is one segment as * is and a name starting with a
     * dot is matched only by a segment that does. Relative to `dir`, sorted
     * as sh sorts them; empty when nothing matches, and then sh hands the
     * glob on as written. A glob holding a brace is left to the program,
     * since sh on a runner (dash) expands none.
     */
    shellGlob(dir, pattern) {
      if (pattern.includes('{') || pattern.startsWith('-')) return [];
      const absolute = pattern.startsWith('/');
      if (absolute) return [];
      const segments = pattern.replace(/^\.\//, '').split('/').filter((segment, index, all) => segment !== '' || index === all.length - 1);
      if (segments.length === 0) return [];
      const tests = segments.map(shellSegment);
      const out = [];
      const consider = (rel) => {
        const parts = rel.split('/');
        if (parts.length === tests.length && parts.every((part, index) => tests[index](part))) out.push(rel);
      };
      for (const path of view.filesUnder(dir)) consider(dir ? path.slice(dir.length + 1) : path);
      for (const found of dirs) if (found !== '' && (dir === '' || found.startsWith(`${dir}/`))) consider(dir ? found.slice(dir.length + 1) : found);
      // A build's output is there when the command runs, though not tracked;
      // each built file is handed on by its path and runs its source.
      for (const path of emitted().keys()) if (dir === '' || path.startsWith(`${dir}/`)) consider(dir ? path.slice(dir.length + 1) : path);
      return [...new Set(out)].sort();
    },
    // A matched set written as few runs as it can be without changing what
    // they stand for: a directory whose every code file is in the set stands
    // for them, and the files it covers are not listed again.
    compact(files) {
      const set = new Set(files);
      const out = [];
      const covered = new Map();
      const whole = (dir) => {
        if (!covered.has(dir)) {
          const code = view.filesUnder(dir).filter(isCodePath);
          covered.set(dir, code.length > 0 && code.every((path) => set.has(path)));
        }
        return covered.get(dir);
      };
      const emitted = new Set();
      for (const file of [...set].sort()) {
        let placed = false;
        if (isCodePath(file)) {
          for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1)) {
            const dir = file.slice(0, at);
            if (whole(dir)) {
              if (!emitted.has(dir)) out.push({ path: `${dir}/`, directory: true });
              emitted.add(dir);
              placed = true;
              break;
            }
          }
        }
        if (!placed) out.push({ path: file });
      }
      return out;
    },
  };
  return view;
}

function stripDot(pattern) {
  return pattern.replace(/^\.\//, '');
}

// One segment of an sh glob as a test of one name: * and ** match any run of
// characters but a slash, ? one, [...] a class, and a leading dot only a
// leading dot.
function shellSegment(segment) {
  if (!/[*?[]/.test(segment)) return (name) => name === segment;
  let source = '';
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (ch === '*') {
      while (segment[i + 1] === '*') i += 1;
      source += '[^/]*';
    } else if (ch === '?') source += '[^/]';
    else if (ch === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end === -1) source += '\\[';
      else {
        const body = segment.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\');
        source += `[${body}]`;
        i = end;
      }
    } else source += ch.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  const re = new RegExp(`^${source}$`);
  const dotted = segment.startsWith('.');
  return (name) => (dotted || !name.startsWith('.')) && re.test(name);
}

const PACKAGING = new WeakMap();

// The directories a Python packaging file sits in, and their src/, by path.
function packagingRoots(repo) {
  if (PACKAGING.has(repo)) return PACKAGING.get(repo);
  const roots = [];
  for (const path of [...repo.tracked].sort()) {
    const base = path.slice(path.lastIndexOf('/') + 1);
    if (base !== 'pyproject.toml' && base !== 'setup.py' && base !== 'setup.cfg') continue;
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    for (const root of [dir, dir ? `${dir}/src` : 'src']) if (!roots.includes(root)) roots.push(root);
  }
  PACKAGING.set(repo, roots);
  return roots;
}

/**
 * Read one piece of level-0 command text run from `dir`.
 * Returns the runs keyed by path, the tracked files it mentions, and the
 * files a shell's expansion of an unquoted glob leaves out that the tool
 * would have run had it expanded the glob itself (shellMissed).
 *
 * `platforms`, when given, are the systems the job runs on (linux, macos,
 * windows). A package script the text starts is handed to sh on Linux and
 * macOS, which expands an unquoted glob before the program sees it, and to
 * cmd on Windows, which expands nothing. A package script is one command
 * line, so its globs are read as sh reads them; a step's own text and a
 * shell script are not, since a bare * there is as often a case pattern or
 * a loop's list as an argument. Without platforms nothing is expanded.
 */
export function readCommands(text, dir, repo, platforms = null) {
  const runs = new Map();
  const mentions = new Set();
  const missed = new Map();
  const reader = makeReader(repo, runs, mentions, missed);
  const where = platforms ? { platforms: [...platforms] } : {};
  reader.read(text, dir, { level: 0, via: null, active: new Set(), ...where });
  for (const path of runs.keys()) mentions.delete(path);
  return { runs, mentions, shellMissed: [...missed.values()] };
}

/**
 * What running one tracked program starts: the file itself, and the commands
 * it spells out for a child process, read as a script a workflow runs by name
 * is read. A person runs it from wherever they are, so what it names is taken
 * from the repository root, as the commands a test spawns are.
 */
export function readProgram(path, repo) {
  const runs = new Map();
  const reader = makeReader(repo, runs, new Set());
  reader.program(path, { level: 0, via: null, active: new Set() });
  return runs;
}

// Of two ways a path is reached, the one the command spells wins: no via
// before a via, a named file before a matched one. A path one tool runs and
// another only checks is run.
//
// The flags a run passes are the ones every way of reaching it passes: a file
// run once with --check and once without is run without it.
export function better(a, b) {
  const rank = (entry) => [entry.via == null ? 0 : 1, entry.matched ? 1 : 0, entry.via ?? ''];
  const [x, y] = [rank(a), rank(b)];
  let pick = a;
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) break;
    if (x[i] > y[i]) {
      pick = b;
      break;
    }
  }
  const runKind = a.runKind === 'checks' && b.runKind === 'checks' ? 'checks' : 'executes';
  // A file only built, or built and checked, is built; one anything runs is run.
  const ran = (entry) => entry.runKind !== 'checks' && !entry.built;
  const built = (a.built || b.built) && !ran(a) && !ran(b);
  const passes = (a.passes ?? []).filter((flag) => (b.passes ?? []).includes(flag));
  const out = { ...pick, runKind };
  delete out.passes;
  delete out.built;
  if (built) out.built = true;
  // A file only packed into an image is packed; one anything else checks or
  // runs is that.
  delete out.packed;
  if (a.packed && b.packed) out.packed = true;
  if (passes.length > 0) out.passes = passes;
  // A binary either way builds is built, whatever else checks it.
  if (a.builds || b.builds) out.builds = true;
  return out;
}

// The flags handed to a script after its path, by name: --check=x is --check.
function flagsOf(args) {
  return [...new Set(args.filter((arg) => /^--?[A-Za-z]/.test(arg)).map((arg) => arg.replace(/=.*$/, '')))].sort();
}

function makeReader(repo, runs, mentions, missed = new Map()) {
  // Where runs are recorded: the runs, or a scratch map while one reading of
  // a line is compared with another (shellLine).
  let sink = runs;
  const record = (entry) => {
    const existing = sink.get(entry.path);
    sink.set(entry.path, existing ? better(existing, entry) : entry);
  };

  function read(text, dir, frame) {
    if (frame.level === 0) {
      // What git add names is what a commit carries, not a file the step
      // reads (landings.js has staging as neither a write nor a read).
      const said = text.split('\n').filter((line) => !/^\s*git\s+(?:-C\s+\S+\s+)?add\b/.test(line)).join('\n');
      for (const piece of said.split(/[\s"'`()[\]{}<>|;&,=:]+/)) {
        const path = pathFrom(dir, piece.replace(/\.+$/, ''));
        if (path != null && repo.tracked.has(path)) mentions.add(path);
      }
    }
    // cd moves the rest of the text; a directory this repository does not
    // track, or one set at run time, names nowhere its files can be read from.
    let here = dir;
    const globs = new Set();
    const lines = commandLines(text, globs);
    const inner = (frame.expanding ?? []).length > 0 && globs.size > 0 ? { ...frame, globs } : { ...frame, globs: null };
    for (const tokens of lines) {
      if (tokens[0] === 'cd' || tokens[0] === 'pushd') here = movedTo(here, tokens.slice(1));
      else if (tokens[0] === 'popd') here = dir;
      else if (here != null) shellLine(tokens, here, inner);
    }
  }

  // The runs one reading of a line records, kept apart from the rest.
  function scratch(read) {
    const saved = sink;
    sink = new Map();
    try {
      read();
      return sink;
    } finally {
      sink = saved;
    }
  }

  // The code files a set of runs stands for, a directory for its own.
  function codeFiles(found) {
    const out = new Set();
    for (const entry of found.values()) {
      if (entry.directory) for (const path of repo.filesUnder(entry.path.replace(/\/$/, ''))) {
        if (isCodePath(path)) out.add(path);
      }
      else if (isCodePath(entry.path)) out.add(entry.path);
    }
    return out;
  }

  /**
   * A line whose unquoted globs the shell expands before the program runs:
   * on a platform whose shell expands them the program is handed what sh
   * selects, where ** is one directory level as * is, and a glob that
   * selects nothing is handed on as written, for the program to expand. On
   * a platform whose shell expands nothing the program is handed the glob.
   * Each reading's runs are recorded, and the files the program would have
   * run from the glob that the shell's selection leaves out are kept, by
   * the directory they share, so the page can say what CI does not run.
   */
  function shellLine(tokens, dir, frame) {
    if (!frame.globs || !tokens.some((token) => frame.globs.has(token))) {
      line(tokens, dir, frame);
      return;
    }
    const expanded = [];
    let changed = false;
    const twoStars = tokens.some((token) => frame.globs.has(token) && token.includes('**'));
    for (const token of tokens) {
      const selected = frame.globs.has(token) ? repo.shellGlob(dir, token) : [];
      if (selected.length === 0) expanded.push(token);
      else {
        expanded.push(...selected);
        changed = true;
      }
    }
    const plain = { ...frame, globs: null };
    if (!changed) {
      line(tokens, dir, plain);
      return;
    }
    const literal = scratch(() => line(tokens, dir, plain));
    const shell = scratch(() => line(expanded, dir, plain));
    const ran = codeFiles(shell);
    const left = [...codeFiles(literal)].filter((path) => !ran.has(path)).sort();
    // Where the two readings run the same files the glob's own reading is
    // kept, a directory standing for its files as before; otherwise each
    // platform's is: what sh selects, and on a platform whose shell expands
    // nothing, the glob.
    const unexpanded = (frame.platforms ?? []).some((os) => !frame.expanding.includes(os));
    if (left.length === 0 || unexpanded) for (const entry of literal.values()) record(entry);
    if (left.length === 0) return;
    for (const entry of shell.values()) record(entry);
    const platform = frame.expanding.includes('linux') ? 'linux' : frame.expanding[0];
    const base = commonDirectory(left);
    const key = `${base}\0${platform}`;
    const entry = missed.get(key) ?? { base, files: new Set(), platform, twoStars: false };
    for (const path of left) entry.files.add(path);
    entry.twoStars ||= twoStars;
    missed.set(key, entry);
  }

  function movedTo(from, args) {
    const target = args.find((arg) => !arg.startsWith('-'));
    if (from == null || target == null || target.includes('$') || target.startsWith('~')) return null;
    const moved = cleanDir(posix.join(from || '.', target));
    return moved != null && repo.dirs.has(moved) ? moved : null;
  }

  function line(tokens, dir, frame) {
    let first = 0;
    while (first < tokens.length && (PREFIX_WORDS.has(tokens[first]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[first]))) first += 1;
    if (first >= tokens.length) return;
    for (const target of npmTargets(tokens, dir, repo)) npmScript(target.dir, target.script, frame, target.args ?? []);
    const argv = tokens.slice(first);
    // pnpm vitest run, with no script named vitest, is vitest.
    const binary = runnerBinary(argv, dir, repo);
    if (binary != null) {
      interpret(argv.slice(binary), dir, frame);
      return;
    }
    // npm exec, pnpm dlx and their kin run a package binary the way npx does.
    if (PACKAGE_RUNNERS.has(argv[0]) && ['exec', 'x', 'dlx'].includes(argv[1])) {
      handlers.npx(['npx', ...argv.slice(2)], dir, frame);
      return;
    }
    if (interpret(argv, dir, frame)) return;
    if (containerBuild(argv, dir, frame)) return;
    if (NON_EXECUTING.has(argv[0])) return;
    // A command the repository installs, typed by its name or by a path to
    // where it was installed (.venv/bin/facet-index), runs its module. Inside
    // an image only the manifests copied into it have installed anything.
    const command = (frame.installed ?? repo.installed).get(baseName(argv[0]));
    if (command != null && !repo.tracked.has(pathFrom(dir, argv[0]) ?? '')) {
      const passes = flagsOf(argv.slice(1));
      record(stamp({ path: command, ...(passes.length > 0 ? { passes } : {}) }, frame));
      if (frame.level === 0) readFile(command, dir, frame);
      return;
    }
    // An unknown command that hands a tool its arguments, a shell function
    // such as run_stage lint ruff check src/, runs that tool.
    for (let i = 1; i < argv.length; i += 1) {
      if (toolOf(argv[i]) != null) {
        interpret(argv.slice(i), dir, frame);
        return;
      }
    }
    // Any other command handed a tracked file reads it (a packager, a
    // bundler, a linter this reader has no rule for). Whether it also runs
    // the file is not known, so it is checked: its reach is walked, and what
    // it would write is not the door's.
    const checked = { ...frame, runKind: 'checks' };
    for (const arg of argv.slice(1)) {
      const path = pathFrom(dir, arg);
      if (path != null && repo.tracked.has(path)) record(stamp({ path }, checked));
    }
  }

  // What npm run hands the script after its name (npm run tauri build --
  // --bundles deb) is appended to the script's own command, as npm does.
  function npmScript(target, script, frame, args = []) {
    const key = `${target}\0${script}`;
    if (frame.active.has(key)) return;
    const pkg = repo.manifest(target);
    const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts != null ? pkg.scripts : null;
    if (!scripts) return;
    frame.active.add(key);
    // A package script runs in the manager's shell, sh or cmd, whatever
    // shell the step that started it names.
    const next = frame.platforms ? { ...frame, expanding: frame.platforms.filter((os) => os !== 'windows') } : frame;
    for (const name of [`pre${script}`, script, `post${script}`]) {
      if (typeof scripts[name] !== 'string') continue;
      read(name === script && args.length > 0 ? `${scripts[name]} ${args.join(' ')}` : scripts[name], target, next);
    }
    frame.active.delete(key);
  }

  const via = (frame, extra) => [frame.via, extra].filter(Boolean).join(' → ') || null;

  // A tracked file the command executes; a directory when the tool accepts
  // one. Returns the path when it was a run.
  function file(token, dir, frame, { directories = false, script = false, args = [] } = {}) {
    const named = pathFrom(dir, token);
    if (named == null) return null;
    // A build output is not tracked; what runs when it runs is its source.
    const path = repo.tracked.has(named) ? named : repo.builtFrom(named) ?? named;
    if (repo.tracked.has(path)) {
      const passes = script ? flagsOf(args) : [];
      record(stamp({ path, ...(passes.length > 0 ? { passes } : {}) }, frame));
      if (script && frame.level === 0) readFile(path, dir, frame);
      return path;
    }
    if (directories && path !== '' && repo.dirs.has(path)) {
      record(stamp({ path: `${path}/`, directory: true }, frame));
      return path;
    }
    return null;
  }

  function readFile(path, dir, frame) {
    const where = frame.platforms ? { platforms: frame.platforms } : {};
    const next = { level: 1, via: via(frame, path), active: frame.active, installed: frame.installed, ...where };
    if (isShellScript(path, repo)) {
      read(repo.text(path) ?? '', dir, next);
    } else {
      for (const command of repo.spawned.get(path) ?? []) read(command, dir, next);
    }
  }

  function matched(entries, frame, tool) {
    const chain = via(frame, tool);
    for (const entry of entries) record(stamp({ ...entry, matched: true }, frame, chain));
  }

  function directoryRuns(dirs, frame, tool) {
    const chain = via(frame, tool);
    for (const found of dirs) {
      if (found === '') continue;
      record(stamp({ path: `${found}/`, directory: true, matched: true }, frame, chain));
    }
  }

  // Positional arguments and the value of each flag, by the tool's flags.
  function split(argv, start, valueFlags) {
    const positional = [];
    const values = new Map();
    const flags = new Set();
    for (let i = start; i < argv.length; i += 1) {
      const token = argv[i];
      if (token === '--') {
        positional.push(...argv.slice(i + 1));
        break;
      }
      if (token.startsWith('-') && token.length > 1) {
        const eq = token.indexOf('=');
        const name = eq === -1 ? token : token.slice(0, eq);
        if (eq !== -1) addValue(values, name, token.slice(eq + 1));
        else if (valueFlags.has(name) && i + 1 < argv.length) addValue(values, name, argv[++i]);
        else flags.add(name);
        continue;
      }
      positional.push(token);
    }
    return { positional, values, flags };
  }

  function valueOf(parsed, ...names) {
    for (const name of names) if (parsed.values.has(name)) return parsed.values.get(name)[0];
    return null;
  }

  // Returns true when the first word is a tool this reader knows; the tool's
  // own rules then decide everything the line runs.
  function interpret(argv, dir, frame) {
    const tool = toolOf(argv[0]);
    if (tool == null) {
      const path = pathFrom(dir, argv[0]);
      if (path != null && (repo.tracked.has(path) || repo.builtFrom(path) != null)) file(argv[0], dir, frame, { script: true, args: argv.slice(1) });
      return false;
    }
    handlers[tool](argv, dir, CHECKERS.has(tool) ? { ...frame, runKind: 'checks' } : frame);
    return true;
  }

  function scriptRunner(argv, dir, frame, valueFlags, { runValues = [], stopAt = [], subcommands = [] } = {}) {
    let i = 1;
    while (i < argv.length && subcommands.includes(argv[i])) i += 1;
    for (; i < argv.length; i += 1) {
      const token = argv[i];
      if (stopAt.includes(token)) return;
      if (token === '--') {
        i += 1;
        break;
      }
      if (!token.startsWith('-') || token === '-') break;
      const eq = token.indexOf('=');
      const name = eq === -1 ? token : token.slice(0, eq);
      if (stopAt.includes(name)) return;
      const value = eq !== -1 ? token.slice(eq + 1) : valueFlags.has(name) ? argv[++i] : null;
      if (value != null && runValues.includes(name)) file(value, dir, frame);
    }
    if (i < argv.length) file(argv[i], dir, frame, { script: true, args: argv.slice(i + 1) });
  }

  function pathArguments(argv, dir, frame, tool, start = 1) {
    const parsed = split(argv, start, VALUE_SETS[tool]);
    for (const token of parsed.positional) {
      const path = pathFrom(dir, token.replace(/::.*$/, ''));
      if (path === '') {
        const files = tool === 'pytest' ? repo.filesMatching('', PYTEST_DEFAULTS) : repo.filesUnder('').filter((item) => item.endsWith('.py'));
        matched(repo.compact(files), frame, tool);
      } else file(token.replace(/::.*$/, ''), dir, frame, { directories: true });
    }
    return parsed;
  }

  // The module an import names, as the package's code loads it: a module
  // file or a package's __init__.py, from the directory the step runs in or
  // a packaging root.
  function importedModule(name, dir, frame) {
    const stem = name.split('.').join('/');
    for (const base of [dir, dir ? `${dir}/src` : 'src', ...packagingRoots(repo)]) {
      for (const candidate of [`${stem}.py`, `${stem}/__init__.py`]) {
        const path = pathFrom(base, candidate);
        if (path != null && repo.tracked.has(path)) {
          record(stamp({ path }, frame));
          return;
        }
      }
    }
  }

  function pythonModule(name, rest, dir, frame) {
    if (name === 'build' && !['build.py', 'build/__main__.py', 'build/__init__.py'].some((file) => repo.tracked.has(pathFrom(dir, file) ?? ''))) {
      const parsed = split(['build', ...rest], 1, VALUE_SETS.build);
      pythonBuild(parsed.positional[0] ?? '.', dir, frame);
      return;
    }
    if (PY_COMPILERS.has(name)) {
      for (const token of rest.filter((arg) => !arg.startsWith('-'))) file(token, dir, { ...frame, runKind: 'checks' }, { directories: true });
      return;
    }
    const parts = name.split('.');
    if (parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) return;
    const stem = parts.join('/');
    // From the directory it runs in first; then from each directory a
    // pyproject.toml, setup.py or setup.cfg packages, where an installed
    // package's modules are found wherever the command runs.
    for (const base of [dir, dir ? `${dir}/src` : 'src', ...packagingRoots(repo)]) {
      for (const candidate of [`${stem}.py`, `${stem}/__main__.py`, `${stem}/__init__.py`]) {
        const path = pathFrom(base, candidate);
        if (path != null && repo.tracked.has(path)) {
          record(stamp({ path }, frame));
          return;
        }
      }
    }
    if (PY_TOOLS.has(name)) {
      interpret([name, ...rest], dir, frame);
      return;
    }
    // A package whose __main__.py the repository holds in one place only is
    // the one -m names, wherever the command sets its working directory.
    const mains = repo.filesUnder('').filter((path) => path === `${stem}/__main__.py` || path.endsWith(`/${stem}/__main__.py`));
    if (mains.length === 1) record(stamp({ path: mains[0] }, frame));
  }

  function reparse(argv, dir, frame) {
    if (argv.length > 0) interpret(argv, dir, frame);
  }

  // A wrapper that runs the command after its own flags: npx, uv run, env.
  function wrapped(argv, start, dir, frame, valueFlags, { chdir = [], assignments = false, count = false } = {}) {
    let i = start;
    let cwd = dir;
    for (; i < argv.length; i += 1) {
      const token = argv[i];
      if (token === '--') {
        i += 1;
        break;
      }
      if (assignments && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
      if (!token.startsWith('-')) break;
      const eq = token.indexOf('=');
      const name = eq === -1 ? token : token.slice(0, eq);
      const value = eq !== -1 ? token.slice(eq + 1) : valueFlags.has(name) ? argv[++i] : null;
      if (value != null && chdir.includes(name)) cwd = cleanDir(posix.join(cwd || '.', value)) ?? cwd;
    }
    if (count && /^\d+(\.\d+)?[smhd]?$/.test(argv[i] ?? '')) i += 1;
    reparse(argv.slice(i), cwd, frame);
  }

  // A wheel or sdist packs the files of the package the project names; the
  // build reads them and runs none.
  function pythonBuild(srcdir, dir, frame) {
    const root = pathFrom(dir, srcdir);
    if (root == null) return;
    const manifest = root ? `${root}/pyproject.toml` : 'pyproject.toml';
    if (!repo.tracked.has(manifest)) return;
    const at = (path) => (root ? `${root}/${path}` : path);
    const chain = via(frame, `build ${manifest}`);
    for (const found of wheelPackages(repo.text(manifest), (path) => repo.dirs.has(at(path)))) {
      record(stamp({ path: `${at(found)}/`, directory: true }, { ...frame, runKind: 'checks' }, chain));
    }
  }

  /**
   * docker build, docker buildx build and podman build of a context: the
   * Dockerfile's COPY and ADD sources the image is built from are packed
   * into it (checked, and marked packed: nothing runs them here),
   * its RUN lines are read as commands from the context, and the command line
   * its ENTRYPOINT and CMD start is read as a command the image runs. Returns
   * true when the words are a build.
   */
  function containerBuild(argv, dir, frame) {
    if (argv[0] !== 'docker' && argv[0] !== 'podman') return false;
    const start = argv[1] === 'buildx' ? 2 : 1;
    if (argv[start] !== 'build' && argv[start] !== 'image') return false;
    const from = argv[start] === 'image' ? (argv[start + 1] === 'build' ? start + 2 : -1) : start + 1;
    if (from === -1) return false;
    const parsed = split(argv, from, VALUE_SETS.docker);
    readContainer(parsed.positional[0] ?? '.', valueOf(parsed, '-f', '--file'), dir, frame);
    return true;
  }

  function readContainer(contextArg, fileArg, dir, frame) {
    const context = pathFrom(dir, contextArg);
    if (context == null || (context !== '' && !repo.dirs.has(context))) return;
    const dockerfile = fileArg != null ? pathFrom(dir, fileArg) : context ? `${context}/Dockerfile` : 'Dockerfile';
    if (dockerfile == null || !repo.tracked.has(dockerfile)) return;
    const chain = via(frame, `docker build ${dockerfile}`);
    const checks = { ...frame, runKind: 'checks', packed: true };
    const stages = [];
    let stage = null;
    for (const { op, args } of dockerInstructions(repo.text(dockerfile) ?? '')) {
      if (op === 'FROM') {
        stage = imageStage(instructionWords(args), stages);
        stages.push(stage);
        continue;
      }
      stage ??= imageStage([], stages);
      if (op === 'WORKDIR') stage.workdir = posix.resolve(stage.workdir, instructionWords(args)[0] ?? '.');
      else if (op === 'COPY' || op === 'ADD') {
        const words = instructionWords(args);
        const fromFlag = words.find((word) => word.startsWith('--from='));
        const paths = words.filter((word) => !word.startsWith('--'));
        if (paths.length < 2) continue;
        const dest = posix.resolve(stage.workdir, paths[paths.length - 1]);
        const into = paths[paths.length - 1].endsWith('/') || paths.length > 2;
        if (fromFlag) {
          const source = stages.find((earlier) => earlier.name === fromFlag.slice('--from='.length).toLowerCase());
          if (!source) continue;
          for (const word of paths.slice(0, -1)) {
            const at = posix.resolve(source.workdir, word);
            const file = into && /\.[^/]+$/.test(baseName(at));
            stage.copies.push({ image: file ? posix.join(dest, baseName(at)) : dest, stage: source, path: at });
          }
          continue;
        }
        for (const source of paths.slice(0, -1)) {
          const path = pathFrom(context, source);
          if (path == null) continue;
          if (path !== '' && repo.tracked.has(path)) {
            record(stamp({ path }, checks, chain));
            stage.copies.push({ image: into ? posix.join(dest, baseName(path)) : dest, path });
          } else if (path === '' || repo.dirs.has(path)) {
            if (path !== '') record(stamp({ path: `${path}/`, directory: true }, checks, chain));
            stage.copies.push({ image: dest, path });
          }
        }
      } else if (op === 'RUN' && frame.level === 0) {
        read(args.startsWith('[') ? instructionWords(args).join(' ') : args, context, { level: 1, via: chain, active: frame.active, installed: imageInstalled(stage) });
      } else if (op === 'ENTRYPOINT') stage.entry = { words: instructionWords(args), shell: !args.startsWith('[') };
      else if (op === 'CMD') stage.cmd = instructionWords(args);
    }
    if (stage == null) return;
    // An exec-form ENTRYPOINT is handed the CMD as its arguments; a shell-form
    // one ignores it, as docker does.
    const words = stage.entry ? (stage.entry.shell ? stage.entry.words : [...stage.entry.words, ...(stage.cmd ?? [])]) : stage.cmd ?? [];
    if (words.length === 0) return;
    const placed = words.map((word, index) => (word.startsWith('-') ? word : imageFile(stage, word, index === 0, context) ?? word));
    read(placed.map(shellWord).join(' '), '', { level: frame.level, via: chain, active: frame.active, runKind: frame.runKind, installed: imageInstalled(stage) });
  }

  // The commands the manifests an image holds install, by name: xrpl-camp in
  // a Python image is the console script its pyproject.toml declares, not the
  // bin a package.json beside it declares for npm.
  function imageInstalled(stage) {
    const found = new Map();
    for (const command of repo.commands) {
      if (command.kind !== 'command' || command.path == null || found.has(command.name)) continue;
      if (imageHolds(stage, command.manifest)) found.set(command.name, command.path);
    }
    return found;
  }

  // A manifest a stage copies from the context, or one a stage it copies from
  // holds: a build stage installs the package and the image takes its
  // environment (COPY --from=builder /opt/venv /opt/venv).
  function imageHolds(stage, path, depth = 0) {
    if (depth > 16) return false;
    return stage.copies.some((copy) => {
      if (copy.stage) return imageHolds(copy.stage, path, depth + 1);
      return copy.path === '' || copy.path === path || path.startsWith(`${copy.path}/`);
    });
  }

  // The file a path in the image is, in this repository: through the COPY
  // that put it there, and the stage that COPY took it from, back to the
  // context. A bare program word is looked up by the name a COPY gave it,
  // which is how a script copied onto PATH is started. A relative path no
  // COPY placed is read from the context, where a checkout-shaped image keeps
  // it. Null when the word names no place in the repository.
  function imageFile(stage, word, program, context) {
    if (program && !word.includes('/')) {
      for (let i = stage.copies.length - 1; i >= 0; i -= 1) {
        const copy = stage.copies[i];
        if (copy.stage == null && baseName(copy.image) === word && repo.tracked.has(copy.path)) return copy.path;
      }
      return null;
    }
    if (!word.includes('/') && !/\.[A-Za-z0-9]+$/.test(word)) return null;
    const found = fromImage(stage, posix.resolve(stage.workdir, word), 0);
    if (found != null) return found;
    return word.startsWith('/') ? null : pathFrom(context, word);
  }

  function fromImage(stage, at, depth) {
    if (depth > 16) return null;
    for (let i = stage.copies.length - 1; i >= 0; i -= 1) {
      const copy = stage.copies[i];
      if (at !== copy.image && !at.startsWith(`${copy.image === '/' ? '' : copy.image}/`)) continue;
      const rest = at.slice(copy.image.length).replace(/^\//, '');
      if (copy.stage) return fromImage(copy.stage, rest ? posix.join(copy.path, rest) : copy.path, depth + 1);
      return rest ? (copy.path ? `${copy.path}/${rest}` : rest) : copy.path;
    }
    return null;
  }

  const handlers = {
    node(argv, dir, frame) {
      const parsed = [];
      let test = false;
      let check = false;
      let i = 1;
      for (; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-e' || token === '--eval' || token === '-p' || token === '--print') return;
        if (token === '--test') {
          test = true;
          continue;
        }
        // node -c parses the script and runs none of it.
        if (token === '-c' || token === '--check') {
          check = true;
          continue;
        }
        if (!token.startsWith('-')) break;
        const eq = token.indexOf('=');
        const name = eq === -1 ? token : token.slice(0, eq);
        const value = eq !== -1 ? token.slice(eq + 1) : VALUE_SETS.node.has(name) ? argv[++i] : null;
        if (value != null && ['--import', '--loader', '--experimental-loader', '--require', '-r'].includes(name)) file(value, dir, frame);
      }
      if (check) {
        if (i < argv.length) file(argv[i], dir, { ...frame, runKind: 'checks' });
        return;
      }
      if (!test) {
        const tool = i < argv.length ? nodeModulesTool(argv[i]) : null;
        if (tool != null) interpret([tool, ...argv.slice(i + 1)], dir, frame);
        else if (i < argv.length) file(argv[i], dir, frame, { script: true, args: argv.slice(i + 1) });
        return;
      }
      for (; i < argv.length; i += 1) parsed.push(argv[i]);
      const patterns = parsed.filter((token) => !token.startsWith('-'));
      if (patterns.length === 0) {
        matched(repo.compact(repo.filesMatching(dir, NODE_TEST_DEFAULTS)), frame, 'node --test');
        return;
      }
      for (const pattern of patterns) {
        if (/[*?[{]/.test(pattern)) {
          // A glob over a build's output runs the sources it is built from.
          const found = repo.filesMatching(dir, [pattern]);
          matched(repo.compact(found.length > 0 ? found : repo.builtMatching(dir, [pattern])), frame, null);
        } else file(pattern, dir, frame, { directories: true });
      }
    },
    python(argv, dir, frame) {
      for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        // python -c "..." runs the modules its code imports.
        if (token === '-c') {
          if (i + 1 < argv.length) for (const name of inlineImports(argv[i + 1])) importedModule(name, dir, frame);
          return;
        }
        if (token === '-m') {
          if (i + 1 < argv.length) pythonModule(argv[i + 1], argv.slice(i + 2), dir, frame);
          return;
        }
        if (/^-m./.test(token)) {
          pythonModule(token.slice(2), argv.slice(i + 1), dir, frame);
          return;
        }
        if (token.startsWith('-')) {
          if (VALUE_SETS.python.has(token)) i += 1;
          continue;
        }
        file(token, dir, frame, { script: true, args: argv.slice(i + 1) });
        return;
      }
    },
    shell(argv, dir, frame) {
      let parseOnly = false;
      for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-c') {
          if (i + 1 < argv.length && !parseOnly) read(argv[i + 1], dir, { ...frame });
          return;
        }
        if (token.startsWith('-') || token.startsWith('+')) {
          // sh -n reads the script's commands and runs none of them.
          if (/^-[A-Za-z]*n[A-Za-z]*$/.test(token)) parseOnly = true;
          if (VALUE_SETS.shell.has(token)) i += 1;
          continue;
        }
        if (parseOnly) file(token, dir, { ...frame, runKind: 'checks' });
        else file(token, dir, frame, { script: true, args: argv.slice(i + 1) });
        return;
      }
    },
    pwsh(argv, dir, frame) {
      for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (/^-(c|command)$/i.test(token)) return;
        if (/^-file$/i.test(token)) {
          if (i + 1 < argv.length) file(argv[i + 1], dir, frame);
          return;
        }
        if (token.startsWith('-')) continue;
        file(token, dir, frame);
        return;
      }
    },
    tsx(argv, dir, frame) {
      scriptRunner(argv, dir, frame, VALUE_SETS.tsx, { subcommands: ['watch'], runValues: ['--import', '--require'] });
    },
    'ts-node'(argv, dir, frame) {
      scriptRunner(argv, dir, frame, VALUE_SETS['ts-node'], { runValues: ['-r', '--require'], stopAt: ['-e', '--eval', '-p', '--print'] });
    },
    deno(argv, dir, frame) {
      const sub = argv[1];
      if (sub === 'run') scriptRunner(argv.slice(1), dir, frame, VALUE_SETS.deno);
      else if (sub === 'test') {
        const parsed = split(argv, 2, VALUE_SETS.deno);
        if (parsed.positional.length === 0) matched(repo.compact(repo.filesMatching(dir, ['**/{*_,*.,}test.{ts,tsx,mts,js,mjs,jsx}'])), frame, 'deno test');
        for (const token of parsed.positional) file(token, dir, frame, { directories: true });
      } else if (sub != null && !sub.startsWith('-')) {
        const path = pathFrom(dir, sub);
        if (path != null && repo.tracked.has(path)) file(sub, dir, frame, { script: true });
      }
    },
    bun(argv, dir, frame) {
      const sub = argv[1];
      if (sub === 'x') {
        handlers.npx(['npx', ...argv.slice(2)], dir, frame);
        return;
      }
      if (sub === 'test') {
        const parsed = split(argv, 2, VALUE_SETS.bun);
        if (parsed.positional.length === 0) matched(repo.compact(repo.filesMatching(dir, ['**/*{.test,_test,.spec,_spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'])), frame, 'bun test');
        for (const token of parsed.positional) file(token, dir, frame, { directories: true });
        return;
      }
      const start = sub === 'run' ? 2 : 1;
      const parsed = split(argv, start, VALUE_SETS.bun);
      const target = parsed.positional[0];
      if (target == null) return;
      const path = pathFrom(dir, target);
      if (path != null && repo.tracked.has(path)) file(target, dir, frame, { script: true });
      else if (sub === 'run') npmScript(dir, target, frame);
    },
    npx(argv, dir, frame) {
      let i = 1;
      for (; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-c' || token === '--call') {
          if (i + 1 < argv.length) read(argv[i + 1], dir, { ...frame });
          return;
        }
        if (token === '--') {
          i += 1;
          break;
        }
        if (!token.startsWith('-')) break;
        if (VALUE_SETS.npx.has(token)) i += 1;
      }
      const bin = argv[i];
      if (bin == null) return;
      const path = pathFrom(dir, bin);
      if (path != null && repo.tracked.has(path)) {
        file(bin, dir, frame, { script: true, args: argv.slice(i + 1) });
        return;
      }
      const name = bin.replace(/@[^@/]+$/, '');
      if (toolOf(name) != null) {
        interpret([name, ...argv.slice(i + 1)], dir, frame);
        return;
      }
      const target = binTarget(repo, dir, name);
      if (target != null) {
        record(stamp({ path: target }, frame));
        if (frame.level === 0) readFile(target, dir, frame);
      }
    },
    uv(argv, dir, frame) {
      if (argv[1] === 'build') pythonBuild(split(argv, 2, VALUE_SETS.build).positional[0] ?? '.', dir, frame);
      else if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['uv run'], { chdir: ['--directory'] });
      else if (argv[1] === 'tool' && argv[2] === 'run') wrapped(argv, 3, dir, frame, VALUE_SETS.uvx);
    },
    uvx(argv, dir, frame) {
      wrapped(argv, 1, dir, frame, VALUE_SETS.uvx);
    },
    poetry(argv, dir, frame) {
      if (argv[1] === 'build') pythonBuild('.', dir, frame);
      else if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['poetry run'], { chdir: ['-C', '--directory'] });
    },
    pipx(argv, dir, frame) {
      if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['pipx run']);
    },
    pybuild(argv, dir, frame) {
      if (argv[1] === 'build') pythonBuild('.', dir, frame);
    },
    // pyinstaller bundles the script it is handed into a program that runs
    // it: a binary it builds, which a later step may ship (core/doors.js).
    pyinstaller(argv, dir, frame) {
      for (const token of split(argv, 1, VALUE_SETS.pyinstaller).positional) file(token, dir, { ...frame, builds: true });
    },
    hatch(argv, dir, frame) {
      if (argv[1] === 'build') {
        pythonBuild('.', dir, frame);
        return;
      }
      // hatch run env:script names a script of the project's own, not a command.
      if (argv[1] === 'run' && !(argv[2] ?? '').includes(':')) wrapped(argv, 2, dir, frame, VALUE_SETS['hatch run']);
    },
    coverage(argv, dir, frame) {
      if (argv[1] !== 'run') return;
      const next = [];
      for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-m') {
          if (i + 1 < argv.length) pythonModule(argv[i + 1], argv.slice(i + 2), dir, frame);
          return;
        }
        if (token.startsWith('-')) {
          if (VALUE_SETS.coverage.has(token)) i += 1;
          continue;
        }
        next.push(token);
        break;
      }
      if (next.length > 0) file(next[0], dir, frame, { script: true });
    },
    pytest(argv, dir, frame) {
      const parsed = pathArguments(argv, dir, frame, 'pytest');
      if (parsed.positional.length > 0) return;
      const config = pytestTargets(repo, dir, { config: valueOf(parsed, '-c') });
      const tool = config.config ? `pytest ${config.config}` : 'pytest';
      if (config.testpaths.length > 0) {
        for (const testpath of config.testpaths) {
          if (repo.tracked.has(testpath)) matched([{ path: testpath }], frame, tool);
          else if (repo.dirs.has(testpath)) directoryRuns([testpath], frame, tool);
        }
        return;
      }
      matched(repo.compact(repo.filesMatching(dir, PYTEST_DEFAULTS)), frame, tool);
    },
    ruff(argv, dir, frame) {
      const sub = argv[1];
      if (sub === 'check' || sub === 'format') pathArguments(argv, dir, frame, 'ruff', 2);
      else if (sub == null || sub.startsWith('-') || repo.tracked.has(pathFrom(dir, sub) ?? '') || repo.dirs.has(pathFrom(dir, sub) ?? '\0')) {
        pathArguments(argv, dir, frame, 'ruff', 1);
      }
    },
    mypy(argv, dir, frame) {
      const parsed = pathArguments(argv, dir, frame, 'mypy');
      for (const name of [...(parsed.values.get('-p') ?? []), ...(parsed.values.get('--package') ?? []), ...(parsed.values.get('-m') ?? []), ...(parsed.values.get('--module') ?? [])]) {
        const stem = name.replaceAll('.', '/');
        if (!file(`${stem}.py`, dir, frame)) file(stem, dir, frame, { directories: true });
      }
    },
    checker(argv, dir, frame) {
      pathArguments(argv, dir, frame, baseName(argv[0]));
    },
    tsc(argv, dir, frame) {
      const build = argv[1] === '-b' || argv[1] === '--build';
      const parsed = split(argv, build ? 2 : 1, VALUE_SETS.tsc);
      if (build && parsed.flags.has('--clean')) return;
      const projects = build ? (parsed.positional.length > 0 ? parsed.positional : ['.']) : [valueOf(parsed, '-p', '--project') ?? (parsed.positional.length > 0 ? null : '.')];
      if (!build && projects[0] == null) {
        for (const token of parsed.positional) file(token, dir, frame);
        return;
      }
      for (const project of projects) {
        const found = tscTargets(repo, dir, project, { build });
        if (found.config == null) continue;
        const tool = `tsc ${found.config}`;
        // A compile that emits to an outDir builds what it compiles.
        const emits = tscEmits(repo, found.config, { noEmit: parsed.flags.has('--noEmit'), outDir: valueOf(parsed, '--outDir') != null });
        const next = emits ? { ...frame, runKind: 'executes', built: true } : frame;
        directoryRuns([...found.directories].sort(), next, tool);
        for (const pattern of found.patterns) matched(repo.compact(repo.filesMatching('', pattern.globs, pattern.exclude)), next, tool);
      }
    },
    // next build and next dev run the app's next.config.* and the routes
    // under its app/, src/app/, pages/ and src/pages/; next start serves what
    // a build made, and next lint checks the app.
    next(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.next);
      const [sub, root] = [parsed.positional[0], parsed.positional[1]];
      if (!['build', 'dev', 'lint'].includes(sub)) return;
      const at = root != null ? pathFrom(dir, root) : dir;
      if (at == null) return;
      const chain = via(frame, `next ${sub}`);
      const kind = sub === 'lint' ? { ...frame, runKind: 'checks' } : frame;
      for (const name of ['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts', 'next.config.mts']) {
        const path = pathFrom(at, name);
        if (path != null && repo.tracked.has(path)) record(stamp({ path, matched: true }, kind, chain));
      }
      for (const name of ['app', 'src/app', 'pages', 'src/pages']) {
        const path = pathFrom(at, name);
        if (path != null && repo.dirs.has(path)) record(stamp({ path: `${path}/`, directory: true, matched: true }, kind, chain));
      }
    },
    // turbo run <task...> (or turbo <task...>) runs each task's script in
    // every workspace member that defines it, or in the members --filter
    // selects; the order turbo.json's dependsOn gives them is not this map's
    // to follow, since every member's script runs either way.
    turbo(argv, dir, frame) {
      const start = argv[1] === 'run' ? 2 : 1;
      const parsed = split(argv, start, VALUE_SETS.turbo);
      const filters = [...(parsed.values.get('--filter') ?? []), ...(parsed.values.get('-F') ?? [])];
      const members = filters.length > 0 ? [...new Set(filters.flatMap((selector) => pnpmSelected(repo, selector, dir)))] : workspaceDirs(repo);
      for (const task of parsed.positional) {
        for (const member of members) {
          const scripts = repo.manifest(member)?.scripts;
          if (scripts && typeof scripts[task] === 'string') npmScript(member, task, { ...frame, via: via(frame, `turbo run ${task}`) });
        }
      }
    },
    // tsup builds the entries it is handed, or its config's literal entry
    // list, and runs none of them.
    tsup(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.tsup);
      const next = { ...frame, runKind: 'executes', built: true };
      const entries = parsed.positional.length > 0 ? parsed.positional.map((token) => ({ token, from: dir })) : tsupEntries(repo, dir, valueOf(parsed, '--config'));
      for (const { token, from } of entries) file(token, from, next);
    },
    vitest(argv, dir, frame) {
      const start = ['run', 'watch', 'dev', 'related', 'bench'].includes(argv[1]) ? 2 : 1;
      const parsed = split(argv, start, VALUE_SETS.vitest);
      const found = vitestTargets(repo, dir, { config: valueOf(parsed, '-c', '--config'), root: valueOf(parsed, '-r', '--root') });
      if (found.base == null) return;
      const filters = parsed.positional.map((token) => stripDot(token));
      if (found.projects) {
        // Each project runs its own tests, by its own config or vitest's
        // defaults, from its own directory.
        for (const project of found.projects) {
          const own = vitestTargets(repo, project.dir, { config: project.config, root: null });
          if (own.base == null || own.projects) continue;
          const files = repo.filesMatching(own.base, own.include, own.exclude)
            .filter((path) => filters.length === 0 || filters.some((filter) => path.includes(filter)));
          matched(repo.compact(files), frame, own.config ? `vitest ${own.config}` : `vitest ${found.config}`);
        }
        return;
      }
      const files = repo.filesMatching(found.base, found.include, found.exclude)
        .filter((path) => filters.length === 0 || filters.some((filter) => path.includes(filter)));
      matched(repo.compact(files), frame, found.config ? `vitest ${found.config}` : 'vitest');
    },
    jest(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.jest);
      const found = jestTargets(repo, dir, { config: valueOf(parsed, '-c', '--config') });
      const ignore = found.ignore.map(patternOf);
      const filters = parsed.positional.map(patternOf);
      const files = found.bases.flatMap((base) => repo.filesMatching(base, found.include))
        .filter((path) => !ignore.some((test) => test(`/${path}`)))
        .filter((path) => filters.length === 0 || filters.some((test) => test(path)));
      matched(repo.compact([...new Set(files)]), frame, found.config ? `jest ${found.config}` : 'jest');
    },
    mocha(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.mocha);
      for (const name of ['-r', '--require', '--file']) for (const value of parsed.values.get(name) ?? []) file(value, dir, frame);
      const found = mochaTargets(repo, dir, { config: valueOf(parsed, '--config') });
      const explicit = [...parsed.positional, ...(parsed.values.get('--spec') ?? [])];
      const specs = explicit.length > 0 ? explicit : found.spec;
      const recursive = found.recursive || parsed.flags.has('--recursive');
      const names = found.extensions.map((ext) => ext.replace(/^\./, ''));
      const extensions = names.length === 1 ? names[0] : `{${names.join(',')}}`;
      const files = [];
      for (const spec of specs) {
        const path = pathFrom(dir, stripDot(spec));
        if (path == null) continue;
        if (repo.tracked.has(path)) files.push(path);
        else if (repo.dirs.has(path)) files.push(...repo.filesMatching(path, [recursive ? `**/*.${extensions}` : `*.${extensions}`]));
        else files.push(...repo.filesMatching(dir, [stripDot(spec)]));
      }
      matched(repo.compact([...new Set(files)].filter(isCodePath)), frame, found.config ? `mocha ${found.config}` : 'mocha');
    },
    eslint(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.eslint);
      const found = eslintTargets(repo, dir, { config: valueOf(parsed, '-c', '--config') });
      const ignores = [...found.ignores, ...(parsed.values.get('--ignore-pattern') ?? [])];
      const script = (path) => /\.(?:[cm]?[jt]sx?)$/.test(path);
      const files = [];
      for (const target of parsed.positional.length > 0 ? parsed.positional : ['.']) {
        const path = pathFrom(dir, stripDot(target));
        if (path == null) continue;
        if (repo.tracked.has(path)) files.push(path);
        else if (repo.dirs.has(path)) files.push(...repo.filesMatching(dir, [path === dir ? '**/*' : `${path.slice(dir ? dir.length + 1 : 0)}/**/*`], ignores).filter(script));
        else files.push(...repo.filesMatching(dir, [stripDot(target)], ignores).filter(script));
      }
      matched(repo.compact([...new Set(files)]), frame, found.config ? `eslint ${found.config}` : 'eslint');
    },
    make(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.make);
      const into = valueOf(parsed, '-C', '--directory');
      const cwd = into != null ? cleanDir(posix.join(dir || '.', into)) : dir;
      if (cwd == null || frame.level !== 0) return;
      const named = valueOf(parsed, '-f', '--file', '--makefile');
      const makefile = named != null
        ? pathFrom(cwd, named)
        : ['GNUmakefile', 'makefile', 'Makefile'].map((name) => pathFrom(cwd, name)).find((path) => path != null && repo.tracked.has(path));
      if (makefile == null || !repo.tracked.has(makefile)) return;
      // make -j 4 takes its count apart from the flag; a target is never a number.
      const targets = parsed.positional.filter((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(token) && !/^\d+$/.test(token));
      read(makeRecipes(repo.text(makefile) ?? '', targets), cwd, { level: 1, via: via(frame, makefile), active: frame.active, installed: frame.installed });
    },
    // astro build and its kin run the site's config and the code under its
    // src/, from the site's own directory; astro check only reads them.
    astro(argv, dir, frame) {
      const sub = argv.slice(1).find((arg) => !arg.startsWith('-')) ?? 'dev';
      if (!['build', 'dev', 'preview', 'check', 'sync'].includes(sub)) return;
      const next = sub === 'check' ? { ...frame, runKind: 'checks' } : frame;
      const chain = via(frame, `astro ${sub}`);
      for (const name of ['astro.config.mjs', 'astro.config.ts', 'astro.config.js', 'astro.config.mts', 'astro.config.cjs']) {
        const path = pathFrom(dir, name);
        if (path != null && repo.tracked.has(path)) record(stamp({ path, matched: true }, next, chain));
      }
      const src = pathFrom(dir, 'src');
      if (src != null && repo.dirs.has(src)) record(stamp({ path: `${src}/`, directory: true, matched: true }, next, chain));
    },
    // vite build, and vite and vite dev, run the app's config and the code
    // under its src/: the config --config names, or vite.config.* at the root
    // the command is handed, from the directory it runs in. vite preview
    // only serves what a build made.
    vite(argv, dir, frame) {
      const parsed = split(argv, 1, VALUE_SETS.vite);
      const [sub, root] = ['build', 'dev', 'serve'].includes(parsed.positional[0]) ? [parsed.positional[0], parsed.positional[1]] : parsed.positional[0] === 'preview' ? ['preview', null] : ['dev', parsed.positional[0]];
      if (sub === 'preview') return;
      const at = root != null ? pathFrom(dir, root) : dir;
      if (at == null) return;
      const chain = via(frame, `vite ${sub}`);
      const named = valueOf(parsed, '-c', '--config');
      const configs = named != null ? [pathFrom(dir, named)] : VITE_CONFIGS.map((name) => pathFrom(at, name));
      for (const path of configs) if (path != null && repo.tracked.has(path)) record(stamp({ path, matched: true }, frame, chain));
      // A library's build bundles the entry its config names, and runs none
      // of its code.
      const config = configs.find((path) => path != null && repo.tracked.has(path));
      const library = sub === 'build' && config != null ? viteLibraryEntries(repo.text(config) ?? '') : [];
      const lib = { ...frame, runKind: 'executes', built: true };
      for (const entry of library) {
        const path = pathFrom(posix.dirname(config) === '.' ? '' : posix.dirname(config), entry);
        if (path != null && repo.tracked.has(path)) record(stamp({ path, matched: true }, lib, chain));
      }
      if (library.length > 0) return;
      const src = pathFrom(at, 'src');
      if (src != null && repo.dirs.has(src)) record(stamp({ path: `${src}/`, directory: true, matched: true }, frame, chain));
    },
    wrapper(argv, dir, frame) {
      const name = baseName(argv[0]);
      wrapped(argv, 1, dir, frame, VALUE_SETS[name] ?? new Set(), { assignments: name === 'env', count: name === 'timeout', chdir: name === 'env' ? ['-C', '--chdir'] : [] });
    },
    /**
     * cargo, by subcommand, over the packages it selects (cargoPackages):
     * test and nextest run each test target and every file holding unit
     * tests; run and bench run the binary or benches they name; build,
     * check, clippy, doc, fmt and install compile the targets and run none
     * of them. tauri hands on to the Tauri CLI.
     */
    cargo(argv, dir, frame) {
      let i = 1;
      let cwd = dir;
      if (argv[i]?.startsWith('+')) i += 1;
      for (; i < argv.length && argv[i].startsWith('-'); i += 1) {
        if (argv[i] === '-C' && argv[i + 1] != null) cwd = cleanDir(posix.join(cwd || '.', argv[++i])) ?? cwd;
        else if (CARGO_VALUE_FLAGS.has(argv[i])) i += 1;
      }
      const sub = CARGO_ALIASES[argv[i]] ?? argv[i];
      if (sub == null || cwd == null) return;
      if (sub === 'tauri') {
        handlers.tauri(['tauri', ...argv.slice(i + 1)], cwd, frame);
        return;
      }
      const end = argv.indexOf('--', i + 1);
      const parsed = split(end === -1 ? argv : argv.slice(0, end), sub === 'nextest' ? i + 2 : i + 1, CARGO_VALUE_FLAGS);
      const packages = cargoPackages(repo, cwd, parsed);
      const chain = via(frame, `cargo ${sub}`);
      const targets = (crate) => cargoTargets(repo, crate, sub, parsed);
      // Every subcommand that compiles a crate first runs its build script.
      if (sub !== 'fmt') for (const crate of packages) if (crate.build) record(stamp({ path: crate.build, matched: true }, { ...frame, runKind: 'executes' }, chain));
      if (sub === 'test' || (sub === 'nextest' && argv[i + 1] === 'run')) {
        const files = packages.flatMap((crate) => targets(crate));
        for (const entry of repo.compact([...new Set(files)])) record(stamp({ ...entry, matched: true }, frame, chain));
      } else if (sub === 'run') {
        // --example runs the example of that name of the packages selected,
        // or of any member when cargo is at a virtual workspace's root.
        const example = valueOf(parsed, '--example');
        const project = cargoProject(repo.repoPath, repo.tracked);
        for (const crate of example != null && packages.length === 0 ? project.crates : packages) {
          const path = example != null ? crate.examples.find((item) => exampleTarget(item) === example) : runBinary(crate, valueOf(parsed, '--bin'))?.path;
          if (path) record(stamp({ path }, frame));
        }
      } else if (sub === 'bench') {
        for (const path of packages.flatMap((crate) => crate.benches)) record(stamp({ path, matched: true }, frame, chain));
      } else if (CARGO_CHECKS.has(sub)) {
        const checks = { ...frame, runKind: 'checks' };
        // cargo build makes each binary it compiles, which a later step may
        // ship (core/doors.js); it runs none of them.
        const bins = new Set(sub === 'build' || sub === 'install' ? packages.flatMap((crate) => crate.bins.map((bin) => bin.path)) : []);
        for (const path of [...new Set(packages.flatMap((crate) => targets(crate)))]) record(stamp({ path, matched: true, ...(bins.has(path) ? { builds: true } : {}) }, checks, chain));
      }
    },
    /**
     * The Tauri CLI's build and dev compile the app's Rust half, which a
     * build only compiles and dev runs, after the command tauri.conf.json
     * names to build or serve the web half, run from the directory the web
     * half is in.
     */
    tauri(argv, dir, frame) {
      const sub = ['android', 'ios'].includes(argv[1]) ? argv[2] : argv[1];
      if (sub !== 'build' && sub !== 'dev') return;
      const app = tauriApp(repo, dir);
      if (!app) return;
      const chain = via(frame, `tauri ${sub}`);
      const before = app.config?.build?.[sub === 'build' ? 'beforeBuildCommand' : 'beforeDevCommand'];
      const script = typeof before === 'string' ? before : typeof before?.script === 'string' ? before.script : null;
      const at = typeof before?.cwd === 'string' ? cleanDir(posix.join(app.web || '.', before.cwd)) : app.web;
      if (script && at != null) read(script, at, { level: 1, via: chain, active: frame.active, installed: frame.installed });
      if (!app.crate) return;
      if (app.crate.build) record(stamp({ path: app.crate.build, matched: true }, { ...frame, runKind: 'executes' }, chain));
      const kind = sub === 'build' ? { ...frame, runKind: 'checks' } : frame;
      const bins = app.crate.bins.map((bin) => bin.path);
      const roots = [...bins, ...(sub === 'build' && app.crate.lib ? [app.crate.lib.path] : [])];
      for (const path of roots) record(stamp({ path, matched: true, ...(sub === 'build' && bins.includes(path) ? { builds: true } : {}) }, kind, chain));
    },
    /**
     * Godot, from the project --path names or the directory it runs in: a
     * script --script (or -s) names runs, one GUT's runner (-gdir, -gtest)
     * or gdUnit4's (-a) is handed runs its tests; a scene named on the line,
     * or with nothing else asked of it the project's main scene, runs as the
     * game does. --check-only parses the script and runs none of it, and
     * --import and an export run no script (an export is a send,
     * core/doors.js).
     */
    godot(argv, dir, frame) {
      const parsed = split(argv, 1, GODOT_VALUE_FLAGS);
      const at = valueOf(parsed, '--path') != null ? pathFrom(dir, valueOf(parsed, '--path')) : dir;
      if (at == null) return;
      const projects = godotProjects(repo.repoPath, repo.tracked);
      const project = projects.find((entry) => entry.dir === at) ?? projectOf(projects, at ? `${at}/x` : 'x');
      const place = (text) => (text.startsWith('res://') ? resPath(project, text, repo.tracked) : [pathFrom(at, text), pathFrom(dir, text)].find((path) => path != null && repo.tracked.has(path)) ?? null);
      const script = valueOf(parsed, '--script', '-s');
      const exporting = ['--export-release', '--export-debug', '--export-pack'].some((flag) => parsed.values.has(flag));
      if (exporting || parsed.flags.has('--import') || parsed.flags.has('--editor') || parsed.flags.has('-e') || parsed.flags.has('--version') || parsed.flags.has('--help')) return;
      const checks = parsed.flags.has('--check-only') ? { ...frame, runKind: 'checks' } : frame;
      if (script != null) {
        const path = place(script);
        if (path) record(stamp({ path }, checks));
        // A runner that finds its tests at run time runs each it finds.
        for (const found of path ? repo.discovered?.get(path) ?? [] : []) record(stamp({ path: found, matched: true, foundBy: path }, checks, via(frame, path)));
        const base = path ? posix.basename(path) : posix.basename(script);
        const runner = base === 'gut_cmdln.gd' ? 'gut' : /^GdUnitCmdTool\.gd$/i.test(base) ? 'gdUnit4' : null;
        if (runner) matched(repo.compact(godotTests(repo, project, runner, argv, place)), frame, runner);
        return;
      }
      const scene = parsed.positional.map(place).find((path) => path != null && /\.t?scn$/.test(path)) ?? project?.mainScene ?? null;
      if (scene) record(stamp({ path: scene }, frame));
    },
    // gdlint and gdformat read the scripts they are handed and run none.
    gdtoolkit(argv, dir, frame) {
      const checks = { ...frame, runKind: 'checks' };
      for (const token of argv.slice(1)) if (!token.startsWith('-')) file(token, dir, checks, { directories: true });
    },
    none() {},
  };

  return {
    read,
    program: (path, frame) => file(path, '', frame, { script: true }),
    container: (context, dockerfile, dir, frame) => readContainer(context, dockerfile, dir, frame),
  };
}

const GODOT_BINARY = /^godot(?:[\d.]*|_v[\w.-]+)(?:\.exe)?$/i;
// The flags Godot takes a value after, written apart; GUT and gdUnit4 read
// their own after the script.
const GODOT_VALUE_FLAGS = new Set(['--path', '--script', '-s', '--main-pack', '--render-thread', '--remote-debug', '--position', '--resolution', '--screen', '--display-driver', '--rendering-driver', '--audio-driver', '--xr-mode', '--log-file', '--quit-after', '--export-release', '--export-debug', '--export-pack', '--frame-delay', '--time-scale', '--fixed-fps', '--write-movie', '-a', '--add', '-i', '--ignore', '-c', '--config']);

// The flags cargo and its subcommands take a value after, written apart.
const CARGO_VALUE_FLAGS = new Set([
  '-C', '-Z', '--config', '--color', '-p', '--package', '--manifest-path', '--bin', '--test', '--example', '--bench', '--target',
  '--target-dir', '-F', '--features', '-j', '--jobs', '--profile', '--exclude', '--message-format', '--lockfile-path',
]);
const CARGO_ALIASES = { b: 'build', c: 'check', t: 'test', r: 'run', d: 'doc' };
// The subcommands that compile what they select and run none of it.
const CARGO_CHECKS = new Set(['build', 'check', 'clippy', 'doc', 'fmt', 'install']);

/**
 * The test files a Godot test runner is handed: GUT's -gdir directories
 * (test_*.gd in each, and under it with -ginclude_subdirs) and -gtest files,
 * and gdUnit4's -a paths, a suite being a script that extends
 * GdUnitTestSuite.
 */
function godotTests(repo, project, runner, argv, place) {
  const out = [];
  const under = (dir, deep) => repo.filesUnder(dir).filter((path) => path.endsWith('.gd') && (deep || posix.dirname(path) === dir));
  const directory = (value) => {
    if (project == null) return null;
    const rest = posix.normalize(value.replace(/^res:\/\//, '').replace(/\/+$/, '') || '.');
    if (rest === '..' || rest.startsWith('../')) return null;
    const path = project.dir ? (rest === '.' ? project.dir : `${project.dir}/${rest}`) : rest === '.' ? '' : rest;
    return path === '' || repo.dirs.has(path) ? path : null;
  };
  if (runner === 'gut') {
    const deep = argv.includes('-ginclude_subdirs');
    for (const arg of argv) {
      const option = /^-(gdir|gtest)=(.*)$/.exec(arg);
      if (!option) continue;
      for (const value of option[2].split(',').filter(Boolean)) {
        if (option[1] === 'gtest') {
          const found = place(value);
          if (found) out.push(found);
          continue;
        }
        const dir = directory(value);
        if (dir != null) out.push(...under(dir, deep).filter((path) => posix.basename(path).startsWith('test_')));
      }
    }
    return out;
  }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '-a' && argv[i] !== '--add') continue;
    const value = argv[i + 1] ?? '';
    const found = place(value);
    const dir = found ? null : directory(value);
    const candidates = found ? [found] : dir != null ? under(dir, true) : [];
    out.push(...candidates.filter((path) => /\bextends\s+GdUnitTestSuite\b/.test(repo.text(path) ?? '')));
  }
  return out;
}

/**
 * The crates a cargo command works on, as cargo selects them: those -p
 * names, every member for --workspace (or --all) less --exclude, and
 * otherwise the package whose manifest the command finds from where it runs
 * (--manifest-path, or the nearest Cargo.toml above), or at a virtual
 * workspace's root its default members, all of them when it names none.
 */
function cargoPackages(repo, dir, parsed) {
  const project = cargoProject(repo.repoPath, repo.tracked);
  const named = parsed.values.get('--manifest-path')?.[0];
  let manifest = named != null ? pathFrom(dir, named) : null;
  for (let at = dir; manifest == null; at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') {
    const candidate = at ? `${at}/Cargo.toml` : 'Cargo.toml';
    if (repo.tracked.has(candidate)) manifest = candidate;
    else if (at === '') break;
  }
  if (manifest == null) return [];
  const here = project.crates.find((crate) => crate.manifest === manifest) ?? null;
  const workspace = project.workspaces.find((entry) => entry.manifest === (here ? here.workspace : manifest)) ?? null;
  const members = workspace ? project.crates.filter((crate) => crate.workspace === workspace.manifest) : here ? [here] : [];
  const names = [...(parsed.values.get('-p') ?? []), ...(parsed.values.get('--package') ?? [])];
  if (names.length > 0) return project.crates.filter((crate) => names.includes(crate.name) && (members.length === 0 || members.includes(crate)));
  if (parsed.flags.has('--workspace') || parsed.flags.has('--all')) {
    const excluded = parsed.values.get('--exclude') ?? [];
    return members.filter((crate) => !excluded.includes(crate.name));
  }
  if (here) return [here];
  if (workspace && workspace.defaults.length > 0) {
    const isDefault = picomatch(workspace.defaults);
    return members.filter((crate) => isDefault(crate.dir));
  }
  return members;
}

/**
 * The files a cargo subcommand compiles or runs of one crate: for test,
 * its test targets and every file of the crate holding unit tests; for the
 * commands that only compile, its library and binaries, and its tests,
 * examples and benches too with --all-targets. --lib, --bin and --test
 * narrow either to the target they name.
 */
function cargoTargets(repo, crate, sub, parsed) {
  const owned = (path) => owningCrate(cargoProject(repo.repoPath, repo.tracked), path) === crate;
  const bin = parsed.values.get('--bin') ?? [];
  const tests = parsed.values.get('--test') ?? [];
  const narrowed = parsed.flags.has('--lib') || bin.length > 0 || tests.length > 0;
  const lib = crate.lib && (!narrowed || parsed.flags.has('--lib')) ? [crate.lib.path] : [];
  const bins = crate.bins.filter((entry) => (narrowed ? bin.includes(entry.name) : true)).map((entry) => entry.path);
  const named = crate.tests.filter((path) => tests.includes(posix.basename(path).replace(/\.rs$/, '')) || tests.includes(posix.basename(posix.dirname(path))));
  if (sub === 'test' || sub === 'nextest') {
    const units = !narrowed || parsed.flags.has('--lib') ? [...repo.unitTests].filter(owned) : [];
    return [...(narrowed ? named : crate.tests), ...units].sort();
  }
  if (sub === 'fmt') return [...(crate.lib ? [crate.lib.path] : []), ...crate.bins.map((entry) => entry.path), ...crate.tests, ...crate.examples, ...crate.benches];
  const all = parsed.flags.has('--all-targets');
  return [
    ...lib,
    ...bins,
    ...(narrowed ? named : all || parsed.flags.has('--tests') ? crate.tests : []),
    ...(all || parsed.flags.has('--examples') ? crate.examples : []),
    ...(all || parsed.flags.has('--benches') ? crate.benches : []),
  ];
}

// The name cargo gives an example: examples/x.rs and examples/x/main.rs are x.
function exampleTarget(path) {
  const base = posix.basename(path);
  return base === 'main.rs' ? posix.basename(posix.dirname(path)) : base.replace(/\.rs$/, '');
}

// The binary cargo run starts: the one --bin names, the one default-run
// names, or the package's only one.
function runBinary(crate, name) {
  if (name != null) return crate.bins.find((bin) => bin.name === name) ?? null;
  return crate.bins.find((bin) => bin.name === crate.defaultRun) ?? (crate.bins.length === 1 ? crate.bins[0] : null);
}

/**
 * The Tauri app the Tauri CLI finds from a directory: tauri.conf.json (or
 * Tauri.toml) in its src-tauri/ or in the directory itself, the crate beside
 * it, and the directory the web half is built in, the one the CLI runs from.
 */
function tauriApp(repo, dir) {
  const join = (...parts) => parts.filter(Boolean).join('/');
  for (const confDir of [join(dir, 'src-tauri'), dir]) {
    const conf = ['tauri.conf.json', 'tauri.conf.json5', 'Tauri.toml'].map((name) => join(confDir, name)).find((path) => repo.tracked.has(path));
    if (!conf) continue;
    let config = null;
    if (conf.endsWith('.json')) {
      try {
        config = JSON.parse(repo.text(conf) ?? 'null');
      } catch {
        config = null;
      }
    }
    const crate = cargoProject(repo.repoPath, repo.tracked).crates.find((entry) => entry.dir === confDir) ?? null;
    const parent = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    return { crate, config, web: confDir === dir && posix.basename(dir) === 'src-tauri' ? parent : dir };
  }
  return null;
}

/**
 * What building a container image from a context runs: the Dockerfile's
 * copies, commands and entrypoint, as a docker build step reads them
 * (docker/build-push-action names the context and the file as inputs).
 */
export function readContainer(context, dockerfile, dir, repo) {
  const runs = new Map();
  const reader = makeReader(repo, runs, new Set());
  reader.container(context ?? '.', dockerfile ?? null, dir, { level: 0, via: null, active: new Set() });
  return runs;
}

// A Dockerfile's instructions with their continuation lines joined, comments
// and parser directives left out.
function dockerInstructions(text) {
  const out = [];
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) continue;
    const line = raw.replace(/\s+$/, '');
    if (line.endsWith('\\')) {
      current += `${line.slice(0, -1)} `;
      continue;
    }
    current += line;
    const match = /^\s*([A-Za-z]+)\s+([\s\S]*)$/.exec(current);
    if (match) out.push({ op: match[1].toUpperCase(), args: match[2].trim() });
    current = '';
  }
  return out;
}

// An instruction's words: its JSON array when it is written as one, else its
// words as the shell splits them.
function instructionWords(args) {
  if (args.startsWith('[')) {
    try {
      const list = JSON.parse(args);
      if (Array.isArray(list)) return list.filter((word) => typeof word === 'string');
    } catch {
      // Not JSON, so the shell form.
    }
  }
  return commandLines(args)[0] ?? [];
}

function baseName(word) {
  return word.slice(word.lastIndexOf('/') + 1);
}

// A FROM starts a stage. One built FROM an earlier stage starts from what that
// stage holds: its WORKDIR, its copies and what it starts.
function imageStage(words, stages) {
  const plain = words.filter((word) => !word.startsWith('--'));
  const base = plain[0] != null ? stages.find((earlier) => earlier.name === plain[0].toLowerCase()) : null;
  const name = plain.length >= 3 && plain[1].toLowerCase() === 'as' ? plain[2].toLowerCase() : null;
  return { name, workdir: base?.workdir ?? '/', copies: [...(base?.copies ?? [])], entry: base?.entry ?? null, cmd: base?.cmd ?? null };
}

// The modules the code handed to python -c imports, in order.
function inlineImports(code) {
  const names = [];
  for (const match of String(code).matchAll(/(?:^|[;\n])\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\b|import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*))/g)) {
    if (match[1]) names.push(match[1]);
    else for (const name of match[2].split(',')) names.push(name.trim());
  }
  return [...new Set(names)];
}

// A word as the shell would read it back as one word.
function shellWord(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

// A run carries the chain that reached it, and whether the tool that reached
// it runs the file or only reads it to check it.
function stamp(entry, frame, via = frame.via) {
  const out = { ...entry, runKind: frame.runKind ?? 'executes' };
  if (via) out.via = via;
  if (frame.builds) out.builds = true;
  if (frame.built) out.built = true;
  if (frame.packed) out.packed = true;
  return out;
}

// The entries a tsup config lists as string literals: entry: ['src/index.ts']
// or entry: { index: 'src/index.ts' }, relative to the config's directory.
function tsupEntries(repo, dir, named) {
  const names = named != null ? [named] : ['tsup.config.ts', 'tsup.config.mts', 'tsup.config.cts', 'tsup.config.js', 'tsup.config.mjs', 'tsup.config.cjs', 'tsup.config.json'];
  for (const name of names) {
    const path = pathFrom(dir, name);
    if (path == null || !repo.tracked.has(path)) continue;
    const text = repo.text(path) ?? '';
    const at = text.search(/\bentry["']?\s*:/);
    if (at === -1) return [];
    const open = text.slice(at).search(/[[{'"]/);
    if (open === -1) return [];
    const start = at + open;
    const end = text[start] === '[' ? text.indexOf(']', start) : text[start] === '{' ? text.indexOf('}', start) : text.indexOf(text[start], start + 1);
    const body = text.slice(start, end === -1 ? undefined : end + 1);
    const from = posix.dirname(path) === '.' ? '' : posix.dirname(path);
    return [...body.matchAll(/['"]([^'"]+\.[cm]?[jt]sx?)['"]/g)].map((match) => ({ token: match[1], from }));
  }
  return [];
}

// The entries a vite config's build.lib names as string literals, or none
// when it builds no library.
function viteLibraryEntries(text) {
  const at = text.search(/\blib\s*:\s*\{/);
  if (at === -1) return [];
  const open = text.indexOf('{', at);
  const close = closingBrace(text, open);
  const body = text.slice(open, close === -1 ? undefined : close + 1);
  const entry = body.search(/\bentry\s*:/);
  if (entry === -1) return [];
  const rest = body.slice(entry);
  const stop = rest.search(/,\s*[A-Za-z_]+\s*:|}\s*$/);
  return [...(stop === -1 ? rest : rest.slice(0, stop)).matchAll(/['"]([^'"]+\.[cm]?[jt]sx?)['"]/g)].map((match) => match[1]);
}

// The rule a tool's first word selects, or null for a word this reader does
// not know.
function toolOf(word) {
  if (typeof word !== 'string' || word === '') return null;
  const name = word.includes('/') ? word.slice(word.lastIndexOf('/') + 1) : word;
  // Godot is a binary a job downloads and runs by its path, ~/godot/godot or
  // Godot_v4.7-stable_linux.x86_64; it is never a file of the repository.
  if (GODOT_BINARY.test(name)) return 'godot';
  // A path to a tool's binary is the tool; a path to a tracked file is not.
  if (word.includes('/') && !word.includes('node_modules/.bin/')) return null;
  if (name === 'node' || name === 'nodejs') return 'node';
  if (/^python(\d+(\.\d+)*)?$/.test(name) || name === 'py') return 'python';
  if (SHELLS.has(name)) return 'shell';
  if (name === 'pwsh' || name === 'powershell') return 'pwsh';
  if (name === 'py.test' || name === 'pytest') return 'pytest';
  if (['black', 'flake8', 'pylint', 'bandit'].includes(name)) return 'checker';
  if (['timeout', 'env', 'sudo', 'xargs', 'nice', 'nohup'].includes(name)) return 'wrapper';
  if (name === 'bunx') return 'npx';
  if (name === 'pyinstaller') return 'pyinstaller';
  if (name === 'poetry' || name === 'flit' || name === 'pdm') return name === 'poetry' ? 'poetry' : 'pybuild';
  if (name === 'gmake') return 'make';
  if (name === 'tox') return 'none';
  if (name === 'gdlint' || name === 'gdformat') return 'gdtoolkit';
  if (name === 'cargo') return 'cargo';
  if (name === 'tauri') return 'tauri';
  const known = ['tsx', 'ts-node', 'deno', 'bun', 'npx', 'uv', 'uvx', 'poetry', 'pipx', 'hatch', 'coverage', 'ruff', 'mypy', 'tsc', 'tsup', 'turbo', 'next', 'vitest', 'jest', 'mocha', 'eslint', 'make', 'astro', 'vite'];
  return known.includes(name) ? name : null;
}

/**
 * The tool a script under node_modules is, named by its file or its package:
 * node node_modules/tsx/dist/cli.mjs x.ts is tsx running x.ts, and node
 * node_modules/vitest/vitest.mjs run is vitest. Null for any other script.
 */
function nodeModulesTool(token) {
  const at = token.lastIndexOf('node_modules/');
  if (at === -1) return null;
  const rest = token.slice(at + 'node_modules/'.length).split('/');
  const pkg = rest[0]?.startsWith('@') ? rest[1] : rest[0];
  const base = rest[rest.length - 1].replace(/\.[cm]?js$/, '');
  if (pkg === 'typescript' && base === 'tsc') return 'tsc';
  return [base, pkg].find((name) => name && toolOf(name) != null && toolOf(name) !== 'none') ?? null;
}

/**
 * The tracked file a package binary name starts, through the bin field of the
 * manifest in the command's directory, the root manifest, or a workspace's.
 */
function binTarget(repo, dir, name) {
  const dirs = [dir, '', ...workspaceDirs(repo)];
  for (const found of [...new Set(dirs)]) {
    const pkg = repo.manifest(found);
    if (!pkg) continue;
    let target = null;
    if (typeof pkg.bin === 'string' && typeof pkg.name === 'string' && pkg.name.replace(/^@[^/]+\//, '') === name) target = pkg.bin;
    else if (pkg.bin && typeof pkg.bin === 'object' && typeof pkg.bin[name] === 'string') target = pkg.bin[name];
    if (target == null) continue;
    const path = pathFrom(found, stripDot(target));
    if (path != null && repo.tracked.has(path)) return path;
  }
  return null;
}

// A jest pattern is a regular expression over the path; one that does not
// compile is matched as text.
function patternOf(pattern) {
  try {
    const re = new RegExp(pattern);
    return (path) => re.test(path);
  } catch {
    return (path) => path.includes(pattern);
  }
}

// The deepest directory every path is under, with its trailing slash, or ''
// for the repository root.
function commonDirectory(paths) {
  let common = paths[0].split('/').slice(0, -1);
  for (const path of paths.slice(1)) {
    const parts = path.split('/').slice(0, -1);
    let i = 0;
    while (i < common.length && i < parts.length && common[i] === parts[i]) i += 1;
    common = common.slice(0, i);
  }
  return common.length > 0 ? `${common.join('/')}/` : '';
}

function isShellScript(path, repo) {
  if (/\.(?:sh|bash)$/.test(path)) return true;
  if (/\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf('/') + 1))) return false;
  const text = repo.text(path) ?? '';
  return /^#!.*\b(?:ba|z|da|k)?sh\b/.test(text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n')));
}

function addValue(values, name, value) {
  if (!values.has(name)) values.set(name, []);
  values.get(name).push(value);
}

/**
 * Split shell text into simple commands, each a list of words with their
 * quotes removed. Operators inside quotes do not split: the parentheses in
 * node -p "require('./package.json')" are JavaScript, and splitting there
 * would make ./package.json look like a command. A here-document body is
 * input to its command, not shell, so it is skipped.
 *
 * Given a set, each word holding a glob character outside quotes (*, ? or
 * [), which a shell would expand, is added to it; a glob in quotes reaches
 * the program as written, and is not.
 */
export function commandLines(text, globs = null) {
  const lines = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let globbed = false;
  const endWord = () => {
    if (inWord) words.push(word);
    if (inWord && globbed && globs) globs.add(word);
    word = '';
    inWord = false;
    globbed = false;
  };
  const endLine = () => {
    endWord();
    if (words.length > 0) lines.push(words);
    words = [];
  };
  const source = withoutHeredocBodies(text);
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      continue;
    }
    if (ch === '$' && source[i + 1] === '(') {
      const end = closingParen(source, i + 1);
      lines.push(...commandLines(source.slice(i + 2, end)));
      word += '$()';
      inWord = true;
      i = end;
      continue;
    }
    if (ch === '$' && source[i + 1] === '{') {
      const end = closingBrace(source, i + 1);
      word += source.slice(i, end + 1);
      inWord = true;
      i = end;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '\\' && i + 1 < source.length) word += source[++i];
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
    } else if (ch === '\\') {
      if (source[i + 1] === '\n') i += 1;
      else if (source[i + 1] === '\r' && source[i + 2] === '\n') i += 2;
      else if (i + 1 < source.length) {
        word += source[++i];
        inWord = true;
      }
    } else if (ch === '#' && !inWord) {
      while (i + 1 < source.length && source[i + 1] !== '\n') i += 1;
    } else if (/\s/.test(ch)) {
      if (ch === '\n') endLine();
      else endWord();
    } else if (ch === '(' && inWord && /^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(word)) {
      // NAME=( a b c ) is an array of values, one word; the lines inside it
      // are no commands (a list of manifests jq later reads).
      const end = closingParen(source, i);
      word += '()';
      i = end;
    } else if (';&|()`{}'.includes(ch)) {
      endLine();
    } else {
      if (ch === '*' || ch === '?' || ch === '[') globbed = true;
      word += ch;
      inWord = true;
    }
  }
  endLine();
  return lines;
}

// A parameter expansion is one word, braces and all, and ${{ }} nests.
function closingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

// A command substitution is a command of its own, and its quotes are its
// own: the double quotes inside "$(node -p "...")" do not close the outer ones.
function closingParen(source, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
    } else if (ch === '\\') {
      i += 1;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === '$' && source[i + 1] === '(') i = closingParen(source, i + 1);
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function withoutHeredocBodies(text) {
  const kept = [];
  let delimiter = null;
  for (const line of text.split(/\r?\n/)) {
    if (delimiter != null) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    kept.push(line);
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (heredoc) delimiter = heredoc[2];
  }
  return kept.join('\n');
}

// One shell command, already split into tokens. Returns the package
// directories and script names npm, pnpm or yarn would run for it, or nothing
// when the command is not a package script invocation. The first manager word
// on the line is the one that runs, so `cross-env X=1 pnpm test` is pnpm's.
function npmTargets(tokens, dir, repo) {
  const start = tokens.findIndex((token) => PACKAGE_RUNNERS.has(token));
  if (start === -1) return [];
  const manager = tokens[start];
  if (manager === 'pnpm') return pnpmTargets(tokens.slice(start + 1), dir, repo);
  if (manager === 'yarn') return yarnTargets(tokens.slice(start + 1), dir, repo);
  return npmCommandTargets(tokens.slice(start + 1), dir, repo);
}

function npmCommandTargets(args, dir, repo) {
  let prefix = dir;
  let command = null;
  let script = null;
  let allWorkspaces = false;
  let includeRoot = false;
  const named = [];
  let passed = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--') {
      if (script != null) passed.push(...args.slice(i + 1));
      break;
    }
    // npm reads its own flags anywhere before --; a word after the script's
    // name is the script's.
    if (script != null && !token.startsWith('-')) {
      passed.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    const flag = token.startsWith('-') && eq !== -1 ? token.slice(0, eq) : token;
    if (NPM_VALUE_FLAGS.has(flag)) {
      const value = eq !== -1 && token.startsWith('-') ? token.slice(eq + 1) : args[++i];
      if (value == null) break;
      if (flag === '--prefix') {
        const cleaned = cleanDir(posix.join(dir || '.', value));
        if (cleaned == null) return [];
        prefix = cleaned;
      } else named.push(value);
      continue;
    }
    if (token === '--workspaces' || token === '-ws') allWorkspaces = true;
    else if (token === '--include-workspace-root') includeRoot = true;
    else if (token.startsWith('-')) continue;
    else if (command == null) command = token;
    else if (script == null && RUN_ALIASES.has(command)) script = token;
  }
  if (TEST_ALIASES.has(command)) script = 'test';
  else if (LIFECYCLE.has(command)) script = command;
  else if (!RUN_ALIASES.has(command) || script == null) return [];

  let dirs;
  if (allWorkspaces) dirs = workspaceDirs(repo);
  else if (named.length > 0) dirs = named.map((value) => workspaceDir(repo, value, prefix)).filter((found) => found != null);
  else dirs = [prefix];
  if (includeRoot && (allWorkspaces || named.length > 0)) dirs = [prefix, ...dirs];
  if (!RUN_ALIASES.has(command)) passed = [];
  return [...new Set(dirs)].map((target) => ({ dir: target, script, ...(passed.length > 0 ? { args: passed } : {}) }));
}

// pnpm's own commands. Any other first word is a script of the package, which
// pnpm runs as it runs `pnpm run` (pnpm audit is pnpm's, even beside a script
// named audit).
const PNPM_COMMANDS = new Set([
  'add', 'approve-builds', 'audit', 'bin', 'cat-file', 'cat-index', 'config', 'create', 'dedupe', 'deploy', 'dlx', 'doctor',
  'env', 'exec', 'fetch', 'find-hash', 'i', 'import', 'init', 'install', 'install-test', 'it', 'licenses', 'link', 'list', 'ln',
  'login', 'logout', 'ls', 'outdated', 'pack', 'patch', 'patch-commit', 'patch-remove', 'prune', 'publish', 'rb', 'rebuild',
  'remove', 'rm', 'root', 'self-update', 'server', 'setup', 'store', 'un', 'uninstall', 'unlink', 'up', 'update', 'upgrade',
  'why', 'x',
]);
const PNPM_VALUE_FLAGS = new Set(['--filter', '-F', '--filter-prod', '-C', '--dir', '--workspace-concurrency', '--reporter', '--changed-files-ignore-pattern', '--test-pattern', '--loglevel']);

/**
 * pnpm [flags] [run] <script>: -r and --recursive run it in every workspace
 * member, --filter (and -F) in the members a selector names, -C and --dir
 * from another directory, and -w at the workspace root. A selector is a
 * member's name or a glob over names, a ./path or {path} to a member, and a
 * name with ... around it, whose dependents and dependencies this map does
 * not follow, so it stands for the member it names.
 */
function pnpmTargets(args, dir, repo) {
  let prefix = dir;
  let command = null;
  let script = null;
  let recursive = false;
  const filters = [];
  for (let i = 0; i < args.length && script == null; i += 1) {
    const token = args[i];
    if (token === '--') break;
    const eq = token.indexOf('=');
    const flag = token.startsWith('-') && eq !== -1 ? token.slice(0, eq) : token;
    if (PNPM_VALUE_FLAGS.has(flag)) {
      const value = eq !== -1 && token.startsWith('-') ? token.slice(eq + 1) : args[++i];
      if (value == null) break;
      if (flag === '-C' || flag === '--dir') {
        const cleaned = cleanDir(posix.join(dir || '.', value));
        if (cleaned == null) return [];
        prefix = cleaned;
      } else if (flag === '--filter' || flag === '-F' || flag === '--filter-prod') filters.push(value);
      continue;
    }
    if (token === '-r' || token === '--recursive') recursive = true;
    else if (token.startsWith('-')) continue;
    else if (command == null) command = token;
    else if (RUN_ALIASES.has(command)) script = token;
  }
  if (command == null) return [];
  if (TEST_ALIASES.has(command)) script = 'test';
  else if (!RUN_ALIASES.has(command)) {
    if (PNPM_COMMANDS.has(command)) return [];
    script = command;
  }
  if (script == null) return [];
  let dirs = [prefix];
  if (filters.length > 0) dirs = filters.flatMap((selector) => pnpmSelected(repo, selector, prefix));
  else if (recursive) dirs = workspaceDirs(repo);
  return [...new Set(dirs)].map((target) => ({ dir: target, script }));
}

/**
 * Where a tool's name stands in pnpm <name> and yarn <name> when the package
 * has no script of that name: both run the package binary of that name, as
 * pnpm exec does. Null for a script, one of the manager's own commands, a
 * word this map knows no tool for, and a command moved to another member.
 */
function runnerBinary(argv, dir, repo) {
  if (argv[0] !== 'pnpm' && argv[0] !== 'yarn') return null;
  const own = argv[0] === 'pnpm' ? PNPM_COMMANDS : YARN_COMMANDS;
  let i = 1;
  for (; i < argv.length && argv[i].startsWith('-'); i += 1) {
    const flag = argv[i].split('=')[0];
    if (['-C', '--dir', '--filter', '-F', '--filter-prod', '--cwd', '-r', '--recursive'].includes(flag)) return null;
    if (!argv[i].includes('=') && PNPM_VALUE_FLAGS.has(flag)) i += 1;
  }
  const command = argv[i];
  if (command == null || own.has(command) || RUN_ALIASES.has(command) || TEST_ALIASES.has(command) || LIFECYCLE.has(command)) return null;
  const scripts = repo.manifest(dir)?.scripts;
  if (scripts && typeof scripts === 'object' && typeof scripts[command] === 'string') return null;
  return toolOf(command) != null ? i : null;
}

function pnpmSelected(repo, selector, prefix) {
  const bare = selector.replace(/^!/, '').replace(/^\.\.\./, '').replace(/\.\.\.$/, '').replace(/^\^/, '');
  if (selector.startsWith('!') || bare === '') return [];
  const path = /^\{(.+)\}$/.exec(bare)?.[1] ?? (bare.startsWith('.') ? bare : null);
  if (path != null) {
    const found = cleanDir(posix.join(prefix || '.', path));
    return found != null && (workspaceMembers(repo).has(found) || found === '') ? [found] : [];
  }
  const isMatch = picomatch(bare);
  return [...workspaceMembers(repo)].filter(([, name]) => name != null && isMatch(name)).map(([found]) => found);
}

// yarn's own commands, across v1 and berry; any other first word is a script.
const YARN_COMMANDS = new Set([
  'add', 'audit', 'autoclean', 'bin', 'cache', 'check', 'config', 'constraints', 'create', 'dedupe', 'dlx', 'exec', 'explain',
  'generate-lock-entry', 'global', 'import', 'info', 'init', 'install', 'licenses', 'link', 'list', 'login', 'logout', 'node',
  'npm', 'outdated', 'owner', 'pack', 'patch', 'patch-commit', 'plugin', 'policies', 'publish', 'rebuild', 'remove', 'search',
  'set', 'stage', 'tag', 'team', 'unlink', 'unplug', 'up', 'upgrade', 'upgrade-interactive', 'version', 'versions', 'why',
]);

/**
 * yarn [run] <script>, yarn workspace <name> <script> in the member it
 * names, and yarn workspaces run <script> (v1) or yarn workspaces foreach
 * run <script> (berry) in every member. --cwd moves the command.
 */
function yarnTargets(args, dir, repo) {
  let prefix = dir;
  const words = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--') break;
    if (token === '--cwd') {
      const cleaned = cleanDir(posix.join(dir || '.', args[++i] ?? ''));
      if (cleaned == null) return [];
      prefix = cleaned;
      continue;
    }
    if (token.startsWith('--cwd=')) {
      const cleaned = cleanDir(posix.join(dir || '.', token.slice('--cwd='.length)));
      if (cleaned == null) return [];
      prefix = cleaned;
      continue;
    }
    if (words.length === 0 && token.startsWith('-')) continue;
    words.push(token);
  }
  const [command, ...rest] = words;
  if (command == null) return [];
  if (command === 'workspace') {
    const member = rest[0] == null ? null : workspaceDir(repo, rest[0], prefix);
    return member == null ? [] : yarnTargets(rest.slice(1), member, repo);
  }
  if (command === 'workspaces') {
    const at = rest.indexOf('run');
    const script = at === -1 ? null : rest.slice(at + 1).find((token) => !token.startsWith('-'));
    return script == null ? [] : workspaceDirs(repo).map((target) => ({ dir: target, script }));
  }
  let script = command;
  if (RUN_ALIASES.has(command)) script = rest.find((token) => !token.startsWith('-')) ?? null;
  else if (TEST_ALIASES.has(command)) script = 'test';
  else if (YARN_COMMANDS.has(command)) return [];
  return script == null ? [] : [{ dir: prefix, script }];
}

function workspaceMembers(repo) {
  return repo.workspaces();
}

function readWorkspaces(repo) {
  const members = new Map();
  const globs = [...workspaceGlobs(repo.manifest('')), ...pnpmWorkspaceGlobs(repo.text('pnpm-workspace.yaml'))];
  if (globs.length === 0) return members;
  const included = globs.filter((glob) => !glob.startsWith('!'));
  const excluded = globs.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1));
  const isMatch = picomatch(included, { dot: true });
  const isExcluded = excluded.length > 0 ? picomatch(excluded, { dot: true }) : () => false;
  for (const path of [...repo.tracked].sort()) {
    if (!path.endsWith('/package.json')) continue;
    const dir = path.slice(0, -'/package.json'.length);
    if (!isMatch(dir) || isExcluded(dir)) continue;
    const pkg = repo.manifest(dir);
    members.set(dir, pkg && typeof pkg.name === 'string' ? pkg.name : null);
  }
  return members;
}

// The members pnpm-workspace.yaml lists, with a ! glob excluding.
function pnpmWorkspaceGlobs(text) {
  if (typeof text !== 'string') return [];
  let doc;
  try {
    doc = parseYaml(text);
  } catch {
    return [];
  }
  const list = Array.isArray(doc?.packages) ? doc.packages : [];
  return list.filter((glob) => typeof glob === 'string').map((glob) => glob.replace(/^(!?)\.\//, '$1').replace(/\/+$/, ''));
}

function workspaceDirs(repo) {
  return [...workspaceMembers(repo).keys()];
}

function workspaceDir(repo, value, prefix) {
  for (const [dir, name] of workspaceMembers(repo)) if (name === value) return dir;
  const asPath = cleanDir(posix.join(prefix || '.', value));
  return asPath != null && workspaceMembers(repo).has(asPath) ? asPath : null;
}

export function workspaceGlobs(pkg) {
  const workspaces = pkg?.workspaces;
  const list = Array.isArray(workspaces) ? workspaces : Array.isArray(workspaces?.packages) ? workspaces.packages : [];
  return list.filter((glob) => typeof glob === 'string').map((glob) => glob.replace(/^\.\//, '').replace(/\/+$/, ''));
}

export function cleanDir(dir) {
  if (typeof dir !== 'string') return null;
  const normalized = posix.normalize(dir.replaceAll('\\', '/')).replace(/\/+$/, '');
  if (normalized === '.' || normalized === '') return '';
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('${{')) {
    return null;
  }
  return normalized;
}

function pathFrom(dir, token) {
  if (!token || token.startsWith('/') || token.includes('://')) return null;
  const path = posix.normalize(dir ? `${dir}/${token}` : token).replace(/\/+$/, '');
  if (path === '..' || path.startsWith('../')) return null;
  return path === '.' ? '' : path;
}
