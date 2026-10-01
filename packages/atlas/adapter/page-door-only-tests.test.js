import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/door-only-tests: C# and PowerShell code the map does not
// read, a C# test project and a site (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/door-only-tests');
const roots = [];
let root;

before(() => {
  root = makeRepo(FIXTURE);
  roots.push(root);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped(roles) {
  const boundaries = Object.entries(roles).map(([name, role]) => ({ name, globs: [name === 'root' ? '*' : `${name}/**`], role }));
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/door-only-tests' });
  const at = built.markdown.indexOf('## What no test touches\n');
  return { section: built.markdown.slice(at, built.markdown.indexOf('\n## ', at + 1)), data: JSON.parse(built.json) };
}

describe('what no test touches, when the only parts read are the tests and a site', () => {
  it('makes no claim about every code part, and says what it cannot see', () => {
    const { section, data } = mapped({ root: 'docs', scripts: 'code', site: 'site', src: 'code', tests: 'test' });
    assert.ok(!section.includes('Every code part'), section);
    assert.ok(section.includes('scripts and src hold only C# and PowerShell files, which this map does not read, so whether a test touches them cannot be seen.'), section);
    assert.equal(data.testedCodeParts, 0);
  });

  it('says no part outside the tests holds code it reads, when no code part is named', () => {
    const { section } = mapped({ root: 'docs', scripts: 'config', site: 'site', src: 'config', tests: 'test' });
    assert.ok(!section.includes('Every code part'), section);
    assert.ok(section.includes('No part outside the tests holds code this map reads.'), section);
  });
});
