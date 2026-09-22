import { randomBytes } from 'node:crypto';
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

// Public @dogfood-lab/atlas cannot depend on @dogfood-lab/findings. The core
// closure test rejects every @dogfood-lab dependency key, and the published
// binary has to run where findings is not installed. This file is the one
// writer. It writes the six generated atlas files. A torn write would make
// the next check fail on a partial file.

function sleepSync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

function renameWithRetry(tmp, dest) {
  const retries = 10;
  const baseMs = 15;
  const maxMs = 200;
  for (let i = 0; i <= retries; i += 1) {
    try {
      renameSync(tmp, dest);
      return;
    } catch (err) {
      if ((err.code !== 'EPERM' && err.code !== 'EBUSY') || i === retries) throw err;
      sleepSync(Math.min(baseMs * 2 ** i, maxMs));
    }
  }
}

export function writeArtifactSync(path, content) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    writeFileSync(tmp, content);
    renameWithRetry(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // The temp file may not exist if the write itself failed.
    }
    throw err;
  }
}
