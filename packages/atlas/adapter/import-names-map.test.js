import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mappedRepository } from '../sidecar/test-client.js';

// docs/atlas-buildup.spec.md, slice AQ (AQ-1): the map records what each
// import of a package binds, in structure.json under each file's
// importNames: the names taken from the module (the name it exports, never
// the local alias; `default` and `*` for the default export and the whole
// namespace), each marked when it is only a type, and the site marked
// typeOnly when every name is. Package imports only; relative imports are
// already file edges. These map the fixture import-names and read what the
// map wrote.

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/import-names');
let root;
let structure;

before(() => {
  root = mappedRepository(FIXTURE, { prefix: 'atlas-import-names-' });
  structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function fileIn(path) {
  return [...structure.boundaries.flatMap((boundary) => boundary.files), ...structure.unassigned].find((file) => file.path === path);
}

const at = (path, line) => fileIn(path).importNames.find((entry) => entry.line === line);
const shape = (entry) => [entry.form, entry.typeOnly, entry.names.map((name) => (name.type ? `type ${name.name}` : name.name)).join(',')];

describe('importNames', () => {
  it('record the names an import takes, never the local alias, with default and the namespace marked', () => {
    assert.deepEqual(shape(at('src/main.ts', 1)), ['import', false, 'default,a,type T,b'], 'import def, { a as local, type T, b }: a, not local');
    assert.deepEqual(shape(at('src/main.ts', 4)), ['import', false, '*'], 'import * as ns');
    assert.deepEqual(shape(at('src/main.ts', 11)), ['import', false, 'string name'], 'a string name keeps its text');
  });

  it('mark a name that is only a type, and the site only when every name is', () => {
    assert.equal(at('src/main.ts', 1).typeOnly, false, 'a mixed import is not type-only');
    assert.deepEqual(at('src/main.ts', 1).names.find((name) => name.name === 'T'), { name: 'T', type: true });
    assert.deepEqual(shape(at('src/main.ts', 2)), ['import', true, 'type Only,type Also'], 'import type { … } makes every name a type');
    assert.deepEqual(shape(at('src/main.ts', 3)), ['import', true, 'type default'], 'import type D');
    assert.equal(at('src/main.ts', 2).specifier, 'lib-a/sub', 'a subpath is kept as written, against its package');
    assert.equal(at('src/main.ts', 2).purl, 'pkg:npm/lib-a');
  });

  it('say a side-effect import binds nothing', () => {
    const entry = at('src/main.ts', 5);
    assert.deepEqual(entry.names, []);
    assert.equal(entry.sideEffect, true);
    assert.equal(entry.typeOnly, false);
  });

  it('record what an export … from hands on', () => {
    assert.deepEqual(shape(at('src/main.ts', 7)), ['reexport', false, 'x,type Z'], 'export { x as y, type Z }: x, not y');
    assert.deepEqual(shape(at('src/main.ts', 8)), ['reexport', true, 'type W'], 'export type');
    assert.deepEqual(shape(at('src/main.ts', 9)), ['reexport', false, '*'], 'export * from');
    assert.deepEqual(shape(at('src/main.ts', 10)), ['reexport', false, '*'], 'export * as star from');
  });

  it('record what a require or import() destructures at once, else the whole module', () => {
    assert.deepEqual(shape(at('src/main.ts', 13)), ['require', false, 'p,q,*'], 'const { p, q: r, ...rest }: p, q, and the rest as *');
    assert.deepEqual(shape(at('src/main.ts', 14)), ['require', false, '*'], 'const whole = require()');
    assert.deepEqual(shape(at('src/main.ts', 15)), ['dynamic', false, 's'], 'const { s } = await import()');
    assert.deepEqual(shape(at('src/main.ts', 16)), ['dynamic', false, '*'], 'const lazy = import() names nothing in particular');
    assert.deepEqual(shape(at('src/plain.cjs', 1)), ['require', false, 'cjsName'], 'a CommonJS file reads the same way');
  });

  it('are bounded: a site that takes more than 50 names says so and keeps the whole module', () => {
    const entry = at('src/main.ts', 12);
    assert.deepEqual(entry.names, [{ name: '*' }]);
    assert.equal(entry.namesTotal, 55);
  });

  it('are in source order, one record per site, and carry no import that is not a package', () => {
    const lines = fileIn('src/main.ts').importNames.map((entry) => entry.line);
    assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
    assert.equal(fileIn('src/main.ts').importNames.length, 15, 'one per package import the file makes (the eq = require form is not read)');
    assert.equal(fileIn('src/main.ts').packages.length, 13, 'packages lists each package once; lib-a and lib-d each appear twice in importNames');
  });
});
