/**
 * A unified diff of one file, for a person to read before anything is
 * written: every changed line with three lines of context.
 *
 * @param {string | null} before the file's text, or null for a new file
 * @param {string} after
 * @param {string} path the file's repository path
 * @returns {string}
 */
export function unifiedDiff(before, after, path, context = 3) {
  const a = linesOf(before ?? '');
  const b = linesOf(after);
  // The longest common subsequence of lines, from the end, then walked from the start.
  const common = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) ops.push({ kind: ' ', text: a[i++], i, j: ++j });
    else if (j < b.length && (i === a.length || common[i][j + 1] >= common[i + 1][j])) ops.push({ kind: '+', text: b[j++], i, j });
    else ops.push({ kind: '-', text: a[i++], i, j });
  }
  const changed = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0);
  if (changed.length === 0) return '';
  const hunks = [];
  for (const index of changed) {
    const last = hunks.at(-1);
    if (last && index - context <= last.end + context) last.end = index;
    else hunks.push({ start: index, end: index });
  }
  const out = [before == null ? '--- /dev/null' : `--- a/${path}`, `+++ b/${path}`];
  for (const hunk of hunks) {
    const from = Math.max(0, hunk.start - context);
    const to = Math.min(ops.length - 1, hunk.end + context);
    const slice = ops.slice(from, to + 1);
    const aLines = slice.filter((op) => op.kind !== '+').length;
    const bLines = slice.filter((op) => op.kind !== '-').length;
    const aStart = ops.slice(0, from).filter((op) => op.kind !== '+').length + (aLines > 0 ? 1 : 0);
    const bStart = ops.slice(0, from).filter((op) => op.kind !== '-').length + (bLines > 0 ? 1 : 0);
    out.push(`@@ -${aStart},${aLines} +${bStart},${bLines} @@`);
    for (const op of slice) out.push(`${op.kind}${op.text}`);
  }
  return `${out.join('\n')}\n`;
}

function linesOf(text) {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}
