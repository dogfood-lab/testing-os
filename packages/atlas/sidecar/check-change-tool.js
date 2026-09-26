import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isOwnTest, isTestFile } from '../core/landings.js';
import { storedBytes, textAttributes } from '../core/text.js';
import { basisOf, byBasis, group } from './answer.js';
import { mapHashes } from './freshness.js';
import { filesAt, git } from './git.js';
import { importersOf, importsOf, reread, rereadFacts, trackedPlace } from './reread.js';

/**
 * atlas_check_change: what a change does, before it is committed. For the
 * changed files, given or taken from the checkout, it names the tests that
 * reach them, the doors that run them or pass through their parts, what the
 * change did to the structure the map records (imports between parts gained
 * or lost, a file in no part, a writer or reader gained or lost, imports that
 * no longer resolve), and whether the map must be regenerated before commit.
 *
 * It reads again only the changed files, each as it is now and as the map
 * read it, with the engine's own per-file code, so what the scoped reading
 * cannot settle is settled alike on both sides and never shows as a change.
 * A change it cannot settle, one that reshapes how the rest of the repository
 * is read (a manifest, a workflow, a configuration file the engine reads,
 * the boundary file) or removes a file, gets "a full refresh is needed", and
 * no partial answer.
 */

const BOUNDARY_FILE = 'atlas/boundaries.yaml';
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const ACTION = /(^|\/)action\.ya?ml$/;
// The manifests the engine reads for doors, entry points, workspaces,
// crates and the Godot project, by name wherever they are.
const MANIFESTS = new Set([
  'package.json', 'pnpm-workspace.yaml', 'pyproject.toml', 'setup.cfg', 'setup.py', 'Cargo.toml', 'go.mod',
  'project.godot', 'export_presets.cfg', 'tauri.conf.json', 'Tauri.toml', 'turbo.json',
]);
// The configuration the engine reads to resolve imports, find tests, follow
// builds and read what containers and make targets run.
const CONFIGURATION = [
  /^[jt]sconfig(\.[\w.-]+)?\.json$/,
  /^(vitest|vite|jest|tsup|astro|next|webpack|rollup|esbuild|svelte|nuxt)\.config\.[cm]?[jt]sx?$/,
  /^jest\.config\.json$/,
  /^\.mocharc\.(js|cjs|ya?ml|jsonc?)$/,
  /^eslint\.config\.[cm]?[jt]s$/,
  /^\.?pytest\.ini$/,
  /^tox\.ini$/,
  /^conftest\.py$/,
  /^(GNUmakefile|[Mm]akefile)$/,
  /^(Dockerfile(\.[\w.-]+)?|[\w.-]+\.Dockerfile)$/,
  /^(docker-)?compose\.ya?ml$/,
  /^\.gitattributes$/,
  /\.(cs|fs)proj$|\.sln$/,
];
// The map's own output: it describes the tree minus atlas/, and a change to it
// is the map, not a change the map describes.
const GENERATED = new Set(['atlas/structure.json', 'atlas/statistics.json', 'atlas/page.json', 'atlas/README.md']);

function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

/**
 * Why a change to this path needs a full map, or null when the scoped
 * reading settles it.
 */
export function reshapes(path) {
  if (path === BOUNDARY_FILE) return 'the boundary file';
  if (WORKFLOW.test(path)) return 'a workflow';
  if (ACTION.test(path)) return 'an action';
  const base = posix.basename(path);
  if (MANIFESTS.has(base)) return 'a manifest';
  if (CONFIGURATION.some((pattern) => pattern.test(base))) return 'a configuration file the engine reads';
  return null;
}

// Two-letter git status to what happened to the file.
function statusOf(code) {
  if (code === '??') return 'untracked';
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'unmerged';
  if (code.includes('D')) return 'deleted';
  if (code.includes('A')) return 'added';
  return 'modified';
}

/**
 * Every file that differs from the map, committed since its commit or not
 * committed yet, with what happened to it; or the files given, classified the
 * same way.
 */
export function changedAgainstMap(root, snapshot, given = null) {
  const since = new Map();
  const diff = git(root, ['diff', '--name-status', '-z', '--no-renames', snapshot.commit, 'HEAD', '--']);
  if (diff.ok) {
    const fields = String(diff.stdout).split('\0');
    for (let i = 0; i + 1 < fields.length; i += 2) if (fields[i + 1]) since.set(fields[i + 1], fields[i]);
  }
  const now = new Map();
  const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  if (status.ok) for (const entry of String(status.stdout).split('\0')) if (entry.length >= 4) now.set(entry.slice(3), entry.slice(0, 2));
  const paths = given ?? [...new Set([...since.keys(), ...now.keys()])].sort();
  const out = [];
  for (const path of paths) {
    if (GENERATED.has(path) || (inAtlas(path) && path !== BOUNDARY_FILE)) continue;
    const committed = since.has(path);
    const uncommitted = now.has(path);
    let status = 'unchanged';
    if (uncommitted) status = statusOf(now.get(path));
    else if (committed) status = { A: 'added', D: 'deleted' }[since.get(path)[0]] ?? 'modified';
    if (uncommitted && committed && status === 'modified' && since.get(path)[0] === 'A') status = 'added';
    out.push({ path, status, committed, uncommitted });
  }
  return out;
}

// A file's bytes hashed as the map hashes them: as git stores the file, by
// the repository's own attributes.
function hashOf(bytes, attributes) {
  return createHash('sha256').update(storedBytes(bytes, attributes)).digest('hex');
}

/**
 * Whether a file read now states what the map recorded of it: the files it
 * imports, the places it writes and reads (weak guesses aside, and reads the
 * map derives from imports), and no import that does not resolve where the
 * map names none. The map counts unresolved imports per part, so a file in a
 * part with more than it names cannot be shown to agree, and is read again.
 */
function agreesWithMap(snapshot, reading) {
  if (!reading || reading.parseError) return false;
  const path = reading.path;
  const file = snapshot.ctx.fileOf.get(path);
  if (!file || file.parseError) return false;
  const now = importsOf(reading);
  if (now.unresolved.length > 0) return false;
  const part = snapshot.structure.boundaries.find((boundary) => boundary.name === snapshot.ctx.boundaryOf.get(path));
  const named = part?.unresolvedNamed ?? [];
  if (part && ((part.unresolvedSites ?? 0) !== named.length || named.some((entry) => entry.path === path))) return false;
  const same = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
  if (!same(now.files, [...(file.importsFiles ?? [])].sort())) return false;
  const strongTargets = (entries) => [...new Set(entries.filter((entry) => entry.confidence !== 'weak' && trackedPlace(snapshot, entry.target)).map((entry) => entry.target))].sort();
  const recorded = (side) => [...new Set((snapshot.structure.landings ?? [])
    .filter((landing) => landing.tracked !== false && !landing.spans)
    .filter((landing) => (landing[side] ?? []).some((entry) => entry.by === path && entry.confidence !== 'weak' && entry.call !== 'import'))
    .map((landing) => landing.target))].sort();
  return same(strongTargets(reading.writes), recorded('writers')) && same(strongTargets(reading.reads), recorded('readers'));
}

/**
 * What the map recorded of a file, in the shape of a reading: the files it
 * imports and the places it writes and reads. Used for a file whose bytes at
 * the map's commit are not the ones the map read (a map made on a working
 * tree and committed with its change).
 */
function recordedReading(snapshot, path) {
  const file = snapshot.ctx.fileOf.get(path);
  const entries = (side) => (snapshot.structure.landings ?? [])
    .filter((landing) => !landing.spans)
    .flatMap((landing) => (landing[side] ?? []).filter((entry) => entry.by === path && entry.call !== 'import')
      .map((entry) => ({ target: landing.target, call: entry.call, confidence: entry.confidence })));
  return {
    recorded: true,
    path,
    parts: [],
    imports: (file?.importsFiles ?? []).map((target) => (target.startsWith('@')
      ? { specifier: target, kind: 'static', resolved: { outcome: 'boundary', boundary: target.slice(1) } }
      : { specifier: target, kind: 'static', resolved: { outcome: 'file', path: target } })),
    writes: entries('writers'),
    reads: entries('readers'),
  };
}

// The places a reading writes or reads that the map holds, by target, each
// with the firmest basis it is known by. A place the repository does not
// track is no place of the map; the re-read lists it with what it cannot see.
function placesOf(snapshot, entries) {
  const out = new Map();
  for (const entry of entries) {
    if (!trackedPlace(snapshot, entry.target)) continue;
    const basis = basisOf(entry.confidence);
    if (!out.has(entry.target) || basis === 'parsed') out.set(entry.target, basis);
  }
  return out;
}

/**
 * @param {object} snapshot
 * @param {{ root: string }} repo
 * @param {{ files?: string[] }} args
 */
export function checkChangeAnswer(snapshot, repo, args) {
  const ctx = snapshot.ctx;
  const changed = changedAgainstMap(repo.root, snapshot, args.files ?? null);
  const question = { files: args.files ?? null, from: args.files ? 'given' : 'checkout' };
  const listed = changed.map(({ path, status, committed, uncommitted }) => ({ path, status, committed, uncommitted, part: ctx.boundaryOf.get(path) ?? null }));

  // A change the scoped reading cannot settle is named, and nothing else is
  // answered: a partial answer would be taken for the whole.
  const refresh = [];
  for (const entry of changed) {
    if (entry.status === 'unchanged') continue;
    const why = entry.status === 'deleted' ? 'a deleted file' : entry.status === 'unmerged' ? 'a file with unmerged changes' : reshapes(entry.path);
    if (why) refresh.push({ path: entry.path, why });
  }
  if (refresh.length > 0) {
    const sentences = [
      `Atlas: a full refresh is needed to answer for this change: ${refresh.slice(0, 6).map((entry) => `${entry.path} is ${entry.why}`).join('; ')}${refresh.length > 6 ? `; and ${refresh.length - 6} more` : ''}.`,
      'Atlas: a scoped reading cannot settle how such a change reshapes the rest of the map, so it answers nothing else; atlas_refresh maps the whole checkout.',
    ];
    return {
      ok: true,
      answer: { question, changed: listed, verdict: { fullRefresh: { needed: true, because: refresh }, regenerate: { needed: true, because: ['a full refresh is needed first'] } }, facts: [], cannotSee: [] },
      sentences,
      files: changed.map((entry) => entry.path),
    };
  }

  const live = changed.filter((entry) => entry.status !== 'unchanged');
  const hashes = mapHashes(snapshot.structure);
  // A file given that neither the map nor the checkout holds names nothing.
  const missing = changed.filter((entry) => entry.status === 'unchanged' && !hashes.has(entry.path) && !ctx.fileOf.has(entry.path));
  if (missing.length > 0) {
    return { ok: false, error: { code: 'ATLAS_EXPLAIN_UNKNOWN_PATH', details: missing.slice(0, 8).map((entry) => `${entry.path} names no file in the map or the checkout`), whatToDo: 'check the paths; give files, not directories' } };
  }
  // Every file asked about is followed to its tests and doors; only the
  // files that differ from the map are read again.
  const subjects = changed.map((entry) => entry.path);
  const nowReadings = new Map(reread(snapshot, repo, live.map((entry) => entry.path)).map((reading) => [reading.path, reading]));
  // As the map read it: the file at the map's commit, when those bytes are the
  // ones the map recorded; a file the map was made from before it was
  // committed is compared with what the map recorded.
  const before = new Map();
  const attributeFiles = [...hashes.keys()].filter((path) => path === '.gitattributes' || path.endsWith('/.gitattributes'));
  const attributes = live.length > 0 && attributeFiles.length > 0 ? textAttributes(repo.root, [...live.map((entry) => entry.path), ...attributeFiles]) : new Map();
  // A file whose reading now agrees with what the map recorded of it changed
  // nothing the map holds, and needs no earlier reading to show it.
  const needsEarlier = live.filter((entry) => hashes.has(entry.path) && !agreesWithMap(snapshot, nowReadings.get(entry.path)));
  const earlier = filesAt(repo.root, snapshot.commit, needsEarlier.map((entry) => entry.path));
  for (const [path, bytes] of earlier) {
    if (hashOf(bytes, attributes.get(path)) === hashes.get(path)) before.set(path, bytes);
  }
  const beforeReadings = new Map(before.size === 0 ? [] : reread(snapshot, repo, [...before.keys()], { content: (path) => before.get(path) ?? null }).map((reading) => [reading.path, reading]));

  const facts = [];
  const cannotSee = [];
  const regenerate = [];
  const alsoStale = [];
  const importsAdded = [];
  const importsRemoved = [];
  const writes = { added: [], removed: [] };
  const reads = { added: [], removed: [] };
  const partOfNew = new Map();
  let unassigned = [];
  const overlaps = [];
  const unresolvedDelta = new Map();

  const agreeing = new Set(live.filter((entry) => hashes.has(entry.path) && !needsEarlier.includes(entry)).map((entry) => entry.path));
  for (const entry of live) {
    const now = nowReadings.get(entry.path);
    if (!now) continue;
    cannotSee.push(...rereadFacts(snapshot, now).cannotSee);
    if (!hashes.has(entry.path)) {
      if (now.parts.length === 0) unassigned.push(entry.path);
      else if (now.parts.length > 1) overlaps.push({ path: entry.path, parts: now.parts });
      else partOfNew.set(entry.path, now.parts[0]);
    }
    if (agreeing.has(entry.path)) continue;
    // The side the change is measured from: the file as the map read it, or,
    // when those bytes are not at hand, what the map recorded of it; nothing
    // for a new file.
    const was = beforeReadings.get(entry.path) ?? (hashes.has(entry.path) ? recordedReading(snapshot, entry.path) : null);
    const nowImports = importsOf(now);
    const wasImports = was ? importsOf(was) : { files: [], unresolved: [] };
    for (const target of nowImports.files) if (!wasImports.files.includes(target)) importsAdded.push({ path: entry.path, imports: target });
    for (const target of wasImports.files) if (!nowImports.files.includes(target)) importsRemoved.push({ path: entry.path, imports: target });
    const part = now.parts.length === 1 ? now.parts[0] : null;
    // The map counts unresolved imports per part: a file read from what the
    // map recorded has no count of its own to compare.
    if (part && !was?.recorded) {
      const delta = nowImports.unresolved.length - wasImports.unresolved.length;
      if (delta !== 0) unresolvedDelta.set(part, (unresolvedDelta.get(part) ?? 0) + delta);
    }
    const nowWrites = placesOf(snapshot, now.writes);
    const wasWrites = placesOf(snapshot, was?.writes ?? []);
    for (const [target, basis] of nowWrites) if (!wasWrites.has(target)) writes.added.push({ item: { path: entry.path, place: ctx.place(target) }, basis });
    for (const [target, basis] of wasWrites) if (!nowWrites.has(target)) writes.removed.push({ item: { path: entry.path, place: ctx.place(target) }, basis });
    const nowReads = placesOf(snapshot, now.reads);
    const wasReads = placesOf(snapshot, was?.reads ?? []);
    for (const [target, basis] of nowReads) if (!wasReads.has(target)) reads.added.push({ item: { path: entry.path, place: ctx.place(target) }, basis });
    for (const [target, basis] of wasReads) if (!nowReads.has(target)) reads.removed.push({ item: { path: entry.path, place: ctx.place(target) }, basis });
  }

  // Imports between parts: the map's edges from each part a changed file is
  // in, recomputed with the changed files' imports as they are now.
  const partOf = (path) => ctx.boundaryOf.get(path) ?? partOfNew.get(path) ?? null;
  const importsNow = new Map();
  for (const [path, file] of ctx.fileOf) importsNow.set(path, [...(file.importsFiles ?? [])]);
  for (const entry of live) {
    const now = nowReadings.get(entry.path);
    if (now) importsNow.set(entry.path, importsOf(now).files);
  }
  const touchedParts = new Set(subjects.map((path) => partOf(path)).filter(Boolean));
  const edgesFrom = (sources) => {
    const edges = new Map();
    for (const [path, targets] of sources) {
      const from = partOf(path);
      if (!from || !touchedParts.has(from)) continue;
      for (const target of targets) {
        const to = target.startsWith('@') ? target.slice(1) : partOf(target);
        if (!to || to === from) continue;
        const key = `${from}\0${to}`;
        const tests = isTestFile(path);
        // An edge is from tests only while every file making it is a test.
        edges.set(key, edges.has(key) ? edges.get(key) && tests : tests);
      }
    }
    return edges;
  };
  const edgesNow = edgesFrom(importsNow);
  const edgesMap = new Map();
  for (const edge of snapshot.structure.edges ?? []) {
    if ((edge.kind !== 'file' && edge.kind !== 'chunk') || !touchedParts.has(edge.from) || edge.from === edge.to) continue;
    edgesMap.set(`${edge.from}\0${edge.to}`, edge.fromTests === true);
  }
  const partEdgesAdded = [];
  const partEdgesRemoved = [];
  for (const [key, tests] of edgesNow) {
    const [from, to] = key.split('\0');
    if (!edgesMap.has(key)) partEdgesAdded.push({ from, to, ...(tests ? { fromTests: true } : {}) });
    else if (edgesMap.get(key) !== tests) partEdgesAdded.push({ from, to, ...(tests ? { fromTests: true } : {}), wasFromTests: edgesMap.get(key) });
  }
  for (const [key, tests] of edgesMap) {
    const [from, to] = key.split('\0');
    if (!edgesNow.has(key)) partEdgesRemoved.push({ from, to, ...(tests ? { fromTests: true } : {}) });
  }

  // The tests that reach the changed files: every test file that imports one,
  // or imports a file that does, as far as imports go; and a test named for
  // one, a guess from its name.
  const importers = new Map();
  for (const [target, paths] of importersOf(snapshot)) importers.set(target, [...paths]);
  for (const entry of live) {
    const was = beforeReadings.get(entry.path);
    const now = nowReadings.get(entry.path);
    for (const target of was ? importsOf(was).files : []) importers.set(target, (importers.get(target) ?? []).filter((path) => path !== entry.path));
    for (const target of now ? importsOf(now).files : []) importers.set(target, [...new Set([...(importers.get(target) ?? []), entry.path])]);
  }
  const reached = new Map(subjects.map((path) => [path, 0]));
  const queue = [...subjects];
  for (let at = 0; at < queue.length; at += 1) {
    for (const importer of importers.get(queue[at]) ?? []) {
      if (reached.has(importer)) continue;
      reached.set(importer, reached.get(queue[at]) + 1);
      queue.push(importer);
    }
  }
  const tests = [...reached.keys()].filter((path) => isTestFile(path) && !subjects.includes(path)).sort();
  const everyFile = [...new Set([...ctx.fileOf.keys(), ...subjects])];
  const namedTests = [...new Set(subjects.flatMap((path) => everyFile.filter((other) => isOwnTest(other, path))))]
    .filter((path) => !tests.includes(path)).sort();
  if (tests.length > 0) facts.push(group('tests', 'parsed', tests, { grain: 'file' }));
  if (namedTests.length > 0) facts.push(group('tests', 'weak', namedTests, { grain: 'file' }));

  // The doors that run a changed file, run a file that imports one, or pass
  // through the part of one.
  const readable = ctx.doors.filter((door) => !door.parseError);
  const executes = (run) => run.runKind !== 'checks' && !run.built;
  const runsPath = (run, path) => run.path === path || (run.path.endsWith('/') && path.startsWith(run.path));
  const runs = [];
  const through = [];
  const passing = [];
  const listedDoors = new Set();
  for (const door of readable) {
    const ran = subjects.filter((path) => (door.runs ?? []).some((run) => executes(run) && runsPath(run, path)));
    if (ran.length > 0) {
      runs.push(...ran.map((file) => ({ door: door.name, file })));
      listedDoors.add(door.name);
      continue;
    }
    const via = [...reached.entries()].filter(([path, depth]) => depth > 0 && (door.runs ?? []).some((run) => executes(run) && runsPath(run, path)))
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    if (via.length > 0) {
      through.push({ door: door.name, through: via[0][0] });
      listedDoors.add(door.name);
      continue;
    }
    for (const entry of door.reach ?? []) {
      if (!touchedParts.has(entry.boundary)) continue;
      passing.push({ item: { door: door.name, part: entry.boundary, depth: entry.depth }, basis: entry.depth === 0 ? 'declared' : 'parsed' });
    }
  }
  if (runs.length > 0) facts.push(group('runs', 'declared', runs));
  if (through.length > 0) facts.push(group('reachedThrough', 'parsed', through));
  facts.push(...byBasis('passesThrough', passing, { grain: 'part' }));

  // What the change did to the structure, as the re-read finds it.
  const reRead = { source: 're-read' };
  if (partEdgesAdded.length > 0) facts.push(group('partImportsAdded', 'parsed', partEdgesAdded, { ...reRead, grain: 'part' }));
  if (partEdgesRemoved.length > 0) facts.push(group('partImportsRemoved', 'parsed', partEdgesRemoved, { ...reRead, grain: 'part' }));
  if (importsAdded.length > 0) facts.push(group('importsAdded', 'parsed', importsAdded, { ...reRead, grain: 'file' }));
  if (importsRemoved.length > 0) facts.push(group('importsRemoved', 'parsed', importsRemoved, { ...reRead, grain: 'file' }));
  if (unassigned.length > 0) facts.push(group('inNoPart', 'declared', unassigned, { grain: 'file' }));
  if (overlaps.length > 0) facts.push(group('inTwoParts', 'declared', overlaps, { grain: 'file' }));
  facts.push(...byBasis('writesAdded', writes.added, reRead), ...byBasis('writesRemoved', writes.removed, reRead));
  facts.push(...byBasis('readsAdded', reads.added, reRead), ...byBasis('readsRemoved', reads.removed, reRead));
  const unresolvedChanges = [...unresolvedDelta.entries()].filter(([, delta]) => delta !== 0).map(([part, delta]) => ({ part, delta }));

  // Whether atlas check fails on the change, by the rules it applies, and
  // what else of the committed map the change makes stale.
  for (const edge of partEdgesAdded) regenerate.push(`${ctx.shown(edge.from)} now imports ${ctx.shown(edge.to)}${edge.fromTests ? ' from tests' : ''} (atlas check: ATLAS_STRUCTURE_DRIFT)`);
  for (const edge of partEdgesRemoved) regenerate.push(`${ctx.shown(edge.from)} no longer imports ${ctx.shown(edge.to)} (atlas check: ATLAS_STRUCTURE_DRIFT)`);
  // atlas check reads the tracked files, so a file not yet added fails it
  // once it is.
  const untracked = new Set(live.filter((entry) => entry.status === 'untracked').map((entry) => entry.path));
  for (const path of unassigned) regenerate.push(`${path} is in no part (atlas check${untracked.has(path) ? ', once it is added' : ''}: ATLAS_UNASSIGNED_NEW)`);
  for (const entry of overlaps) regenerate.push(`${entry.path} is in ${entry.parts.join(' and ')} (atlas check: ATLAS_OVERLAP)`);
  for (const { part, delta } of unresolvedChanges) regenerate.push(`${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} ${Math.abs(delta) === 1 ? 'import' : 'imports'} in ${ctx.shown(part)} could not be resolved (atlas check: ATLAS_STRUCTURE_DRIFT)`);
  if (writes.added.length + writes.removed.length > 0) alsoStale.push('who writes the places this change writes');
  if (reads.added.length + reads.removed.length > 0) alsoStale.push('who reads the places this change reads');
  if (partOfNew.size > 0) alsoStale.push('the files of the parts that gain a file');
  if (live.length > 0) alsoStale.push('the hashes of the changed files');

  const verdict = {
    fullRefresh: { needed: false, because: [] },
    regenerate: { needed: regenerate.length > 0, because: regenerate, ...(alsoStale.length > 0 ? { alsoStale } : {}) },
  };
  const sentences = checkSentences(ctx, { live, subjects, tests, namedTests, runs, through, passing, partEdgesAdded, partEdgesRemoved, unassigned, writes, reads, regenerate, alsoStale, unresolvedChanges });
  return {
    ok: true,
    answer: { question, changed: listed, verdict, ...(unresolvedChanges.length > 0 ? { unresolvedChanges } : {}), facts, cannotSee },
    sentences,
    files: changed.map((entry) => entry.path),
  };
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const NAMED = 6;

function named(items) {
  return items.length <= NAMED ? list(items) : `${items.slice(0, NAMED).join(', ')} and ${items.length - NAMED} more`;
}

function checkSentences(ctx, facts) {
  const out = [];
  const files = facts.live.map((entry) => entry.path);
  if (files.length === 0) {
    out.push(facts.subjects.length === 0
      ? 'Atlas: no file differs from the map, so there is no change to check.'
      : 'Atlas: none of these files differs from the map, so the change leaves the map as it is.');
    if (facts.subjects.length === 0) return out;
  } else {
    out.push(`Atlas: ${files.length === 1 ? `${files[0]} differs` : `${files.length} files differ`} from the map; each was read again as it is now and as the map read it.`);
  }
  if (facts.tests.length > 0) out.push(`Atlas: ${facts.tests.length === 1 ? '1 test reaches' : `${facts.tests.length} tests reach`} the change through imports: ${named(facts.tests)}.`);
  else out.push('Atlas: no test reaches the change through imports.');
  if (facts.namedTests.length > 0) out.push(`Atlas: ${named(facts.namedTests)} ${facts.namedTests.length === 1 ? 'is' : 'are'} named for a changed file, a guess from the name (weak).`);
  for (const entry of facts.runs) out.push(`Atlas: ${entry.door} runs ${entry.file}.`);
  for (const entry of facts.through) out.push(`Atlas: ${entry.door} reaches the change through ${entry.through}.`);
  const passing = [...new Set(facts.passing.map((entry) => entry.item.door))];
  if (passing.length > 0) out.push(`Atlas: ${list(passing)} ${passing.length === 1 ? 'passes' : 'pass'} through the parts of the change.`);
  for (const edge of facts.partEdgesAdded) out.push(`Atlas: ${ctx.shown(edge.from)} now imports ${ctx.shown(edge.to)}${edge.fromTests ? ', from tests only' : ''} (re-read).`);
  for (const edge of facts.partEdgesRemoved) out.push(`Atlas: ${ctx.shown(edge.from)} no longer imports ${ctx.shown(edge.to)} (re-read).`);
  for (const path of facts.unassigned) out.push(`Atlas: ${path} is new and in no part.`);
  for (const entry of facts.writes.added) out.push(`Atlas: ${entry.item.path} now writes ${entry.item.place} (re-read${entry.basis === 'parsed' ? '' : `, ${entry.basis}`}).`);
  for (const entry of facts.writes.removed) out.push(`Atlas: ${entry.item.path} no longer writes ${entry.item.place} (re-read).`);
  for (const entry of facts.reads.added) out.push(`Atlas: ${entry.item.path} now reads ${entry.item.place} (re-read${entry.basis === 'parsed' ? '' : `, ${entry.basis}`}).`);
  for (const entry of facts.reads.removed) out.push(`Atlas: ${entry.item.path} no longer reads ${entry.item.place} (re-read).`);
  if (facts.regenerate.length > 0) out.push(`Atlas: the map must be regenerated before commit, or atlas check fails: ${facts.regenerate.join('; ')}.`);
  else if (facts.alsoStale.length > 0) out.push(`Atlas: atlas check passes on this change as it stands; regenerating the map keeps ${list(facts.alsoStale)} current.`);
  else out.push('Atlas: atlas check passes on this change as it stands.');
  return out;
}
