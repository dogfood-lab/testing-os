import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage, unreadEnd } from './page.js';

// fixtures/atlas/glob-readers: places one script writes that others read
// only through a glob, spelled in code or under a directory chosen at run
// time (see its README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/glob-readers');
const roots = [];
let structure;
let markdown;
let data;

before(() => {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [{ name: 'kb', globs: ['kb/**'], role: 'code' }, { name: 'root', globs: ['*'], role: 'code' }];
  structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const built = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/glob-readers' });
  markdown = built.markdown;
  data = JSON.parse(built.json);
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function section(heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

function readersOf(target) {
  return (structure.landings.find((landing) => landing.target === target)?.readers ?? []).map((entry) => `${entry.by} ${entry.pattern ?? ''}`.trim());
}

describe('a place read through a glob', () => {
  it('is read by each file whose spelled pattern matches it, through a loop over a glob and through rglob', () => {
    for (const target of ['kb/alpha.db', 'kb/beta.db']) {
      assert.deepEqual(readersOf(target), ['check.py */*.db', 'sizes.py **/*.db'], target);
    }
  });

  it('is never said to be read by nothing', () => {
    const unread = section('Written but never read');
    assert.ok(!unread.includes('kb/alpha.db'), unread);
    assert.ok(!unread.includes('kb/beta.db'), unread);
    assert.ok(!data.unread.some((item) => item.place.endsWith('.db')), JSON.stringify(data.unread));
  });

  it('keeps no pattern it matched nothing beside as a place of its own', () => {
    for (const pattern of ['*', '*/*.db', '**/*.db']) {
      assert.ok(!structure.landings.some((landing) => landing.target === pattern), JSON.stringify(structure.landings.map((landing) => landing.target)));
    }
  });
});

describe('a place written from files a glob finds under the home directory', () => {
  it('is written from inputs this repository does not keep', () => {
    const authored = section('Hand-authored');
    assert.ok(authored.includes('- **notes/*.txt** is written by notes/vendor.py from inputs this repository does not keep, and by people.'), authored);
  });
});

describe('a place a pattern under a directory chosen at run time could match', () => {
  it('is read by nothing the map can name, and the page names what may read it', () => {
    const unread = section('Written but never read');
    assert.ok(unread.includes('- **kb/build.log** is written by kb/load.py and read by nothing else this map can name: report.py reads `*.log` under a directory chosen at run time, which may include it.'), unread);
    assert.deepEqual(data.unread.find((item) => item.place === 'kb/build.log').mayRead, { by: ['report.py'], patterns: ['*.log'] });
    assert.deepEqual(structure.landings.find((landing) => landing.target === 'kb/build.log').mayReaders, [{ by: 'report.py', pattern: '*.log' }]);
  });
});

describe('the files a pattern under a directory chosen at run time may read', () => {
  it('leave out a pattern that spells no kind of file, and name three before counting the rest', () => {
    assert.ok(!JSON.stringify(structure.landings).includes('inventory.py'), 'rglob("*") under a directory a person names is set against no place');
    assert.equal(
      unreadEnd({ by: ['a.py', 'b.py', 'c.py', 'd.py', 'e.py'], patterns: ['*.json'] }),
      'and read by nothing else this map can name: a.py, b.py, c.py and 2 more files read `*.json` under a directory chosen at run time, which may include it.',
    );
  });
});
