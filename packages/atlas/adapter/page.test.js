import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { analyzeHistory } from '../core/history.js';
import { readBoundaryFile } from './boundary-file.js';
import { buildPage, displayName } from './page.js';

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = resolve(REPO_ROOT, 'fixtures/atlas');
const REGENERATE = 'Regenerate with `npx --yes @dogfood-lab/atlas map`.';
const roots = [];
let doors;
let host;
let sequence;

const HEADINGS = [
  '# doors: how it works',
  '## What this is',
  '## What comes in',
  '## What happens through Ingest',
  '## Who reads the results',
  '## The other doors',
  '## What breaks what',
  '## What tends to change together',
  '## What no test touches',
  '## Written but never read',
  '## Helpers that look duplicated',
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

// Ingest commits into the repository, so it is the main door although Checks
// reaches further; without Ingest the main door is Checks, whose files carry
// no sequences and whose readers are all found by parsing.
function withoutIngest(structure) {
  return { ...structure, doors: structure.doors.filter((door) => !door.file.endsWith('ingest.yml')) };
}

function withoutChecks(structure) {
  return { ...structure, doors: structure.doors.filter((door) => !door.file.endsWith('checks.yml')) };
}

function withEntryCalls(structure, calls) {
  const boundaries = structure.boundaries.map((boundary) => ({
    ...boundary,
    files: boundary.files.map((file) => (file.path !== 'tools/ingest.js' ? file : {
      ...file,
      entry: 'ingest',
      entryRule: 1,
      sequences: [{ calls, exported: true, invokedAtTopLevel: true, isDefaultExport: false, name: 'ingest' }],
    })),
  }));
  return { ...structure, boundaries };
}

before(() => {
  doors = mappedCopy('doors');
  host = mappedCopy('host');
  sequence = mappedCopy('sequence');
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
      // Checks reaches one part more, but Ingest is the door that commits into
      // the repository, so the page follows it and says why.
      '## What this is': '9 parts. Work enters through 5 doors; the busiest is Ingest, which reaches 2 parts and commits into the repository (Checks reaches 3 but commits nothing).',
      '## What comes in': '3. **weekly.** On a push touching 1 path; on a schedule (`0 6 * * 1`), Monday at 06:00 UTC. Runs tools/render.js.',
      '## What happens through Ingest': '2. That reaches lib (4 files).',
      '## Who reads the results': '- **records/** has no reader in this repository.',
      '## The other doors': '**weekly** runs tools/render.js, reaches lib, writes to reports/out.md, and sends a dispatch to acme/hub.',
      '## What breaks what': '- **lib** is imported by 1 part (tools) and sits on the path of 4 doors.',
      '## What tends to change together': 'No two source files changed together often enough to name.',
      '## What no test touches': '- **tools** is imported by no test.',
      '## Written but never read': '- **cache/state.json** is written by tools/cache.js and read by nothing else in this repository.',
      '## Helpers that look duplicated': '- **normalize** is exported by lib/store.js (lib) and tools/prepare.js (tools); the two look alike.',
      '## Generated, never hand-edited': '- **records/** is written by .github/workflows/ingest.yml, tools/ingest.js and tools/scratch.js.',
      '## Hand-authored': 'People write .github/, policies/, the repository root and site/. Nothing in this repository writes to them.',
      // tools/ingest.js imports lib/policy.js first; lib names no entry point,
      // and the file the door's code opens is named instead of lib/.
      '## Where to start': '.github/workflows/ingest.yml → tools/ingest.js → lib/policy.js → indexes/ → site/index.html',
      '## What this map cannot see': REGENERATE,
    };
    for (const [heading, sentence] of Object.entries(exact)) {
      assert.ok(section(markdown, heading).split('\n').includes(sentence), `${heading}: ${sentence}`);
    }
  });

  it('states nothing from a weak landing: a bare root file name under a root it could not read', () => {
    const weak = doors.structure.landings.find((landing) => landing.target === '.gitignore');
    assert.deepEqual(weak.writers, [{ by: 'tools/scratch.js', confidence: 'weak' }]);
    const records = doors.structure.landings.find((landing) => landing.target === 'records');
    assert.ok(records.writers.some((entry) => entry.by === 'tools/scratch.js' && entry.confidence === 'ast'));
    const { markdown, json } = page(doors);
    assert.equal(markdown.includes('.gitignore'), false);
    assert.equal(JSON.parse(json).generated.some((item) => item.place === '.gitignore'), false);
    const tools = doors.structure.boundaries.find((boundary) => boundary.name === 'tools');
    assert.equal(tools.origin, 'authored');
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
    // tools/ingest.js reads indexes/latest.json as well as writing it; a
    // writer reading back its own place is kept in the artifact, not the page.
    const ingest = doors.structure.doors.find((door) => door.file.endsWith('ingest.yml'));
    assert.ok(ingest.readers.some((entry) => entry.by === 'tools/ingest.js' && entry.target === 'indexes/latest.json'));
    assert.equal(reads.includes('tools/ingest.js'), false);
    assert.match(reads, /^- \*\*indexes\/\*\* is read by site\/index\.html \(found by text\), tools\/render\.js and tools\/report\.py\.$/m);
    assert.match(reads, /^- \*\*records\/\*\* has no reader in this repository\.$/m);
    assert.match(section(markdown, '## Where to start'), /^\.github\/workflows\/ingest\.yml → tools\/ingest\.js → lib\/policy\.js → indexes\/ → site\/index\.html\n\nRead those in order to follow one submission end to end\.$/m);
    assert.match(section(markdown, '## What this map cannot see'), /^- Readers marked \(found by text\) come from scanning unparsed files\.$/m);
    // site/index.html is found by text, and a page runs what it names, so it
    // is a reader a hand edit reaches.
    assert.match(section(markdown, '## What breaks what'), /^- \*\*indexes\/\*\* is written by tools and workflows, and read by site and tools; a hand edit reaches every reader\.$/m);
  });

  it('writes the order of work inside the files the main door runs, one level into what they call', () => {
    const { markdown, json } = page(doors, { structure: withoutChecks });
    const lines = section(markdown, '## What happens through Ingest').split('\n');
    const first = lines.indexOf('1. The workflow runs tools/ingest.js and tools/prepare.js in tools.');
    assert.ok(first >= 0);
    // Seven called functions have two or more steps. prepare has two, in the
    // entry's own part, so it is not followed; of the six left, the five with
    // the most steps are kept, and verify beats load policy on source order at
    // two steps each. The kept ones are shown in the order ingest calls them.
    assert.deepEqual(lines.slice(first + 1, first + 9), [
      '   1. Inside tools/ingest.js, ingest does, in order: prepare, verify (lib), load policy, write record, rebuild index, audit record and seal record.',
      '   2. **Verify** (lib) runs, in order: check policy and confirm.',
      '   3. **Write record** (lib) runs, in order: check schema, check policy, schema version and load policy.',
      '   4. **Rebuild index** (lib) runs, in order: load schema, check policy and schema version.',
      '   5. **Audit record** (lib) runs, in order: check schema, write record and schema version.',
      '   6. **Seal record** (lib) runs, in order: check schema, check policy, load schema, load policy and schema version.',
      '   7. Inside tools/prepare.js, prepare does, in order: check schema (lib) and check policy.',
      '2. That reaches lib (4 files).',
    ]);
    assert.equal(lines.some((line) => /\*\*(Prepare|Load policy)\*\*/.test(line)), false);
    // Another part is named once, after the first step that enters it.
    assert.equal(lines[first + 1].split('(lib)').length - 1, 1);
    // lib/verify.js hands checkSchema to runCheck; a function passed is not
    // known to run there, so the artifact keeps it and the page does not.
    assert.equal(lines[first + 2].includes('check schema'), false);
    const [ingest] = JSON.parse(json).sequences;
    assert.equal(ingest.file, 'tools/ingest.js');
    assert.equal(ingest.entry, 'ingest');
    assert.deepEqual(ingest.steps.map((step) => [step.name, step.part]), [
      ['prepare', 'tools'],
      ['verify', 'lib'],
      ['loadPolicy', 'lib'],
      ['writeRecord', 'lib'],
      ['rebuildIndex', 'lib'],
      ['auditRecord', 'lib'],
      ['sealRecord', 'lib'],
    ]);
    assert.deepEqual(ingest.inner.map((inner) => [inner.name, inner.file, inner.steps.length]), [
      ['verify', 'lib/verify.js', 2],
      ['writeRecord', 'lib/store.js', 4],
      ['rebuildIndex', 'lib/store.js', 3],
      ['auditRecord', 'lib/policy.js', 3],
      ['sealRecord', 'lib/store.js', 5],
    ]);
    assert.deepEqual(JSON.parse(page(doors, { structure: withoutIngest }).json).sequences, []);
  });

  it('follows a called function in the entry\'s own part once it has three steps, and names no part for it', () => {
    const call = (name, file, inner) => ({ name, target: { file }, line: 1, ...(inner ? { inner } : {}) });
    const steps = (n) => Array.from({ length: n }, (_, index) => call(`step${index + 1}`, index % 2 === 0 ? 'lib/policy.js' : 'lib/schema.js'));
    const { markdown } = page(doors, {
      structure: (structure) => withEntryCalls(withoutChecks(structure), [
        call('prepare', 'tools/prepare.js', steps(3)),
        call('verify', 'lib/verify.js', steps(2)),
      ]),
    });
    const happens = section(markdown, '## What happens through Ingest');
    assert.match(happens, /^ {3}2\. \*\*Prepare\*\* runs, in order: step 1 \(lib\), step 2 and step 3\.$/m);
    assert.match(happens, /^ {3}3\. \*\*Verify\*\* \(lib\) runs, in order: step 1 and step 2\.$/m);
  });

  it('carries the name the page gives each part next to its id, so the site words it the same way', () => {
    const call = (name, file, inner) => ({ name, target: { file }, line: 1, ...(inner ? { inner } : {}) });
    const { markdown, json } = page(doors, {
      structure: (structure) => withEntryCalls(withoutChecks(structure), [
        call('prepare', 'tools/prepare.js'),
        call('configure', 'package.json', [call('stepOne', 'lib/policy.js'), call('stepTwo', 'lib/schema.js')]),
      ]),
    });
    const [ingest] = JSON.parse(json).sequences;
    assert.equal(ingest.partLabel, 'tools');
    assert.deepEqual(ingest.steps.map((step) => [step.part, step.partLabel]), [['tools', 'tools'], ['root', 'the repository root']]);
    assert.deepEqual([ingest.inner[0].part, ingest.inner[0].partLabel], ['root', 'the repository root']);
    assert.deepEqual(ingest.inner[0].steps.map((step) => step.partLabel), ['lib', 'lib']);
    assert.match(section(markdown, '## What happens through Ingest'), /^ {3}2\. \*\*Configure\*\* \(the repository root\) runs, in order: step one \(lib\) and step two\.$/m);
  });

  it('lists eight or more steps, stops at twelve, and folds three calls into one file into one step', () => {
    const named = (count) => Array.from({ length: count }, (_, index) => ({
      name: `stepNumber${index + 1}`,
      target: { file: index % 2 === 0 ? 'lib/policy.js' : 'tools/prepare.js' },
      line: index + 1,
    }));
    const inside = (calls) => section(page(doors, { structure: (structure) => withEntryCalls(withoutChecks(structure), calls) }).markdown, '## What happens through Ingest');
    assert.match(inside(named(7)), /^ {3}1\. Inside tools\/ingest\.js, ingest does, in order: step number 1 \(lib\), step number 2, .+ and step number 7\.$/m);
    const listed = inside(named(8)).split('\n');
    const lead = listed.indexOf('   1. Inside tools/ingest.js, ingest does, in order:');
    assert.ok(lead >= 0);
    assert.deepEqual(listed.slice(lead + 1, lead + 3), ['      1. step number 1 (lib)', '      2. step number 2']);
    assert.equal(listed[lead + 8], '      8. step number 8');
    const capped = inside(named(14)).split('\n');
    assert.equal(capped[capped.indexOf('   1. Inside tools/ingest.js, ingest does, in order:') + 12], '      12. step number 12, and 2 more');
    assert.equal(capped.some((line) => line.includes('step number 13')), false);
    const store = (name, line) => ({ name, target: { file: 'lib/store.js' }, line });
    assert.match(
      inside([store('openStore', 1), store('writeRecord', 2), store('closeStore', 3), { name: 'rebuildIndex', target: { file: 'tools/prepare.js' }, line: 4 }]),
      /^ {3}1\. Inside tools\/ingest\.js, ingest does, in order: store \(lib, 3 steps\) and rebuild index\.$/m,
    );
  });

  it('says there are no doors and skips the door sections when no workflow exists', () => {
    const { markdown } = page(host, { repoName: 'host' });
    assert.match(markdown, /^3 parts\. No workflows were found, so this page has no doors\.$/m);
    for (const heading of ['## What comes in', '## What happens through', '## Who reads the results', '## The other doors']) {
      assert.equal(markdown.includes(heading), false, heading);
    }
    // Every import of beta sits in a test file: needed to test it, not to run it.
    assert.match(markdown, /^- \*\*beta\*\* is imported only from tests, by 1 part \(tests\), and sits on the path of no door\.$/m);
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

  it('lists what the map cannot see one fact per bullet, with the regenerate line as its own paragraph', () => {
    // GitHub joins bare consecutive lines into one paragraph, so each limit is a bullet.
    const { markdown, json } = page(doors);
    const limits = JSON.parse(json).limits;
    assert.ok(limits.length >= 2);
    assert.equal(
      section(markdown, '## What this map cannot see'),
      `## What this map cannot see\n\n${limits.map((line) => `- ${line}`).join('\n')}\n\n${REGENERATE}\n`,
    );
    const clear = buildPage({
      structure: {
        ...withoutIngest(doors.structure),
        boundaries: doors.structure.boundaries.map((boundary) => ({ ...boundary, dynamicReads: 0, dynamicWrites: 0, unresolvedSites: 0 })),
      },
      statistics: { ...doors.statistics, confidence: { level: 'high' } },
      document: doors.document,
      repoName: 'acme/doors',
    });
    assert.deepEqual(JSON.parse(clear.json).limits, []);
    assert.equal(section(clear.markdown, '## What this map cannot see'), `## What this map cannot see\n\n${REGENERATE}\n`);
  });

  it('calls a boundary of root-level globs the repository root in prose, and keeps its id in page.json', () => {
    assert.equal(displayName({ name: 'root', globs: ['*'] }), 'the repository root');
    assert.equal(displayName({ name: 'top', globs: ['*.md', 'LICENSE'] }), 'the repository root');
    assert.equal(displayName({ name: 'docs', globs: ['*.md', 'docs/**'] }), 'docs');
    assert.equal(displayName({ name: 'markdown', globs: ['**/*.md'] }), 'markdown');
    assert.equal(displayName({ name: 'everything', globs: ['**'] }), 'everything');
    assert.equal(displayName({ name: 'lib', globs: ['lib/**'] }), 'lib');
    assert.equal(displayName({ name: 'empty', globs: [] }), 'empty');

    const root = doors.structure.boundaries.find((boundary) => boundary.name === 'root');
    assert.deepEqual(root.globs, ['*']);
    const plain = page(doors);
    assert.equal(
      section(plain.markdown, '## Hand-authored').split('\n')[2],
      'People write .github/, policies/, the repository root and site/. Nothing in this repository writes to them.',
    );
    assert.deepEqual(JSON.parse(plain.json).authored, ['.github/', 'policies/', 'root', 'site/']);

    const importing = page(doors, {
      structure: (structure) => ({ ...structure, edges: [...structure.edges, { from: 'root', kind: 'file', to: 'lib' }] }),
    });
    assert.match(
      section(importing.markdown, '## What breaks what'),
      /^- \*\*lib\*\* is imported by 2 parts \(the repository root, tools\) and sits on the path of 4 doors\.$/m,
    );
    assert.deepEqual(JSON.parse(importing.json).breaks.find((entry) => entry.name === 'lib').importedBy, ['root', 'tools']);

    // A listed part carries the name the list gives it, next to its id.
    const imported = JSON.parse(page(doors, {
      structure: (structure) => ({ ...structure, edges: [...structure.edges, { from: 'lib', kind: 'file', to: 'root' }] }),
    }).json);
    assert.equal(imported.breaks.find((entry) => entry.name === 'root').partLabel, 'the repository root');
    assert.equal(imported.breaks.find((entry) => entry.name === 'lib').partLabel, 'lib');
  });

  it('carries one map of the name of every part, so a root part another imports reads the repository root in every list', () => {
    const mapped = mappedCopy('root-part');
    const built = page(mapped, { repoName: 'acme/top-level-part' });
    const data = JSON.parse(built.json);
    assert.deepEqual(data.partLabels, { '.github': '.github', lib: 'lib', root: 'the repository root', tools: 'tools' });
    assert.equal(
      section(built.markdown, '## What breaks what'),
      [
        '## What breaks what',
        '',
        '- **lib** is imported by 1 part (the repository root) and sits on the path of 1 door.',
        '- **the repository root** is imported by 1 part (tools) and sits on the path of 1 door.',
        '',
      ].join('\n'),
    );
    assert.deepEqual(data.breaks.map((entry) => [entry.name, entry.importedBy]), [['lib', ['root']], ['root', ['tools']]]);
    assert.ok(section(built.markdown, '## What happens through CI').includes('2. That reaches the repository root (1 file).'));
  });

  it('names source files that changed together, from statistics built over a commit list', () => {
    const commit = (hash, paths) => ({ hash, parents: ['p'], files: paths.map((path) => ({ path, added: 1, deleted: 0 })) });
    // Three commits touch tools/ingest.js and lib/store.js; README.md rides
    // along in each, and a docs file is not a source file, so its pairs are
    // measured but not named. Three more touch lib/policy.js and its own
    // test, which is expected and only counted.
    const analyzed = analyzeHistory([
      commit('c1', ['tools/ingest.js', 'lib/store.js', 'README.md']),
      commit('c2', ['tools/ingest.js', 'lib/store.js', 'README.md']),
      commit('c3', ['tools/ingest.js', 'lib/store.js', 'README.md']),
      commit('c4', ['lib/policy.js', 'lib/policy.test.js']),
      commit('c5', ['lib/policy.js', 'lib/policy.test.js']),
      commit('c6', ['lib/policy.js', 'lib/policy.test.js']),
    ], { inScope: 40, revisions: 3 });
    assert.equal(analyzed.pairs.length, 4);
    const statistics = {
      ...doors.statistics,
      pairs: analyzed.pairs,
      confidence: { level: 'low', reason: analyzed.confidenceReason },
      parameters: { ...doors.statistics.parameters, sharedFloorUsed: analyzed.sharedFloorUsed },
    };
    const built = buildPage({ structure: doors.structure, statistics, document: doors.document, repoName: 'acme/doors' });
    assert.equal(section(built.markdown, '## What tends to change together'), [
      '## What tends to change together',
      '- **lib/store.js** and **tools/ingest.js** changed together in 3 of 3 commits, and the tools part imports the lib part.',
      '1 file changed together with its own test, as expected.',
      'Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 20 source files reach 10 revisions.',
      'Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.',
    ].join('\n\n') + '\n');
    const data = JSON.parse(built.json);
    assert.deepEqual(data.changesTogether, [
      { a: 'lib/store.js', b: 'tools/ingest.js', either: 3, partLabels: ['lib', 'tools'], parts: ['lib', 'tools'], relation: 'b-imports-a', shared: 3 },
    ]);
    assert.equal(data.changesTogetherWithTests, 1);
    assert.deepEqual(data.changesTogetherNote, [
      '1 file changed together with its own test, as expected.',
      'Confidence is low: fewer than 30 qualifying commits in the window, and fewer than 20 source files reach 10 revisions.',
      'Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.',
    ]);

    const inside = buildPage({
      structure: doors.structure,
      statistics: { ...statistics, pairs: [{ a: 'lib/policy.js', b: 'lib/store.js', either: 4, shared: 3, strength: 0.75 }] },
      document: doors.document,
      repoName: 'acme/doors',
    });
    assert.match(inside.markdown, /^- \*\*lib\/policy\.js\*\* and \*\*lib\/store\.js\*\* changed together in 3 of 4 commits, inside the lib part\.$/m);
    const apart = buildPage({
      structure: doors.structure,
      statistics: { ...statistics, pairs: [{ a: 'lib/store.js', b: 'site/app.js', either: 4, shared: 3, strength: 0.75 }] },
      document: doors.document,
      repoName: 'acme/doors',
    });
    assert.match(apart.markdown, /^- \*\*lib\/store\.js\*\* and \*\*site\/app\.js\*\* changed together in 3 of 4 commits\.$/m);
    const empty = page(doors);
    assert.deepEqual(JSON.parse(empty.json).changesTogether, []);
    assert.equal(section(empty.markdown, '## What tends to change together'), [
      '## What tends to change together',
      'No two source files changed together often enough to name.',
      'Window: 180 days; a pair counts from 3 shared commits, since the window holds fewer than 30 qualifying commits.',
    ].join('\n\n') + '\n');
  });

  it('bounds this repository\'s order of work and names its five strongest source pairs', () => {
    const atlas = join(REPO_ROOT, 'atlas');
    const statistics = JSON.parse(readFileSync(join(atlas, 'statistics.json'), 'utf8'));
    const structure = JSON.parse(readFileSync(join(atlas, 'structure.json'), 'utf8'));
    const own = buildPage({ structure, statistics, document: readBoundaryFile(REPO_ROOT), repoName: 'dogfood-lab/testing-os' });
    // CI reaches further, but the ingest door commits into the repository, so
    // it is the one the page follows, and the page says why.
    assert.ok(section(own.markdown, '## What this is').split('\n').includes(
      '23 parts. Work enters through 6 doors; the busiest is Ingest dogfood submission, which reaches 7 parts and commits into the repository (CI reaches 11 but commits nothing).',
    ));
    const happens = section(own.markdown, '## What happens through Ingest dogfood submission').split('\n');
    const followed = happens.filter((line) => /^ {3}\d+\. \*\*/.test(line));
    assert.ok(followed.length <= 5);
    assert.ok(followed.some((line) => line.includes('**Verify** (verify) runs, in order:')));
    assert.ok(followed.some((line) => line.includes('**Write record** runs, in order:')));
    assert.equal(happens.some((line) => line.includes('Is duplicate')), false);

    const source = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|py)$/i;
    // A file and its own test: same directory, same name once the test
    // marker and extension are gone.
    const bare = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const dir = (path) => path.slice(0, path.lastIndexOf('/') + 1);
    const tested = (path) => /^(.+)(?:\.test|\.spec|_test)$/.exec(bare(path))?.[1] ?? /^test_(.+)$/.exec(bare(path))?.[1] ?? null;
    const ownTest = (a, b) => dir(a) === dir(b) && ((tested(a) != null && tested(b) == null && tested(a) === bare(b)) || (tested(b) != null && tested(a) == null && tested(b) === bare(a)));
    const sourcePairs = statistics.pairs.filter((pair) => source.test(pair.a) && source.test(pair.b));
    // The coupling floor moves with the history (it falls to the fallen floor
    // only while fewer than twenty source files reach ten revisions), so the
    // counts below are derived from the committed statistics, never pinned.
    const withTests = sourcePairs.filter((pair) => ownTest(pair.a, pair.b)).length;
    const together = section(own.markdown, '## What tends to change together');
    assert.equal(JSON.parse(own.json).changesTogetherWithTests, withTests);
    if (withTests > 0) {
      const line = withTests === 1
        ? '1 file changed together with its own test, as expected.'
        : `${withTests} files changed together with their own tests, as expected.`;
      assert.ok(together.includes(`\n\n${line}\n\n`), `the set-aside line reads: ${line}`);
    }
    const expected = sourcePairs
      .filter((pair) => !ownTest(pair.a, pair.b))
      .sort((x, y) => y.strength - x.strength || y.shared - x.shared || (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : 1))
      .slice(0, 5);
    const bullets = together.split('\n').filter((line) => line.startsWith('- '));
    assert.deepEqual(bullets.map((line) => /^- \*\*(.+?)\*\* and \*\*(.+?)\*\* changed together in (\d+) of (\d+) commits[,.]/.exec(line).slice(1)),
      expected.map((pair) => [pair.a, pair.b, String(pair.shared), String(pair.either)]));
    assert.equal(bullets.some((line) => line.includes('.md**')), false);
    if (expected.length === 0) {
      assert.ok(together.includes('changed together often enough to name.'), 'the empty case says so in words');
    }
    assert.match(together, /\n\nWindow: \d+ days; a pair counts from \d+ shared commits(, since [^\n]+)?\.\n$/);
  });

  it('finds reports/ written and never read in this repository, and every code part under a test', () => {
    const atlas = join(REPO_ROOT, 'atlas');
    const structure = JSON.parse(readFileSync(join(atlas, 'structure.json'), 'utf8'));
    const own = buildPage({
      structure,
      statistics: JSON.parse(readFileSync(join(atlas, 'statistics.json'), 'utf8')),
      document: readBoundaryFile(REPO_ROOT),
      repoName: 'dogfood-lab/testing-os',
    });
    // generate.js checks reports/ exists before writing into it; a writer
    // reading back its own place is not a reader of it.
    assert.ok(section(own.markdown, '## Written but never read').split('\n')
      .includes('- **reports/** is written by packages/portfolio/generate.js and read by nothing else in this repository.'));
    const data = JSON.parse(own.json);
    assert.ok(data.unread.some((item) => item.place === 'reports/'));
    // fixtures is a code part made only of test material, so it is not counted.
    assert.ok(structure.testFiles > 0);
    const code = structure.boundaries.filter((boundary) => boundary.role === 'code' && boundary.name !== 'fixtures').map((boundary) => boundary.name);
    assert.deepEqual(Object.keys(data.testedBy), code);
    for (const [part, n] of Object.entries(data.testedBy)) assert.ok(n > 0, part);
    assert.deepEqual(data.untested, []);
    assert.deepEqual(data.untestedNote, []);
    assert.ok(section(own.markdown, '## What no test touches').includes('\n\nEvery code part is imported by at least one test.\n'));
    // findings and ingest each keep an atomic-write.js. The findings one is
    // called by a file the ingest door runs, so its order is recorded; the
    // ingest one is called only from files a step further in, so it has none,
    // and the rule falls back to the file name and names the pair.
    assert.ok(data.duplicates.some((item) => item.name === 'atomicWriteFileSync'
      && item.files.join() === 'packages/findings/lib/atomic-write.js,packages/ingest/lib/atomic-write.js'));
  });

  it('names this repository\'s root boundary the repository root wherever its page names it', () => {
    const atlas = join(REPO_ROOT, 'atlas');
    const own = buildPage({
      structure: JSON.parse(readFileSync(join(atlas, 'structure.json'), 'utf8')),
      statistics: JSON.parse(readFileSync(join(atlas, 'statistics.json'), 'utf8')),
      document: readBoundaryFile(REPO_ROOT),
      repoName: 'dogfood-lab/testing-os',
    });
    const authoredLine = section(own.markdown, '## Hand-authored').split('\n')[2];
    assert.match(authoredLine, /\bthe repository root\b/);
    assert.doesNotMatch(authoredLine.replaceAll('the repository root', ''), /\broot\b/);
    assert.match(section(own.markdown, '## Who reads the results'), /the repository root \(\d+ README files\)/);
    for (const line of own.markdown.split('\n')) {
      assert.doesNotMatch(line.replaceAll('the repository root', ''), /(^|[\s(,*])root\b/, line);
    }
    const data = JSON.parse(own.json);
    assert.ok(data.authored.includes('root'));
    // Only the label fields carry the page's wording; every id stays an id.
    const ids = JSON.stringify(data, (key, value) => (key === 'partLabel' || key === 'partLabels' ? undefined : value));
    assert.equal(ids.includes('the repository root'), false);
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

  it('carries the imports among the parts "What breaks what" lists, one per pair, as page.json edges', () => {
    const plain = JSON.parse(page(doors).json);
    assert.deepEqual(plain.breaks.filter((entry) => entry.kind === 'part').map((entry) => entry.name), ['lib', 'tools']);
    assert.deepEqual(plain.edges, [{ from: 'tools', fromTests: false, to: 'lib' }]);
    // A second import between the same two parts is one edge, a pair imported
    // only from tests says so, a production import beside a test one keeps the
    // pair production, and an import from a part the list does not name is left out.
    const patched = JSON.parse(page(doors, {
      structure: (structure) => ({
        ...structure,
        edges: [
          ...structure.edges,
          { from: 'tools', fromTests: true, kind: 'file', to: 'lib' },
          { from: 'lib', fromTests: true, kind: 'file', to: 'tools' },
          { from: 'site', kind: 'file', to: 'lib' },
          { from: 'lib', kind: 'file', to: 'lib' },
        ],
      }),
    }).json);
    const listed = new Set(patched.breaks.filter((entry) => entry.kind === 'part').map((entry) => entry.name));
    for (const edge of patched.edges) assert.ok(listed.has(edge.from) && listed.has(edge.to), JSON.stringify(edge));
    assert.deepEqual(patched.edges, [
      { from: 'lib', fromTests: true, to: 'tools' },
      { from: 'tools', fromTests: false, to: 'lib' },
    ]);
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
    assert.equal(data.parts, 9);
    assert.equal(data.mainDoor, '.github/workflows/ingest.yml');
    assert.deepEqual(data.doors.map((door) => door.name), ['Checks', 'Ingest', 'weekly', 'Manual', 'broken']);
    assert.deepEqual(data.doors[2].triggers, ['on a push touching 1 path', 'on a schedule (`0 6 * * 1`), Monday at 06:00 UTC']);
    assert.deepEqual(data.doors[2].sends, ['sends a dispatch to acme/hub']);
    assert.deepEqual(data.startHere, ['.github/workflows/ingest.yml', 'tools/ingest.js', 'lib/policy.js', 'indexes/', 'site/index.html']);
    assert.deepEqual(data.authored, ['.github/', 'policies/', 'root', 'site/']);
    assert.deepEqual(data.readers, [
      { readers: ['site/index.html (found by text)', 'tools/render.js', 'tools/report.py'], target: 'indexes/' },
      { readers: [], target: 'records/' },
    ]);
    assert.equal(data.limits.at(-1), `Statistics confidence is low: ${doors.statistics.confidence.reason.replace(/\.$/, '')}.`);
  });

  it('names what no test touches, what is written but never read, and helpers that look alike', () => {
    const { markdown, json } = page(doors);
    assert.equal(section(markdown, '## What no test touches'), '## What no test touches\n\n- **tools** is imported by no test.\n');
    // cache/state.json is read only by the file that writes it; records/ and
    // the two reports are read by nothing at all.
    assert.equal(section(markdown, '## Written but never read'), [
      '## Written but never read',
      '',
      '- **cache/state.json** is written by tools/cache.js and read by nothing else in this repository.',
      '- **records/** is written by .github/workflows/ingest.yml, tools/ingest.js and tools/scratch.js, and read by nothing else in this repository.',
      '- **reports/out.json** is written by tools/report.py and read by nothing else in this repository.',
      '- **reports/out.md** is written by tools/render.js and read by nothing else in this repository.',
      '',
    ].join('\n'));
    assert.equal(section(markdown, '## Helpers that look duplicated'), [
      '## Helpers that look duplicated',
      '',
      'These are candidates from names and call order, not a judgement.',
      '',
      '- **normalize** is exported by lib/store.js (lib) and tools/prepare.js (tools); the two look alike.',
      '',
    ].join('\n'));
    const data = JSON.parse(json);
    assert.deepEqual(data.testedBy, { lib: 1, tools: 0 });
    assert.deepEqual(data.untested, [{ part: 'tools', partLabel: 'tools', testedBy: 0 }]);
    assert.deepEqual(data.untestedNote, []);
    assert.deepEqual(data.unread.map((item) => item.place), ['cache/state.json', 'records/', 'reports/out.json', 'reports/out.md']);
    assert.deepEqual(data.unread[1].writers, ['.github/workflows/ingest.yml', 'tools/ingest.js', 'tools/scratch.js']);
    assert.deepEqual(data.unreadNote, []);
    assert.deepEqual(data.duplicates, [{ files: ['lib/store.js', 'tools/prepare.js'], name: 'normalize', partLabels: ['lib', 'tools'], parts: ['lib', 'tools'] }]);
    assert.equal(data.duplicatesLead, 'These are candidates from names and call order, not a judgement.');
    assert.deepEqual(data.duplicatesNote, []);
  });

  it('counts a test file that reaches a part directly or through one import', () => {
    // lib/verify.test.js imports lib/verify.js, which imports lib/policy.js
    // and lib/schema.js: one test reaches lib. Nothing a test imports reaches
    // tools.
    assert.equal(doors.structure.testFiles, 1);
    const tested = Object.fromEntries(doors.structure.boundaries.map((boundary) => [boundary.name, boundary.testedBy]));
    assert.equal(tested.lib, 1);
    assert.equal(tested.tools, 0);
    const lib = doors.structure.boundaries.find((boundary) => boundary.name === 'lib');
    const store = lib.files.find((file) => file.path === 'lib/store.js');
    assert.deepEqual(store.exports, ['normalize', 'rebuildIndex', 'sealRecord', 'writeRecord']);
    assert.deepEqual(store.sequences.find((item) => item.name === 'normalize').calls.map((call) => call.name), ['checkSchema', 'checkPolicy']);
    assert.equal('exports' in lib.files.find((file) => file.path === 'lib/verify.test.js'), false, 'a file that exports nothing carries no list');
  });

  it('says the empty case of each: no test files by name, nothing written, no helper alike', () => {
    const { markdown, json } = page(sequence, { repoName: 'acme/sequence' });
    assert.equal(sequence.structure.testFiles, 0);
    assert.equal(section(markdown, '## What no test touches'), '## What no test touches\n\nNo test files were found by name.\n');
    // Nothing in the fixture writes, so "every written place has a reader"
    // would be true of nothing.
    assert.equal(section(markdown, '## Written but never read'), '## Written but never read\n\nNo place this map can see is written, so none goes unread.\n');
    assert.equal(section(markdown, '## Helpers that look duplicated'), '## Helpers that look duplicated\n\nNo two parts export a helper that looks alike.\n');
    const data = JSON.parse(json);
    assert.deepEqual([data.untested, data.untestedNote], [[], ['No test files were found by name.']]);
    assert.deepEqual([data.unread, data.unreadNote], [[], []]);
    assert.deepEqual([data.duplicates, data.duplicatesLead, data.duplicatesNote], [[], null, []]);

    const reached = (structure) => ({
      ...structure,
      boundaries: structure.boundaries.map((boundary) => ({ ...boundary, testedBy: 1 })),
      testFiles: 1,
    });
    assert.equal(section(page(sequence, { structure: reached }).markdown, '## What no test touches'),
      '## What no test touches\n\nEvery code part is imported by at least one test.\n');
  });

  it('caps each list and counts the rest', () => {
    const many = (structure) => {
      const tools = structure.boundaries.find((boundary) => boundary.name === 'tools');
      const extra = Array.from({ length: 9 }, (_, i) => ({
        ...tools,
        files: [{ exports: [`pair${Math.floor(i / 2)}`, 'same'], hash: 'x', path: `extra${i}/a.js` }],
        globs: [`extra${i}/**`],
        name: `extra${i}`,
      }));
      return { ...structure, boundaries: [...structure.boundaries, ...extra] };
    };
    const { markdown, json } = page(doors, { structure: many });
    const untested = section(markdown, '## What no test touches');
    assert.equal(untested.split('\n').filter((line) => line.startsWith('- ')).length, 8);
    assert.ok(untested.endsWith('\n\nAnd 2 more parts.\n'), untested);
    // Nine parts export same() from a file named a.js, one candidate read as a
    // contract; pair0 to pair3 are each alike in two of them, and pair4 in
    // one. By name: normalize and the four pairs are shown, same is counted.
    const alike = section(markdown, '## Helpers that look duplicated');
    const bullets = alike.split('\n').filter((line) => line.startsWith('- '));
    assert.equal(bullets.length, 5);
    assert.ok(bullets[0].startsWith('- **normalize** is exported by'), bullets[0]);
    assert.equal(bullets[4], '- **pair3** is exported by extra6/a.js (extra6) and extra7/a.js (extra7); the two look alike.');
    assert.ok(alike.endsWith('\n\nAnd 1 more candidate.\n'), alike);
    const data = JSON.parse(json);
    assert.deepEqual([data.untested.length, data.untestedNote], [8, ['And 2 more parts.']]);
    assert.deepEqual(data.duplicatesNote, ['And 1 more candidate.']);
  });

  it('calls two helpers alike by the same calls in order, or by file name where either has no recorded order', () => {
    const patched = (structure, patches) => ({
      ...structure,
      boundaries: structure.boundaries.map((boundary) => {
        const files = boundary.files.map((file) => (patches[file.path] ? { ...file, ...patches[file.path](file) } : file));
        return { ...boundary, files: [...files, ...(patches[boundary.name]?.() ?? [])] };
      }),
    });
    const lines = (markdown) => section(markdown, '## Helpers that look duplicated').split('\n').filter((line) => line.startsWith('- '));
    const reversed = (file) => ({
      sequences: file.sequences.map((item) => (item.name === 'normalize' ? { ...item, calls: [...item.calls].reverse() } : item)),
    });
    assert.deepEqual(lines(page(doors, { structure: (structure) => patched(structure, { 'tools/prepare.js': reversed }) }).markdown), [], 'the same calls in another order');
    const unordered = (file) => ({ sequences: file.sequences.filter((item) => item.name !== 'normalize') });
    assert.deepEqual(lines(page(doors, { structure: (structure) => patched(structure, { 'tools/prepare.js': unordered }) }).markdown), [], 'no order on one side, and store.js is not prepare.js');
    // A second store.js in tools records no order: its names match lib's by
    // file name. prepare.js and it are in one part, so they are not a pair.
    const second = () => [{ exports: ['normalize', 'writeRecord'], hash: 'x', path: 'tools/store.js' }];
    assert.deepEqual(lines(page(doors, { structure: (structure) => patched(structure, { tools: second }) }).markdown), [
      '- **normalize** is exported by lib/store.js (lib) and tools/prepare.js (tools); the two look alike.',
      '- **normalize** is exported by lib/store.js (lib) and tools/store.js (tools); the two look alike.',
      '- **writeRecord** is exported by lib/store.js (lib) and tools/store.js (tools); the two look alike.',
    ]);
  });

  it('puts what changed second, a list when something did and one line when nothing structural did', () => {
    const since = { commit: 'abcdef0123456789', generatedAt: '2026-09-20T06:00:00.000Z' };
    const changed = {
      fileCounts: { added: 1, changed: 0, moved: 0, parts: 1, removed: 0 },
      items: [
        { kind: 'cycle', sentence: 'lib now imports tools, which closes the cycle lib → tools → lib.', subjects: ['lib', 'tools'] },
        { kind: 'counts', sentence: '1 file added, across 1 part.', subjects: [] },
      ],
      since,
      unchanged: false,
    };
    const { markdown, json } = buildPage({ ...doors, repoName: 'acme/doors', changes: changed });
    const heading = '## What changed since 2026-09-20 (abcdef0)';
    assert.ok(markdown.indexOf(`${heading}\n`) > markdown.indexOf('## What this is\n'));
    assert.ok(markdown.indexOf(`${heading}\n`) < markdown.indexOf('## What comes in\n'));
    assert.equal(section(markdown, heading), `${heading}\n\n- lib now imports tools, which closes the cycle lib → tools → lib.\n- 1 file added, across 1 part.\n`);
    assert.deepEqual(JSON.parse(json).changes, changed);
    const quiet = { ...changed, items: [{ kind: 'counts', sentence: 'Nothing structural changed since 2026-09-20; 2 files changed content.', subjects: [] }], unchanged: true };
    assert.equal(section(buildPage({ ...doors, repoName: 'acme/doors', changes: quiet }).markdown, heading), `${heading}\n\nNothing structural changed since 2026-09-20; 2 files changed content.\n`);
    assert.equal(buildPage({ ...doors, repoName: 'acme/doors' }).markdown.includes('## What changed'), false, 'no changes object, no section');
    assert.equal('changes' in JSON.parse(buildPage({ ...doors, repoName: 'acme/doors' }).json), false);
  });

  it('is what atlas map writes, and atlas map writes none of the retired renders', () => {
    const written = readFileSync(join(doors.root, 'atlas', 'README.md'), 'utf8');
    // A fresh repository has no map committed at HEAD, so the page says so.
    assert.equal(written, buildPage({ ...doors, repoName: 'doors-fixture', changes: { first: true } }).markdown);
    assert.ok(existsSync(join(doors.root, 'atlas', 'page.json')));
    for (const name of ['orientation.md', 'dev.md', 'machine.md', 'machine-stats.txt']) {
      assert.equal(existsSync(join(doors.root, 'atlas', name)), false, name);
    }
  });
});

describe('the branch page.json names for editing', () => {
  function mapAt(root) {
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    return JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).defaultBranch;
  }

  function committed(branch) {
    const root = mkdtempSync(join(tmpdir(), 'atlas-branch-'));
    roots.push(root);
    cpSync(join(FIXTURES, 'root-part'), root, { recursive: true });
    git(root, ['init', '-b', branch]);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'root-part']);
    return root;
  }

  it('is the remote default a clone records, even on another branch', () => {
    const upstream = committed('trunk');
    const clone = mkdtempSync(join(tmpdir(), 'atlas-branch-'));
    roots.push(clone);
    git(tmpdir(), ['clone', '--quiet', upstream, clone]);
    assert.equal(git(clone, ['symbolic-ref', 'refs/remotes/origin/HEAD']).trim(), 'refs/remotes/origin/trunk');
    git(clone, ['checkout', '--quiet', '-b', 'feature']);
    assert.equal(mapAt(clone), 'trunk');
  });

  it('is the branch checked out without a remote, and main on a detached head', () => {
    const root = committed('develop');
    assert.equal(mapAt(root), 'develop');
    git(root, ['checkout', '--quiet', '--detach']);
    assert.equal(mapAt(root), 'main');
  });
});

describe('files the parser cannot read', () => {
  it('records the construct each stops on, and the limits count them by construct', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-unread-'));
    roots.push(root);
    cpSync(join(FIXTURES, 'root-part'), root, { recursive: true });
    // The three constructs tree-sitter-typescript 0.23.2 fails on in
    // ai-rpg-engine, written as that repository writes them, and one error
    // that is none of them.
    const files = {
      'lib/inspect.ts': "export class Engine {\n  getPanels(): import('./core.js').Panel[] {\n    return [];\n  }\n}\n",
      'lib/key.ts': 'export function key(a: string, b: string): string {\n  return `${a}\0${b}`;\n}\n',
      'lib/wire.ts': "export function wire(a: string, b: string): string {\n  return `${a}\0${b}`;\n}\n",
      'lib/mocked.test.ts': "const actual = await importOriginal<typeof import('./core.js')>();\nexport { actual };\n",
      'lib/broken.ts': 'export const = ;\n',
    };
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
    git(root, ['init']);
    git(root, ['config', 'core.autocrlf', 'false']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'unread']);
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
    const unread = Object.fromEntries(structure.boundaries.flatMap((boundary) => boundary.files)
      .filter((file) => file.parseError).map((file) => [file.path, file.unreadSyntax ?? null]));
    assert.deepEqual(unread, {
      'lib/broken.ts': null,
      'lib/inspect.ts': 'import-type-array',
      'lib/key.ts': 'nul-character',
      'lib/mocked.test.ts': 'typeof-import-argument',
      'lib/wire.ts': 'nul-character',
    });
    const line = '5 files use syntax the parser cannot read, so what they import is not known: a NUL character inside a string (2), an import type followed by `[]` (1), `typeof import(…)` as a type argument (1) and other syntax (1).';
    assert.ok(JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).limits.includes(line));
    assert.ok(readFileSync(join(root, 'atlas', 'README.md'), 'utf8').includes(`\n- ${line}\n`));
  });
});

describe('commands built at run time', () => {
  it('counts each spawn whose program or arguments are computed, tests included, and follows the spelled ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-spawns-'));
    roots.push(root);
    cpSync(join(FIXTURES, 'root-part'), root, { recursive: true });
    const files = {
      'tools/gate.test.js': [
        "import { execSync, spawnSync } from 'node:child_process';",
        "const args = ['tools/run.js'];",
        'spawnSync(process.execPath, args);',
        "spawnSync('node', args);",
        'execSync(`node ${args[0]}`);',
        "spawnSync('node', ['tools/run.js']);",
        "execSync('node tools/run.js');",
        "/x/.exec('text');",
        '',
      ].join('\n'),
    };
    for (const [path, text] of Object.entries(files)) writeFileSync(join(root, path), text);
    git(root, ['init']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'spawns']);
    const mapped = spawnSync(process.execPath, [CLI, 'map'], { cwd: root, encoding: 'utf8' });
    assert.equal(mapped.status, 0, mapped.stdout + mapped.stderr);
    const structure = JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8'));
    const tools = structure.boundaries.find((boundary) => boundary.name === 'tools');
    assert.equal(tools.dynamicSpawns, 3);
    assert.equal(structure.boundaries.find((boundary) => boundary.name === 'lib').dynamicSpawns, 0);
    // The spelled-out commands are still followed: the test reaches run.js.
    assert.equal(tools.testedBy, 1);
    const limits = JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')).limits;
    assert.ok(limits.includes('3 commands are built at run time and not followed.'), limits.join('\n'));
  });
});
