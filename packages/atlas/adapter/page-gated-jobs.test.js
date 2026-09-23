import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// fixtures/atlas/gated-jobs: a CI workflow started by a push, a pull request
// or by hand, whose deploy job runs only on a push to main, whose release job
// runs only on a tag, and whose changelog job commits only on main.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/gated-jobs');
const roots = [];
let structure;
let markdown;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-gated-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'gated-jobs']);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
  markdown = readFileSync(join(root, 'atlas', 'README.md'), 'utf8');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('a job gated to one trigger', () => {
  it('keeps what a gated job sends and commits apart from what every run of the door does', () => {
    const ci = structure.doors.find((door) => door.file === '.github/workflows/ci.yml');
    assert.equal(ci.sends.deploysPages, false);
    assert.equal(ci.sends.releases, false);
    assert.deepEqual(ci.stages, []);
    assert.deepEqual(ci.gated, [
      { jobs: ['deploy-pages'], pushes: false, sends: ['deploysPages'], stages: [], when: { branches: ['main'], event: 'push' } },
      { jobs: ['changelog'], pushes: true, sends: [], stages: ['CHANGELOG.md'], when: { branches: ['main'] } },
      { jobs: ['release'], pushes: false, sends: ['releases'], stages: [], when: { event: 'push', tags: true } },
    ]);
  });

  it('says on which trigger each gated job acts', () => {
    const lines = markdown.split('\n');
    assert.ok(lines.includes('3. It deploys the site on a push to main.'), markdown);
    assert.ok(lines.includes('4. It commits CHANGELOG.md and pushes on main.'), markdown);
    assert.ok(lines.includes('5. It creates a GitHub release on a tag push.'), markdown);
  });
});
