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
import { fileURLToPath } from 'node:url';
import * as render from '../../public/atlas/render.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const shellPath = join(repoRoot, 'site', 'public', 'atlas', 'index.html');
const renderPath = join(repoRoot, 'site', 'public', 'atlas', 'render.js');
const shell = readFileSync(shellPath, 'utf8');
const renderSrc = readFileSync(renderPath, 'utf8');
const page = JSON.parse(readFileSync(join(repoRoot, 'atlas', 'page.json'), 'utf8'));

const SECTIONS = [
  'What this is',
  render.changesHeading(page.changes),
  'What comes in',
  `What happens through ${page.doors.find((door) => door.file === page.mainDoor).name}`,
  'Who reads the results',
  'The other doors',
  'What breaks what',
  'What tends to change together',
  'What no test touches',
  'Written but never read',
  'Helpers that look duplicated',
  'Generated, never hand-edited',
  'Hand-authored',
  'Where to start',
  'What this map cannot see',
];

// The renderer's escaper writes these five entities and no others, and the
// markdown twin carries the raw characters, so every site-vs-markdown
// comparison reads the markup through this: tags dropped, entities decoded
// in one pass so a literal "&amp;lt;" stays "&lt;".
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

function plain(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);
}

// The "What changed since …" section as the site shows it and as the markdown
// twin writes it, each as its list of sentences with code marks dropped.
function changesTexts(pageData, markdown) {
  const html = render.renderPage(pageData, { repo: pageData.repo });
  const heading = render.changesHeading(pageData.changes);
  const at = html.indexOf(`<h2>${render.esc(heading)}</h2>`);
  assert.ok(at !== -1, 'the site carries the heading');
  const body = html.slice(at, html.indexOf('</section>', at));
  const start = markdown.indexOf(`## ${heading}\n`);
  assert.ok(start !== -1, 'the markdown twin carries the same heading');
  const end = markdown.indexOf('\n## ', start + 1);
  const twin = markdown.slice(start, end === -1 ? markdown.length : end);
  const tag = pageData.changes.unchanged ? 'p' : 'li';
  return {
    html,
    heading,
    shown: [...body.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((match) => plain(match[1])),
    written: twin.split('\n').slice(2).filter(Boolean).map((line) => line.replace(/^- /, '').replace(/`/g, '')),
  };
}

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
  const text = plain(html);
  const markdown = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8').replace(/\*\*|`/g, '');
  for (const sentence of [
    // CI reaches further, but the ingest door is the one that commits into the
    // repository, so the page follows it and says why.
    `${page.parts} parts. Work enters through ${page.doors.length} doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (CI reaches 11 but commits nothing).`,
    'That reaches dogfood-swarm (1 file), findings (2 files) and verify (10 files).',
    'It commits indexes/ and records/, then pushes.',
    'self-dogfood runs packages/report/cli.js, scripts/build.mjs, scripts/sync-version.mjs and 1 more, and sends a dispatch to dogfood-lab/testing-os.',
    'Read those in order to follow one dogfood submission end to end.',
    'Regenerate with npx --yes @dogfood-lab/atlas map.',
    'Inside packages/ingest/run.js, ingest does, in order: log stage (dogfood-swarm), is duplicate, load context (3 steps), verify (verify), write record and rebuild indexes.',
  ]) {
    assert.ok(text.includes(sentence), sentence);
    assert.ok(markdown.includes(sentence), `the markdown twin says it too: ${sentence}`);
  }
});

test('what changed since the last map sits second and says what the committed markdown says', () => {
  assert.ok(page.changes && typeof page.changes === 'object', 'this repository was mapped against a committed map');
  const markdown = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8');
  const { html, heading, shown, written } = changesTexts(page, markdown);
  const at = html.indexOf(`<h2>${heading}</h2>`);
  assert.ok(at > html.indexOf('<h2>What this is</h2>'));
  assert.ok(at < html.indexOf('<h2>What comes in</h2>'));
  assert.deepEqual(shown, written);
  assert.deepEqual(shown, page.changes.items.map((item) => item.sentence.replace(/`/g, '')));
});

test('the comparison decodes what the escaper writes, so an apostrophe or an ampersand still matches the markdown', () => {
  const printable = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('');
  assert.equal(plain(render.esc(printable)), printable, 'every entity the escaper emits is decoded');
  assert.equal(plain('&amp;lt;'), '&lt;', 'decoded once, not twice');
  const since = { commit: '0123456789abcdef', generatedAt: '2026-09-20T06:00:00.000Z' };
  const items = [
    { kind: 'door', sentence: "Build & test's push trigger now also names `atlas/**`.", subjects: [] },
    { kind: 'landing', sentence: 'reports/ is now written by tools/"render" & <lib>.', subjects: [] },
    { kind: 'counts', sentence: '1 file changed content, across 1 part.', subjects: [] },
  ];
  const fixture = { ...page, changes: { since, items, unchanged: false } };
  const markdown = [
    '## What changed since 2026-09-20 (0123456)',
    '',
    "- Build & test's push trigger now also names `atlas/**`.",
    '- reports/ is now written by tools/"render" & <lib>.',
    '- 1 file changed content, across 1 part.',
    '',
  ].join('\n');
  const { html, shown, written } = changesTexts(fixture, markdown);
  assert.ok(html.includes('Build &amp; test&#39;s push trigger'), 'the markup is escaped');
  assert.deepEqual(shown, written);
  assert.deepEqual(shown, items.map((item) => item.sentence.replace(/`/g, '')));
});

test('the changes section lists the headline first, is one line when nothing structural changed, and is absent without changes', () => {
  const since = { commit: '0123456789abcdef', generatedAt: '2026-09-20T06:00:00.000Z' };
  const items = [
    { kind: 'cycle', sentence: 'ingest now imports dogfood-swarm, which closes the cycle ingest → dogfood-swarm → findings → ingest.', subjects: [] },
    { kind: 'door', sentence: "CI's push trigger now also names `atlas/**`.", subjects: [] },
    { kind: 'counts', sentence: '2 files changed content, across 1 part.', subjects: [] },
  ];
  const html = render.renderPage({ ...page, changes: { since, items, unchanged: false } }, { repo: page.repo });
  assert.ok(html.includes('<h2>What changed since 2026-09-20 (0123456)</h2>\n<ul><li>ingest now imports dogfood-swarm, which closes the cycle'), 'the headline is the first item');
  assert.ok(html.includes('<li>CI&#39;s push trigger now also names <code>atlas/**</code>.</li>'), 'backticks mark code');
  const quiet = render.renderPage({
    ...page,
    changes: { since, items: [{ kind: 'counts', sentence: 'Nothing structural changed since 2026-09-20; no file changed.', subjects: [] }], unchanged: true },
  }, { repo: page.repo });
  assert.ok(quiet.includes('<h2>What changed since 2026-09-20 (0123456)</h2>\n<p>Nothing structural changed since 2026-09-20; no file changed.</p></section>'));
  const first = render.renderPage({ ...page, changes: { first: true } }, { repo: page.repo });
  assert.ok(first.includes('<h2>What changed since the last map</h2>\n<p>This is the first map.</p></section>'));
  const { changes, ...older } = page;
  assert.ok(changes, 'this repository has changes to leave out');
  assert.equal(render.renderPage(older, { repo: page.repo }).includes('<h2>What changed'), false);
  const hostile = '<script>alert(1)</script>';
  const escaped = render.renderPage({
    ...page,
    changes: { since: { commit: hostile, generatedAt: hostile }, items: [{ kind: 'door', sentence: hostile, subjects: [] }], unchanged: false },
  }, {});
  assert.equal(escaped.includes('<script>'), false);
});

// The section's own markup, so a nested list is read where it sits.
function happensSection(html) {
  const start = html.indexOf('<h2>What happens through ');
  return html.slice(start, html.indexOf('</section>', start));
}

// The <li> items directly inside the <ol> that opens at `from`, each with
// its own markup, so a list nested inside an item stays inside that item.
function listItems(html, from) {
  const items = [];
  let depth = 0;
  let start = -1;
  const tags = /<(\/?)(ol|li)>/g;
  tags.lastIndex = from;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    const [, close, tag] = match;
    if (tag === 'ol') {
      depth += close ? -1 : 1;
      if (depth === 0) return items;
    } else if (depth === 1 && !close) {
      start = tags.lastIndex;
    } else if (depth === 1 && close) {
      items.push(html.slice(start, match.index));
    }
  }
  return items;
}

test('the order of work sits under step 1, as the markdown nests it', () => {
  const section = happensSection(render.renderPage(page, { repo: page.repo }));
  const steps = listItems(section, section.indexOf('<ol>'));
  const inside = listItems(steps[0], steps[0].indexOf('<ol>'));
  const expected = page.sequences.reduce((sum, sequence) => sum + 1 + sequence.inner.length, 0);
  assert.equal(inside.length, expected, 'one item per sequence and per inner function');
  const [first] = page.sequences;
  assert.ok(plain(inside[0]).startsWith(`Inside ${first.file}, ${first.phrase} does, in order:`), plain(inside[0]));
  const blob = `https://github.com/dogfood-lab/testing-os/blob/${page.commit}/`;
  assert.ok(inside[0].includes(`<a href="${blob}${first.file}"><code>${first.file}</code></a>`), 'the file links to the mapped commit');
  for (const step of steps.slice(1)) assert.equal(step.includes('<ol>'), false, 'only step 1 carries the order of work');
  const lines = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8').split(/\r?\n/);
  assert.ok(lines.includes(`   1. ${plain(inside[0])}`), 'the markdown nests it the same way');
});

test('a called function reads as a list from eight steps and as a sentence up to seven', () => {
  // This repository's busiest door calls into no function with that many
  // steps, so the rule is shown on a sequence written for it.
  const inner = (name, part, n) => ({
    file: `packages/${part}/index.js`,
    name,
    part,
    partLabel: part,
    phrase: name,
    steps: Array.from({ length: n }, (_, index) => ({ name: `step${index}`, part, partLabel: part, phrase: `step ${index}` })),
  });
  const fixture = {
    ...page,
    sequences: [{
      entry: 'ingest',
      file: 'packages/ingest/run.js',
      part: 'ingest',
      partLabel: 'ingest',
      phrase: 'ingest',
      steps: [{ name: 'verify', part: 'verify', partLabel: 'verify', phrase: 'verify' }, { name: 'write record', part: 'ingest', partLabel: 'ingest', phrase: 'write record' }],
      inner: [inner('verify', 'verify', 8), inner('write record', 'ingest', 7)],
    }],
  };
  const section = happensSection(render.renderPage(fixture, { repo: page.repo }));
  const steps = listItems(section, section.indexOf('<ol>'));
  const inside = listItems(steps[0], steps[0].indexOf('<ol>'));
  const verify = inside.find((item) => item.startsWith('<strong>Verify</strong> (verify) runs, in order:'));
  assert.ok(verify, 'a function in another part names that part');
  assert.deepEqual(listItems(verify, verify.indexOf('<ol>')).map(plain), Array.from({ length: 8 }, (_, index) => `step ${index}`));
  // A called function in the entry file's own part is not given its part.
  const writeRecord = inside.find((item) => item.startsWith('<strong>Write record</strong> runs, in order:'));
  assert.equal(writeRecord.includes('<ol>'), false, 'seven steps or fewer read as one sentence');
  assert.equal(plain(writeRecord), 'Write record runs, in order: step 0, step 1, step 2, step 3, step 4, step 5 and step 6.');
});

test('what tends to change together renders the pairs page.json names and the set-aside line', () => {
  const html = render.renderPage(page, { repo: page.repo });
  const start = html.indexOf('<h2>What tends to change together</h2>');
  assert.ok(start !== -1);
  const body = html.slice(start, html.indexOf('</section>', start));
  const bullets = [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => plain(match[1]));
  // The count is whatever the committed map says: the coupling floor moves with
  // the history, so this repository can name five pairs one week and none the next.
  assert.equal(bullets.length, page.changesTogether.length);
  const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => plain(match[1]));
  if (page.changesTogetherWithTests > 0) {
    const noun = page.changesTogetherWithTests === 1 ? 'file' : 'files';
    const verb = page.changesTogetherWithTests === 1 ? 'its' : 'their';
    assert.ok(paragraphs.includes(`${page.changesTogetherWithTests} ${noun} changed together with ${verb} own ${page.changesTogetherWithTests === 1 ? 'test' : 'tests'}, as expected.`), 'the set-aside line renders');
  }
  const markdown = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8');
  const from = markdown.indexOf('## What tends to change together\n');
  const twin = markdown.slice(from, markdown.indexOf('\n## ', from + 1));
  assert.deepEqual(bullets, twin.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2).replace(/\*\*/g, '')));
  const twinParagraphs = twin.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('- ') && !line.startsWith('## '));
  assert.deepEqual(paragraphs, twinParagraphs, 'every paragraph of the section matches the markdown, empty case included');
});

// A section's sentences as the site shows them and as the markdown twin
// writes them: every paragraph and bullet, markup and code marks dropped.
function sectionTexts(pageData, markdown, heading) {
  const html = render.renderPage(pageData, { repo: pageData.repo });
  const at = html.indexOf(`<h2>${render.esc(heading)}</h2>`);
  assert.ok(at !== -1, `the site carries ${heading}`);
  const body = html.slice(at, html.indexOf('</section>', at));
  const start = markdown.indexOf(`## ${heading}\n`);
  assert.ok(start !== -1, `the markdown twin carries ${heading}`);
  const end = markdown.indexOf('\n## ', start + 1);
  const twin = markdown.slice(start, end === -1 ? markdown.length : end);
  return {
    shown: [...body.matchAll(/<(p|li)>([\s\S]*?)<\/\1>/g)].map((match) => plain(match[2])),
    written: twin.split('\n').slice(2).filter(Boolean).map((line) => line.replace(/^- /, '').replace(/\*\*|`/g, '')),
  };
}

test('the three derived views say what the committed markdown says, in the same place', () => {
  const markdown = readFileSync(join(repoRoot, 'atlas', 'README.md'), 'utf8');
  for (const heading of ['What no test touches', 'Written but never read', 'Helpers that look duplicated']) {
    const { shown, written } = sectionTexts(page, markdown, heading);
    assert.ok(shown.length > 0, heading);
    assert.deepEqual(shown, written, heading);
  }
  const unread = sectionTexts(page, markdown, 'Written but never read').shown;
  assert.ok(unread.includes('reports/ is written by packages/portfolio/generate.js and read by nothing else in this repository.'));
  const alike = sectionTexts(page, markdown, 'Helpers that look duplicated').shown;
  assert.equal(alike[0], 'These are candidates from names and call order, not a judgement.');
});

test('the derived views render their lists, caps and empty cases from page.json alone', () => {
  const fixture = {
    ...page,
    testFiles: 3,
    untested: [{ part: 'root', partLabel: 'the repository root', testedBy: 0 }, { part: 'tools', partLabel: 'tools', testedBy: 0 }],
    untestedNote: ['And 4 more parts.'],
    unread: [{ place: 'cache/', writers: ['tools/cache.js'] }, { place: 'records/', writers: ['.github/workflows/ingest.yml', 'tools/ingest.js'] }],
    unreadNote: [],
    duplicates: [{ files: ['lib/store.js', 'tools/prepare.js'], name: 'normalize', partLabels: ['lib', 'tools'], parts: ['lib', 'tools'] }],
    duplicatesLead: 'These are candidates from names and call order, not a judgement.',
    duplicatesNote: ['And 1 more pair.'],
  };
  const markdown = [
    '## What no test touches', '', '- **the repository root** is imported by no test.', '- **tools** is imported by no test.', '', 'And 4 more parts.', '',
    '## Written but never read', '', '- **cache/** is written by tools/cache.js and read by nothing else in this repository.',
    '- **records/** is written by .github/workflows/ingest.yml and tools/ingest.js, and read by nothing else in this repository.', '',
    '## Helpers that look duplicated', '', 'These are candidates from names and call order, not a judgement.', '',
    '- **normalize** is exported by lib/store.js (lib) and tools/prepare.js (tools); the two look alike.', '', 'And 1 more pair.', '',
  ].join('\n');
  for (const heading of ['What no test touches', 'Written but never read', 'Helpers that look duplicated']) {
    const { shown, written } = sectionTexts(fixture, markdown, heading);
    assert.deepEqual(shown, written, heading);
  }
  const html = render.renderPage(fixture, { repo: page.repo });
  assert.ok(html.indexOf('<h2>What tends to change together</h2>') < html.indexOf('<h2>What no test touches</h2>'));
  assert.ok(html.indexOf('<h2>Helpers that look duplicated</h2>') < html.indexOf('<h2>Generated, never hand-edited</h2>'));

  const empty = render.renderPage({ ...page, testFiles: 0, untested: [], untestedNote: ['No test files were found by name.'], unread: [], unreadNote: [], duplicates: [], duplicatesLead: null, duplicatesNote: [] }, { repo: page.repo });
  assert.ok(empty.includes('<h2>What no test touches</h2>\n<p>No test files were found by name.</p></section>'));
  assert.ok(empty.includes('<h2>Written but never read</h2>\n<p>Every written place has a reader.</p></section>'));
  assert.ok(empty.includes('<h2>Helpers that look duplicated</h2>\n<p>No two parts export a helper that looks alike.</p></section>'));
  const reached = render.renderPage({ ...page, testFiles: 5, untested: [], untestedNote: [] }, { repo: page.repo });
  assert.ok(reached.includes('<h2>What no test touches</h2>\n<p>Every code part is imported by at least one test.</p></section>'));

  const { untested, unread, duplicates, ...older } = page;
  assert.ok(untested && unread && duplicates, 'this repository has the three lists to leave out');
  const before = render.renderPage(older, { repo: page.repo });
  for (const heading of ['What no test touches', 'Written but never read', 'Helpers that look duplicated']) {
    assert.equal(before.includes(`<h2>${heading}</h2>`), false, heading);
  }

  const hostile = '<script>alert(1)</script>';
  const escaped = render.renderPage({
    ...page,
    untested: [{ part: hostile, partLabel: hostile }],
    untestedNote: [hostile],
    unread: [{ place: hostile, writers: [hostile] }],
    unreadNote: [hostile],
    duplicates: [{ files: [hostile, hostile], name: hostile, partLabels: [hostile, hostile] }],
    duplicatesLead: hostile,
    duplicatesNote: [hostile],
  }, {});
  assert.equal(escaped.includes('<script>'), false);
});

test('more than twelve steps list twelve and count the rest', () => {
  const steps = Array.from({ length: 14 }, (_, index) => ({ name: `step${index}`, part: 'ingest', phrase: `step ${index}` }));
  const fixture = { ...page, sequences: [{ entry: 'main', file: 'packages/ingest/run.js', inner: [], part: 'ingest', phrase: 'main', steps }] };
  const section = happensSection(render.renderPage(fixture, { repo: page.repo }));
  const inside = listItems(section, section.indexOf('<ol>', section.indexOf('<ol>') + 1));
  const listed = listItems(inside[0], inside[0].indexOf('<ol>'));
  assert.equal(listed.length, 12);
  assert.equal(listed.at(-1), 'step 11, and 2 more');
});

test('a method is named with the class it is called on, and parts read as "the tests part"', () => {
  const steps = [
    { name: 'Trainer', part: 'backpropagate', partLabel: 'backpropagate', phrase: 'trainer' },
    { name: 'train', part: 'backpropagate', partLabel: 'backpropagate', phrase: 'train', receiver: 'Trainer' },
  ];
  const fixture = {
    ...page,
    sequences: [{ entry: 'main', file: 'scripts/smoke.py', inner: [], part: 'scripts', phrase: 'main', steps }],
    changesTogether: [
      { a: 'backpropagate/cli.py', b: 'tests/test_cli.py', either: 4, partLabels: ['backpropagate', 'tests'], parts: ['backpropagate', 'tests'], relation: 'b-imports-a', shared: 3 },
      { a: 'README.md', b: 'backpropagate/cli.py', either: 4, partLabels: ['the repository root', 'backpropagate'], parts: ['root', 'backpropagate'], relation: 'a-imports-b', shared: 3 },
    ],
  };
  const html = render.renderPage(fixture, { repo: page.repo });
  assert.ok(plain(happensSection(html)).includes('main does, in order: trainer (backpropagate) and train (Trainer).'));
  assert.ok(plain(html).includes('changed together in 3 of 4 commits, and the tests part imports the backpropagate part.'));
  assert.ok(plain(html).includes('changed together in 3 of 4 commits, and the repository root imports the backpropagate part.'));
});

test('with nothing written, the never-read section says so rather than that every place is read', () => {
  const html = render.renderPage({ ...page, unread: [], unreadNote: [], written: 0 }, { repo: page.repo });
  assert.ok(html.includes('<h2>Written but never read</h2>\n<p>No place this map can see is written, so none goes unread.</p></section>'));
});

test('a page.json without sequences renders the section as before', () => {
  const { sequences, ...older } = page;
  assert.ok(Array.isArray(sequences) && sequences.length > 0, 'this repository has sequences to leave out');
  const section = happensSection(render.renderPage(older, { repo: page.repo }));
  const steps = listItems(section, section.indexOf('<ol>'));
  assert.equal((section.match(/<ol>/g) ?? []).length, 1, 'no nested list');
  assert.ok(plain(steps[0]).startsWith(`The workflow runs ${page.doors.find((door) => door.file === page.mainDoor).runs[0]}`));
  assert.equal(section.includes('in order:'), false);
  assert.equal(happensSection(render.renderPage({ ...page, sequences: [] }, { repo: page.repo })), section, 'an empty list is the same as none');
});

test('file paths link to the blob at the mapped commit, places to the tree', () => {
  const html = render.renderPage(page, { repo: page.repo });
  const blob = `https://github.com/dogfood-lab/testing-os/blob/${page.commit}/`;
  const tree = `https://github.com/dogfood-lab/testing-os/tree/${page.commit}/`;
  // A door names three of its runs and counts the rest; a directory run is a place.
  for (const path of page.doors[0].runs.slice(0, 3)) assert.ok(html.includes(`href="${path.endsWith('/') ? tree : blob}${path}"`), path);
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
    sequences: [{
      entry: hostile,
      file: `${hostile}.js`,
      part: hostile,
      phrase: hostile,
      steps: [{ part: hostile, phrase: hostile }, { phrase: hostile }],
      inner: [{ file: `${hostile}.js`, part: null, phrase: hostile, steps: [{ phrase: hostile }, { phrase: hostile }] }],
    }],
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
  const pageRules = shell.replace(/^\.(?:flow|bars|strip) [^{\n]*\btext\b[^\n]*$/gm, '');
  for (const size of pageRules.matchAll(/font(?:-size)?:\s*(\d+)px/g)) {
    assert.ok(Number(size[1]) >= 14, `text below 14px: ${size[0]}`);
  }
});

/* ---------- the "what breaks what" picture ---------- */

// The part rows of the list, in its order, as the picture must draw them.
function breakParts(pageData) {
  return pageData.breaks.filter((entry) => entry.kind === 'part').slice(0, 8);
}

// The name the list gives a part; a row written before labels were carried has only its id.
function label(part) {
  return part.partLabel ?? part.name;
}

function breaksSectionHtml(html) {
  const start = html.indexOf('<h2>What breaks what</h2>');
  return html.slice(start, html.indexOf('</section>', start));
}

test('the what-breaks-what picture draws one row per listed part, its bar lengths from the list', () => {
  const parts = breakParts(page);
  assert.ok(parts.length > 1, 'this repository lists parts');
  const svg = render.renderBreaks(page);
  assert.match(svg, /^<svg [^>]*role="img"[^>]*aria-labelledby="atlasBreaksTitle atlasBreaksDesc"/);
  const rows = render.breaksRows(page);
  assert.deepEqual(rows.map((row) => row.name), parts.map(label));
  const bars = [...svg.matchAll(/<rect class="bar" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((match) => Number(match[2]));
  const dashed = [...svg.matchAll(/<rect class="bar bar-tests" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((match) => ({ x: Number(match[1]), width: Number(match[2]) }));
  const withProduction = parts.filter((part) => part.importedBy.length > 0);
  const withTests = parts.filter((part) => part.importedByTests.length > 0);
  assert.equal(bars.length, withProduction.length, 'one solid bar per part imported to run');
  assert.equal(dashed.length, withTests.length, 'one dashed bar per part also imported from tests');
  // One unit of length per importing part, the same unit for both bars.
  const unit = bars[0] / withProduction[0].importedBy.length;
  withProduction.forEach((part, index) => assert.ok(Math.abs(bars[index] - part.importedBy.length * unit) < 1e-9, part.name));
  withTests.forEach((part, index) => assert.ok(Math.abs(dashed[index].width - part.importedByTests.length * unit) < 1e-9, part.name));
  // The dashed bar continues the solid one.
  const barX = Number(/<rect class="bar" x="([\d.]+)"/.exec(svg)[1]);
  withTests.forEach((part, index) => assert.ok(Math.abs(dashed[index].x - (barX + part.importedBy.length * unit)) < 1e-9, part.name));
  // The numbers at the bar ends and the door numerals are the list's own.
  for (const part of parts) {
    const end = part.importedByTests.length > 0 ? `${part.importedBy.length} + ${part.importedByTests.length} from tests` : String(part.importedBy.length);
    assert.ok(svg.includes(`>${end}</text>`), `${part.name}: ${end}`);
    assert.ok(svg.includes(`>${esc(label(part))}</text>`), part.name);
  }
  const numerals = [...svg.matchAll(/text-anchor="end">(\d+)<\/text>/g)].map((match) => Number(match[1]));
  assert.deepEqual(numerals, parts.map((part) => part.doors));
});

function esc(text) {
  return render.esc(text);
}

test('the picture says in one sentence what its first three rows say, naming the first part', () => {
  const svg = render.renderBreaks(page);
  assert.match(svg, /<title id="atlasBreaksTitle">[^<]+<\/title>/);
  const desc = /<desc id="atlasBreaksDesc">([^<]+)<\/desc>/.exec(svg)[1];
  const [first, second, third] = breakParts(page);
  const clause = (part) => {
    const doors = `${part.doors} door${part.doors === 1 ? '' : 's'}`;
    const by = `${part.importedBy.length} part${part.importedBy.length === 1 ? '' : 's'}`;
    return part.importedByTests.length > 0
      ? `${label(part)} is imported by ${by} and ${part.importedByTests.length} more only from tests, and sits on the path of ${doors}`
      : `${label(part)} is imported by ${by} and sits on the path of ${doors}`;
  };
  assert.ok(desc.startsWith(`${label(first)} is imported by `), desc);
  assert.ok(plain(desc).startsWith(`${clause(first)}; ${clause(second)}; ${clause(third)}`), desc);
  assert.ok(desc.endsWith('.'));
  // A part imported only from tests reads as the list reads it.
  const onlyTests = render.renderBreaks({ breaks: [{ kind: 'part', name: 'fixtures', importedBy: [], importedByTests: ['scripts'], doors: 0 }] });
  assert.ok(onlyTests.includes('<desc id="atlasBreaksDesc">fixtures is imported only from tests, by 1 part, and sits on the path of no door.</desc>'));
  assert.ok(onlyTests.includes('>1 from tests</text>'));
  assert.equal(onlyTests.includes('<rect class="bar" '), false, 'no solid bar for no production importer');
});

test('the picture sits after the list, carries no colour, and drops out below 600px', () => {
  const html = render.renderPage(page, { repo: page.repo });
  const section = breaksSectionHtml(html);
  assert.ok(section.indexOf('</ul>') < section.indexOf('<figure class="picture bars">'), 'after the list');
  assert.match(section, /<figcaption>[^<]*dashed[^<]*<\/figcaption><\/figure>$/);
  assertNoColourLiterals(render.renderBreaks(page), 'the picture');
  assert.match(shell, /@media \(max-width: 599\.98px\) \{ \.bars \{ display: none; \}/);
  assert.match(shell, /\.bars \.bar-tests \{[^}]*stroke-dasharray/, 'the test-only bar is the dashed atom');
  const places = render.renderPage({ ...page, breaks: page.breaks.filter((entry) => entry.kind === 'place') }, { repo: page.repo });
  assert.equal(places.includes('atlasBreaksTitle'), false, 'no part rows, no picture');
  assert.equal(render.renderBreaks({ breaks: [{ kind: 'part', name: '<script>', importedBy: ['<b>'], doors: 1 }] }).includes('<script>'), false);
});

test('a part is labelled as the list names it, so a root-level part reads "the repository root"', () => {
  const breaks = [
    { kind: 'part', name: 'root', partLabel: 'the repository root', importedBy: ['lib', 'tools'], importedByTests: [], doors: 3 },
    { kind: 'part', name: 'lib', importedBy: ['tools'], importedByTests: [], doors: 2 },
  ];
  const svg = render.renderBreaks({ breaks });
  assert.ok(svg.includes('>the repository root</text>'));
  assert.equal(svg.includes('>root</text>'), false, 'the id is not the label');
  assert.ok(svg.includes('>lib</text>'), 'a row without a label falls back to its id');
  assert.ok(svg.includes('<desc id="atlasBreaksDesc">the repository root is imported by 2 parts and sits on the path of 3 doors; lib is'));
  const html = render.renderPage({ ...page, breaks }, { repo: page.repo });
  assert.ok(breaksSectionHtml(html).includes('<li><strong>the repository root</strong> is imported by 2 parts'), 'the list says the same');
});

test('page.json carries the imports among the listed parts, for a later layer of the picture', () => {
  const listed = new Set(breakParts(page).map((part) => part.name));
  assert.ok(Array.isArray(page.edges) && page.edges.length > 0);
  for (const edge of page.edges) {
    assert.deepEqual(Object.keys(edge).sort(), ['from', 'fromTests', 'to']);
    assert.ok(listed.has(edge.from) && listed.has(edge.to), JSON.stringify(edge));
  }
  assert.equal(render.renderBreaks(page).includes('<path'), false, 'edges are not drawn yet');
});

/* ---------- the delta strip ---------- */

const HISTORY = {
  entries: [
    { renderedAt: '2026-09-08T06:00:00.000Z', commit: 'a'.repeat(40), itemCount: 0, headlineKind: 'unchanged', fileCounts: null },
    { renderedAt: '2026-09-15T06:00:00.000Z', commit: 'b'.repeat(40), itemCount: 5, headlineKind: 'cycle', fileCounts: null },
    { renderedAt: '2026-09-22T06:00:00.000Z', commit: 'c'.repeat(40), itemCount: 2, headlineKind: 'door', fileCounts: null },
  ],
};

function changesSectionHtml(html) {
  const start = html.indexOf('<h2>What changed since');
  return html.slice(start, html.indexOf('</section>', start));
}

test('the delta strip draws one column per render, height from its count, with the caption sentence', () => {
  const caption = '3 renders since 2026-09-08; 2 of them changed the structure; the largest delta was 5 items on 2026-09-15.';
  const html = render.renderPage(page, { repo: page.repo, history: HISTORY });
  const section = changesSectionHtml(html);
  assert.ok(section.indexOf('<figure class="picture strip">') > section.indexOf('</ul>'), 'after the changes');
  assert.ok(section.endsWith(`<figcaption>${caption}</figcaption></figure>`));
  const svg = render.renderDelta(HISTORY);
  assert.ok(svg.includes(`<desc id="atlasStripDesc">${caption}</desc>`));
  assert.match(svg, /<title id="atlasStripTitle">[^<]+<\/title>/);
  assert.equal((svg.match(/<path class="tick"/g) ?? []).length, 3, 'one column per render');
  const heights = [...svg.matchAll(/<rect class="col" x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert.equal(heights.length, 2, 'a render that changed nothing has no height');
  assert.ok(Math.abs(heights[0] / heights[1] - 5 / 2) < 1e-9, 'height is proportional to the count');
  // Only a cycle and an import carry a mark, each a symbol with a title; a cycle's is the strongest.
  assert.equal((svg.match(/<use class="glyph glyph-strong" href="#atlasGlyphCycle"/g) ?? []).length, 1);
  assert.equal(svg.includes('href="#atlasGlyphImport"'), false);
  assert.match(svg, /<symbol id="atlasGlyphCycle"[^>]*><title>[^<]+<\/title>/);
  assert.match(svg, /<symbol id="atlasGlyphImport"[^>]*><title>[^<]+<\/title>/);
  assert.match(shell, /\.strip use\.glyph-strong \{ stroke-width: 2\.4; \}/, 'the strongest mark is the heavier stroke');
  assert.ok(svg.includes('>2026-09-08</text>') && svg.includes('>2026-09-22</text>'), 'the first and last are dated');
  assertNoColourLiterals(svg, 'the strip');
  assert.match(shell, /@media \(max-width: 599\.98px\) \{[^\n]*\.strip svg \{ display: none; \}/, 'the strip keeps its sentence on a phone');
});

test('the strip dates the first, the last and every fourth render, and caps at fifty-two', () => {
  const entries = Array.from({ length: 60 }, (_, index) => ({
    renderedAt: new Date(Date.UTC(2025, 7, 4) + index * 7 * 86_400_000).toISOString(),
    itemCount: index % 3,
    headlineKind: index % 3 === 0 ? 'unchanged' : 'import-added',
  }));
  const rows = render.historyRows({ entries });
  assert.equal(rows.length, 52);
  assert.equal(rows[0].date, entries[8].renderedAt.slice(0, 10), 'the newest fifty-two');
  const svg = render.renderDelta({ entries });
  const dated = [...svg.matchAll(/class="date"[^>]*>([^<]+)<\/text>/g)].map((match) => match[1]);
  const expected = rows.map((row) => row.date).filter((_, index) => index % 4 === 0 || index === rows.length - 1);
  assert.equal(dated[0], rows[0].date);
  assert.equal(dated.at(-1), rows.at(-1).date);
  for (const date of dated) assert.ok(expected.includes(date), date);
  assert.ok(dated.length >= expected.length - 1, 'at most the fourth next to the last yields to it');
  assert.ok((svg.match(/<use class="glyph" href="#atlasGlyphImport"/g) ?? []).length > 0, 'an import headline carries the import mark');
  assert.equal(render.deltaCaption(render.historyRows({ entries: [{ renderedAt: '2026-09-01T06:00:00Z', itemCount: 0 }] })), '1 render since 2026-09-01; none of them changed the structure.');
});

test('without history the strip is not drawn and the section is as before', () => {
  const without = render.renderPage(page, { repo: page.repo });
  assert.equal(without.includes('atlasStripTitle'), false);
  assert.equal(render.renderPage(page, { repo: page.repo, history: null }), without);
  assert.equal(render.renderPage(page, { repo: page.repo, history: { entries: [] } }), without);
  assert.equal(render.renderPage(page, { repo: page.repo, history: { entries: [{ itemCount: 3 }] } }), without, 'an undated entry cannot be placed');
  const hostile = render.renderDelta({ entries: [{ renderedAt: '2026-09-01<script>', itemCount: 1, headlineKind: '<script>' }] });
  assert.equal(hostile.includes('<script>'), false);
  assert.equal(render.historyDataUrl('https://raw.example/', 'o/n'), 'https://raw.example/indexes/atlas/o/n/history.json');
  assert.match(shell, /load\(historyDataUrl\(CONFIG\.atlasBase, repo\)\)\.then\([^\n]*\(\) => null\)/, 'a missing or unreadable history is never an error');
});

/* ---------- the one line a person may write ---------- */

test('with no summary the page invites one, linking to the boundary file in GitHub\'s editor', () => {
  assert.ok(!page.summary, 'this repository has no summary yet');
  const html = render.renderPage(page, { repo: page.repo });
  const edit = 'https://github.com/dogfood-lab/testing-os/edit/main/atlas/boundaries.yaml';
  const line = `<p class="summary">No one has written the one line a person may add. <a href="${edit}">Write it.</a></p>`;
  assert.ok(html.includes(line));
  assert.ok(html.indexOf(line) > html.indexOf('<p class="mapped">'), 'after the mapped-at line');
  assert.ok(html.indexOf(line) < html.indexOf('<h2>What this is</h2>'));
  assert.equal(render.summaryEditUrl('not a repo'), null);
  assert.ok(render.renderPage({ ...page, repo: 'x' }, {}).includes('<p class="summary">No one has written the one line a person may add.</p>'), 'no link without a repository to link to');
});

test('with a summary the page shows it as written by a person, with a small link to correct it', () => {
  const summary = 'testing-os collects proof that other repositories\' tests ran.';
  const html = render.renderPage({ ...page, summary, summaryFrom: 'person' }, { repo: page.repo });
  const edit = 'https://github.com/dogfood-lab/testing-os/edit/main/atlas/boundaries.yaml';
  assert.ok(html.includes(`<p class="summary">${esc(summary)} (written by a person) <a class="correct" href="${edit}">Correct it</a></p>`));
  assert.equal(html.includes('No one has written'), false);
  assert.equal((html.match(/\(written by a person\)/g) ?? []).length, 1, 'said once, at the top');
  assert.match(shell, /\.summary \.correct \{ font-size: 14px; \}/);
});
