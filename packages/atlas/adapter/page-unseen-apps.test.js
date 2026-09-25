import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mapRepository } from '../core/index.js';
import { makeRepo } from '../core/fixture-repo.js';
import { buildArtifact } from './artifact.js';
import { buildPage } from './page.js';

// fixtures/atlas/unseen-apps: an app and deployments no workflow reaches,
// and a UI that calls the server over HTTP (see the fixture's README).

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/unseen-apps');
const roots = [];

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

function mapped() {
  const root = makeRepo(FIXTURE);
  roots.push(root);
  const boundaries = [
    { name: 'desktop', globs: ['apps/desktop/**'], role: 'code' },
    { name: 'root', globs: ['*', '.github/**'], role: 'config' },
    { name: 'server', globs: ['packages/server/**'], role: 'code' },
    { name: 'ui', globs: ['packages/ui/**'], role: 'code' },
  ];
  const structure = buildArtifact(mapRepository({ repoPath: root, boundaries }), '0'.repeat(40));
  const page = buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/unseen-apps' });
  return { structure, markdown: page.markdown, data: JSON.parse(page.json) };
}

function section(markdown, heading) {
  const at = markdown.indexOf(`## ${heading}\n`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at, end === -1 ? undefined : end);
}

describe('what runs where no workflow reaches', () => {
  const { structure, markdown, data } = mapped();

  it('draws an HTTP call to a route the server mounts as an edge between the parts', () => {
    assert.deepEqual(structure.edges.filter((edge) => edge.kind === 'http'), [{ from: 'ui', kind: 'http', routes: 2, to: 'server' }]);
    assert.match(section(markdown, 'What breaks what'), /- \*\*server\*\* is called over HTTP by 1 part \(ui\) and sits on the path of 1 door\./);
  });

  it('says the HTTP link and the deployments in the limits', () => {
    assert.ok(data.limits.includes('ui calls server over HTTP at 2 routes, a link no import shows: the map draws it, and no door\'s reach follows it.'), data.limits.join('\n'));
    assert.ok(data.limits.includes('There is a Dockerfile, a fly.toml and a render.yaml that no workflow runs; what deploys from them does so from outside this repository, and is not on this page.'), data.limits.join('\n'));
  });

  it('reads the Tauri app as a desktop app, so it is no longer unseen', () => {
    assert.ok(!data.limits.some((line) => line.includes('Tauri')), data.limits.join('\n'));
    // No workflow here builds it (fixtures/atlas/release-binaries has one that does).
    assert.match(markdown, /\*\*fixture\*\* \(a desktop app built from apps\/desktop\/src-tauri, which nothing ships\)\. Runs apps\/desktop\/src-tauri\/src\/main\.rs\./);
  });
});
