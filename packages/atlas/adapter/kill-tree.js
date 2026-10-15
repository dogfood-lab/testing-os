/**
 * Ending a child process and what it started. On Windows `git.exe` is a
 * launcher that starts the real git as a child, so `child.kill()` ends the
 * launcher and leaves the real process holding the stdout and stderr pipes:
 * the child's `close` event, which waits for the pipes, does not come until
 * that process ends on its own. A stalled `git clone` overran its budget to
 * 21 s against 1.2 s when the whole tree was ended (measured by The Cleaner,
 * ollama-intern-mcp#81 has the same fix).
 */
import { spawn } from 'node:child_process';

/** How long a caller waits for `close` after the kill before it stops waiting. */
export const KILL_GRACE_MS = 2_000;

function killChild(child) {
  try {
    child.kill('SIGKILL');
  } catch {
    // Already gone.
  }
}

/**
 * Ends the child and, on Windows, everything it started.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ platform?: string, spawnProcess?: typeof spawn }} [options] the platform and the spawner, so a test can
 *   take the Windows branch on any host
 */
export function killTree(child, { platform = process.platform, spawnProcess = spawn } = {}) {
  if (platform === 'win32' && child.pid !== undefined) {
    const taskkill = spawnProcess('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    taskkill.on('error', () => killChild(child));
    return;
  }
  killChild(child);
}
