import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { readBoundaryFile } from './boundary-file.js';
import { buildPage } from './page.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas');
const roots = [];
let doors;
let host;

const HEADINGS = [
  '# doors: how it works',
  '## What this is',
  '## What comes in',
  '## What happens through Checks',
  '## Who reads the results',
  '## The other doors',
  '## What breaks what',
  '## Generated, never hand-edited',
  '## Hand-authored',
  '## Where to start',
  '## What this map cannot see',
];

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function mappedCopy(fixture) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-page-'));
  roots.push(root);
  cpSync(join(FIXTURES, fixture), root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', fixture]);
  const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
  assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
  return {
    root,
    structure: JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')),
    statistics: JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8')),
    document: readBoundaryFile(root),
  };
}

function page(input, patch = {}) {
  return buildPage({
    structure: patch.structure ? patch.structure(input.structure) : input.structure,
    statistics: input.statistics,
    document: patch.document ? patch.document(input.document) : input.document,
    repoName: patch.repoName ?? 'acme/doors',
  });
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next);
}

before(() => {
  doors = mappedCopy('doors');
  host = mappedCopy('host');
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas page', () => {
  it('writes every section in order, each from the recorded facts', () => {
    const { markdown } = page(doors);
    let at = -1;
    for (const heading of HEADINGS) {
      const next = markdown.indexOf(`${heading}\n`);
      assert.ok(next > at, heading);
      at = next;
    }
    const commit = doors.statistics.generatedFrom.commit.slice(0, 7);
    const date = doors.statistics.generatedAt.slice(0, 10);
    assert.ok(markdown.startsWith(`# doors: how it works\n\nMapped at ${date} from commit ${commit}.\n`));
    const exact = {
      '## What this is': '8 parts. Work enters through 5 doors; the busiest is Checks, which reaches 2 parts.',
      '## What comes in': '3. **weekly.** On a push touching 1 path; on a schedule (`0 6 * * 1`), Monday at 06:00 UTC. Runs tools/render.js.',
      '## What happens through Checks': '2. That reaches lib (1 file).',
      '## Who reads the results': '- **reports/** has no reader in this repository.',
      '## The other doors': '**weekly** runs tools/render.js, reaches lib, writes to reports/, and sends a dispatch to acme/hub.',
      '## What breaks what': '- **lib** is imported by 1 part (tools) and sits on the path of 4 doors.',
      '## Generated, never hand-edited': '- **records/** is written by .github/workflows/ingest.yml and tools/ingest.js.',
      '## Hand-authored': 'People write .github/, policies/ and site/. Nothing in this repository writes to them.',
      '## Where to start': '.github/workflows/checks.yml → tools/render.js → lib/',
      '## What this map cannot see': 'Regenerate with `npx --yes @dogfood-lab/atlas map`.',
    };
    for (const [heading, sentence] of Object.entries(exact)) {
      assert.ok(section(markdown, heading).split('\n').includes(sentence), `${heading}: ${sentence}`);
    }
  });

  it('names each trigger in words and marks a workflow it could not read', () => {
    const comes = section(page(doors).markdown, '## What comes in');
    assert.match(comes, /^2\. \*\*Ingest\.\*\* When a repository sends a `submission` event; or by hand\. Runs tools\/ingest\.js and tools\/prepare\.js\.$/m);
    assert.match(comes, /^4\. \*\*Manual\.\*\* By hand\. Runs lib\/schema\.js\.$/m);
    assert.match(comes, /^5\. \*\*broken\.\*\* This workflow could not be read\.$/m);
  });

  it('follows the door that reaches most, and names the readers of what it writes', () => {
    const { markdown } = page(doors, {
      structure: (structure) => ({ ...structure, doors: structure.doors.filter((door) => !door.file.endsWith('checks.yml')) }),
    });
    const happens = section(markdown, '## What happens through Ingest');
    assert.match(happens, /^3\. It writes to indexes\/ and records\/\.$/m);
    assert.match(happens, /^4\. It commits indexes\/ and records\/, then pushes\.$/m);
    const reads = section(markdown, '## Who reads the results');
    assert.match(reads, /^- \*\*indexes\/\*\* is read by site\/index\.html \(found by text\), tools\/render\.js and tools\/report\.py\.$/m);
    assert.match(reads, /^- \*\*records\/\*\* has no reader in this repository\.$/m);
    assert.match(section(markdown, '## Where to start'), /^\.github\/workflows\/ingest\.yml → tools\/ingest\.js → lib\/ → indexes\/ → site\/index\.html\n\nRead those in order to follow one submission end to end\.$/m);
    assert.match(section(markdown, '## What this map cannot see'), /^Readers marked \(found by text\) come from scanning unparsed files\.$/m);
    assert.match(section(markdown, '## What breaks what'), /^- \*\*indexes\/\*\* is written by tools and workflows, and read by site and tools; a hand edit reaches every reader\.$/m);
  });

  it('says there are no doors and skips the door sections when no workflow exists', () => {
    const { markdown } = page(host, { repoName: 'host' });
    assert.match(markdown, /^3 parts\. No workflows were found, so this page has no doors\.$/m);
    for (const heading of ['## What comes in', '## What happens through', '## Who reads the results', '## The other doors']) {
      assert.equal(markdown.includes(heading), false, heading);
    }
    assert.match(markdown, /^- \*\*beta\*\* is imported by 1 part \(tests\) and sits on the path of no door\.$/m);
    assert.match(markdown, /^No door was found, so there is no path through this repository to follow\.$/m);
  });

  it('marks a summary as written by a person, and writes only the derived line without one', () => {
    const marked = page(host, { repoName: 'host' });
    assert.match(marked.markdown, /## What this is\n\na small host fixture \(written by a person\)\n\n3 parts\./);
    assert.equal(JSON.parse(marked.json).summaryFrom, 'person');
    const plain = page(host, { repoName: 'host', document: (document) => ({ ...document, summary: '' }) });
    assert.match(plain.markdown, /## What this is\n\n3 parts\./);
    assert.equal(plain.markdown.includes('written by a person'), false);
    const data = JSON.parse(plain.json);
    assert.equal(data.summary, null);
    assert.equal(data.summaryFrom, null);
  });

  it('keeps to plain sentences: the only arrows are the chain, and no glyph legend is drawn', () => {
    const { markdown } = page(doors);
    const chain = section(markdown, '## Where to start').split('\n')[2];
    for (const line of markdown.split('\n')) {
      if (line !== chain) assert.equal(line.includes('→'), false, line);
      assert.doesNotMatch(line, /[◷⚠⌘⚗¶⚙▶▣]/, line);
    }
    assert.doesNotMatch(markdown, /```|Legend|unnamed|status/);
  });

  it('writes the same bytes twice, and a page.json with sorted keys that carries the same sections', () => {
    const first = page(doors);
    const second = page(doors);
    assert.equal(first.markdown, second.markdown);
    assert.equal(first.json, second.json);
    assert.ok(first.json.endsWith('}\n'));
    const data = JSON.parse(first.json);
    assert.deepEqual(Object.keys(data), [...Object.keys(data)].sort());
    assert.equal(data.repo, 'acme/doors');
    assert.equal(data.parts, 8);
    assert.equal(data.mainDoor, '.github/workflows/checks.yml');
    assert.deepEqual(data.doors.map((door) => door.name), ['Checks', 'Ingest', 'weekly', 'Manual', 'broken']);
    assert.deepEqual(data.doors[2].triggers, ['on a push touching 1 path', 'on a schedule (`0 6 * * 1`), Monday at 06:00 UTC']);
    assert.deepEqual(data.doors[2].sends, ['sends a dispatch to acme/hub']);
    assert.deepEqual(data.startHere, ['.github/workflows/checks.yml', 'tools/render.js', 'lib/']);
    assert.deepEqual(data.authored, ['.github/', 'policies/', 'site/']);
    assert.deepEqual(data.readers, [{ readers: [], target: 'reports/' }]);
    assert.equal(data.limits.at(-1), `Statistics confidence is low: ${doors.statistics.confidence.reason.replace(/\.$/, '')}.`);
  });

  it('is what atlas map writes, and atlas map writes none of the retired renders', () => {
    const written = readFileSync(join(doors.root, 'atlas', 'README.md'), 'utf8');
    assert.equal(written, buildPage({ ...doors, repoName: 'doors-fixture' }).markdown);
    assert.ok(existsSync(join(doors.root, 'atlas', 'page.json')));
    for (const name of ['orientation.md', 'dev.md', 'machine.md', 'machine-stats.txt']) {
      assert.equal(existsSync(join(doors.root, 'atlas', name)), false, name);
    }
  });
});
