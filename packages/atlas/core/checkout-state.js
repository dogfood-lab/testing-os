import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * "The checkout is as it was": every file under a root, .git included, by
 * content and mtime, and the rows that differ between two such snapshots.
 * A tool that wrote anything into the checkout, or let git refresh its index
 * there, would change a row. Test support, shared by the fleet service's
 * tests and the sidecar's; not published.
 */

/**
 * @param {string} root
 * @returns {Array<{ path: string, hash: string, mtimeMs: number }>} sorted by path
 */
export function checkoutSnapshot(root) {
  const rows = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      rows.push({
        path: relative(root, path).replaceAll('\\', '/'),
        hash: createHash('sha256').update(readFileSync(path)).digest('hex'),
        mtimeMs: statSync(path).mtimeMs,
      });
    }
  };
  walk(root);
  return rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The rows that differ between two snapshots, each named by its path and by
 * what moved, so a breach of "the checkout is never written" says which file
 * and whether its content or only its mtime changed.
 */
export function changedRows(before, after) {
  const was = new Map(before.map((row) => [row.path, row]));
  const now = new Map(after.map((row) => [row.path, row]));
  const changes = [];
  for (const [path, row] of now) {
    const old = was.get(path);
    if (!old) changes.push(`${path}: added`);
    else if (old.hash !== row.hash) changes.push(`${path}: content changed`);
    else if (old.mtimeMs !== row.mtimeMs) changes.push(`${path}: mtime ${old.mtimeMs} -> ${row.mtimeMs}`);
  }
  for (const path of was.keys()) if (!now.has(path)) changes.push(`${path}: removed`);
  return changes;
}
