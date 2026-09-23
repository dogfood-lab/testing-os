import { readFileSync } from 'node:fs';
import { join as joinFs, posix } from 'node:path';
import picomatch from 'picomatch';
import { isCodePath } from './languages.js';
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
};
const VALUE_SETS = Object.fromEntries(Object.entries(VALUES).map(([tool, flags]) => [tool, new Set(flags)]));

/**
 * The tracked files and directories a repository holds, the files each
 * directory holds, and the package manifests, read once per map.
 */
export function repositoryView({ repoPath, tracked, spawned = new Map() }) {
  const dirs = new Set(['']);
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
// before a via, a named file before a matched one.
export function better(a, b) {
  const rank = (entry) => [entry.via == null ? 0 : 1, entry.matched ? 1 : 0, entry.via ?? ''];
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] < y[i]) return a;
    if (x[i] > y[i]) return b;
  }
  return a;
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
    for (const tokens of commandLines(text)) line(tokens, dir, frame);
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
    if (NON_EXECUTING.has(argv[0])) return;
    // An unknown command that hands a tool its arguments, a shell function
    // such as run_stage lint ruff check src/, runs that tool.
    for (let i = 1; i < argv.length; i += 1) {
      if (toolOf(argv[i]) != null) {
        interpret(argv.slice(i), dir, frame);
        return;
      }
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
  function file(token, dir, frame, { directories = false, script = false } = {}) {
    const path = pathFrom(dir, token);
    if (path == null) return null;
    if (repo.tracked.has(path)) {
      record(withVia({ path }, frame.via));
      if (script && frame.level === 0) readFile(path, dir, frame);
      return path;
    }
    if (directories && path !== '' && repo.dirs.has(path)) {
      record(withVia({ path: `${path}/`, directory: true }, frame.via));
      return path;
    }
    return null;
  }

  function readFile(path, dir, frame) {
    const next = { level: 1, via: via(frame, path), active: frame.active };
    if (isShellScript(path, repo)) {
      read(repo.text(path) ?? '', dir, next);
    } else {
      for (const command of repo.spawned.get(path) ?? []) read(command, dir, next);
    }
  }

  function matched(entries, frame, tool) {
    const chain = via(frame, tool);
    for (const entry of entries) record(withVia({ ...entry, matched: true }, chain));
  }

  function directoryRuns(dirs, frame, tool) {
    const chain = via(frame, tool);
    for (const found of dirs) {
      if (found === '') continue;
      record(withVia({ path: `${found}/`, directory: true, matched: true }, chain));
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
      if (path != null && repo.tracked.has(path)) file(argv[0], dir, frame, { script: true });
      return false;
    }
    handlers[tool](argv, dir, frame);
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
    if (i < argv.length) file(argv[i], dir, frame, { script: true });
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
    const parts = name.split('.');
    if (parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) return;
    const stem = parts.join('/');
    for (const base of [dir, dir ? `${dir}/src` : 'src']) {
      for (const candidate of [`${stem}.py`, `${stem}/__main__.py`, `${stem}/__init__.py`]) {
        const path = pathFrom(base, candidate);
        if (path != null && repo.tracked.has(path)) {
          record(withVia({ path }, frame.via));
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

  const handlers = {
    node(argv, dir, frame) {
      const parsed = [];
      let test = false;
      let i = 1;
      for (; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-e' || token === '--eval' || token === '-p' || token === '--print') return;
        if (token === '--test') {
          test = true;
          continue;
        }
        if (!token.startsWith('-')) break;
        const eq = token.indexOf('=');
        const name = eq === -1 ? token : token.slice(0, eq);
        const value = eq !== -1 ? token.slice(eq + 1) : VALUE_SETS.node.has(name) ? argv[++i] : null;
        if (value != null && ['--import', '--loader', '--experimental-loader', '--require', '-r'].includes(name)) file(value, dir, frame);
      }
      if (!test) {
        if (i < argv.length) file(argv[i], dir, frame, { script: true });
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
        file(token, dir, frame, { script: true });
        return;
      }
    },
    shell(argv, dir, frame) {
      for (let i = 1; i < argv.length; i += 1) {
        const token = argv[i];
        if (token === '-c') {
          if (i + 1 < argv.length) read(argv[i + 1], dir, { ...frame });
          return;
        }
        if (token.startsWith('-') || token.startsWith('+')) {
          if (VALUE_SETS.shell.has(token)) i += 1;
          continue;
        }
        file(token, dir, frame, { script: true });
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
        file(bin, dir, frame, { script: true });
        return;
      }
      const name = bin.replace(/@[^@/]+$/, '');
      if (toolOf(name) != null) {
        interpret([name, ...argv.slice(i + 1)], dir, frame);
        return;
      }
      const target = binTarget(repo, dir, name);
      if (target != null) {
        record(withVia({ path: target }, frame.via));
        if (frame.level === 0) readFile(target, dir, frame);
      }
    },
    uv(argv, dir, frame) {
      if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['uv run'], { chdir: ['--directory'] });
      else if (argv[1] === 'tool' && argv[2] === 'run') wrapped(argv, 3, dir, frame, VALUE_SETS.uvx);
    },
    uvx(argv, dir, frame) {
      wrapped(argv, 1, dir, frame, VALUE_SETS.uvx);
    },
    poetry(argv, dir, frame) {
      if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['poetry run'], { chdir: ['-C', '--directory'] });
    },
    pipx(argv, dir, frame) {
      if (argv[1] === 'run') wrapped(argv, 2, dir, frame, VALUE_SETS['pipx run']);
    },
    hatch(argv, dir, frame) {
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
      read(makeRecipes(repo.text(makefile) ?? '', targets), cwd, { level: 1, via: via(frame, makefile), active: frame.active });
    },
    wrapper(argv, dir, frame) {
      const name = baseName(argv[0]);
      wrapped(argv, 1, dir, frame, VALUE_SETS[name] ?? new Set(), { assignments: name === 'env', count: name === 'timeout', chdir: name === 'env' ? ['-C', '--chdir'] : [] });
    },
    none() {},
  };

  return { read, program: (path, frame) => file(path, '', frame, { script: true }) };
}

function baseName(word) {
  return word.slice(word.lastIndexOf('/') + 1);
}

function withVia(entry, via) {
  return via ? { ...entry, via } : entry;
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
  if (name === 'gmake') return 'make';
  if (['tox', 'cargo'].includes(name)) return 'none';
  const known = ['tsx', 'ts-node', 'deno', 'bun', 'npx', 'uv', 'uvx', 'poetry', 'pipx', 'hatch', 'coverage', 'ruff', 'mypy', 'tsc', 'vitest', 'jest', 'mocha', 'eslint', 'make'];
  return known.includes(name) ? name : null;
}

/**
 * The tracked file a package binary name starts, through the bin field of the
 * manifest in the command's directory, the root manifest, or a workspace's.
 */
function binTarget(repo, dir, name) {
  const dirs = [dir, ''];
  const root = repo.manifest('');
  const globs = workspaceGlobs(root);
  if (globs.length > 0) {
    const isMatch = picomatch(globs, { dot: true });
    for (const path of [...repo.tracked].sort()) {
      if (path.endsWith('/package.json') && isMatch(path.slice(0, -'/package.json'.length))) dirs.push(path.slice(0, -'/package.json'.length));
    }
  }
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
// directories and script names npm would run for it, or nothing when the
// command is not an npm script invocation.
function npmTargets(tokens, dir, repo) {
  const start = tokens.indexOf('npm');
  if (start === -1) return [];
  let prefix = dir;
  let command = null;
  let script = null;
  let allWorkspaces = false;
  let includeRoot = false;
  const named = [];
  for (let i = start + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--') break;
    const eq = token.indexOf('=');
    const flag = token.startsWith('-') && eq !== -1 ? token.slice(0, eq) : token;
    if (NPM_VALUE_FLAGS.has(flag)) {
      const value = eq !== -1 && token.startsWith('-') ? token.slice(eq + 1) : tokens[++i];
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

function workspaceMembers(repo) {
  return repo.workspaces();
}

function readWorkspaces(repo) {
  const members = new Map();
  const globs = workspaceGlobs(repo.manifest(''));
  if (globs.length === 0) return members;
  const isMatch = picomatch(globs, { dot: true });
  for (const path of [...repo.tracked].sort()) {
    if (!path.endsWith('/package.json')) continue;
    const dir = path.slice(0, -'/package.json'.length);
    if (!isMatch(dir)) continue;
    const pkg = repo.manifest(dir);
    members.set(dir, pkg && typeof pkg.name === 'string' ? pkg.name : null);
  }
  return members;
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
