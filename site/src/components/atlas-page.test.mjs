/**
 * The Atlas site page is a static shell plus render.js, a module of pure
 * functions from page.json to HTML. These tests render this repository's own
 * committed atlas/page.json through that module, so a change to the page
 * contract that the site has not followed reds here, not in a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const shellPath = join(repoRoot, 'site', 'public', 'atlas', 'index.html');
const renderPath = join(repoRoot, 'site', 'public', 'atlas', 'render.js');
const shell = readFileSync(shellPath, 'utf8');
const renderSrc = readFileSync(renderPath, 'utf8');
const page = JSON.parse(readFileSync(join(repoRoot, 'atlas', 'page.json'), 'utf8'));
const render = await import(pathToFileURL(renderPath).href);

const SECTIONS = [
  'What this is',
  'What comes in',
  `What happens through ${page.doors.find((door) => door.file === page.mainDoor).name}`,
  'Who reads the results',
  'The other doors',
  'What breaks what',
  'Generated, never hand-edited',
  'Hand-authored',
  'Where to start',
  'What this map cannot see',
];

function headings(html) {
  return [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((match) => match[1]);
}

// The panel test's palette rule, applied to everything outside the token
// blocks: a colour may be defined once in :root and only referenced after.
function assertNoColourLiterals(text, label) {
  assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${label}: hex colour`);
  assert.doesNotMatch(text, /\brgba?\s*\(/i, `${label}: rgb()`);
  assert.doesNotMatch(text, /\bhsla?\s*\(/i, `${label}: hsl()`);
  assert.doesNotMatch(text, /(?<![\w-])(?:red|blue|green|white|black|gray|grey|orange|yellow|purple|pink|transparent|currentcolor)(?![\w-])/i, `${label}: named colour`);
}

test('the page carries the title and every section, in the order the spec gives', () => {
  const html = render.renderPage(page, { repo: page.repo });
  assert.match(html, /<h1>dogfood-lab\/testing-os: how it works<\/h1>/);
  assert.equal(render.pageTitle(page, { repo: page.repo }), 'dogfood-lab/testing-os: how it works');
  assert.match(html, /Mapped at 2026-\d\d-\d\d from commit /);
  assert.deepEqual(headings(html), SECTIONS);
});

test('the sentences are the ones the committed markdown carries', () => {
  const html = render.renderPage(page, { repo: page.repo });
  const text = html.replace(/<[^>]+>/g, '');
  const markdown = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8').replace(/\*\*|`/g, '');
  for (const sentence of [
    `${page.parts} parts. Work enters through ${page.doors.length} doors; the busiest is Ingest dogfood submission, which reaches 7 parts.`,
    'That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).',
    'It commits indexes/ and records/, then pushes.',
    'Release runs scripts/build.mjs, scripts/check-doc-drift.mjs, scripts/check-finding-regression-pins.mjs and 1 more, reaches ingest and portfolio, publishes to npm, and creates a GitHub release.',
    'Read those in order to follow one dogfood submission end to end.',
    'Regenerate with npx --yes @dogfood-lab/atlas map.',
  ]) {
    assert.ok(text.includes(sentence), sentence);
    assert.ok(markdown.includes(sentence), `the markdown twin says it too: ${sentence}`);
  }
});

test('file paths link to the blob at the mapped commit, places to the tree', () => {
  const html = render.renderPage(page, { repo: page.repo });
  const blob = `https://github.com/dogfood-lab/testing-os/blob/${page.commit}/`;
  const tree = `https://github.com/dogfood-lab/testing-os/tree/${page.commit}/`;
  for (const path of page.doors[0].runs) assert.ok(html.includes(`href="${blob}${path}"`), path);
  for (const path of page.startHere.filter((entry) => !entry.endsWith('/'))) assert.ok(html.includes(`href="${blob}${path}"`), path);
  assert.ok(html.includes(`href="${tree}indexes"`), 'a place opens as a tree');
  assert.ok(html.includes(`href="${blob}examples/README.md"><code>examples/README.md</code></a> (found by text)`), 'a found-by-text reader links its path only');
  assert.ok(!html.includes(`${blob}root`), 'a part name is not a path');
  assert.ok(html.includes('href="https://github.com/dogfood-lab/testing-os/blob/atlas-render/indexes/atlas/dogfood-lab/testing-os/README.md"'), 'the markdown twin on the render branch');
  assert.ok(html.includes('href="./"'), 'a link back to the fleet');
});

test('every string from JSON is escaped before it reaches the markup', () => {
  const hostile = '<script>alert(1)</script>';
  const fixture = {
    ...page,
    repo: hostile,
    summary: hostile,
    doors: [{ ...page.doors[0], name: hostile, runs: [`${hostile}.js`], triggers: [hostile] }, ...page.doors.slice(1)],
    breaks: [{ kind: 'part', name: hostile, importedBy: [hostile], doors: 1 }],
    readers: [{ target: 'indexes/', readers: [hostile] }],
    limits: [hostile],
  };
  const html = render.renderPage(fixture, {});
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(render.renderFlow(fixture).includes('<script>'), false);
  assert.equal(render.renderFleet({ repositories: [{ repo: hostile, doors: 1 }] }, 0).includes('<script>'), false);
});

test('only owner/name values are fetched', () => {
  for (const good of ['dogfood-lab/testing-os', 'mcp-tool-shop-org/a.b_c-d']) assert.equal(render.isRepo(good), true, good);
  for (const bad of ['', 'testing-os', 'a/b/c', '../x', 'a/..', 'a/b?c', 'a /b', 'https://x/y', null]) {
    assert.equal(render.isRepo(bad), false, String(bad));
  }
  assert.equal(render.pageDataUrl('https://raw.example/', 'o/n'), 'https://raw.example/indexes/atlas/o/n/page.json');
});

test('the flow picture is described in words and names the main door', () => {
  const svg = render.renderFlow(page);
  assert.match(svg, /^<svg [^>]*role="img"[^>]*aria-labelledby="atlasFlowTitle atlasFlowDesc"/);
  assert.match(svg, /<title id="atlasFlowTitle">How work flows through Ingest dogfood submission<\/title>/);
  const desc = /<desc id="atlasFlowDesc">([^<]+)<\/desc>/.exec(svg);
  assert.ok(desc, 'desc');
  assert.ok(desc[1].includes('Ingest dogfood submission (.github/workflows/ingest.yml)'), desc[1]);
  const html = render.renderPage(page, { repo: page.repo });
  assert.ok(html.indexOf('<svg') > html.indexOf('<h2>What this is</h2>'));
  assert.ok(html.indexOf('<svg') < html.indexOf('<h2>What comes in</h2>'));
  assert.match(html, /A dashed border marks a reader found by scanning text/);
});

test('the flow picture draws the columns page.json states, and bands between part columns', () => {
  const columns = render.flowColumns(page);
  const main = page.doors.find((door) => door.file === page.mainDoor);
  const depths = new Set(main.reach.map((entry) => entry.depth));
  assert.deepEqual(columns.map((column) => column.kind), ['door', ...[...depths].map(() => 'parts'), 'landings', 'readers']);
  const readers = columns.at(-1);
  assert.ok(readers.nodes.length <= 7, 'six readers, then one "+n more"');
  assert.equal(readers.nodes.at(-1).lines[0], `+${readers.total - 6} more`);
  const svg = render.renderFlow(page);
  assert.equal((svg.match(/<g class="band">/g) ?? []).length, depths.size, 'one band per step after the door');
  assert.equal((svg.match(/>reaches</g) ?? []).length, depths.size - 1);
  assert.equal((svg.match(/>writes to</g) ?? []).length, 1);
  assert.ok((svg.match(/class="node node-text"/g) ?? []).length > 0, 'readers found by text are dashed');
  assert.equal(render.renderFlow({ ...page, mainDoor: null }), '');
});

test('the fleet lists every rendered repository as a link to its page', () => {
  const now = Date.parse('2026-09-23T00:00:00Z');
  const html = render.renderFleet({
    generatedAt: '2026-09-22T06:00:00Z',
    repositories: [
      { repo: 'mcp-tool-shop-org/armature', renderedAt: '2026-09-20T06:00:00Z', doors: 2 },
      { repo: 'dogfood-lab/testing-os', renderedAt: '2026-09-22T06:00:00Z', doors: 6 },
      { repo: 'not a repo', renderedAt: '2026-09-22T06:00:00Z', doors: null },
    ],
  }, now);
  assert.match(html, /<h2>3 repositories rendered<\/h2>/);
  assert.ok(html.includes('<a href="?repo=dogfood-lab/testing-os">dogfood-lab/testing-os</a> <span class="facts">6 doors · mapped today</span>'));
  assert.ok(html.includes('<a href="?repo=mcp-tool-shop-org/armature">mcp-tool-shop-org/armature</a> <span class="facts">2 doors · mapped 2 days ago</span>'));
  assert.ok(html.includes('not a repo <span class="facts">doors not counted'), 'an invalid name is text, not a link');
  assert.ok(html.indexOf('dogfood-lab/testing-os') < html.indexOf('mcp-tool-shop-org/armature'), 'sorted by name');
  assert.match(render.renderFleet({ repositories: [] }, now), /No public repository has adopted Atlas yet\./);
});

test('the shell imports render.js and reads only the render branch', () => {
  assert.match(shell, /<script type="module">[\s\S]*from "\.\/render\.js"/);
  assert.match(shell, /atlasBase:\s*"https:\/\/raw\.githubusercontent\.com\/dogfood-lab\/testing-os\/atlas-render\/"/);
  assert.match(shell, /atlasFleet:\s*"indexes\/atlas\/fleet\.json"/);
  assert.ok(shell.includes('This repository has not been rendered yet.'), 'a 404 is a state');
  assert.match(shell, /if \(!isRepo\(repo\)\) \{[\s\S]*?return;/, 'an invalid repo never reaches fetch');
});

test('colour is defined once in :root and only referenced after', () => {
  const tokens = [...shell.matchAll(/:root[^{]*\{[^}]*\}/g)];
  assert.ok(tokens.length >= 2, 'a dark and a light token block');
  assertNoColourLiterals(shell.replace(/:root[^{]*\{[^}]*\}/g, ''), 'index.html outside :root');
  assertNoColourLiterals(renderSrc, 'render.js');
  assert.match(shell, /var\(--/);
});

test('phone width keeps 16px gutters and drops the picture below 600px', () => {
  assert.match(shell, /\.wrap \{[^}]*padding: 0 16px;/);
  assert.match(shell, /@media \(max-width: 599\.98px\) \{ \.flow \{ display: none; \} \}/);
  assert.match(shell, /overflow-x: clip/);
  // SVG text is sized in viewBox units and scales with the picture, so the
  // 14px floor is checked on the page's own text rules.
  const pageRules = shell.replace(/^\.flow [^{\n]*\btext\b[^\n]*$/gm, '');
  for (const size of pageRules.matchAll(/font(?:-size)?:\s*(\d+)px/g)) {
    assert.ok(Number(size[1]) >= 14, `text below 14px: ${size[0]}`);
  }
});
