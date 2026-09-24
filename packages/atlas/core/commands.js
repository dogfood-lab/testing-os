import { readFileSync } from 'node:fs';
import { join as joinFs, posix } from 'node:path';
import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';
import { isCodePath } from './languages.js';
import { wheelPackages } from './python-manifest.js';
import {
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
// whether or not it emits, since a compiler runs none of the code it builds.
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
const VALUE_SETS = Object.fromEntries(Object.entries(VALUES).map(([tool, flags]) => [tool, new Set(flags)]));

/**
 * The tracked files and directories a repository holds, the files each
 * directory holds, and the package manifests, read once per map.
 *
 * builtFrom, when given, is the tracked source a path a build emits is
 * compiled from (core/resolve.js resolveDeclaredPath), or null: a command
 * that runs dist/cli.js runs the CLI src/cli.ts is built into.
 */
export function repositoryView({ repoPath, tracked, spawned = new Map(), commands = [], builtFrom = () => null }) {
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
    tracked,
    dirs,
    spawned,
    installed,
    commands,
    builtFrom,
    text(path) {
      if (!tracked.has(path)) return null;
      if (!texts.has(path)) {
        let text = null;
        try {
          text = readFileSync(joinFs(repoPath, path), 'utf8');
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

/**
 * Read one piece of level-0 command text run from `dir`.
 * Returns the runs keyed by path, and the tracked files it mentions.
 */
export function readCommands(text, dir, repo) {
  const runs = new Map();
  const mentions = new Set();
  const reader = makeReader(repo, runs, mentions);
  reader.read(text, dir, { level: 0, via: null, active: new Set() });
  for (const path of runs.keys()) mentions.delete(path);
  return { runs, mentions };
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
  const passes = (a.passes ?? []).filter((flag) => (b.passes ?? []).includes(flag));
  const out = { ...pick, runKind };
  delete out.passes;
  if (passes.length > 0) out.passes = passes;
  return out;
}

// The flags handed to a script after its path, by name: --check=x is --check.
function flagsOf(args) {
  return [...new Set(args.filter((arg) => /^--?[A-Za-z]/.test(arg)).map((arg) => arg.replace(/=.*$/, '')))].sort();
}

function makeReader(repo, runs, mentions) {
  const record = (entry) => {
    const existing = runs.get(entry.path);
    runs.set(entry.path, existing ? better(existing, entry) : entry);
  };

  function read(text, dir, frame) {
    if (frame.level === 0) {
      for (const piece of text.split(/[\s"'`()[\]{}<>|;&,=:]+/)) {
        const path = pathFrom(dir, piece.replace(/\.+$/, ''));
        if (path != null && repo.tracked.has(path)) mentions.add(path);
      }
    }
    // cd moves the rest of the text; a directory this repository does not
    // track, or one set at run time, names nowhere its files can be read from.
    let here = dir;
    for (const tokens of commandLines(text)) {
      if (tokens[0] === 'cd' || tokens[0] === 'pushd') here = movedTo(here, tokens.slice(1));
      else if (tokens[0] === 'popd') here = dir;
      else if (here != null) line(tokens, here, frame);
    }
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
    for (const target of npmTargets(tokens, dir, repo)) npmScript(target.dir, target.script, frame);
    const argv = tokens.slice(first);
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

  function npmScript(target, script, frame) {
    const key = `${target}\0${script}`;
    if (frame.active.has(key)) return;
    const pkg = repo.manifest(target);
    const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts != null ? pkg.scripts : null;
    if (!scripts) return;
    frame.active.add(key);
    for (const name of [`pre${script}`, script, `post${script}`]) {
      if (typeof scripts[name] === 'string') read(scripts[name], target, frame);
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
    const next = { level: 1, via: via(frame, path), active: frame.active, installed: frame.installed };
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
    for (const base of [dir, dir ? `${dir}/src` : 'src']) {
      for (const candidate of [`${stem}.py`, `${stem}/__main__.py`, `${stem}/__init__.py`]) {
        const path = pathFrom(base, candidate);
        if (path != null && repo.tracked.has(path)) {
          record(stamp({ path }, frame));
          return;
        }
      }
    }
    if (PY_TOOLS.has(name)) interpret([name, ...rest], dir, frame);
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
   * Dockerfile's COPY and ADD sources the image is built from are checked,
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
    const checks = { ...frame, runKind: 'checks' };
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
        if (i < argv.length) file(argv[i], dir, frame, { script: true, args: argv.slice(i + 1) });
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
          const base = dir;
          matched(repo.compact(repo.filesMatching(base, [pattern])), frame, null);
        } else file(pattern, dir, frame, { directories: true });
      }
    },
    python(argv, dir, frame) {
      for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-c') return;
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
    // pyinstaller bundles the script it is handed into a program that runs it.
    pyinstaller(argv, dir, frame) {
      for (const token of split(argv, 1, VALUE_SETS.pyinstaller).positional) file(token, dir, frame);
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
        directoryRuns([...found.directories].sort(), frame, tool);
        for (const pattern of found.patterns) matched(repo.compact(repo.filesMatching('', pattern.globs, pattern.exclude)), frame, tool);
      }
    },
    vitest(argv, dir, frame) {
      const start = ['run', 'watch', 'dev', 'related', 'bench'].includes(argv[1]) ? 2 : 1;
      const parsed = split(argv, start, VALUE_SETS.vitest);
      const found = vitestTargets(repo, dir, { config: valueOf(parsed, '-c', '--config'), root: valueOf(parsed, '-r', '--root') });
      if (found.base == null) return;
      const filters = parsed.positional.map((token) => stripDot(token));
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
    wrapper(argv, dir, frame) {
      const name = baseName(argv[0]);
      wrapped(argv, 1, dir, frame, VALUE_SETS[name] ?? new Set(), { assignments: name === 'env', count: name === 'timeout', chdir: name === 'env' ? ['-C', '--chdir'] : [] });
    },
    none() {},
  };

  return {
    read,
    program: (path, frame) => file(path, '', frame, { script: true }),
    container: (context, dockerfile, dir, frame) => readContainer(context, dockerfile, dir, frame),
  };
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

// A word as the shell would read it back as one word.
function shellWord(word) {
  return /^[\w@%+=:,./-]+$/.test(word) ? word : `'${word.replaceAll("'", "'\\''")}'`;
}

// A run carries the chain that reached it, and whether the tool that reached
// it runs the file or only reads it to check it.
function stamp(entry, frame, via = frame.via) {
  const out = { ...entry, runKind: frame.runKind ?? 'executes' };
  if (via) out.via = via;
  return out;
}

// The rule a tool's first word selects, or null for a word this reader does
// not know.
function toolOf(word) {
  if (typeof word !== 'string' || word === '') return null;
  const name = word.includes('/') ? word.slice(word.lastIndexOf('/') + 1) : word;
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
  if (['tox', 'cargo'].includes(name)) return 'none';
  const known = ['tsx', 'ts-node', 'deno', 'bun', 'npx', 'uv', 'uvx', 'poetry', 'pipx', 'hatch', 'coverage', 'ruff', 'mypy', 'tsc', 'vitest', 'jest', 'mocha', 'eslint', 'make', 'astro'];
  return known.includes(name) ? name : null;
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
 */
export function commandLines(text) {
  const lines = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
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
    } else if (';&|()`{}'.includes(ch)) {
      endLine();
    } else {
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
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--') break;
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
  return [...new Set(dirs)].map((target) => ({ dir: target, script }));
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
