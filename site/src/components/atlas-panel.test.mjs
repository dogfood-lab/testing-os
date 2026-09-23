/**
 * The dashboard panel is static HTML. These pins keep the Atlas slice's
 * contract: the panel, the render-branch data URL, the page it links to, the
 * doors column, the two glyphs, the palette rule, and the state sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(join(repoRoot, 'site', 'public', 'dashboard', 'index.html'), 'utf8');

function panel() {
  const start = src.indexOf('id="atlasPanel"');
  const end = src.indexOf('id="emptyFleet"');
  assert.ok(start > 0 && end > start, 'atlas panel must sit before the hero fallbacks');
  return src.slice(start, end);
}

test('atlas panel is labelled and its table headers are scoped', () => {
  const html = panel();
  assert.match(html, /aria-labelledby="atlasH"/);
  assert.match(html, /<caption[^>]*class="sr"/);
  const heads = [...html.matchAll(/<th\b[^>]*>/g)];
  assert.ok(heads.length >= 7, 'expected a header for every column');
  for (const head of heads) assert.match(head[0], /scope="col"/);
});

test('atlas data is read from the render branch', () => {
  assert.match(src, /atlasBase:\s*"https:\/\/raw\.githubusercontent\.com\/dogfood-lab\/testing-os\/atlas-render\/"/);
  assert.match(src, /atlasFleet:\s*"indexes\/atlas\/fleet\.json"/);
});

test('each row links to the site page for its repository, not a retired render', () => {
  assert.match(src, /"\.\.\/atlas\/\?repo=" \+ String\(repo\)\.split\("\/"\)\.map\(encodeURIComponent\)\.join\("\/"\)/);
  assert.match(src, /esc\(atlasHref\(r\.repo\)\) \+ '">page<\/a>/);
  assert.equal(src.includes('/blob/atlas-render/indexes/atlas/'), false, 'the markdown link now lives on the site page');
  for (const retired of ['orientation.md', 'dev.md', 'machine.md', 'machine-stats.txt']) {
    assert.equal(src.includes(retired), false, retired);
  }
});

test('the panel counts doors, and no longer counts unnamed boundaries', () => {
  const html = panel();
  assert.match(html, /data-sort="doors">doors</);
  assert.match(src, /num\("doors"\)/);
  assert.equal(/unnamed/.test(src), false);
});

test('the age and low-confidence glyphs are symbols with titles', () => {
  for (const id of ['atlas-age', 'atlas-low']) {
    assert.match(src, new RegExp('<symbol\\s+id="' + id + '"[\\s\\S]*?<title>[^<]+</title>'));
  }
});

test('the atlas style block adds meanings, not colors', () => {
  const start = src.indexOf('/* atlas */');
  const end = src.indexOf('/* atlas end */');
  assert.ok(start > 0 && end > start, 'atlas style block missing');
  const block = src.slice(start, end);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(block, /\brgb\s*\(/i);
  assert.doesNotMatch(block, /\bhsl\s*\(/i);
  assert.doesNotMatch(block, /(?<![\w-])(?:red|blue|green|white|black|gray|grey|orange|yellow|purple|pink|transparent|currentcolor)(?![\w-])/i);
  assert.match(block, /var\(--/);
});

test('the four atlas state strings are verbatim', () => {
  for (const sentence of [
    'no render yet — the weekly job has not run',
    'no public repository has adopted Atlas yet',
    'historical',
    'low confidence',
  ]) {
    assert.ok(src.includes(sentence), sentence);
  }
});
