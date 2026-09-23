import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { isOwnTest, ownTestPair } from '../core/landings.js';
import { declaredDependencies, declaredScripts } from '../core/python-manifest.js';
import { readBoundaryFile } from './boundary-file.js';
import { buildPage } from './page.js';

// The python-pkg fixture is the conventions a Python repository keeps that a
// JavaScript-shaped reading gets wrong: a dependency named like a local
// module, tests in tests/, a console script in pyproject.toml, a class made
// and then called, a module loaded from a path, and a release script that
// rewrites a tracked file.

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas/python-pkg');
const roots = [];
let mapped;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}

function atlas(cwd, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

function section(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`);
  assert.ok(start >= 0, heading);
  const next = markdown.indexOf('\n## ', start + heading.length);
  return markdown.slice(start, next === -1 ? markdown.length : next);
}

function part(name) {
  const found = mapped.structure.boundaries.find((boundary) => boundary.name === name);
  assert.ok(found, name);
  return found;
}

function file(path) {
  const found = mapped.structure.boundaries.flatMap((boundary) => boundary.files).find((item) => item.path === path);
  assert.ok(found, path);
  return found;
}

function calls(path, name) {
  const sequence = (file(path).sequences ?? []).find((item) => item.name === name);
  assert.ok(sequence, `${path} ${name}`);
  return sequence.calls.map((call) => `${call.name}${call.receiver ? ` (${call.receiver})` : ''} → ${call.target?.file ?? call.target?.boundary ?? 'null'}`);
}

before(() => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-python-'));
  roots.push(root);
  cpSync(FIXTURE, root, { recursive: true });
  git(root, ['init']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['add', '-A']);
  git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'python-pkg']);
  const result = atlas(root, ['map']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  mapped = {
    root,
    stdout: result.stdout,
    structure: JSON.parse(readFileSync(join(root, 'atlas', 'structure.json'), 'utf8')),
    statistics: JSON.parse(readFileSync(join(root, 'atlas', 'statistics.json'), 'utf8')),
    markdown: readFileSync(join(root, 'atlas', 'README.md'), 'utf8'),
    page: JSON.parse(readFileSync(join(root, 'atlas', 'page.json'), 'utf8')),
    document: readBoundaryFile(root),
  };
});

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('python manifests', () => {
  it('reads declared dependencies from pyproject.toml, without the project naming itself in an extra', () => {
    assert.deepEqual([...declaredDependencies(FIXTURE, ['pyproject.toml'])].sort(), ['datasets', 'requests']);
  });

  it('reads the console scripts as module and function', () => {
    assert.deepEqual(declaredScripts(FIXTURE, ['pyproject.toml']), [{ manifest: 'pyproject.toml', module: 'trainkit.console', fn: 'main' }]);
  });
});

describe('python resolution', () => {
  it('reads a declared dependency as external though a local module shares its name, and counts those sites apart', () => {
    // trainkit/datasets.py and trainkit/trainer.py both import the datasets
    // library; a local module of one name deeper in the tree does not shadow it.
    const trainkit = part('trainkit');
    assert.equal(trainkit.externals, 2);
    assert.deepEqual(trainkit.externalNames, ['datasets']);
    assert.equal(trainkit.unresolvedSites, 0);
  });

  it('leaves a name that is local only by a sys.path insert unresolved, since nothing says which it is', () => {
    // scripts/smoke.py imports helpers, which is scripts/helpers.py only when
    // the script's own directory is on the path; it is not declared.
    assert.equal(part('scripts').unresolvedSites, 1);
    assert.equal('externalNames' in part('scripts'), false);
    assert.equal(part('scripts').externals, 0);
  });

  it('resolves importlib.import_module with a literal, and a module loaded from a path, as imports', () => {
    // tests/test_smoke.py loads scripts/smoke.py with spec_from_file_location
    // from a path built on __file__; scripts/smoke.py imports trainkit.plugins
    // by name. Each is an edge the parts can be seen through.
    assert.ok(mapped.structure.edges.some((edge) => edge.from === 'tests' && edge.to === 'scripts'));
    assert.equal(part('scripts').testedBy, 1);
    const reach = mapped.structure.doors.find((door) => door.name === 'Smoke').reach;
    assert.deepEqual(reach.find((entry) => entry.boundary === 'trainkit').files, 5);
  });
});

describe('python entry points', () => {
  it('takes a console script from pyproject.toml as the entry of the part that holds its module', () => {
    assert.deepEqual(part('trainkit').entryPoints, ['trainkit/console.py']);
  });

  it('drops an entry outside the part: the root package.json bin lives in bin/', () => {
    assert.deepEqual(part('root').entryPoints, []);
  });

  it('rule 0: the function the script names is the entry, over one called at top level', () => {
    assert.equal(file('trainkit/console.py').entry, 'main');
    assert.equal(file('trainkit/console.py').entryRule, 0);
  });
});

describe('the order of work through objects', () => {
  it('follows a method called on an object of an imported class to the class, through the package that hands it on', () => {
    // from trainkit import Trainer reaches trainkit/__init__.py, which imports
    // Trainer from .trainer; handle = build() is a same-file call whose
    // result names no class, so handle.close() is no step.
    assert.deepEqual(calls('scripts/smoke.py', 'main'), [
      'Trainer → trainkit/trainer.py',
      'train (Trainer) → trainkit/trainer.py',
      'main → trainkit/console.py',
    ]);
  });

  it('follows new in JavaScript, and not a factory function\'s result', () => {
    assert.deepEqual(calls('web/run.js', 'main'), ['save (Store) → web/store.js', 'openDb → web/store.js']);
  });
});

describe('own tests across directories', () => {
  it('pairs a test with its file beside it or under a test directory, in the same language', () => {
    assert.equal(isOwnTest('tests/test_trainer.py', 'trainkit/trainer.py'), true);
    assert.equal(isOwnTest('lib/page.test.js', 'lib/page.js'), true);
    assert.equal(isOwnTest('packages/x/test/page.test.js', 'packages/x/src/page.ts'), true);
    assert.equal(isOwnTest('spec/store.spec.ts', 'src/store.ts'), true);
    assert.equal(isOwnTest('lib/test_trainer.py', 'trainkit/trainer.py'), false, 'apart, and not under a test directory');
    assert.equal(isOwnTest('tests/test_trainer.py', 'docs/trainer.md'), false, 'another language');
    assert.equal(isOwnTest('trainkit/trainer.py', 'tests/test_trainer.py'), false);
    assert.equal(ownTestPair('trainkit/trainer.py', 'tests/test_trainer.py'), true);
  });

  it('counts a test for the part of the file it is named for', () => {
    assert.equal(part('trainkit').testedBy, 2);
    assert.equal(section(mapped.markdown, '## What no test touches'), [
      '## What no test touches',
      '- **bin** is imported by no test.\n- **web** is imported by no test.',
    ].join('\n\n') + '\n');
  });

  it('sets a file and its own test in tests/ aside from what changes together', () => {
    const statistics = {
      ...mapped.statistics,
      confidence: { level: 'full' },
      pairs: [
        { a: 'tests/test_trainer.py', b: 'trainkit/trainer.py', either: 5, shared: 5, strength: 1 },
        { a: 'tests/test_smoke.py', b: 'trainkit/console.py', either: 4, shared: 3, strength: 0.75 },
      ],
    };
    const built = buildPage({ structure: mapped.structure, statistics, document: mapped.document, repoName: 'acme/trainkit' });
    assert.equal(section(built.markdown, '## What tends to change together'), [
      '## What tends to change together',
      '- **tests/test_smoke.py** and **trainkit/console.py** changed together in 3 of 4 commits, and the tests part imports the trainkit part.',
      '1 file changed together with its own test, as expected.',
      'Window: 180 days; a pair counts from 3 shared commits.',
    ].join('\n\n') + '\n');
  });
});

describe('shell scripts as writers and readers', () => {
  it('reads a redirection, mv and tee as writes and cat as a read, and not a here-document\'s body', () => {
    const landing = (target) => mapped.structure.landings.find((item) => item.target === target);
    assert.deepEqual(landing('CITATION.cff').writers, [{ by: 'scripts/release.sh', confidence: 'text' }]);
    assert.deepEqual(landing('notes/releases.md').writers, [{ by: 'scripts/release.sh', confidence: 'text' }]);
    assert.deepEqual(landing('VERSION').writers, []);
    assert.ok(landing('VERSION').readers.some((entry) => entry.by === 'scripts/release.sh' && entry.call === 'cat'));
    assert.equal(part('root').origin, 'mixed');
  });

  it('no longer calls the root hand-authored once a script writes into it', () => {
    assert.equal(section(mapped.markdown, '## Hand-authored'), '## Hand-authored\n\nPeople write .github/. Nothing in this repository writes to them.\n');
    assert.match(section(mapped.markdown, '## Generated, never hand-edited'), /^- \*\*CITATION\.cff\*\* is written by scripts\/release\.sh\.$/m);
    assert.match(section(mapped.markdown, '## Written but never read'), /^- \*\*CITATION\.cff\*\* is written by scripts\/release\.sh and read by nothing else in this repository\.$/m);
  });
});

describe('the page on a Python package', () => {
  it('writes the order of work with the class a method is called on', () => {
    assert.equal(section(mapped.markdown, '## What happens through Smoke'), [
      '## What happens through Smoke',
      [
        '1. The workflow runs scripts/smoke.py in scripts.',
        '   1. Inside scripts/smoke.py, main does, in order: trainer (trainkit), train (Trainer) and main.',
        '2. That reaches trainkit (5 files).',
      ].join('\n'),
    ].join('\n\n') + '\n');
    const steps = mapped.page.sequences[0].steps;
    assert.deepEqual(steps.map((step) => step.receiver ?? null), [null, 'Trainer', null]);
  });

  it('starts where the door\'s code opens the package and follows the name it imports to its file', () => {
    assert.deepEqual(mapped.page.startHere, [
      '.github/workflows/smoke.yml',
      'scripts/smoke.py',
      'trainkit/__init__.py',
      'trainkit/trainer.py',
    ]);
  });

  it('counts declared dependencies apart from what could not be resolved', () => {
    assert.deepEqual(mapped.page.limits.slice(0, 2), [
      '2 import sites name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.',
      '1 import site could not be resolved.',
    ]);
  });
});

describe('atlas check and explain on a map git does not hold', () => {
  it('says there is nothing to check against until the map is committed, then compares', () => {
    const before = atlas(mapped.root, ['check']);
    assert.equal(before.status, 0, before.stdout);
    assert.equal(before.stdout, 'atlas check\n  no committed map; nothing to check against\n');
    const root = mkdtempSync(join(tmpdir(), 'atlas-python-'));
    roots.push(root);
    cpSync(mapped.root, root, { recursive: true });
    git(root, ['add', 'atlas']);
    git(root, ['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', 'map']);
    const after = atlas(root, ['check']);
    assert.equal(after.status, 0, after.stdout);
    assert.match(after.stdout, /boundaries match the committed map/);
  });

  it('explains a part\'s declared dependencies the way the page counts them', () => {
    const result = atlas(mapped.root, ['explain', 'trainkit/datasets.py']);
    assert.equal(result.status, 0, result.stdout);
    assert.ok(result.stdout.split('\n').includes(
      'In its part, 2 imports name a declared dependency that shares its name with a local module (datasets); they are read as the dependency, which is not in this repository.',
    ), result.stdout);
  });
});
