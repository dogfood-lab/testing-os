import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileKind, isTestPath, roleFor } from './templates.js';

describe('derived roles', () => {
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
    assert.equal(roleFor(['dogfood/a.yaml', 'dogfood/validate.test.mjs']), 'config');
  });

  it('reads a part as docs when its prose outweighs its code more than two to one', () => {
    const pages = Array.from({ length: 10 }, (_, i) => `docs/page-${i}.md`);
    assert.equal(roleFor([...pages, 'docs/check-links.ts']), 'docs');
    assert.equal(roleFor([...pages, 'docs/check-links.ts', 'docs/package.json']), 'docs');
    // One module beside its README and changelog is still a package of code.
    assert.equal(roleFor(['pkg/index.ts', 'pkg/README.md', 'pkg/CHANGELOG.md', 'pkg/package.json']), 'code');
    // Its tests count with its code: three modules under test beside five pages.
    assert.equal(roleFor(['pkg/a.ts', 'pkg/a.test.ts', 'pkg/b.test.ts', ...pages.slice(0, 5)]), 'code');
    // Below the ratio with no prose majority, configuration is what is left.
    assert.equal(roleFor(['cfg/a.json', 'cfg/b.json', 'cfg/c.json', 'cfg/d.md', 'cfg/e.md', 'cfg/f.md', 'cfg/g.md', 'cfg/h.ts']), 'config');
    assert.equal(fileKind('site/public/robots.txt'), 'docs');
    assert.equal(fileKind('requirements-dev.txt'), 'other');
  });
});
