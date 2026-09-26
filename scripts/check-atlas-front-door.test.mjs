/**
 * The Atlas front door as an agent that runs no script receives it, read as
 * text and never through a browser: the site's Atlas page names the agent
 * index in its markup, and the site root serves llms.txt, which says what
 * Atlas is and links the same index.
 *
 * The build-output test needs `npm run build` in site/. Without a build it
 * skips visibly, as in ci.yml's test:scripts; pages.yml runs this file right
 * after its build, where the output exists, so the deployed files are the
 * ones checked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
// Where scripts/atlas-render.mjs publishes the index: indexes/atlas/llms.txt on the atlas-render branch.
const INDEX = 'https://raw.githubusercontent.com/dogfood-lab/testing-os/atlas-render/indexes/atlas/llms.txt';

// The markup with every script removed: what a reader that runs none is left with.
function withoutScripts(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
}

function assertPointer(html, label) {
  const text = withoutScripts(html);
  const head = text.slice(0, text.indexOf('</head>'));
  assert.ok(head.includes(`<link rel="alternate" type="text/plain" href="${INDEX}"`), `${label}: the head names the index`);
  const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(text.slice(text.indexOf('<body')));
  assert.ok(noscript, `${label}: the body has a noscript block`);
  assert.ok(noscript[1].includes(`<a href="${INDEX}">`), `${label}: the noscript block links the index`);
}

test('the Atlas page names the agent index in markup no script has to run for', () => {
  assertPointer(readFileSync(join(repoRoot, 'site', 'public', 'atlas', 'index.html'), 'utf8'), 'site/public/atlas/index.html');
});

test('the site root serves llms.txt, which says what Atlas is and links the index', () => {
  const text = readFileSync(join(repoRoot, 'site', 'public', 'llms.txt'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(text, /^# testing-os\n\n> Atlas, the repository mapper in testing-os, /, 'a title, then the summary, as the llms.txt convention orders them');
  assert.ok(text.includes(`](${INDEX}): `), 'a link to the index, with what it holds');
});

test('the site build serves llms.txt at its root and the pointer in the Atlas page', (t) => {
  const dist = join(repoRoot, 'site', 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    t.skip('site/dist holds no build: run npm run build in site/ (pages.yml runs this file after its build)');
    return;
  }
  const stale = ' (a build older than site/public? rebuild with npm run build in site/)';
  assert.ok(existsSync(join(dist, 'llms.txt')), `site/dist/llms.txt is missing${stale}`);
  assert.equal(
    readFileSync(join(dist, 'llms.txt'), 'utf8'),
    readFileSync(join(repoRoot, 'site', 'public', 'llms.txt'), 'utf8'),
    `site/dist/llms.txt is site/public/llms.txt${stale}`,
  );
  assertPointer(readFileSync(join(dist, 'atlas', 'index.html'), 'utf8'), 'site/dist/atlas/index.html');
});
