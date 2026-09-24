import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseToml } from './toml.js';

describe('the TOML reader Cargo manifests are read with', () => {
  it('reads tables, arrays of tables, dotted and quoted keys, inline tables and every kind of string', () => {
    const doc = parseToml([
      '[package]',
      'name = "forge" # the crate',
      "description = '''",
      'two "lines"',
      "'''",
      'version.workspace = true',
      '',
      '[dependencies]',
      'engine = { path = "../engine", package = "forge-engine", features = ["a", "b"] }',
      "[target.'cfg(windows)'.dependencies]",
      'winapi = "0.3"',
      '[[bin]]',
      'name = "one"',
      '[[bin]]',
      'name = "two"',
      'path = "src/two.rs"',
      '[workspace]',
      'members = [',
      '  "crates/*", # every crate',
      '  "apps/cli",',
      ']',
    ].join('\n'));
    assert.deepEqual(doc, {
      package: { name: 'forge', description: 'two "lines"\n', version: { workspace: 'true' } },
      dependencies: { engine: { path: '../engine', package: 'forge-engine', features: ['a', 'b'] } },
      target: { 'cfg(windows)': { dependencies: { winapi: '0.3' } } },
      bin: [{ name: 'one' }, { name: 'two', path: 'src/two.rs' }],
      workspace: { members: ['crates/*', 'apps/cli'] },
    });
  });

  it('keeps what a document declared before the line it cannot read', () => {
    assert.deepEqual(parseToml('[package]\nname = "kept"\nthis is not toml\nversion = "1"\n'), { package: { name: 'kept' } });
  });
});
