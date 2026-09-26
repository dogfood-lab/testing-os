import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readBoundaryFile } from '../adapter/boundary-file.js';
import { buildMap, repositoryName, writeMap } from '../adapter/commands.js';
import { ENGINE } from '../adapter/engine.js';
import { writeArtifactSync } from '../adapter/write.js';
import { head } from './git.js';

/**
 * The child process atlas_refresh starts: it maps the checkout at root with
 * this engine, the way atlas map does, and writes the map into out, a
 * directory in the cache the parent swaps in whole once this exits 0. It
 * writes nothing else anywhere. Its git runs read only: the parent starts it
 * with GIT_OPTIONAL_LOCKS=0 and no lazy fetch. Progress and a failure go to
 * the parent over the IPC channel; when the parent goes away, so does it.
 */

const [root, out] = process.argv.slice(2);
const tell = (message) => {
  if (process.connected) process.send(message);
};
const orphaned = () => process.exit(1);
process.on('disconnect', orphaned);

// The last message is sent before the channel closes, and closing it is
// this process's own doing, not the parent leaving.
function finish(message, code) {
  process.exitCode = code;
  process.off('disconnect', orphaned);
  if (process.connected) process.send(message, () => process.disconnect());
}

try {
  const startedAt = new Date();
  const boundary = readBoundaryFile(root);
  if (!boundary.ok) throw new Error(`${boundary.code}: ${boundary.details.join('; ')}`);
  const commit = head(root);
  if (!commit) throw new Error('the repository has no commit to map');
  // Named as atlas map names it, so the refreshed page is the one a map of
  // this checkout would write.
  const map = buildMap({ repo: root, boundary, commit, origin: repositoryName(root), progress: (phase) => tell({ progress: phase }) });
  tell({ progress: 'writing the snapshot' });
  mkdirSync(out, { recursive: true });
  writeMap(out, map);
  const finishedAt = new Date();
  writeArtifactSync(join(out, 'snapshot.json'), `${JSON.stringify({
    engine: ENGINE,
    head: commit,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  }, null, 2)}\n`);
  finish({ done: true }, 0);
} catch (err) {
  finish({ error: err?.message ?? String(err) }, 1);
}
