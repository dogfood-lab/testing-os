import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A raw stdio client for the sidecar's tests: it writes JSON-RPC lines to
 * `atlas mcp`, reads every line the server writes, answers the requests the
 * server sends (roots/list) with a handler the test gives, and keeps every
 * stdout line so a test can check that each one is a protocol message.
 * Not published; the official SDK client is exercised in its own test.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));

/**
 * @param {{ cwd: string, env?: Record<string, string>, onRequest?: (message: object) => unknown }} options
 */
export function startServer({ cwd, env = {}, onRequest = () => null }) {
  const child = spawn(process.execPath, [CLI, 'mcp'], { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  const stderr = [];
  const waiting = new Map();
  let buffered = '';
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  // Writing to a server that already exited fails with EPIPE; the exit
  // handler below reports that as the failure it is.
  child.stdin.on('error', () => {});
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  child.stdout.on('data', (chunk) => {
    buffered += chunk;
    let at = buffered.indexOf('\n');
    while (at !== -1) {
      const line = buffered.slice(0, at);
      buffered = buffered.slice(at + 1);
      at = buffered.indexOf('\n');
      lines.push(line);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof message.method === 'string' && message.id !== undefined) {
        const result = onRequest(message);
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`);
      } else if (message.id !== undefined && waiting.has(message.id)) {
        waiting.get(message.id)(message);
        waiting.delete(message.id);
      }
    }
  });
  // A server that exits leaves nothing to wait for: every pending request
  // fails with what it printed, so a broken server fails a test at once.
  const exited = new Promise((resolve) => child.on('exit', (code) => {
    for (const [, settle] of waiting) settle(Promise.reject(new Error(`atlas mcp exited ${code} before answering\nstdout: ${lines.join('\n')}${buffered}\nstderr: ${stderr.join('')}`)));
    waiting.clear();
    resolve(code);
  }));

  return {
    lines,
    stderr,
    exited,
    /** Sends a request and settles with the whole response message. */
    request(method, params) {
      const id = nextId;
      nextId += 1;
      return this.send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    },
    /** Sends any message with an id and settles with the response to that id. */
    send(message) {
      const answered = new Promise((resolve) => waiting.set(message.id, resolve));
      child.stdin.write(`${JSON.stringify(message)}\n`);
      return answered;
    },
    /** Sends a line as it is, for framing tests; settles with the next response to id. */
    raw(line, id = null) {
      const answered = new Promise((resolve) => waiting.set(id, resolve));
      child.stdin.write(`${line}\n`);
      return answered;
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })}\n`);
    },
    /** Closes the server's input, the host's way to stop it, and settles with its exit code. */
    close() {
      child.stdin.end();
      return exited;
    },
  };
}

/** git in a test repository; throws with git's words when it fails. */
export function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}\n${result.stderr || String(result.error ?? '')}`);
  return result.stdout.trim();
}

/** Stages everything and commits it as the test author. */
export function commitAll(cwd, message) {
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-q', '-m', message]);
}

/** atlas map in a checkout; throws with its output when it fails. */
export function mapIn(cwd) {
  const result = spawnSync(process.execPath, [CLI, 'map'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`atlas map failed\n${result.stdout}${result.stderr}`);
}

/**
 * A fixture as a committed repository in a temporary directory, with a
 * history in which the given files change together, mapped, and the map
 * committed. Returns the root; the caller removes it.
 *
 * @param {string} fixture the fixture directory
 * @param {{ together?: string[], times?: number, prefix?: string }} [options]
 */
export function mappedRepository(fixture, { together = [], times = 6, prefix = 'atlas-sidecar-' } = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cpSync(fixture, root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'core.autocrlf', 'false']);
  // A commit may start git's background maintenance, which repacks objects
  // under .git moments later; a test that checks .git is untouched must not
  // race it.
  git(root, ['config', 'maintenance.auto', 'false']);
  git(root, ['config', 'gc.auto', '0']);
  commitAll(root, 'fixture');
  for (let i = 1; together.length > 0 && i <= times; i += 1) {
    for (const path of together) appendFileSync(join(root, path), `// change ${i}\n`);
    commitAll(root, `change ${i}`);
  }
  mapIn(root);
  commitAll(root, 'map');
  return root;
}

/** The _meta a 2026-07-28 request carries. */
export function modernMeta(version = '2026-07-28', capabilities = {}) {
  return {
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientCapabilities': capabilities,
    'io.modelcontextprotocol/clientInfo': { name: 'atlas-test', version: '0.0.0' },
  };
}

/** An initialize request of a handshake revision. */
export function initializeParams(version = '2025-11-25', capabilities = {}) {
  return { protocolVersion: version, capabilities, clientInfo: { name: 'atlas-test', version: '0.0.0' } };
}
