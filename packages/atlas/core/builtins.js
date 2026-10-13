/**
 * Node's built-in modules by their bare names, as a fixed list committed
 * here rather than read from the Node that runs the map
 * (docs/atlas-buildup.spec.md, slice AO). A map records whether an import
 * is a package, so a list that moved with the running Node would make one
 * commit map differently on Node 22 and Node 24, and atlas check disagree
 * across machines with nothing changed. The list is Node 22's, the oldest
 * the engine supports, as builtinModules gave it on 22.22.3. A module Node
 * provides only under its prefix (node:test, node:sqlite, node:sea) is not
 * here: it is a built-in only when the import spells node:, which the
 * resolver treats as built-in whatever follows.
 */
export const NODE_BUILTINS = Object.freeze(new Set([
  '_http_agent', '_http_client', '_http_common', '_http_incoming', '_http_outgoing', '_http_server',
  '_stream_duplex', '_stream_passthrough', '_stream_readable', '_stream_transform', '_stream_wrap', '_stream_writable',
  '_tls_common', '_tls_wrap',
  'assert', 'assert/strict', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'diagnostics_channel', 'dns', 'dns/promises', 'domain', 'events', 'fs', 'fs/promises', 'http', 'http2',
  'https', 'inspector', 'inspector/promises', 'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks',
  'process', 'punycode', 'querystring', 'readline', 'readline/promises', 'repl', 'stream', 'stream/consumers',
  'stream/promises', 'stream/web', 'string_decoder', 'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty',
  'url', 'util', 'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]));

/**
 * Whether an import names a Node built-in: node: and anything after it, or
 * a bare name on the list, or a path under one (fs/promises is listed; a
 * deeper path under an unscoped built-in counts as that built-in).
 *
 * @param {string} specifier as the import spells it
 */
export function isNodeBuiltin(specifier) {
  if (specifier.startsWith('node:')) return true;
  if (NODE_BUILTINS.has(specifier)) return true;
  if (specifier.startsWith('@')) return false;
  return NODE_BUILTINS.has(specifier.split('/')[0]);
}
