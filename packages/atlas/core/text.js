import { spawnSync } from 'node:child_process';

/**
 * A tracked file's content as git stores it, whatever the checkout's line
 * endings: a Windows checkout with core.autocrlf holds CRLF where Linux holds
 * LF, and a map made on either must be the same map. A text file is read
 * with CRLF as LF; a binary file is read as it is.
 *
 * A file is text, as git's text=auto has it, when its first 8000 bytes hold
 * no NUL. A tracked .gitattributes decides first: -text (and binary) keeps a
 * file as it is, and text, or an eol, makes it text whatever it holds. Only
 * the repository's own attribute files are read: the system's, the user's
 * core.attributesFile and $GIT_DIR/info/attributes belong to the host, and a
 * map read from them would differ between hosts.
 */

const FIRST_FEW_BYTES = 8000;
const CR = 13;

/**
 * The attributes git gives each path that decide whether it is text, read
 * from the tracked .gitattributes files, or an empty map when there are none.
 *
 * @param {string} repoPath
 * @param {string[]} paths tracked regular files
 * @returns {Map<string, { text?: string, eol?: string }>}
 */
export function textAttributes(repoPath, paths) {
  const out = new Map();
  if (!paths.some((path) => path === '.gitattributes' || path.endsWith('/.gitattributes'))) return out;
  const result = spawnSync('git', ['-c', 'core.attributesFile=', 'check-attr', '-z', '--stdin', 'text', 'eol'], {
    cwd: repoPath,
    input: paths.join('\0'),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_ATTR_NOSYSTEM: '1' },
  });
  if (result.status !== 0) return out;
  const fields = result.stdout.split('\0');
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const [path, name, value] = [fields[i], fields[i + 1], fields[i + 2]];
    if (value === 'unspecified') continue;
    if (!out.has(path)) out.set(path, {});
    out.get(path)[name] = value;
  }
  return out;
}

/**
 * @param {Buffer} bytes the file as the checkout holds it
 * @param {{ text?: string, eol?: string }} [attributes]
 * @returns {Buffer} the file as git stores it
 */
export function storedBytes(bytes, attributes = {}) {
  if (attributes.text === 'unset') return bytes;
  const text = attributes.text === 'set' || (attributes.text == null && attributes.eol != null);
  if (!text && bytes.subarray(0, FIRST_FEW_BYTES).includes(0)) return bytes;
  if (!bytes.includes(CR)) return bytes;
  return Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
}

/**
 * A text file read for what it says (a workflow, a Dockerfile, a manifest),
 * with CRLF read as LF, so a line never ends in a carriage return.
 *
 * @param {string} text
 * @returns {string}
 */
export function storedText(text) {
  return text.includes('\r') ? text.replaceAll('\r\n', '\n') : text;
}
