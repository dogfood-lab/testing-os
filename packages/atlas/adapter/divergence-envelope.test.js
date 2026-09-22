import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const SCHEMA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/schemas/src/json/atlas-divergence.schema.json');
const roots = [];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atlas-divergence-'));
  roots.push(root);
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'user.email', 'atlas@example.com']);
  git(root, ['config', 'user.name', 'atlas']);
  git(root, ['remote', 'add', 'origin', 'https://github.com/example/host.git']);
  mkdirSync(join(root, 'atlas'));
  mkdirSync(join(root, 'alpha'));
  mkdirSync(join(root, 'beta'));
  writeFileSync(join(root, 'atlas', 'boundaries.yaml'), [
    'summary: a divergence fixture',
    'boundaries:',
    '  - name: alpha',
    '    globs: [alpha/**]',
    '    status: proposed',
    '    role: code',
    '  - name: beta',
    '    globs: [beta/**]',
    '    status: proposed',
    '    role: code',
    '',
  ].join('\n'));
  for (let i = 0; i < 12; i += 1) writeFileSync(join(root, `pad${i}.txt`), 'p\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'pad']);
  for (let i = 0; i < 5; i += 1) {
    writeFileSync(join(root, 'alpha', 'a.js'), `a${i}\n`);
    writeFileSync(join(root, 'beta', 'b.js'), `b${i}\n`);
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', `couple ${i}`]);
  }
  return root;
}

function validate(envelope) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const ok = ajv.validate(JSON.parse(readFileSync(SCHEMA, 'utf8')), envelope);
  assert.equal(ok, true, ajv.errorsText());
}

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('divergence envelope', () => {
  it('validates, keeps ids across two runs, and clears a row that the previous report had open', () => {
    const root = fixture();
    const firstPath = join(root, 'first.json');
    const secondPath = join(root, 'second.json');
    const thirdPath = join(root, 'third.json');
    const first = atlas(root, ['map', '--divergence', firstPath]);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const envelope = JSON.parse(readFileSync(firstPath, 'utf8'));
    validate(envelope);
    assert.equal(envelope.repo, 'example/host');
    assert.equal(envelope.shared_commit_floor, 3);
    assert.equal(envelope.confidence, 'low');
    assert.ok(envelope.rows.some((row) => row.rule === 'leaks' && row.state === 'open'));
    const again = atlas(root, ['map', '--divergence', secondPath]);
    assert.equal(again.status, 0, again.stdout + again.stderr);
    const second = JSON.parse(readFileSync(secondPath, 'utf8'));
    validate(second);
    assert.deepEqual(second.rows.map((row) => row.id), envelope.rows.map((row) => row.id));
    const previous = {
      ...envelope,
      rows: [
        ...envelope.rows,
        {
          id: 'example/host|leaks|ghost',
          rule: 'leaks',
          boundary: 'ghost',
          value: 1,
          threshold: 0,
          confidence: 'low',
          state: 'open',
          first_seen: '2020-01-01T00:00:00Z',
          last_seen: '2020-06-01T00:00:00Z',
        },
      ],
    };
    const previousPath = join(root, 'previous.json');
    writeFileSync(previousPath, JSON.stringify(previous));
    const third = atlas(root, ['map', '--divergence', thirdPath, '--previous', previousPath]);
    assert.equal(third.status, 0, third.stdout + third.stderr);
    const cleared = JSON.parse(readFileSync(thirdPath, 'utf8'));
    validate(cleared);
    const ghost = cleared.rows.find((row) => row.id === 'example/host|leaks|ghost');
    assert.equal(ghost.state, 'cleared');
    assert.equal(ghost.first_seen, '2020-01-01T00:00:00Z');
    assert.equal(ghost.last_seen, '2020-06-01T00:00:00Z');
  });
});
