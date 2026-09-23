import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import picomatch from 'picomatch';
import { parse } from 'yaml';

const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const TRIGGER_LISTS = ['paths', 'branches', 'tags', 'types', 'workflows'];
const RUN_ALIASES = new Set(['run', 'run-script', 'rum', 'urn']);
const TEST_ALIASES = new Set(['test', 't', 'tst']);
const LIFECYCLE = new Set(['start', 'stop', 'restart']);
const VALUE_FLAGS = new Set(['-w', '--workspace', '--prefix']);
const EXECUTORS = new Set(['node', 'npx', 'bash', 'sh', 'pwsh', 'python', 'python3', 'deno', 'tsx']);
// Words that can open a shell command line without being the command.
const PREFIX_WORDS = new Set(['if', 'elif', 'then', 'else', 'while', 'until', 'do', 'exec', 'time', '!']);

/**
 * Read every tracked workflow under .github/workflows and describe it as a
 * door: what starts it, what it runs, what it may touch and what it sends.
 * A workflow that does not parse is still a door; it is recorded as such and
 * the rest of the map is unaffected.
 *
 * @param {{ repoPath: string, tracked: Set<string> }} input
 */
export function mapDoors({ repoPath, tracked }) {
  const scripts = scriptIndex(repoPath, tracked);
  return [...tracked]
    .filter(isWorkflow)
    .sort()
    .map((file) => readDoor(repoPath, file, tracked, scripts));
}

export function isWorkflow(path) {
  return WORKFLOW.test(path);
}

function readDoor(repoPath, file, tracked, scripts) {
  const fallback = posix.basename(file).replace(/\.ya?ml$/, '');
  let text;
  let doc;
  try {
    text = readFileSync(join(repoPath, file), 'utf8');
    doc = parse(text);
  } catch {
    return { file, name: fallback, parseError: true };
  }
  if (!isMapping(doc)) return { file, name: fallback, parseError: true };

  const permissions = new Set(permissionList(doc.permissions));
  const commands = [];
  const uses = new Set();
  const runs = new Map();
  const mentions = new Map();
  const workflowDir = workingDirectory(doc.defaults);
  for (const [job, body] of Object.entries(isMapping(doc.jobs) ? doc.jobs : {})) {
    if (!isMapping(body)) continue;
    for (const permission of permissionList(body.permissions)) permissions.add(permission);
    const jobDir = workingDirectory(body.defaults) ?? workflowDir ?? '';
    const steps = Array.isArray(body.steps) ? body.steps : [];
    steps.forEach((step, index) => {
      if (!isMapping(step)) return;
      if (typeof step.uses === 'string') uses.add(step.uses.replace(/@.*$/, ''));
      if (typeof step.run !== 'string') return;
      const name = typeof step.name === 'string' && step.name.trim() !== '' ? step.name : String(index);
      commands.push({ job, step: name, text: step.run });
      // A step whose working directory cannot be read as a repository path
      // names nothing Atlas can place, so its tokens are left unresolved.
      const dir = step['working-directory'] === undefined ? jobDir : cleanDir(step['working-directory']);
      if (dir == null) return;
      const named = namedPaths(step.run, dir, tracked, scripts, new Set());
      for (const path of named.runs) runs.set(`${path}\0${job}`, { path, job });
      for (const path of named.mentions) mentions.set(`${path}\0${job}`, { path, job });
    });
  }

  for (const key of runs.keys()) mentions.delete(key);
  const byPathThenJob = (a, b) => compare(a.path, b.path) || compare(a.job, b.job);
  const texts = commands.map((command) => command.text);
  const joined = texts.join('\n');
  return {
    file,
    name: typeof doc.name === 'string' && doc.name.trim() !== '' ? doc.name : fallback,
    triggers: triggerList(doc.on),
    permissions: [...permissions].sort(),
    secrets: [...new Set([...text.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort(),
    usesWorkflowToken: /\bgithub\.token\b|\bsecrets\.GITHUB_TOKEN\b/.test(text),
    commands,
    runs: [...runs.values()].sort(byPathThenJob),
    mentions: [...mentions.values()].sort(byPathThenJob),
    stages: [...new Set(texts.flatMap(stagedPaths))].sort(),
    pushes: /\bgit\s+push\b/.test(joined),
    sends: {
      dispatchesTo: [
        ...new Set([...joined.matchAll(/repos\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/dispatches\b/g)].map((m) => `${m[1]}/${m[2]}`)),
      ].sort(),
      publishes: /\bnpm\s+publish\b/.test(joined),
      releases: /\bgh\s+release\s+create\b/.test(joined),
      deploysPages: [...uses].some((name) => name === 'actions/deploy-pages' || name.startsWith('actions/deploy-pages/')),
    },
    uses: [...uses].sort(),
  };
}

function triggerList(on) {
  const out = [];
  if (typeof on === 'string') out.push({ event: on });
  else if (Array.isArray(on)) {
    for (const event of on) if (typeof event === 'string') out.push({ event });
  } else if (isMapping(on)) {
    for (const [event, config] of Object.entries(on)) {
      if (event === 'schedule') {
        const crons = (Array.isArray(config) ? config : []).filter((entry) => isMapping(entry) && typeof entry.cron === 'string');
        if (crons.length === 0) out.push({ event });
        for (const entry of crons) out.push({ event, cron: entry.cron });
        continue;
      }
      const trigger = { event };
      if (event !== 'workflow_dispatch' && isMapping(config)) {
        for (const field of TRIGGER_LISTS) {
          const list = stringList(config[field]);
          if (list) trigger[field] = [...new Set(list)].sort();
        }
      }
      out.push(trigger);
    }
  }
  const unique = new Map(out.map((trigger) => [canonical(trigger), trigger]));
  return [...unique.entries()]
    .sort(([keyA, a], [keyB, b]) => compare(a.event, b.event) || compare(keyA, keyB))
    .map(([, trigger]) => trigger);
}

function permissionList(value) {
  if (value === 'read-all') return ['all:read'];
  if (value === 'write-all') return ['all:write'];
  if (!isMapping(value)) return [];
  return Object.entries(value)
    .filter(([, level]) => typeof level === 'string')
    .map(([scope, level]) => `${scope}:${level}`);
}

function workingDirectory(defaults) {
  const dir = isMapping(defaults) && isMapping(defaults.run) ? defaults.run['working-directory'] : undefined;
  return dir === undefined ? null : cleanDir(dir);
}

function cleanDir(dir) {
  if (typeof dir !== 'string') return null;
  const normalized = posix.normalize(dir.replaceAll('\\', '/')).replace(/\/+$/, '');
  if (normalized === '.' || normalized === '') return '';
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('${{')) {
    return null;
  }
  return normalized;
}

/**
 * Tracked paths a command executes, and tracked paths it only mentions.
 *
 * A path is executed when it is the command itself, or when it follows an
 * executor with nothing but flags between them. Every other tracked path in
 * the text is a mention: an echoed message, a file handed to git diff. npm
 * scripts the command starts are read by the same rule, followed through
 * nested invocations. `active` holds the scripts on the current chain, so a
 * script that starts itself stops instead of looping.
 */
function namedPaths(text, dir, tracked, scripts, active) {
  const runs = new Set();
  const mentions = new Set();
  for (const piece of text.split(/[\s"'`()[\]{}<>|;&,=:]+/)) {
    const path = pathFrom(dir, piece.replace(/\.+$/, ''));
    if (path != null && tracked.has(path)) mentions.add(path);
  }
  for (const tokens of commandLines(text)) {
    for (const index of executedPositions(tokens)) {
      const path = pathFrom(dir, tokens[index]);
      if (path != null && tracked.has(path)) runs.add(path);
    }
    for (const target of npmTargets(tokens, dir, scripts)) {
      const key = `${target.dir}\0${target.script}`;
      if (active.has(key)) continue;
      const manifest = scripts.manifest(target.dir);
      if (!manifest) continue;
      active.add(key);
      for (const name of [`pre${target.script}`, target.script, `post${target.script}`]) {
        const body = manifest[name];
        if (typeof body !== 'string') continue;
        const nested = namedPaths(body, target.dir, tracked, scripts, active);
        for (const path of nested.runs) runs.add(path);
        for (const path of nested.mentions) mentions.add(path);
      }
      active.delete(key);
    }
  }
  for (const path of runs) mentions.delete(path);
  return { runs, mentions };
}

function executedPositions(tokens) {
  const positions = new Set();
  let first = 0;
  while (first < tokens.length && (PREFIX_WORDS.has(tokens[first]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[first]))) {
    first += 1;
  }
  if (first < tokens.length) positions.add(first);
  for (let i = first; i < tokens.length; i += 1) {
    if (!EXECUTORS.has(tokens[i])) continue;
    let next = i + 1;
    while (next < tokens.length && tokens[next].startsWith('-')) next += 1;
    if (next < tokens.length) positions.add(next);
  }
  return positions;
}

/**
 * Split shell text into simple commands, each a list of words with their
 * quotes removed. Operators inside quotes do not split: the parentheses in
 * node -p "require('./package.json')" are JavaScript, and splitting there
 * would make ./package.json look like a command. A here-document body is
 * input to its command, not shell, so it is skipped.
 */
function commandLines(text) {
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
function npmTargets(tokens, dir, scripts) {
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
    if (VALUE_FLAGS.has(flag)) {
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
  if (allWorkspaces) dirs = scripts.workspaceDirs();
  else if (named.length > 0) dirs = named.map((value) => scripts.workspaceDir(value, prefix)).filter((found) => found != null);
  else dirs = [prefix];
  if (includeRoot && (allWorkspaces || named.length > 0)) dirs = [prefix, ...dirs];
  return [...new Set(dirs)].map((target) => ({ dir: target, script }));
}

function stagedPaths(text) {
  const staged = [];
  for (const tokens of commandLines(text)) {
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      if (tokens[i] !== 'git' || tokens[i + 1] !== 'add') continue;
      for (const token of tokens.slice(i + 2)) {
        if (token.startsWith('-')) continue;
        staged.push(token);
      }
      break;
    }
  }
  return staged;
}

function scriptIndex(root, tracked) {
  const manifests = new Map();
  const read = (dir) => {
    if (manifests.has(dir)) return manifests.get(dir);
    const path = dir ? `${dir}/package.json` : 'package.json';
    let pkg = null;
    if (tracked.has(path)) {
      try {
        pkg = JSON.parse(readFileSync(join(root, path), 'utf8'));
      } catch {
        pkg = null;
      }
    }
    if (!isMapping(pkg)) pkg = null;
    manifests.set(dir, pkg);
    return pkg;
  };
  let members = null;
  const workspaces = () => {
    if (members) return members;
    members = new Map();
    const globs = workspaceGlobs(read(''));
    if (globs.length === 0) return members;
    const isMatch = picomatch(globs, { dot: true });
    for (const path of [...tracked].sort()) {
      if (!path.endsWith('/package.json')) continue;
      const dir = path.slice(0, -'/package.json'.length);
      if (!isMatch(dir)) continue;
      const pkg = read(dir);
      members.set(dir, pkg && typeof pkg.name === 'string' ? pkg.name : null);
    }
    return members;
  };
  return {
    manifest(dir) {
      const pkg = read(dir);
      return pkg && isMapping(pkg.scripts) ? pkg.scripts : null;
    },
    workspaceDirs() {
      return [...workspaces().keys()];
    },
    workspaceDir(value, prefix) {
      for (const [dir, name] of workspaces()) if (name === value) return dir;
      const asPath = cleanDir(posix.join(prefix || '.', value));
      return asPath != null && workspaces().has(asPath) ? asPath : null;
    },
  };
}

function workspaceGlobs(pkg) {
  const workspaces = pkg?.workspaces;
  const list = Array.isArray(workspaces) ? workspaces : Array.isArray(workspaces?.packages) ? workspaces.packages : [];
  return list.filter((glob) => typeof glob === 'string').map((glob) => glob.replace(/^\.\//, '').replace(/\/+$/, ''));
}

function pathFrom(dir, token) {
  if (!token || token.startsWith('/') || token.includes('://')) return null;
  const path = posix.normalize(dir ? `${dir}/${token}` : token);
  if (path === '..' || path.startsWith('../')) return null;
  return path;
}

function stringList(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return null;
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isMapping(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
