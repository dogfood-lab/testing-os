import { spawn } from 'node:child_process';
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
