/**
 * The site says what the markdown twin says for the sentences slice AJ-3
 * corrected: a directory its writers only put files into "holds files
 * written by" them, a place named by its shape is shown as the markdown
 * shows it, and the files a step calls that the path does not go through
 * are listed beside the path. Each fixture is mapped by the atlas CLI, so
 * the site renders the page.json `atlas map` writes, and each section is
 * compared line for line with the README.md written beside it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as render from '../../public/atlas/render.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

// The page.json and README.md `atlas map` writes for a copy of a fixture.
function mapped(name) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-site-truth-'));
  try {
    cpSync(join(repoRoot, 'fixtures', 'atlas', name), root, { recursive: true });
    const git = (args) => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    };
    git(['init']);
    git(['add', '-A']);
    git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', name]);
    // The parts are the ones atlas init proposes, as for a first map.
    for (const verb of ['init', 'map']) {
      const run = spawnSync(process.execPath, [join(repoRoot, 'packages', 'atlas', 'cli.js'), verb], { cwd: root, encoding: 'utf8' });
      assert.equal(run.status, 0, run.stdout + run.stderr);
    }
    return {
      page: JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')),
      markdown: readFileSync(join(root, 'atlas', 'README.md'), 'utf8').replace(/\r\n/g, '\n'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// A section of the markdown as its lines of text: list marks, bold and code
// marks dropped.
function markdownLines(markdown, heading) {
  const at = markdown.indexOf(`\n## ${heading}\n`);
  assert.ok(at !== -1, `the markdown has ${heading}`);
  const end = markdown.indexOf('\n## ', at + 1);
  return markdown.slice(at + heading.length + 5, end === -1 ? undefined : end).split('\n')
    .map((line) => line.replace(/^- /, '').replace(/\*\*|`/g, '').trim())
    .filter((line) => line !== '');
}

// The same section as the site renders it: one line per paragraph or list
// item, tags dropped, entities decoded, the screen reader's ", then" between
// the chain's files left out as the markdown's arrows leave it out.
function siteLines(html, heading) {
  const at = html.indexOf(`<h2>${render.esc(heading)}</h2>`);
  assert.ok(at !== -1, `the site has ${heading}`);
  const body = html.slice(at + `<h2>${render.esc(heading)}</h2>`.length, html.indexOf('</section>', at));
  return body.replace(/<span class="sr">[^<]*<\/span>/g, '').replace(/<\/(?:p|li)>/g, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity])
    .split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

test('a directory its writers only put files into holds files written by them, on the site as in the markdown', () => {
  const { page, markdown } = mapped('written-into');
  assert.ok(page.generated.some((item) => item.into), 'the map has a directory its writers only put files into');
  const html = render.renderPage(page, { repo: 'acme/written-into' });
  for (const heading of ['Generated, never hand-edited', 'Written but never read', 'What breaks what', 'Hand-authored']) {
    assert.deepEqual(siteLines(html, heading), markdownLines(markdown, heading), heading);
  }
  const generated = siteLines(html, 'Generated, never hand-edited');
  assert.ok(generated.includes('kb/ holds files written by kb/gen.py.'), generated.join('\n'));
  assert.ok(!generated.some((line) => line.startsWith('kb/ is written by')), generated.join('\n'));
  // A place named by its shape is shown as the markdown shows it.
  assert.ok(generated.includes('tuning/matrix-*.json is written by scripts/tune.mjs when run from the repository root, and committed.'), generated.join('\n'));
});

test('the files a step calls that the path does not go through are listed beside the path, on the site as in the markdown', () => {
  for (const name of ['start-steps/siblings', 'start-steps/lazy']) {
    const { page, markdown } = mapped(name);
    assert.ok((page.startBeside ?? []).length > 0, `${name} lists files beside its path`);
    const html = render.renderPage(page, { repo: `acme/${name.replace('/', '-')}` });
    assert.deepEqual(siteLines(html, 'Where to start'), markdownLines(markdown, 'Where to start'), name);
  }
});

test('the files listed beside a path are counted past four, as the markdown counts them', () => {
  const { page } = mapped('start-steps/siblings');
  const many = { ...page, startBeside: [{ files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'], from: 'src/cli.js' }] };
  const lines = siteLines(render.renderPage(many, { repo: 'acme/siblings' }), 'Where to start');
  assert.ok(lines.includes('Beside the path, src/cli.js also calls a.js, b.js, c.js, d.js and 2 more files.'), lines.join('\n'));
  // A file name is data: it is escaped, never markup.
  const hostile = { ...page, startBeside: [{ files: ['<img src=x>.js'], from: 'src/cli.js' }] };
  assert.equal(render.renderPage(hostile, { repo: 'acme/siblings' }).includes('<img src=x>'), false);
});

test('a place a pattern under a directory chosen at run time could match is read by nothing the map can name, on the site as in the markdown', () => {
  const { page, markdown } = mapped('glob-readers');
  assert.ok(page.unread.some((item) => item.mayRead), 'the map has a place a run-time pattern may read');
  const html = render.renderPage(page, { repo: 'acme/glob-readers' });
  assert.deepEqual(siteLines(html, 'Written but never read'), markdownLines(markdown, 'Written but never read'));
  // A pattern is data: it is escaped, never markup.
  const hostile = { ...page, unread: [{ ...page.unread[0], mayRead: { by: ['report.py'], patterns: ['<img src=x>'] } }] };
  assert.equal(render.renderPage(hostile, { repo: 'acme/glob-readers' }).includes('<img src=x>'), false);
});

test('a path that ends at a tie among the files it leads to names them, on the site as in the markdown', () => {
  const { page, markdown } = mapped('start-scenes');
  assert.ok(page.startStop, 'the map has a path that ends at a tie');
  const html = render.renderPage(page, { repo: 'acme/start-scenes' });
  assert.deepEqual(siteLines(html, 'Where to start'), markdownLines(markdown, 'Where to start'));
});
