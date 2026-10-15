import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/action-jobs: jobs whose work is done by actions, and a
// job that reads the organization's other repositories (see the fixture's
// README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/action-jobs');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function page() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'scripts', globs: ['scripts/**'], role: 'code' },
    { name: 'docs', globs: ['docs/**'], role: 'docs' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  return buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/action-jobs' }).markdown;
}

describe('a job made only of actions', () => {
  it('is said by what its actions do', () => {
    const markdown = page();
    const flow = markdown.split('## What happens through Docs Quality')[1].split('\n## ')[0];
    assert.ok(flow.includes('2. It lints Markdown with markdownlint-cli2.\n3. It checks links with lychee.'), flow);
  });
});

describe('a job that reads the organization through gh api', () => {
  it('reads other repositories', () => {
    const markdown = page();
    assert.ok(markdown.includes('**Org Guard** runs no file this map can see and reads other repositories through the GitHub API.'), markdown);
  });
});

describe('a job that reads its own repository through gh api', () => {
  it('reads no other repository', () => {
    const markdown = page();
    assert.ok(markdown.includes('**PR comment** runs no file this map can see.'), markdown);
  });
});

describe('a workflow that uploads a SARIF report', () => {
  // github/codeql-action/upload-sarif sends a report any tool may have made
  // to code scanning (OpenSSF Scorecard's, in interlock); it scans nothing.
  // Only init, analyze and autobuild are CodeQL's own scan.
  it('is not said to scan code with CodeQL', () => {
    const markdown = page();
    assert.ok(markdown.includes('**Scorecard** runs no file this map can see and uploads a SARIF report to code scanning.'), markdown);
  });

  it('leaves CodeQL\'s own steps saying they scan code with CodeQL', () => {
    const markdown = page();
    assert.ok(markdown.includes('**Code Scanning** runs no file this map can see and scans code with CodeQL.'), markdown);
  });
});
