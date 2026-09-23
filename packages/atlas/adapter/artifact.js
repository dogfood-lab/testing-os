import { isOwnTest, isTestFile, isTestMaterial, testedStem } from '../core/landings.js';
import { roleFor } from './templates.js';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byPath = (a, b) => cmp(a.path, b.path);

// The artifact describes the tree minus atlas/. Every list below, and every
// count, is over that set. The directory cannot record a stable hash of
// itself, and a count that includes it changes on the commit that lands it.
function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

function keep(items) {
  return items.filter((item) => !inAtlas(item.path));
}

// A site read as a declared dependency because a local module shares its name
// resolved, but to nothing this map can open, so it is counted apart: the
// page says how many imports name dependencies that are not installed here.
// A site that names a path outside the repository is counted apart as well,
// since what it loads is on one machine's disk and the map never looks.
function siteCounts(files) {
  let unresolved = 0;
  let resolved = 0;
  let externals = 0;
  let outside = 0;
  const externalNames = new Set();
  for (const file of files) {
    if (!Array.isArray(file.imports)) continue;
    for (const site of file.imports) {
      const outcome = site.resolved?.outcome;
      if (outcome === 'file' || outcome === 'boundary' || outcome === 'external') resolved += 1;
      else unresolved += 1;
      if (site.resolved?.declared) {
        externals += 1;
        externalNames.add(site.specifier.split('.')[0]);
      }
      if (site.resolved?.outside) outside += 1;
    }
  }
  return { unresolved, resolved, externals, externalNames: [...externalNames].sort(), outside };
}

// Reads and writes whose path is built at run time name no place, so the map
// can only count them, and so do those that go to the directory the code is
// run in or to the home directory, which are the caller's places. Test material is left out for the reason landings leave
// it out: what it names is a temporary copy, not the repository.
//
// A command handed to a child process whose program or arguments are built at
// run time is not followed either. Tests are counted here: a test that runs a
// script it builds the command for is how a part goes untested unseen. How
// many of them are in tests is counted apart, since a suite spawning the
// command it tests is most of them in a repository with a CLI.
function dynamicCounts(files) {
  let reads = 0;
  let writes = 0;
  let spawns = 0;
  let spawnsInTests = 0;
  let outsideReads = 0;
  let outsideWrites = 0;
  for (const file of files) {
    spawns += file.dynamicSpawns ?? 0;
    if (isTestFile(file.path)) spawnsInTests += file.dynamicSpawns ?? 0;
    if (isTestMaterial(file.path)) continue;
    reads += file.dynamicReads ?? 0;
    writes += file.dynamicWrites ?? 0;
    outsideReads += file.outsideReads ?? 0;
    outsideWrites += file.outsideWrites ?? 0;
  }
  return { outsideReads, outsideWrites, reads, spawns, spawnsInTests, writes };
}

function resolvedFiles(file) {
  if (!Array.isArray(file.imports)) return { files: [], boundaries: [] };
  const files = [];
  const boundaries = [];
  for (const site of file.imports) {
    if (site.resolved?.outcome === 'file') files.push(site.resolved.path);
    else if (site.resolved?.outcome === 'boundary') boundaries.push(site.resolved.boundary);
  }
  return { files, boundaries };
}

/**
 * How many test files reach each part: a test file, by name, that imports a
 * file of the part, or imports a file that imports one, or is the own test of
 * a file of the part (tests/test_trainer.py for backpropagate/trainer.py),
 * which is what a test named for a file tests even when its import could not
 * be resolved. A test that runs a file as a child process, with the command
 * written out in full (spawnSync('node', ['scripts/gate.mjs'])), reaches it as
 * surely as one that imports it (the core records those as spawns), and the
 * file's imports are followed the same one hop. This is counted here, where
 * the resolved imports are still in hand. A test file reached is not the
 * part's code under test, so it counts only as the hop, not as the part.
 */
function testReach(mapped) {
  const all = [...mapped.boundaries.flatMap((boundary) => boundary.files), ...mapped.unassigned, ...mapped.overlaps]
    .filter((file) => !inAtlas(file.path));
  const byPath = new Map(all.map((file) => [file.path, file]));
  const boundaryOf = new Map();
  for (const boundary of mapped.boundaries) for (const file of boundary.files) boundaryOf.set(file.path, boundary.name);
  const tests = all.filter((file) => isTestFile(file.path));
  const byStem = new Map();
  for (const file of all) {
    if (isTestFile(file.path) || !boundaryOf.has(file.path)) continue;
    const base = file.path.slice(file.path.lastIndexOf('/') + 1);
    const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(file.path);
  }
  const testedBy = new Map();
  for (const test of tests) {
    const direct = resolvedFiles(test);
    direct.files.push(...(test.spawns ?? []));
    const parts = new Set(direct.boundaries);
    const reached = new Set(direct.files);
    for (const path of direct.files) {
      const hop = byPath.get(path);
      if (!hop) continue;
      const next = resolvedFiles(hop);
      for (const target of next.files) reached.add(target);
      for (const boundary of next.boundaries) parts.add(boundary);
    }
    for (const path of reached) {
      if (path !== test.path && !isTestFile(path) && boundaryOf.has(path)) parts.add(boundaryOf.get(path));
    }
    for (const path of byStem.get(testedStem(test.path)) ?? []) if (isOwnTest(test.path, path)) parts.add(boundaryOf.get(path));
    for (const part of parts) testedBy.set(part, (testedBy.get(part) ?? 0) + 1);
  }
  return { testFiles: tests.length, testedBy };
}

// A boundary file may leave a role out; the role is then derived from the
// files, the same way init derives the one it writes.
export function buildArtifact(mapped, commit) {
  const tested = testReach(mapped);
  const boundaries = mapped.boundaries.map((boundary) => {
    const files = keep(boundary.files);
    const sites = siteCounts(files);
    const dynamic = dynamicCounts(files);
    const named = sites.externals > 0 ? { externalNames: sites.externalNames } : {};
    const outside = {
      ...(sites.outside > 0 ? { outsideImports: sites.outside } : {}),
      ...(dynamic.outsideReads > 0 ? { outsideReads: dynamic.outsideReads } : {}),
      ...(dynamic.outsideWrites > 0 ? { outsideWrites: dynamic.outsideWrites } : {}),
    };
    return {
      ...named,
      ...outside,
      dynamicReads: dynamic.reads,
      dynamicSpawns: dynamic.spawns,
      dynamicSpawnsInTests: dynamic.spawnsInTests,
      dynamicWrites: dynamic.writes,
      entryPoints: [...boundary.entryPoints].filter((path) => !inAtlas(path)).sort(),
      externals: sites.externals,
      files: files.map(carryFile).sort(byPath),
      globs: [...boundary.globs].sort(),
      importConfidence: sites.unresolved > sites.resolved ? 'low' : 'full',
      name: boundary.name,
      origin: boundary.origin,
      role: boundary.role ?? roleFor(files.map((file) => file.path), { manifest: boundary.holdsManifest === true }),
      testedBy: tested.testedBy.get(boundary.name) ?? 0,
      unresolvedSites: sites.unresolved,
    };
  });
  const overlaps = keep(mapped.overlaps)
    .map((overlap) => ({ ...carryFile(overlap), boundaries: [...overlap.boundaries].sort() }))
    .sort(byPath);
  const unassigned = keep(mapped.unassigned).map(carryFile).sort(byPath);
  const tracked = boundaries.reduce((sum, boundary) => sum + boundary.files.length, 0) + overlaps.length + unassigned.length;
  return {
    boundaries,
    // One manifest can declare several commands, so a door sorts by its file
    // and then its name.
    doors: (mapped.doors ?? []).map(carryDoor).sort((a, b) => cmp(a.file, b.file) || cmp(a.name, b.name) || cmp(a.kind ?? '', b.kind ?? '')),
    edges: mapped.edges.map((edge) => ({ from: edge.from, kind: edge.kind, to: edge.to, ...(edge.fromTests ? { fromTests: true } : {}) })),
    generatedFrom: { commit, tracked },
    landings: carryLandings(mapped.landings ?? []),
    overlaps,
    submodules: [...mapped.submodules].sort(),
    symlinks: mapped.symlinks.filter((link) => !inAtlas(link.path)).map((link) => ({ path: link.path, target: link.target })).sort(byPath),
    testFiles: tested.testFiles,
    unassigned,
  };
}

// The order of work is carried only where the core recorded it: the files a
// door runs and the files they call into. Exported names are carried for
// every file that has one, and so are the files a file imports, so a reader
// of one file can be told what it imports and what imports it.
function carryFile(file) {
  const out = { hash: file.hash, path: file.path };
  if (file.exports) out.exports = [...file.exports];
  // A file the parser could not read has no imports to list, which is not
  // the same as importing nothing; it is marked so a reader is not told so,
  // with the construct the parser stopped on when it is one of the known ones.
  if (file.parseError) out.parseError = true;
  if (file.parseError && file.unreadSyntax) out.unreadSyntax = file.unreadSyntax;
  const imported = importTargets(file);
  if (imported.files.length > 0) out.importsFiles = imported.files;
  if (imported.all.length > 0) out.reexportsAll = imported.all;
  if (file.sequences) out.sequences = file.sequences.map(carrySequence);
  if (file.entry != null) {
    out.entry = file.entry;
    out.entryRule = file.entryRule;
  }
  return out;
}

/**
 * The places a file's resolved imports land on, deduplicated and sorted: a
 * tracked file by its path, and a build chunk whose sources share a part as
 * @part, since no one file is what it imports. The files it re-exports whole
 * (export * from) are listed apart as well.
 */
function importTargets(file) {
  const files = new Set();
  const all = new Set();
  if (!Array.isArray(file.imports)) return { files: [], all: [] };
  for (const site of file.imports) {
    const resolved = site.resolved;
    let target = null;
    if (resolved?.outcome === 'file') target = resolved.path;
    else if (resolved?.outcome === 'boundary') target = `@${resolved.boundary}`;
    if (target == null || target === file.path || inAtlas(target)) continue;
    files.add(target);
    if (site.reexportsAll) all.add(target);
  }
  return { files: [...files].sort(), all: [...all].sort() };
}

function carrySequence(sequence) {
  const out = {
    calls: sequence.calls.map(carryCall),
    exported: sequence.exported,
    invokedAtTopLevel: sequence.invokedAtTopLevel,
    isDefaultExport: sequence.isDefaultExport,
    name: sequence.name,
  };
  if (sequence.truncated) out.truncated = true;
  return out;
}

function carryCall(call) {
  const out = { line: call.line, name: call.name, target: call.target == null ? null : { ...call.target } };
  if (call.passed) out.passed = true;
  if (call.receiver != null) out.receiver = call.receiver;
  if (call.via != null) out.via = call.via;
  if (call.inner) out.inner = call.inner.map(carryCall);
  if (call.innerTruncated) out.innerTruncated = true;
  return out;
}

// A landing on atlas/ is the map describing itself, and a reader or writer in
// atlas/ is the map's own files; both are left out for the reason the file
// lists leave atlas/ out.
function carryLandings(landings) {
  return landings
    .filter((landing) => !inAtlas(landing.target))
    .map((landing) => ({
      readers: landing.readers.filter((entry) => !inAtlas(entry.by)).map(carryReader),
      ...(landing.spans ? { spans: landing.spans } : {}),
      target: landing.target,
      ...(landing.tracked === false ? { tracked: false } : {}),
      writers: landing.writers.filter((entry) => !inAtlas(entry.by)).map(carryWriter),
    }))
    .filter((landing) => landing.readers.length > 0 || landing.writers.length > 0);
}

function carryWriter(entry) {
  const out = { by: entry.by };
  if (entry.confidence != null) out.confidence = entry.confidence;
  if (entry.stamps) out.stamps = true;
  if (entry.unless) out.unless = [...entry.unless];
  return out;
}

function carryReader(entry) {
  const out = { by: entry.by };
  for (const field of ['call', 'confidence', 'ref', 'repo', 'target']) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

// A run always says whether the door runs the file or only checks it; it
// carries directory, matched and via only when they say something.
function carryRun(run) {
  const out = { job: run.job, path: run.path, runKind: run.runKind ?? 'executes' };
  if (run.directory) out.directory = true;
  if (run.matched) out.matched = true;
  if (run.via) out.via = run.via;
  return out;
}

// Every list a door carries arrives sorted from the core, except commands,
// whose order is the workflow's own. Copying field by field keeps the
// artifact's shape the one written here rather than whatever the core adds.
// A workflow carries no kind, so an artifact written before commands were
// doors reads the same.
function carryDoor(door) {
  if (door.parseError) return { file: door.file, name: door.name, parseError: true };
  return {
    ...(door.kind ? { kind: door.kind } : {}),
    commands: door.commands.map((command) => ({ job: command.job, step: command.step, text: command.text })),
    elsewhere: (door.elsewhere ?? []).map((entry) => ({ clone: entry.clone, dir: entry.dir, pushes: entry.pushes, stages: [...entry.stages] })),
    file: door.file,
    landings: door.landings.filter((target) => !inAtlas(target)),
    mentions: door.mentions.map((mention) => ({ job: mention.job, path: mention.path })),
    name: door.name,
    permissions: [...door.permissions],
    pushes: door.pushes,
    reach: door.reach.map(carryReach),
    readers: door.readers.filter((entry) => !inAtlas(entry.target) && !inAtlas(entry.by)).map(carryReader),
    runs: door.runs.map(carryRun),
    runsCount: door.runsCount,
    checksCount: door.checksCount ?? 0,
    secrets: [...door.secrets],
    sends: {
      deploysPages: door.sends.deploysPages,
      dispatchesTo: [...door.sends.dispatchesTo],
      opensIssues: door.sends.opensIssues,
      opensIssuesOnFailure: door.sends.opensIssuesOnFailure,
      opensPullRequests: door.sends.opensPullRequests,
      publishes: door.sends.publishes,
      publishesTo: [...door.sends.publishesTo],
      releases: door.sends.releases,
    },
    stages: [...door.stages],
    triggers: door.triggers.map((trigger) => ({ ...trigger })),
    uses: [...door.uses],
    usesWorkflowToken: door.usesWorkflowToken,
  };
}

function carryReach(entry) {
  const out = { boundary: entry.boundary, depth: entry.depth, files: entry.files };
  if (entry.enters) out.enters = { file: entry.enters.file, from: entry.enters.from };
  return out;
}

export function serializeArtifact(artifact) {
  return `${JSON.stringify(sortKeys(artifact), null, 2)}\n`;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}
