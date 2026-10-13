import { LOCATION_VARIABLES } from './git.js';
import { createProtocol } from './protocol.js';
import { callTool, listTools, stopTools } from './tools.js';

/**
 * `atlas mcp`: the sidecar on stdio. It reads one JSON-RPC message per line
 * from input and writes one per line to output, and nothing else goes to
 * output: anything else the process prints, a stray console.log in a
 * dependency included, is sent to the error stream, where the protocol lets
 * a server log. It never listens on a port.
 *
 * Each line is handed on as it arrives, not after the one before it is
 * answered: a tool call may be waiting for the client's reply to roots/list,
 * which arrives as a later line.
 *
 * @param {{ cwd?: string, repos?: object[] | null, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, errors?: NodeJS.WritableStream }} [options]
 *   repos: the roots a --repos file named (sidecar/roots.js), or null
 * @returns {Promise<void>} settles when input ends and every answer is sent
 */
export function serve({ cwd = process.cwd(), repos = null, input = process.stdin, output = process.stdout, errors = process.stderr } = {}) {
  // The directory alone chooses a repository: every git this process starts,
  // the engine's own included, runs without the variables that would point
  // it at another (docs/atlas-buildup.spec.md, slice AN).
  for (const key of Object.keys(process.env)) if (LOCATION_VARIABLES.includes(key.toUpperCase())) delete process.env[key];
  const writeOut = output.write.bind(output);
  if (output === process.stdout) {
    const toErrors = errors.write.bind(errors);
    process.stdout.write = (chunk, encoding, callback) => toErrors(chunk, encoding, callback);
  }
  const log = (line) => errors.write(`${line}\n`);
  const protocol = createProtocol({
    send: (message) => writeOut(`${JSON.stringify(message)}\n`),
    tools: { list: listTools, call: callTool },
    cwd,
    repos,
    log,
  });
  return new Promise((resolve) => {
    let buffered = '';
    const pending = new Set();
    const dispatch = (line) => {
      const work = protocol.receive(line).catch((err) => log(`atlas mcp: ${err?.stack ?? err}`));
      pending.add(work);
      work.finally(() => pending.delete(work));
    };
    input.setEncoding?.('utf8');
    input.on('data', (chunk) => {
      buffered += chunk;
      let at = buffered.indexOf('\n');
      while (at !== -1) {
        dispatch(buffered.slice(0, at));
        buffered = buffered.slice(at + 1);
        at = buffered.indexOf('\n');
      }
    });
    input.on('end', async () => {
      if (buffered !== '') dispatch(buffered);
      buffered = '';
      while (pending.size > 0) await Promise.allSettled([...pending]);
      await protocol.idle();
      // A map still being made in the background is stopped, and its
      // unfinished directory removed: the session it served has ended.
      await stopTools();
      // A pipe takes writes asynchronously, and the caller exits once this
      // settles: the empty write's callback runs after every answer before it.
      await new Promise((done) => writeOut('', done));
      resolve();
    });
  });
}
