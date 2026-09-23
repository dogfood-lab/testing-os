import { isTestMaterial } from '../core/landings.js';
import { roleFor } from './templates.js';

const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// The artifact describes the tree minus atlas/. Every list below, and every
// count, is over that set. The directory cannot record a stable hash of
// itself, and a count that includes it changes on the commit that lands it.
function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

function keep(items) {
  return items.filter((item) => !inAtlas(item.path));
}

function siteCounts(files) {
  let unresolved = 0;
  let resolved = 0;
  for (const file of files) {
    if (!Array.isArray(file.imports)) continue;
    for (const site of file.imports) {
      const outcome = site.resolved?.outcome;
      if (outcome === 'file' || outcome === 'boundary' || outcome === 'external') resolved += 1;
      else unresolved += 1;
    }
  }
  return { unresolved, resolved };
}

// Reads and writes whose path is built at run time name no place, so the map
// can only count them. Test material is left out for the reason landings leave
// it out: what it names is a temporary copy, not the repository.
function dynamicCounts(files) {
  let reads = 0;
  let writes = 0;
  for (const file of files) {
    if (isTestMaterial(file.path)) continue;
    reads += file.dynamicReads ?? 0;
    writes += file.dynamicWrites ?? 0;
  }
  return { reads, writes };
}

// A boundary file may leave a role out; the role is then derived from the
// files, the same way init derives the one it writes.
export function buildArtifact(mapped, commit) {
  const boundaries = mapped.boundaries.map((boundary) => {
    const files = keep(boundary.files);
    const sites = siteCounts(files);
    const dynamic = dynamicCounts(files);
    return {
      dynamicReads: dynamic.reads,
      dynamicWrites: dynamic.writes,
      entryPoints: [...boundary.entryPoints].filter((path) => !inAtlas(path)).sort(),
      files: files.map((file) => ({ hash: file.hash, path: file.path })).sort(byPath),
      globs: [...boundary.globs].sort(),
      importConfidence: sites.unresolved > sites.resolved ? 'low' : 'full',
      name: boundary.name,
      origin: boundary.origin,
      role: boundary.role ?? roleFor(files.map((file) => file.path)),
      unresolvedSites: sites.unresolved,
    };
  });
  const overlaps = keep(mapped.overlaps)
    .map((overlap) => ({
      boundaries: [...overlap.boundaries].sort(),
      hash: overlap.hash,
      path: overlap.path,
    }))
    .sort(byPath);
  const unassigned = keep(mapped.unassigned).map((file) => ({ hash: file.hash, path: file.path })).sort(byPath);
  const tracked = boundaries.reduce((sum, boundary) => sum + boundary.files.length, 0) + overlaps.length + unassigned.length;
  return {
    boundaries,
    doors: (mapped.doors ?? []).map(carryDoor).sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
    edges: mapped.edges.map((edge) => ({ from: edge.from, kind: edge.kind, to: edge.to })),
    generatedFrom: { commit, tracked },
    landings: carryLandings(mapped.landings ?? []),
    overlaps,
    submodules: [...mapped.submodules].sort(),
    symlinks: mapped.symlinks.filter((link) => !inAtlas(link.path)).map((link) => ({ path: link.path, target: link.target })).sort(byPath),
    unassigned,
  };
}

// A landing on atlas/ is the map describing itself, and a reader or writer in
// atlas/ is the map's own files; both are left out for the reason the file
// lists leave atlas/ out.
function carryLandings(landings) {
  return landings
    .filter((landing) => !inAtlas(landing.target))
    .map((landing) => ({
      readers: landing.readers.filter((entry) => !inAtlas(entry.by)).map(carryReader),
      target: landing.target,
      writers: landing.writers.filter((entry) => !inAtlas(entry.by)).map((entry) => ({ by: entry.by })),
    }))
    .filter((landing) => landing.readers.length > 0 || landing.writers.length > 0);
}

function carryReader(entry) {
  const out = { by: entry.by };
  for (const field of ['call', 'confidence', 'ref', 'repo', 'target']) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

// Every list a door carries arrives sorted from the core, except commands,
// whose order is the workflow's own. Copying field by field keeps the
// artifact's shape the one written here rather than whatever the core adds.
function carryDoor(door) {
  if (door.parseError) return { file: door.file, name: door.name, parseError: true };
  return {
    commands: door.commands.map((command) => ({ job: command.job, step: command.step, text: command.text })),
    file: door.file,
    landings: door.landings.filter((target) => !inAtlas(target)),
    mentions: door.mentions.map((mention) => ({ job: mention.job, path: mention.path })),
    name: door.name,
    permissions: [...door.permissions],
    pushes: door.pushes,
    reach: door.reach.map((entry) => ({ boundary: entry.boundary, depth: entry.depth, files: entry.files })),
    readers: door.readers.filter((entry) => !inAtlas(entry.target) && !inAtlas(entry.by)).map(carryReader),
    runs: door.runs.map((run) => ({ job: run.job, path: run.path })),
    secrets: [...door.secrets],
    sends: {
      deploysPages: door.sends.deploysPages,
      dispatchesTo: [...door.sends.dispatchesTo],
      publishes: door.sends.publishes,
      releases: door.sends.releases,
    },
    stages: [...door.stages],
    triggers: door.triggers.map((trigger) => ({ ...trigger })),
    uses: [...door.uses],
    usesWorkflowToken: door.usesWorkflowToken,
  };
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
