import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const GRAMMARS = fileURLToPath(new URL('../grammars/', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url));
// Each grammar and where its bytes come from: the four VS Code ships and
// Rust from @vscode/tree-sitter-wasm, GDScript built from its npm source
// with the tree-sitter CLI of the web-tree-sitter version the package pins.
const EXPECTED = {
  'tree-sitter-gdscript.wasm': { source: 'tree-sitter-gdscript', version: '6.1.0' },
  'tree-sitter-javascript.wasm': { source: '@vscode/tree-sitter-wasm', version: '0.3.1' },
  'tree-sitter-python.wasm': { source: '@vscode/tree-sitter-wasm', version: '0.3.1' },
  'tree-sitter-rust.wasm': { source: '@vscode/tree-sitter-wasm', version: '0.3.1' },
  'tree-sitter-tsx.wasm': { source: '@vscode/tree-sitter-wasm', version: '0.3.1' },
  'tree-sitter-typescript.wasm': { source: '@vscode/tree-sitter-wasm', version: '0.3.1' },
};
const WASM = Object.keys(EXPECTED).sort();

describe('grammar manifest', () => {
  const manifest = JSON.parse(readFileSync(join(GRAMMARS, 'manifest.json'), 'utf8'));

  it('re-hashes every vendored grammar against the manifest', () => {
    // The hash is the pin. A grammar file that no longer matches the bytes
    // recorded from its source fails here.
    const present = readdirSync(GRAMMARS).sort();
    assert.deepEqual(present, ['manifest.json', ...WASM].sort());
    assert.deepEqual(Object.keys(manifest.grammars ?? {}).sort(), WASM);
    for (const name of WASM) {
      const entry = manifest.grammars[name];
      assert.equal(entry.source, EXPECTED[name].source, name);
      assert.equal(entry.version, EXPECTED[name].version, name);
      const hash = createHash('sha256').update(readFileSync(join(GRAMMARS, name))).digest('hex');
      assert.equal(hash, entry.sha256, name);
    }
  });

  it('says how a grammar no package ships prebuilt was built, for the runtime it is loaded by', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'));
    const built = manifest.grammars?.['tree-sitter-gdscript.wasm']?.built ?? {};
    assert.equal(built.cli, `tree-sitter-cli@${pkg.dependencies['web-tree-sitter']}`);
    assert.equal(built.command, 'tree-sitter build --wasm');
    assert.match(built.sourceIntegrity ?? '', /^sha512-/);
  });

  it('ships every grammar in the package', () => {
    const files = JSON.parse(readFileSync(PACKAGE, 'utf8')).files;
    for (const name of [...WASM, 'manifest.json']) assert.ok(files.includes(`grammars/${name}`), name);
  });
});
