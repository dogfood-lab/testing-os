import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Language, Parser } from 'web-tree-sitter';
import { git, READ_ONLY_ENV } from './git.js';

/**
 * What the sidecar can do, read from its code (docs/atlas-sidecar.spec.md,
 * "Safety"): the process `atlas mcp` runs, and the worker a refresh starts,
 * load no network module, never fetch, open a socket or listen, and run no
 * program but git; the sidecar's own git runs only read commands. Every
 * module they load ships in the package.
 *
 * Each module is read as a syntax tree, with the JavaScript grammar the
 * engine itself ships, so a comment about a fetch, or a string the engine
 * looks for in the code it maps, is never taken for a use.
 */

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The two processes: `atlas mcp` starts at the command line's entry, and a
// refresh forks the worker.
const ENTRIES = ['cli.js', 'sidecar/refresh-worker.js'];
const NETWORK = new Set(['http', 'https', 'http2', 'net', 'dgram', 'tls', 'dns']);
const NETWORK_NAMES = new Set(['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest']);
const LISTENS = new Set(['listen', 'createServer', 'createConnection', 'connect']);
const RUNS = new Set(['spawnSync', 'spawn', 'execFileSync', 'execFile', 'execSync', 'exec', 'fork']);
const READS = new Set(['cat-file', 'diff', 'ls-files', 'merge-base', 'rev-parse', 'show', 'status']);

await Parser.init({ locateFile: () => fileURLToPath(import.meta.resolve('web-tree-sitter/web-tree-sitter.wasm')) });
const parser = new Parser();
parser.setLanguage(await Language.load(readFileSync(join(PACKAGE, 'grammars', 'tree-sitter-javascript.wasm'))));

function* nodes(node) {
  yield node;
  for (const child of node.namedChildren) yield* nodes(child);
}

// A string literal's value, or null for anything computed.
function literal(node) {
  if (node?.type === 'string') return node.text.slice(1, -1);
  if (node?.type === 'template_string' && !node.namedChildren.some((child) => child.type === 'template_substitution')) return node.text.slice(1, -1);
  return null;
}

/**
 * What one module imports, calls and names, read from its tree. A call is
 * named by its function, with the object it is called on when it is a
 * method; namespaces are the names a module gives a whole module it imports.
 *
 * @returns {{ imports: string[], namespaces: Map<string, string>, computed: number,
 *   calls: Array<{ callee: string, on: string|null, first: string|null, firstValue: string|null }>, names: string[] }}
 */
function readModule(source) {
  const tree = parser.parse(source);
  const imports = [];
  const namespaces = new Map();
  let computed = 0;
  const calls = [];
  const names = [];
  for (const node of nodes(tree.rootNode)) {
    if ((node.type === 'import_statement' || node.type === 'export_statement') && node.childForFieldName('source')) {
      const from = literal(node.childForFieldName('source'));
      imports.push(from);
      for (const inner of nodes(node)) if (inner.type === 'namespace_import') namespaces.set(inner.namedChildren[0].text, from);
    } else if (node.type === 'call_expression') {
      const callee = node.childForFieldName('function');
      const args = node.childForFieldName('arguments');
      const first = args?.namedChildren[0] ?? null;
      if (callee.type === 'import') {
        if (literal(first) == null) computed += 1;
        else imports.push(literal(first));
      } else {
        const method = callee.type === 'member_expression';
        // Read now: the tree is freed before the module is checked.
        calls.push({
          callee: method ? callee.childForFieldName('property').text : callee.text,
          on: method ? callee.childForFieldName('object').text : null,
          first: first?.text ?? null,
          firstValue: literal(first),
        });
      }
    } else if (node.type === 'identifier' || node.type === 'property_identifier') {
      names.push(node.text);
    }
  }
  tree.delete();
  return { imports, namespaces, computed, calls, names };
}

/** Every module of the package the entries load, each read. */
function closure() {
  const modules = new Map();
  const queue = ENTRIES.map((entry) => join(PACKAGE, entry));
  while (queue.length > 0) {
    const file = queue.pop();
    if (modules.has(file)) continue;
    const read = readModule(readFileSync(file, 'utf8'));
    modules.set(file, read);
    for (const specifier of read.imports) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      assert.ok(existsSync(target), `${relative(PACKAGE, file)} imports ${specifier}, which does not exist`);
      queue.push(target);
    }
  }
  return modules;
}

const MODULES = closure();
const name = (file) => relative(PACKAGE, file).replaceAll('\\', '/');

describe('what the sidecar can do, read from its code', () => {
  it('loads every module by a name written in the code', () => {
    for (const [file, { computed, calls }] of MODULES) {
      assert.equal(computed, 0, `${name(file)} imports a module whose name is computed`);
      assert.ok(!calls.some((call) => call.callee === 'require'), `${name(file)} requires a module`);
    }
    assert.ok(MODULES.size > 20, `the closure holds ${MODULES.size} modules`);
    assert.ok([...MODULES.keys()].map(name).includes('sidecar/server.js'), 'atlas mcp reaches the server');
  });

  it('imports no network module', () => {
    for (const [file, { imports }] of MODULES) {
      for (const specifier of imports) {
        const bare = specifier.replace(/^node:/, '').split('/')[0];
        assert.ok(!NETWORK.has(bare), `${name(file)} imports ${specifier}`);
      }
    }
  });

  it('never fetches, opens a socket or listens', () => {
    for (const [file, { calls, names }] of MODULES) {
      for (const used of names) assert.ok(!NETWORK_NAMES.has(used), `${name(file)} names ${used}`);
      for (const call of calls) assert.ok(!LISTENS.has(call.callee), `${name(file)} calls ${call.callee}`);
    }
  });

  it('runs no program but git, and the refresh worker', () => {
    const spawning = [];
    for (const [file, { imports, namespaces, calls }] of MODULES) {
      if (!imports.includes('node:child_process')) continue;
      spawning.push(name(file));
      // A function imported from child_process, called by its own name or on
      // the module imported whole; a pattern's exec is no program.
      const whole = new Set([...namespaces].filter(([, from]) => from === 'node:child_process').map(([local]) => local));
      for (const call of calls.filter((entry) => RUNS.has(entry.callee) && (entry.on == null || whole.has(entry.on)))) {
        if (call.callee === 'fork') assert.equal(`${name(file)} ${call.first}`, 'sidecar/refresh.js WORKER', 'only the refresh forks, and only its worker');
        else assert.equal(call.firstValue, 'git', `${name(file)} runs ${call.first} with ${call.callee}`);
      }
    }
    assert.deepEqual(spawning.filter((file) => file.startsWith('sidecar/')).sort(), ['sidecar/git.js', 'sidecar/refresh.js'], 'the sidecar runs git in one module and forks in one');
    assert.match(readFileSync(join(PACKAGE, 'sidecar/refresh.js'), 'utf8'), /const WORKER = fileURLToPath\(new URL\('\.\/refresh-worker\.js', import\.meta\.url\)\);/, 'the worker is the module beside it');
  });

  it('runs only read commands of git itself', () => {
    const source = readFileSync(join(PACKAGE, 'sidecar/git.js'), 'utf8');
    const listed = /const READ_COMMANDS = new Set\(\[([^\]]*)\]\)/.exec(source);
    assert.ok(listed, 'the sidecar lists the git commands it runs');
    const commands = [...listed[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    for (const command of commands) assert.ok(READS.has(command), `git ${command} is not a read command`);
    for (const command of ['commit', 'add', 'checkout', 'reset', 'fetch', 'gc', 'update-index', 'config']) {
      assert.throws(() => git(PACKAGE, [command]), /is not a read command/, `git ${command} is refused`);
    }
    assert.deepEqual(READ_ONLY_ENV, { GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' });
  });

  it('ships every module it loads', () => {
    const files = new Set(JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')).files);
    for (const file of MODULES.keys()) assert.ok(files.has(name(file)), `${name(file)} is loaded by atlas mcp but not in the package's files`);
  });
});
