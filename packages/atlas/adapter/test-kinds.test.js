import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { buildArtifact } from './artifact.js';
import { kindsOf } from './test-kinds.js';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';

// Each part gets exactly one kind, from its language and manifests, the most
// specific winning (docs/atlas-test-gaps.spec.md, "Kind of code").

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/test-kinds');
const PARTS = [
  { name: 'root', globs: ['package.json', 'README.md'], role: 'config' },
  { name: 'server', globs: ['packages/server/**'], role: 'code' },
  { name: 'lib', globs: ['packages/lib/**'], role: 'code' },
  { name: 'tools', globs: ['tools/**'], role: 'code' },
  { name: 'crate', globs: ['crate/**'], role: 'code' },
  { name: 'extension', globs: ['extension/**'], role: 'code' },
  { name: 'game', globs: ['game/**'], role: 'code' },
  { name: 'data', globs: ['data/**'], role: 'data' },
];
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('the kind of code each part is', () => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const kinds = kindsOf(buildArtifact(mapRepository({ repoPath: root, boundaries: PARTS }), '0'.repeat(40)));

  it('resolves a TypeScript MCP server inside a monorepo to MCP server, and names it', () => {
    assert.deepEqual(kinds.get('server'), { kind: 'mcp-server', label: 'MCP server' });
  });

  it('gives a plain package of a workspace monorepo the monorepo kind', () => {
    assert.deepEqual(kinds.get('lib'), { kind: 'ts-monorepo', label: 'TypeScript monorepo' });
  });

  it('reads the other kinds from language and manifests', () => {
    assert.deepEqual(kinds.get('tools'), { kind: 'python', label: 'Python library or CLI' });
    assert.deepEqual(kinds.get('crate'), { kind: 'rust', label: 'Rust crate or CLI' });
    assert.deepEqual(kinds.get('extension'), { kind: 'vscode-extension', label: 'VS Code extension' });
    assert.deepEqual(kinds.get('game'), { kind: 'godot-game', label: 'Godot game' });
    assert.deepEqual(kinds.get('data'), { kind: 'data', label: 'Data or asset pack' });
  });

  it('gives a part that is not code no kind', () => {
    assert.equal(kinds.has('root'), false);
  });
});
