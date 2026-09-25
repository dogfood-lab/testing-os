import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { roleFor } from './templates.js';

// fixtures/atlas/init-role-ties: directories whose role sits on an edge
// (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/init-role-ties');

function files(dir) {
  return readdirSync(join(FIXTURE, dir)).flatMap((name) => {
    const path = join(FIXTURE, dir, name);
    return statSync(path).isDirectory() ? files(join(dir, name)) : [relative(FIXTURE, path).split(sep).join('/')];
  });
}

describe('init roles on the edge', () => {
  it('gives a docs and config tie docs', () => {
    assert.equal(roleFor(files('docs')), 'docs');
  });

  it('gives a directory of JSON and Markdown reports data', () => {
    assert.equal(roleFor(files('artifacts')), 'data');
  });

  it('gives an npm wrapper with a command code', () => {
    assert.equal(roleFor(files('npm'), { manifest: true }), 'code');
  });
});
