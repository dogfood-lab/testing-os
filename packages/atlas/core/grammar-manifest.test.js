import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const GRAMMARS = fileURLToPath(new URL('../grammars/', import.meta.url));
const WASM = [
  'tree-sitter-javascript.wasm',
  'tree-sitter-python.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-typescript.wasm',
];

describe('grammar manifest', () => {
  it('re-hashes the four vendored grammars against the manifest', () => {
    // The hash is the pin. A grammar file that no longer matches the bytes
    // recorded from @vscode/tree-sitter-wasm 0.3.1 fails here.
    const manifest = JSON.parse(readFileSync(join(GRAMMARS, 'manifest.json'), 'utf8'));
    assert.equal(manifest.source, '@vscode/tree-sitter-wasm');
    assert.equal(manifest.version, '0.3.1');
    const present = readdirSync(GRAMMARS).sort();
    assert.deepEqual(present, ['manifest.json', ...WASM].sort());
    assert.deepEqual(Object.keys(manifest.sha256).sort(), [...WASM].sort());
    for (const name of WASM) {
      const hash = createHash('sha256').update(readFileSync(join(GRAMMARS, name))).digest('hex');
      assert.equal(hash, manifest.sha256[name], name);
    }
  });
});
