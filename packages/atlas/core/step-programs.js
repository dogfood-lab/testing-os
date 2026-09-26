/**
 * Whether a step's shell text runs a program that could be running tests:
 * anything but the shell's own words, the tools that read and print text,
 * and the programs that audit, lint, format or type-check. A step named for
 * tests that runs nothing else (it greps for placeholder tests, audits the
 * test toolchain, type-checks the test files, checks a stated test count)
 * runs no tests, whatever its name says; one that runs a built binary, a
 * script or an unknown command may, and is kept as a test step whose runner
 * Atlas cannot name.
 */

// Words that start a command without being the program it runs.
const LEADS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', 'time', 'sudo', 'env', 'exec', 'command', 'nohup', 'builtin']);
// Words that close a construct, after which only redirections may follow.
const CLOSERS = new Set(['fi', 'done', 'esac', '}', 'end']);
// Constructs whose own words are not commands: their body is.
const HEADS = new Set(['for', 'case', 'select', 'function']);
const TOOLS = new Set([
  // the shell's own
  '[', '[[', 'test', 'echo', 'printf', 'exit', 'return', 'set', 'unset', 'export', 'local', 'declare', 'readonly', 'read', 'shift', 'true', 'false', ':', 'cd', 'pushd', 'popd', 'source', '.', 'eval', 'trap', 'wait', 'break', 'continue', 'shopt', 'let',
  // reading and printing text, and moving files
  'grep', 'egrep', 'fgrep', 'rg', 'cat', 'head', 'tail', 'sed', 'awk', 'gawk', 'jq', 'yq', 'wc', 'sort', 'uniq', 'cut', 'tr', 'ls', 'find', 'diff', 'cmp', 'tee', 'xargs', 'basename', 'dirname', 'realpath', 'readlink', 'mkdir', 'rm', 'rmdir', 'cp', 'mv', 'ln', 'touch', 'chmod', 'chown', 'date', 'sleep', 'stat', 'file', 'du', 'df', 'which', 'type', 'hash', 'sha256sum', 'shasum', 'md5sum', 'base64', 'column', 'paste', 'fold', 'rev', 'nl', 'comm', 'join', 'split', 'tar', 'unzip', 'zip', 'gzip', 'gunzip', 'curl', 'wget', 'git', 'printenv',
  // auditing, linting, formatting and type-checking
  'pip-audit', 'safety', 'bandit', 'tsc', 'vue-tsc', 'eslint', 'ruff', 'mypy', 'pyright', 'flake8', 'pylint', 'black', 'isort', 'prettier', 'biome', 'shellcheck', 'actionlint', 'markdownlint', 'cspell', 'gdlint', 'gdformat', 'clippy-driver', 'rustfmt',
]);
const PYTHON_TOOLS = new Set(['mypy', 'ruff', 'black', 'isort', 'flake8', 'pylint', 'pyright', 'pip', 'pip_audit', 'bandit', 'build', 'twine', 'venv', 'json.tool', 'compileall', 'py_compile']);
// A package manager's commands and scripts that run no tests.
const MANAGER_WORDS = new Set(['install', 'i', 'ci', 'add', 'remove', 'audit', 'outdated', 'ls', 'list', 'config', 'publish', 'pack', 'version', 'view', 'info', 'why', 'link', 'dedupe', 'prune', 'cache', 'set', 'get', 'whoami', 'login', 'init', 'upgrade', 'update']);
const CHECK_SCRIPT = /^(?:type-?check|typecheck|types|tsc|lint|format|fmt|prettier|audit|check[:-]types|check[:-]format|check[:-]lint)(?:[:-]|$)/i;
const MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/**
 * @param {string} text a step's run text
 * @returns {boolean}
 */
export function runsAProgram(text) {
  return commandsOf(String(text ?? '')).some(runsOne);
}

function runsOne(words) {
  let at = 0;
  while (at < words.length && (LEADS.has(words[at]) || /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(words[at]))) at += 1;
  if (at >= words.length) return false;
  const first = words[at];
  if (HEADS.has(first) || CLOSERS.has(first) || /^[0-9]*[<>&]/.test(first)) return false;
  return programRuns(first, words.slice(at + 1));
}

function programRuns(word, args) {
  const name = word.split('/').pop();
  if (name === '' || TOOLS.has(name)) return false;
  if (MANAGERS.has(name)) {
    const sub = args.find((arg) => !arg.startsWith('-'));
    if (sub == null) return false;
    if (sub === 'run' || sub === 'run-script') {
      const script = args.slice(args.indexOf(sub) + 1).find((arg) => !arg.startsWith('-'));
      return script != null && !CHECK_SCRIPT.test(script);
    }
    if (sub === 'exec' || sub === 'dlx' || sub === 'x') {
      const rest = args.slice(args.indexOf(sub) + 1).filter((arg) => !arg.startsWith('-'));
      return rest.length > 0 && programRuns(rest[0], rest.slice(1));
    }
    return !MANAGER_WORDS.has(sub) && !CHECK_SCRIPT.test(sub);
  }
  if (name === 'npx' || name === 'pnpx' || name === 'bunx') {
    const rest = args.filter((arg) => !arg.startsWith('-'));
    return rest.length > 0 && programRuns(rest[0], rest.slice(1));
  }
  if (name === 'uv' || name === 'poetry' || name === 'pipenv' || name === 'hatch') {
    const rest = args.filter((arg) => !arg.startsWith('-'));
    if (rest[0] === 'run') return rest.length > 1 && programRuns(rest[1], rest.slice(2));
    return false;
  }
  if (/^(python[0-9.]*|py|pip[0-9.]*)$/.test(name)) {
    if (name.startsWith('pip')) return false;
    const module = args[0] === '-m' ? args[1] : null;
    return module == null || !PYTHON_TOOLS.has(module);
  }
  return true;
}

/**
 * The words of each simple command in a shell text, quotes read as the
 * shell reads them. A command substitution's commands are commands too.
 */
export function commandsOf(text) {
  const out = [];
  let words = [];
  let word = '';
  let quoted = false;
  const flush = () => {
    if (word !== '' || quoted) words.push(word);
    word = '';
    quoted = false;
  };
  const end = () => {
    flush();
    if (words.length > 0) out.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\' && text[i + 1] === '\n') {
      i += 1;
      continue;
    }
    if (ch === '\\') {
      word += text[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      word += text.slice(i + 1, close === -1 ? text.length : close);
      quoted = true;
      i = close === -1 ? text.length : close;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      for (; j < text.length && text[j] !== '"'; j += 1) {
        if (text[j] === '\\') {
          word += text[j + 1] ?? '';
          j += 1;
        } else if (text[j] === '$' && text[j + 1] === '(') {
          const close = closing(text, j + 1);
          out.push(...commandsOf(text.slice(j + 2, close)));
          word += text.slice(j, close + 1);
          j = close;
        } else word += text[j];
      }
      quoted = true;
      i = j;
      continue;
    }
    if (ch === '$' && text[i + 1] === '(') {
      const close = closing(text, i + 1);
      out.push(...commandsOf(text.slice(i + 2, close)));
      word += text.slice(i, close + 1);
      i = close;
      continue;
    }
    if (ch === '`') {
      const close = text.indexOf('`', i + 1);
      out.push(...commandsOf(text.slice(i + 1, close === -1 ? text.length : close)));
      i = close === -1 ? text.length : close;
      continue;
    }
    if (ch === '#' && word === '' && !quoted) {
      const close = text.indexOf('\n', i);
      i = close === -1 ? text.length : close - 1;
      continue;
    }
    // 2>&1 and &>file redirect; they separate nothing.
    if (ch === '&' && (/[<>]$/.test(word) || text[i + 1] === '>')) {
      word += ch;
      continue;
    }
    if (ch === '\n' || ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') {
      end();
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      flush();
      continue;
    }
    word += ch;
  }
  end();
  return out;
}

// The index of the parenthesis that closes the one at `open`, quotes and
// nesting read; the end of the text when none does.
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === "'") {
      const close = text.indexOf("'", i + 1);
      if (close === -1) return text.length;
      i = close;
      continue;
    }
    if (ch === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) if (text[i] === '\\') i += 1;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}
