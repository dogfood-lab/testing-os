import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { structuralChanges } from '../adapter/changes.js';

/**
 * The oracle for "the sidecar invents nothing": every fact in an answer must
 * equal a fact in the committed map (atlas/structure.json, statistics.json,
 * page.json) or in `atlas explain --json`. Each tool's facts are checked
 * against the file that states them; a fact with no source there fails.
 * Test support only, not published.
 */

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));

function under(path, place) {
  return path === place || path.startsWith(`${place}/`);
}

function strip(place) {
  return place.endsWith('/') ? place.slice(0, -1) : place;
}

/** The committed map of a checkout, read as the sidecar reads it. */
export function committedMap(root) {
  const read = (file) => {
    try {
      return JSON.parse(readFileSync(join(root, 'atlas', file), 'utf8'));
    } catch {
      return null;
    }
  };
  const structure = read('structure.json');
  const fileOf = new Map();
  const boundaryOf = new Map();
  for (const boundary of structure.boundaries) {
    for (const file of boundary.files) {
      fileOf.set(file.path, file);
      boundaryOf.set(file.path, boundary.name);
    }
  }
  for (const file of [...(structure.unassigned ?? []), ...(structure.overlaps ?? [])]) fileOf.set(file.path, file);
  return { root, structure, statistics: read('statistics.json') ?? {}, page: read('page.json'), fileOf, boundaryOf };
}

/** `atlas explain <target> --json` in the checkout. */
export function explainJson(root, target) {
  const result = spawnSync(process.execPath, [CLI, 'explain', target, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout);
  return JSON.parse(result.stdout);
}

function landingWith(map, side, by, place) {
  return map.structure.landings.some((landing) => (under(landing.target, strip(place)) || under(strip(place), landing.target))
    && (landing[side] ?? []).some((entry) => entry.by === by));
}

function door(map, name) {
  return map.structure.doors.find((entry) => entry.name === name);
}

function runs(map, name, file) {
  return (door(map, name)?.runs ?? []).some((run) => run.path === file || (run.path.endsWith('/') && file.startsWith(run.path)));
}

function pair(map, a, b) {
  return (map.statistics.pairs ?? []).some((entry) => (entry.a === a && entry.b === b) || (entry.a === b && entry.b === a));
}

function checkExplain(map, answer, explained) {
  for (const group of answer.facts) {
    for (const item of group.items) {
      const where = `${group.fact} [${group.basis}] ${JSON.stringify(item)}`;
      switch (group.fact) {
        case 'part':
          assert.ok(explained.part === item.part || (explained.parts ?? []).some((entry) => entry.part === item.part), where);
          break;
        case 'globs':
        case 'entryPoints':
          assert.ok(explained[group.fact].includes(item), where);
          break;
        case 'door':
          assert.equal(explained.doors.isDoor, item, where);
          break;
        case 'runBy':
        case 'builtBy':
        case 'checkedBy':
        case 'onPath':
          assert.ok(explained.doors[group.fact].includes(item), where);
          break;
        case 'importsFiles':
        case 'reexportsAll':
        case 'importedByFiles':
        case 'ownTests':
        case 'reads':
        case 'writtenByDoors':
          assert.ok(explained[group.fact].includes(item), where);
          break;
        case 'imports':
        case 'importedBy':
          assert.ok([...explained.imports, ...explained.importedBy, ...explained.importedByTests].includes(item), where);
          break;
        case 'writes':
          if (group.basis === 'weak') assert.ok(map.structure.landings.some((landing) => under(landing.target, strip(item)) && landing.writers.some((entry) => entry.confidence === 'weak')), where);
          else assert.ok(explained.writes.some((write) => write.place === item), where);
          break;
        case 'readersOfWrites':
          assert.ok(explained.writes.some((write) => write.place === item.place && write.readers.includes(item.by)), where);
          break;
        case 'writtenBy':
          if (group.basis === 'weak') assert.ok(landingWith(map, 'writers', item.by, item.place), where);
          else assert.ok(explained.writtenBy.some((entry) => entry.by === item.by && entry.place === item.place && entry.relation === item.relation), where);
          break;
        case 'readBy':
          assert.ok(explained.readBy.some((entry) => entry.by === item), where);
          break;
        case 'sequence':
          assert.ok(explained.sequence.steps.some((step) => JSON.stringify(step) === JSON.stringify(item)), where);
          break;
        case 'sequences':
          assert.ok(explained.sequences.includes(item), where);
          break;
        case 'changesWith':
          assert.ok(explained.changesWith.some((entry) => JSON.stringify(entry) === JSON.stringify(item)), where);
          break;
        default:
          assert.fail(`an explain fact with no source to check it against: ${where}`);
      }
    }
  }
}

function checkOverview(map, answer) {
  const page = map.page;
  for (const group of answer.facts) {
    for (const item of group.items) {
      const where = `${group.fact} [${group.basis}] ${JSON.stringify(item)}`;
      switch (group.fact) {
        case 'summary':
          assert.equal(item, page.summary, where);
          break;
        case 'parts':
          assert.equal(map.structure.boundaries.find((boundary) => boundary.name === item.part)?.files.length, item.files, where);
          break;
        case 'doors': {
          const source = page.doors.find((entry) => entry.name === item.name && entry.file === item.file);
          assert.ok(source, where);
          assert.deepEqual(item.triggers, source.triggers ?? [], where);
          assert.deepEqual(item.runs, source.runs ?? [], where);
          assert.deepEqual(item.sends, source.sends ?? [], where);
          break;
        }
        case 'reaches':
          assert.ok(page.doors.some((entry) => entry.name === item.door && (entry.reach ?? []).some((reach) => reach.boundary === item.part && reach.depth === item.depth)), where);
          break;
        case 'doorWrites':
          assert.ok(map.structure.doors.some((entry) => entry.name === item.door && (entry.landings ?? []).includes(strip(item.place))), where);
          break;
        case 'mainDoor':
          assert.equal(page.doors.find((entry) => (entry.id ?? entry.file) === page.mainDoor)?.name, item.name, where);
          break;
        case 'mainFlow':
          assert.ok(page.sequences.some((sequence) => sequence.file === item.file && JSON.stringify(sequence.steps) === JSON.stringify(item.steps)), where);
          break;
        case 'startDoor':
          assert.equal(page.startDoor.split('#')[0], item.file, where);
          break;
        case 'startHere':
          assert.ok(page.startHere.includes(item), where);
          break;
        default:
          assert.fail(`an overview fact with no source to check it against: ${where}`);
      }
    }
  }
}

function checkReach(map, answer) {
  const listed = new Set();
  for (const group of answer.facts) for (const item of group.items) if (item?.path) listed.add(item.path);
  for (const group of answer.facts) {
    for (const item of group.items) {
      const where = `${group.fact} [${group.basis}] ${JSON.stringify(item)}`;
      switch (group.fact) {
        case 'asked':
          assert.equal(map.boundaryOf.get(item.path) ?? null, item.part, where);
          break;
        case 'runs':
          assert.ok(runs(map, item.door, item.file), where);
          break;
        case 'checks':
          assert.ok((door(map, item.door)?.runs ?? []).some((run) => run.runKind === 'checks' && (run.path === item.file || item.file.startsWith(run.path))), where);
          break;
        case 'reachedThrough':
          assert.ok(runs(map, item.door, item.through) && listed.has(item.through), where);
          break;
        case 'passesThrough':
          assert.ok((door(map, item.door)?.reach ?? []).some((entry) => entry.boundary === item.part && entry.depth === item.depth), where);
          break;
        case 'importedBy':
          assert.ok((map.fileOf.get(item.path)?.importsFiles ?? []).includes(item.via), where);
          break;
        case 'readBy':
          assert.ok(landingWith(map, 'readers', item.path, item.place), where);
          assert.ok(map.structure.landings.some((landing) => (under(strip(item.place), landing.target) || under(landing.target, strip(item.place))) && landing.writers.some((entry) => entry.by === item.via)), where);
          break;
        case 'parts':
          assert.ok([...listed].some((path) => map.boundaryOf.get(path) === item), where);
          break;
        case 'partEdges':
          assert.ok(map.structure.edges.some((edge) => edge.from === item.from && edge.to === item.to && edge.kind === item.kind), where);
          break;
        case 'changesWith':
          assert.ok(pair(map, item.file, item.with), where);
          break;
        default:
          assert.fail(`a reach fact with no source to check it against: ${where}`);
      }
    }
  }
}

function checkChanges(map, answer, base) {
  const items = structuralChanges(base, map.structure, { repoPath: map.root });
  for (const group of answer.facts) {
    for (const item of group.items) {
      const where = `${group.fact} [${group.basis}] ${JSON.stringify(item)}`;
      if (group.fact === 'files') continue;
      const sources = items.filter((entry) => entry.kind === group.fact);
      if (group.fact === 'landing') {
        // A landing item split by basis names a subset of one item's subjects.
        assert.ok(sources.some((entry) => entry.subjects[0] === item.subjects[0] && item.subjects.slice(1).every((by) => entry.subjects.includes(by))), where);
      } else {
        assert.ok(sources.some((entry) => entry.sentence === item.sentence), where);
      }
    }
  }
}

/**
 * Asserts that every fact of one tool's answer has its source in the
 * committed map or in explain --json.
 *
 * @param {string} tool
 * @param {object} answer structuredContent.answer
 * @param {object} map from committedMap
 * @param {{ explained?: object, base?: object }} [sources]
 */
export function assertInventsNothing(tool, answer, map, { explained = null, base = null } = {}) {
  if (tool === 'atlas_explain') checkExplain(map, answer, explained);
  else if (tool === 'atlas_overview') checkOverview(map, answer);
  else if (tool === 'atlas_reach') checkReach(map, answer);
  else if (tool === 'atlas_changes') checkChanges(map, answer, base);
  else assert.fail(`no oracle for ${tool}`);
  for (const entry of answer.cannotSee ?? []) {
    if (entry.grain !== 'part' || !entry.part) continue;
    const boundary = map.structure.boundaries.find((item) => item.name === entry.part);
    assert.ok(boundary, JSON.stringify(entry));
    if (entry.basis === 'unresolved' && entry.what === 'import') assert.equal(entry.count, boundary.unresolvedSites, JSON.stringify(entry));
    if (entry.basis === 'unresolved' && entry.what === 'write') assert.equal(entry.count, boundary.dynamicWrites, JSON.stringify(entry));
    if (entry.basis === 'unresolved' && entry.what === 'read') assert.equal(entry.count, boundary.dynamicReads, JSON.stringify(entry));
    if (entry.basis === 'unresolved' && entry.what === 'command') assert.equal(entry.count, boundary.dynamicSpawns, JSON.stringify(entry));
  }
}
