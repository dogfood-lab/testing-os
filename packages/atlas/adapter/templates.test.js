import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileKind, isTestPath, reasonTemplate, roleFor, willBreakTemplate } from './templates.js';

describe('derived templates', () => {
  it('states the facts and nothing else', () => {
    assert.equal(
      reasonTemplate({
        count: 3,
        role: 'code',
        entryPoints: ['pkg/cli.js', 'pkg/index.js'],
        imports: [],
        importedBy: ['tests'],
      }),
      '3 files, role code; entry points pkg/cli.js, pkg/index.js; imports none; imported by tests',
    );
    assert.equal(
      reasonTemplate({ count: 1, role: 'docs', entryPoints: [], imports: [], importedBy: [] }),
      '1 file, role docs; entry points none; imports none; imported by none',
    );
    assert.equal(
      willBreakTemplate({ fanIn: ['ingest', 'report'], coveredBy: ['tests'] }),
      'Changing this breaks ingest, report; covered by tests in tests',
    );
    assert.equal(
      willBreakTemplate({ fanIn: [], coveredBy: [] }),
      'Changing this breaks nothing that imports it; not covered by any test boundary',
    );
  });

  it('keeps a package code when its suite outnumbers its source, and reserves test for a suite', () => {
    assert.equal(isTestPath('packages/beta/beta.test.js'), true);
    assert.equal(fileKind('packages/beta/beta.test.js'), 'test');
    const suite = ['pkg/index.js', 'pkg/a.test.js', 'pkg/b.test.js', 'pkg/c.test.js'];
    assert.equal(roleFor(suite), 'code');
    assert.equal(roleFor(['tests/check.js', 'tests/more.js']), 'test');
    assert.equal(roleFor(['docs/guide.md']), 'docs');
    assert.equal(roleFor(['config/a.json', 'config/b.yaml']), 'config');
    assert.equal(roleFor(['pkg/index.js', 'pkg/package.json', 'pkg/one.test.js']), 'code');
    assert.equal(fileKind('.github/CODEOWNERS'), 'config');
    assert.equal(fileKind('indexes/chain.jsonl'), 'config');
    assert.equal(fileKind('.gitignore'), 'config');
    assert.equal(fileKind('records/.gitkeep'), 'other');
    assert.equal(fileKind('assets/logo.png'), 'other');
    assert.equal(roleFor(['.github/CODEOWNERS', '.github/workflows/ci.yml']), 'config');
    assert.equal(roleFor(['assets/logo.png', 'records/.gitkeep']), 'config');
    assert.equal(roleFor(['swarms/notes.md', 'swarms/plan.md']), 'docs');
  });
});
