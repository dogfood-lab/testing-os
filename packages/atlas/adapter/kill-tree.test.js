/**
 * defaultRun ends a timed-out child and what it started, and stops waiting for
 * the pipes a grandchild holds. The launcher stands for git on Windows: a
 * process that starts the real one as a child with the same stdio, so the
 * launcher's death does not close the pipes. Against a defaultRun that only
 * calls child.kill() and waits for `close`, the first test waits the
 * grandchild's whole sleep (measured on Windows with cmd.exe as the launcher).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { defaultRun } from './fleet.js';
import { KILL_GRACE_MS } from './kill-tree.js';

const SLEEP_MS = 15_000;
const TIMEOUT_MS = 1_500;

// The real worker: records its own pid, then sleeps.
const GRANDCHILD = `
require('node:fs').writeFileSync(process.argv[2], String(process.pid));
setTimeout(() => {}, ${SLEEP_MS});
`;

const scratch = [];
const grandchildren = [];

// A launcher process (cmd.exe, or sh with a command after the worker so it cannot exec it) that starts the
// worker as its child. The names are relative to the working directory so no quoting is needed.
function launcherIn(dir) {
  writeFileSync(join(dir, 'grandchild.cjs'), GRANDCHILD);
  const line = 'node grandchild.cjs grandchild.pid';
  const [command, args] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', line]] : ['sh', ['-c', `${line}; :`]];
  return { command, args, cwd: dir, pidFile: join(dir, 'grandchild.pid') };
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function recordGrandchild(pidFile) {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    grandchildren.push(pid);
    return pid;
  } catch {
    return null;
  }
}

afterEach(() => {
  for (const pid of grandchildren.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('defaultRun on a timeout', () => {
  it('settles shortly after the budget although a grandchild still holds the pipes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-kill-tree-'));
    scratch.push(dir);
    const { command, args, cwd, pidFile } = launcherIn(dir);
    const began = Date.now();
    const result = await defaultRun(command, args, { cwd, timeoutMs: TIMEOUT_MS });
    const elapsed = Date.now() - began;
    recordGrandchild(pidFile);
    assert.equal(result.timedOut, true);
    assert.equal(result.status, 124);
    assert.ok(elapsed >= TIMEOUT_MS - 50, `settled before the budget: ${elapsed} ms`);
    assert.ok(elapsed < TIMEOUT_MS + KILL_GRACE_MS + 2_500, `waited for the grandchild's pipes: ${elapsed} ms`);
  });

  it('ends the grandchild too on Windows', { skip: process.platform !== 'win32' }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-kill-tree-'));
    scratch.push(dir);
    const { command, args, cwd, pidFile } = launcherIn(dir);
    await defaultRun(command, args, { cwd, timeoutMs: TIMEOUT_MS });
    const pid = recordGrandchild(pidFile);
    assert.ok(pid, 'the worker never recorded its pid');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    assert.equal(alive(pid), false, 'the grandchild outlived the timeout');
  });
});

describe('defaultRun without a timeout', () => {
  it('resolves once, with the exit status and the output, when the child ends by itself', async () => {
    const result = await defaultRun(process.execPath, ['-e', 'console.log("ok"); process.exit(3)'], { timeoutMs: 10_000 });
    assert.equal(result.status, 3);
    assert.equal(result.stdout.trim(), 'ok');
    assert.equal(result.timedOut, false);
  });

  it('reports a command that cannot start as status 1 with the error', async () => {
    const result = await defaultRun('atlas-no-such-command-for-this-test', [], { timeoutMs: 10_000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT|not found|spawn/i);
  });
});
