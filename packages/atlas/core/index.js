import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import { Language, Parser } from 'web-tree-sitter';
import { readCommands, repositoryView } from './commands.js';
import { mapCommandDoors, mapDoors, markUnpublished } from './doors.js';
import { httpEdges, httpFacts } from './http.js';
import { declaredEntries, deriveEntryPoints, manifestCommands, memberCommands, memberPackage, pythonScripts } from './entry-points.js';
import { buildCalls } from './bundles.js';
import { astLandings, attachLandings, githubChanges, isTestFile, isTestMaterial, noLandings, pathShape, pythonPathValues, scriptPath, settleHelperPaths, settleParamPaths, textLandings, trackedPlaces } from './landings.js';
import { languageOf, SCRIPT_LANGUAGES } from './languages.js';
import { walkReach } from './reach.js';
import { attachResolution, emittedFiles, registerBuilds, resolveDeclaredPath } from './resolve.js';
import { attachSequences, sequenceFacts } from './sequence.js';
import { settleSpawnHelpers, spawnedCommands } from './spawned.js';
import { storedBytes, textAttributes } from './text.js';
import { rustCalls, rustImports, rustPaths, rustSequence, settleRustPaths } from './rust.js';
import { cargoProject, owningCrate } from './cargo.js';
import { unseenParts } from './unseen.js';
import { godotResourceReadings, gdscriptReadings, settleGodotPaths } from './gdscript.js';

const GODOT_TEXT = /\.(?:tscn|tres)$/;

const GRAMMAR_DIR = fileURLToPath(new URL('../grammars/', import.meta.url));

const GRAMMAR_FILE = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  python: 'tree-sitter-python.wasm',
  rust: 'tree-sitter-rust.wasm',
  gdscript: 'tree-sitter-gdscript.wasm',
};

// Grammars load when this module evaluates, once per process, and every
// mapRepository call reuses them. That is one load per language rather than
// one load per file; a second call in the same process does not load again.
const runtimeWasm = fileURLToPath(import.meta.resolve('web-tree-sitter/web-tree-sitter.wasm'));
await Parser.init({ locateFile: () => runtimeWasm });
const languages = {};
for (const [name, file] of Object.entries(GRAMMAR_FILE)) {
  languages[name] = await Language.load(readFileSync(join(GRAMMAR_DIR, file)));
}
const parser = new Parser();

/**
 * Map tracked files onto named boundaries.
 *
 * Overlaps are reported and left out of every boundary's file list.
 * Ambiguous ownership is a fact for the human; this function does not pick a winner.
 *
 * @param {{ repoPath: string, boundaries: Array<{ name: string, globs?: string[], status?: string, role?: string }> }} input
 */
export function mapRepository({ repoPath, boundaries } = {}) {
  if (typeof repoPath !== 'string' || repoPath.length === 0) {
    throw new Error('repoPath is required');
  }
  if (!Array.isArray(boundaries)) {
    throw new Error('boundaries must be an array');
  }
  // Resolution compares absolute paths against the repository root, so a
  // relative root ('.') would leave every relative import unresolved.
  repoPath = resolve(repoPath);

  const ordered = boundaries.map(validateBoundary);
  const seen = new Set();
  for (const boundary of ordered) {
    if (seen.has(boundary.name)) {
      throw new Error(`duplicate boundary name: ${boundary.name}`);
    }
    seen.add(boundary.name);
  }
  ordered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const tracked = listTracked(repoPath);
  const places = trackedPlaces(tracked.regular);
  const attributes = textAttributes(repoPath, tracked.regular);
  const matchers = ordered.map((boundary) => ({
    name: boundary.name,
    isMatch: picomatch(boundary.globs, { dot: true }),
  }));

  /** @type {Map<string, { name: string, status: string | undefined, role: string | undefined, globs: string[], files: object[], unresolvedSites: number, parseErrors: number }>} */
  const byName = new Map(
    ordered.map((boundary) => [
      boundary.name,
      {
        name: boundary.name,
        status: boundary.status,
        role: boundary.role,
        globs: boundary.globs,
        files: [],
        unresolvedSites: 0,
        parseErrors: 0,
      },
    ])
  );
  const unassigned = [];
  const overlaps = [];

  // The order of work in a file is read while its tree is alive and finished
  // once imports resolve, so the first reading waits here, keyed by path.
  const facts = new Map();
  const spawned = new Map();
  const builds = new Map();
  for (const path of tracked.regular) {
    const file = describeFile(repoPath, path, places, facts, spawned, attributes.get(path), builds);
    const hits = [];
    for (const matcher of matchers) {
      if (matcher.isMatch(path)) hits.push(matcher.name);
    }
    if (hits.length === 0) unassigned.push(file);
    else if (hits.length === 1) byName.get(hits[0]).files.push(file);
    else overlaps.push({ ...file, boundaries: hits });
  }

  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const trackedSet = new Set(tracked.regular);
  // A bin a bundler writes is traced to its entry before tsconfig is read,
  // and the esbuild calls that say so are read only while each tree lives.
  registerBuilds(repoPath, builds, new Map([...byName.values()].flatMap((boundary) => boundary.files).concat(unassigned, overlaps)
    .filter((file) => builds.size > 0 && Array.isArray(file.imports))
    .map((file) => [file.path, file.imports.map((site) => site.specifier)])));
  const boundaryList = [...byName.values()];
  const scripts = pythonScripts(repoPath, trackedSet);
  const commands = manifestCommands(repoPath, trackedSet, scripts);
  const manifests = repositoryManifests(repoPath, trackedSet);
  const crates = declaredEntries(repoPath, trackedSet);
  for (const boundary of boundaryList) {
    boundary.files.sort(byPath);
    boundary.holdsManifest = boundary.files.some((file) => manifests.includes(file.path));
    boundary.parseErrors = boundary.files.filter((file) => file.parseError).length;
    // A Cargo example is a door of its own, never its part's way in.
    boundary.entryPoints = deriveEntryPoints({ repoPath, globs: boundary.globs, tracked: trackedSet, scripts, commands: commands.filter((command) => !command.example), crates });
  }
  unassigned.sort(byPath);
  overlaps.sort(byPath);
  tracked.symlinks.sort(byPath);
  tracked.submodules.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const resolution = attachResolution({
    repoPath,
    boundaries: boundaryList,
    unassigned,
    overlaps,
    tracked: tracked.regular,
  });
  const project = cargoProject(repoPath, trackedSet);
  // A crate's build script is run by every build of the crate; the page says
  // what a writer that is one is.
  const buildScripts = new Set(project.crates.map((crate) => crate.build).filter(Boolean));
  for (const file of [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps]) if (buildScripts.has(file.path)) file.buildScript = true;
  settleRustPaths({ files: [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps], places, crateDirOf: (path) => owningCrate(project, path)?.dir ?? null, isTest: isTestMaterial });
  for (const file of [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps]) {
    delete file.rustBound;
    delete file.rustNames;
  }
  settleGodotPaths({ repoPath, tracked: trackedSet, files: [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps], places });
  settleHelperPaths([...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps]);
  settleParamPaths([...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps], places);
  settleSpawnHelpers([...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps], spawned);

  const builtFrom = (path) => (trackedSet.has(path) ? null : resolveDeclaredPath(repoPath, path, trackedSet));
  const emitted = () => emittedFiles(repoPath, trackedSet);
  const unitTests = new Set([...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps].filter((file) => file.testsInside).map((file) => file.path));
  // What a runner finds at run time and runs, by the runner (gdscript.js).
  const discovered = new Map([...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps].filter((file) => file.discovers).map((file) => [file.path, file.discovers]));
  for (const file of [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps]) delete file.discovers;
  const doors = settleInstalled([
    ...mapDoors({ repoPath, tracked: trackedSet, spawned, commands, builtFrom, emitted, unitTests, discovered }),
    ...mapCommandDoors({ repoPath, tracked: trackedSet, spawned, commands, builtFrom, emitted, unitTests, discovered }),
  ], [...boundaryList.flatMap((boundary) => boundary.files), ...unassigned, ...overlaps], repoPath, trackedSet);
  // A workspace member a workflow publishes by name is a package people
  // import, with a door of its own, as the root package is; being named by
  // a publish, it is published.
  const members = publishedMembers(doors).map((dir) => memberPackage(repoPath, dir, trackedSet))
    .filter((entry) => entry != null && !doors.some((door) => door.kind === 'package' && door.file === entry.manifest));
  // The commands of a manifest no workspace names are doors when a workflow
  // publishes it or works in its directory: examples/<tool>/package.json a
  // dispatch publishes, a package a CI matrix tests in src/<project>.
  const installed = new Set(doors.filter((door) => door.kind === 'command').map((door) => door.file));
  const binDirs = [...new Set([...publishedMembers(doors), ...doors.flatMap((door) => door.workedIn ?? [])])].sort()
    .filter((dir) => !installed.has(`${dir}/package.json`));
  for (const door of doors) delete door.workedIn;
  members.push(...binDirs.flatMap((dir) => memberCommands(repoPath, dir, trackedSet)));
  const memberDoors = members.length > 0 ? mapCommandDoors({ repoPath, tracked: trackedSet, spawned, commands: members, builtFrom, emitted, unitTests, discovered }) : [];
  markUnpublished(doors, rootManifest(repoPath, trackedSet));
  markPrivateCommands(doors, rootManifest(repoPath, trackedSet));
  // A private manifest's command is installed by no one.
  for (const door of memberDoors) {
    if (door.kind !== 'command' || !members.some((entry) => entry.kind === 'command' && entry.privateMember && entry.manifest === door.file && entry.name === door.name)) continue;
    door.unshipped = true;
    door.privatePackage = true;
  }
  doors.push(...memberDoors);
  markUnshipped(doors, cargoProject(repoPath, trackedSet));
  const graph = importGraph(boundaryList, unassigned, overlaps);
  attachTestSpawns(graph.files, spawned, repositoryView({ repoPath, tracked: trackedSet, spawned, builtFrom, emitted }));
  const edges = [...resolution.edges, ...spawnEdges(graph), ...httpEdges(graph.files, graph.boundaryOf, isTestMaterial)]
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
  for (const file of graph.files.values()) delete file.http;
  for (const door of doors) {
    if (door.parseError) continue;
    // A checker reaches the code it reads, so the reach is walked from every
    // run; what the door writes is read only from the files it runs.
    const walked = walkReach(door.runs.map((run) => run.path), graph);
    door.reach = walked.reach;
    // A binary a door builds to ship runs nowhere here, so what it writes is
    // not the door's.
    const ran = walkReach(door.runs.filter((run) => run.runKind !== 'checks' && !run.built).map((run) => run.path), graph);
    door.reachFiles = ran.files;
    // The files each gate's runs reach, so a place only gated work writes
    // is said under that gate (landings.js).
    door.reachByGate = gateReach(door, graph);
    // A package is imported, never run as a program.
    door.executed = door.kind === 'package' ? [] : ran.executed;
    // A file the door runs that changes other repositories through the API
    // sends out of this one, as a dispatch does. A test that imports that
    // file runs it against its own stand-ins, and a package only loaded
    // calls nothing, so neither is the door's reach for this.
    if (door.kind !== 'package') {
      const runs = door.runs.filter((run) => run.runKind !== 'checks' && !run.built && !isTestFile(run.path)).map((run) => run.path);
      const walkedRuns = walkReach(runs, graph).files;
      if (walkedRuns.some((path) => (graph.files.get(path)?.githubChanges ?? 0) > 0)) door.sends.changesRepositories = true;
      // git and gh the code it runs starts, which change no part here.
      const programs = [...new Set(walkedRuns.flatMap((path) => graph.files.get(path)?.programs ?? []))].sort();
      if (programs.length > 0) door.programs = programs;
    }
  }
  for (const file of graph.files.values()) delete file.programs;
  const landings = attachLandings({ files: [...graph.files.values()], doors, boundaries: boundaryList, places });
  // The flags a run passes matter only to which of a writer's guarded writes
  // the door is credited with, which attachLandings has now decided.
  for (const door of doors) {
    delete door.reachFiles;
    delete door.reachByGate;
    delete door.executed;
    for (const run of door.runs ?? []) delete run.passes;
  }
  const entryPoints = new Map(boundaryList.map((boundary) => [boundary.name, [...boundary.entryPoints].sort()]));
  // A console script names the function it calls, which is that file's entry
  // before any rule read from the file itself.
  const entryFunctions = new Map();
  for (const script of scripts) if (script.fn && !entryFunctions.has(script.path)) entryFunctions.set(script.path, script.fn);
  attachSequences({ files: graph.files, facts, doors, entryPoints, entryFunctions });
  attachExports(graph.files, facts);
  const unseenView = repositoryView({ repoPath, tracked: trackedSet });
  const unseen = unseenParts(trackedSet, doors, (path) => unseenView.text(path));

  return {
    generatedFrom: { repoPath, tracked: tracked.regular.length },
    boundaries: boundaryList,
    unassigned,
    overlaps,
    symlinks: tracked.symlinks,
    submodules: tracked.submodules,
    edges,
    importConfidence: resolution.importConfidence,
    doors,
    landings,
    ...(unseen.length > 0 ? { unseen } : {}),
  };
}

// The files the runs held to each gate reach, one entry per gate, the
// ungated runs under a null gate.
function gateReach(door, graph) {
  const groups = new Map();
  for (const run of door.runs ?? []) {
    if (run.runKind === 'checks' || run.built) continue;
    const key = run.when ? JSON.stringify(sortedKeys(run.when)) : '';
    if (!groups.has(key)) groups.set(key, { when: run.when ?? null, paths: [] });
    groups.get(key).paths.push(run.path);
  }
  return [...groups.values()].map((group) => ({ when: group.when, files: walkReach(group.paths, graph).files }));
}

function sortedKeys(value) {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]));
  return value;
}

// The workspace members, by directory, a workflow's npm publish names.
function publishedMembers(doors) {
  const dirs = new Set();
  for (const door of doors) {
    if (door.kind || door.parseError) continue;
    const entries = [...(door.sends?.packages?.values?.() ?? door.sends?.packages ?? [])];
    for (const key of (door.gated ?? []).flatMap((entry) => entry.sends ?? [])) if (typeof key === 'string' && key.startsWith('packages:')) entries.push(JSON.parse(key.slice('packages:'.length)));
    for (const entry of entries) if (entry?.dir && entry.dir !== '' && entry.registry === 'npm') dirs.add(entry.dir);
  }
  return [...dirs].sort();
}

/**
 * Mark a crate's binary unshipped when nothing here ships it: no workflow
 * builds or installs it (cargo build, cargo install, the Tauri CLI's build,
 * a release that uploads it) and no cargo publish sends its crate. It is
 * still a door, as a package no door publishes is, and the page says it is
 * built from its crate and that nothing ships it. Drops what the doors
 * carried for this. Mutates the doors.
 *
 * @param {object[]} doors every door of the map
 * @param {{ crates: object[], workspaces: object[] }} project
 */
function markUnshipped(doors, project) {
  const workflows = doors.filter((door) => !door.kind && !door.parseError);
  const built = new Set(workflows.flatMap((door) => (door.runs ?? []).filter((run) => run.builds || run.built).map((run) => run.path)));
  const published = new Set();
  for (const entry of workflows.flatMap((door) => door.publishedCrates ?? [])) {
    if (entry.name != null) {
      for (const crate of project.crates) if (crate.name === entry.name) published.add(crate.manifest);
      continue;
    }
    // The manifest cargo finds from where it runs; a virtual workspace's
    // root publishes its members.
    for (let at = entry.dir; ; at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') {
      const manifest = at ? `${at}/Cargo.toml` : 'Cargo.toml';
      const crate = project.crates.find((item) => item.manifest === manifest);
      const workspace = project.workspaces.find((item) => item.manifest === manifest);
      if (crate) published.add(crate.manifest);
      else if (workspace) for (const member of workspace.members) published.add(member);
      if (crate || workspace || at === '') break;
    }
  }
  for (const door of doors) {
    delete door.publishedCrates;
    for (const run of door.runs ?? []) delete run.builds;
    // An example is run from a checkout, which is how it reaches people.
    if (door.kind !== 'command' || door.example || posix.basename(door.file) !== 'Cargo.toml') continue;
    if (published.has(door.file) || (door.runs ?? []).some((run) => built.has(run.path))) continue;
    door.unshipped = true;
  }
}

/**
 * A command the root package.json declares, when the package is private: npm
 * publishes no private package, so no one installs the command from here,
 * and the page says nothing ships it, as it says of a crate's binary. A
 * private workspace member's command is settled by settleInstalled.
 * Mutates the doors.
 */
function markPrivateCommands(doors, manifest) {
  if (manifest?.private !== true) return;
  for (const door of doors) {
    if (door.kind !== 'command' || door.file !== 'package.json' || door.bundledInto?.length > 0) continue;
    door.unshipped = true;
    door.privatePackage = true;
  }
}

function rootManifest(repoPath, tracked) {
  if (!tracked.has('package.json')) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf8'));
    return pkg != null && typeof pkg === 'object' && !Array.isArray(pkg) ? pkg : null;
  } catch {
    return null;
  }
}

/**
 * The manifests at the top of the tree that name and configure the project as
 * a whole: a package.json with a name, pyproject.toml, Cargo.toml, go.mod or
 * a Godot project.godot.
 * A package.json with no name is a workspace shell or a tool's settings, not a
 * project's manifest. A manifest further down belongs to one package of the
 * repository, such as a docs site, and says nothing about the part it is in.
 */
function repositoryManifests(repoPath, tracked) {
  const found = ['pyproject.toml', 'Cargo.toml', 'go.mod', 'project.godot'].filter((path) => tracked.has(path));
  if (tracked.has('package.json')) {
    try {
      const pkg = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf8'));
      if (typeof pkg?.name === 'string' && pkg.name.trim() !== '') found.push('package.json');
    } catch {
      // An unreadable manifest names nothing.
    }
  }
  return found;
}

/**
 * The files a test runs as a child process, read from the commands it spells
 * out in full the way a door's commands are read. A test is taken to run them
 * from the repository root, where a suite that spawns scripts usually sets its
 * cwd; when nothing it names runs from there, from its own directory and each
 * one above it. Recorded as spawns on the test file, so a test that runs a
 * script reaches it as one that imports it does.
 */
function attachTestSpawns(files, spawned, repo) {
  for (const [path, commands] of spawned) {
    const file = files.get(path);
    if (!file) continue;
    // Production code runs its child processes from where the door that
    // runs it stands, the repository root.
    const dirs = [''];
    if (isTestFile(path)) for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) dirs.push(path.slice(0, at));
    for (const dir of dirs) {
      const runs = new Set();
      for (const command of commands) {
        for (const run of readCommands(command, dir, repo).runs.values()) {
          // Production code that type-checks or lints another part runs none
          // of it; a test's checks are how it reaches what it checks.
          if (!isTestFile(path) && run.runKind === 'checks') continue;
          if (run.path.endsWith('/')) {
            for (const [other, entry] of files) if (entry.language != null && other.startsWith(run.path)) runs.add(other);
          } else if (run.path !== path) runs.add(run.path);
        }
      }
      if (runs.size > 0) {
        file.spawns = [...runs].sort();
        break;
      }
    }
  }
}

// A part whose production code runs another part's file as a child process
// depends on it as an import does: kind spawns, one per ordered pair.
function spawnEdges(graph) {
  const pairs = new Map();
  for (const [path, file] of graph.files) {
    if (isTestFile(path)) continue;
    const from = graph.boundaryOf.get(path);
    for (const target of file.spawns ?? []) {
      const to = graph.boundaryOf.get(target);
      if (from && to && from !== to) pairs.set(`${from}\0${to}`, { from, to, kind: 'spawns' });
    }
  }
  return [...pairs.values()];
}

// The names a file hands out, from the same reading the order of work comes
// from. An anonymous default export has no name to compare, so it is not one.
function attachExports(files, facts) {
  for (const [path, fact] of facts) {
    const names = new Set();
    for (const fn of fact.functions) {
      if (fn.moduleLevel && fn.exported && fn.name !== 'default' && fn.name !== '') names.add(fn.name);
    }
    if (names.size > 0) files.get(path).exports = [...names].sort();
  }
}

function importGraph(boundaries, unassigned, overlaps) {
  const files = new Map();
  const boundaryOf = new Map();
  for (const boundary of boundaries) {
    for (const file of boundary.files) {
      files.set(file.path, file);
      boundaryOf.set(file.path, boundary.name);
    }
  }
  for (const file of [...unassigned, ...overlaps]) files.set(file.path, file);
  return { files, boundaryOf };
}

function validateBoundary(boundary) {
  if (boundary == null || typeof boundary.name !== 'string' || boundary.name.trim() === '') {
    throw new Error('boundary name is required');
  }
  const globs = boundary.globs == null ? [] : boundary.globs;
  if (!Array.isArray(globs) || globs.some((glob) => typeof glob !== 'string')) {
    throw new Error(`boundary globs must be an array of strings: ${boundary.name}`);
  }
  return {
    name: boundary.name,
    status: boundary.status,
    role: boundary.role,
    globs: [...globs],
  };
}

function listTracked(repoPath) {
  // -z: without it git octal-escapes and quotes any non-ASCII path, and the
  // core would hash a file that does not exist under that spelling. The buffer
  // is raised because the default 1 MiB is a few tens of thousands of paths,
  // which real repositories in the fleet exceed. --stage is how symlink and
  // gitlink modes are visible; without it both look like ordinary paths.
  const result = spawnSync('git', ['ls-files', '-z', '--stage'], {
    cwd: repoPath,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.error?.message || '').trim();
    throw new Error(`git ls-files failed: ${detail || `exit ${result.status}`}`);
  }

  const regular = [];
  const symlinks = [];
  const submodules = [];
  for (const line of result.stdout.split('\0')) {
    if (line.length === 0) continue;
    const record = parseStageLine(line);
    // Stage 0 is the resolved index entry. Higher stages are an in-progress
    // merge of the same path, and listing them would count one file three times.
    if (record.stage !== '0') continue;
    if (record.mode === '120000') {
      symlinks.push({ path: record.path, target: symlinkTarget(repoPath, record.path) });
    } else if (record.mode === '160000') {
      submodules.push(record.path);
    } else if (record.mode === '100644' || record.mode === '100755') {
      regular.push(record.path);
    } else {
      throw new Error(`unsupported index mode ${record.mode} for ${record.path}`);
    }
  }
  return { regular, symlinks, submodules };
}

function parseStageLine(line) {
  const tab = line.indexOf('\t');
  if (tab === -1) throw new Error('git ls-files --stage line has no path');
  const meta = line.slice(0, tab).split(' ');
  if (meta.length !== 3) throw new Error(`git ls-files --stage line is not mode oid stage: ${line}`);
  return {
    mode: meta[0],
    oid: meta[1],
    stage: meta[2],
    path: line.slice(tab + 1).replaceAll('\\', '/'),
  };
}

function symlinkTarget(repoPath, path) {
  try {
    return readlinkSync(join(repoPath, path)).replaceAll('\\', '/');
  } catch {
    // The index says this path is a symlink. A worktree that cannot read the
    // link is still not a file to hash, and the walk must not throw on it.
    return null;
  }
}

// A file is read as git stores it (text.js), so what is hashed and parsed is
// the same on a checkout with either line ending.
function describeFile(repoPath, path, places, facts, spawned, attributes, builds) {
  const bytes = storedBytes(readFileSync(join(repoPath, path)), attributes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const language = languageOf(path);
  // A scene or resource Godot saves as text names what it instances and
  // reads line by line, read as text by rule (core/gdscript.js).
  if (language == null && GODOT_TEXT.test(path)) return { path, hash, language: null, ...godotResourceReadings(bytes.toString('utf8')), ...noLandings() };
  if (language == null) return { path, hash, language: null, imports: 'unavailable', ...textLandings(path, bytes, places) };
  const extracted = parseFile(language, path, bytes.toString('utf8'), places);
  if (extracted.parseError) {
    const syntax = extracted.unreadSyntax ? { unreadSyntax: extracted.unreadSyntax } : {};
    return { path, hash, language, parseError: true, ...syntax, imports: [], ...noLandings() };
  }
  facts.set(path, extracted.sequence);
  if (extracted.builds.length > 0) builds.set(path, extracted.builds);
  if (extracted.spawned.commands.length > 0) spawned.set(path, extracted.spawned.commands);
  const built = extracted.spawned.built > 0 ? { dynamicSpawns: extracted.spawned.built } : {};
  const programs = extracted.spawned.programs?.length > 0 && !isTestFile(path) ? { programs: extracted.spawned.programs } : {};
  const empty = extracted.noStatements ? { noStatements: true } : {};
  // Read by settleInstalled, then dropped.
  const starts = extracted.startsOnLoad ? { startsOnLoad: true } : {};
  const holds = extracted.holds === 'reexports' ? { reexportsOnly: true } : extracted.holds === 'constant' ? { constantOnly: true } : {};
  // Read once the parts are known, then dropped (core/http.js httpEdges).
  const http = extracted.http ? { http: extracted.http } : {};
  const api = extracted.githubChanges > 0 && !isTestFile(path) ? { githubChanges: extracted.githubChanges } : {};
  // Read once imports resolve, then dropped (core/spawned.js settleSpawnHelpers).
  const helpers = Object.keys(extracted.spawned.helpers ?? {}).length > 0 ? { spawnHelpers: extracted.spawned.helpers } : {};
  const pending = extracted.spawned.pending?.length > 0 ? { pendingSpawns: extracted.spawned.pending } : {};
  // Read once every file and manifest is known, then dropped (core/rust-modules.js).
  const native = extracted.native ?? {};
  return { path, hash, language, imports: extracted.imports, ...extracted.landings, ...built, ...programs, ...helpers, ...pending, ...api, ...empty, ...holds, ...http, ...starts, ...native };
}

// One parse serves every reading of a file: its imports, its landings, the
// order of the calls it makes and the commands it hands a child process.
function parseFile(language, path, original, places) {
  let tree;
  let typeSites = [];
  // The grammar stops at a raw NUL byte wherever it is, a comment or a
  // string; a space in its place reads the same, every offset unmoved.
  const source = original.includes('\0') ? original.replaceAll('\0', ' ') : original;
  try {
    parser.setLanguage(languages[language]);
    tree = parser.parse(source);
    if (tree != null && tree.rootNode.hasError && SCRIPT_LANGUAGES.has(language)) {
      const repaired = repairSource(source, (text) => parser.parse(text));
      if (repaired) {
        tree.delete();
        tree = repaired.tree;
        typeSites = repaired.sites;
      }
    }
  } catch {
    return { parseError: true, imports: [] };
  }
  if (tree == null) return { parseError: true, imports: [] };
  try {
    if (tree.rootNode.hasError) return { parseError: true, imports: [], unreadSyntax: unreadSyntax(tree.rootNode, source) };
    if (!SCRIPT_LANGUAGES.has(language) && language !== 'python') return nativeReadings(language, tree.rootNode);
    const imports = language === 'python' ? collectPython(tree.rootNode, path, places) : [...collectScript(tree.rootNode), ...typeSites];
    return {
      imports,
      landings: astLandings(language, tree.rootNode, path, places),
      sequence: sequenceFacts(language, tree.rootNode),
      spawned: language === 'python' ? pythonSpawns(tree.rootNode) : spawnedCommands(tree.rootNode, (node) => scriptPath(node, path)),
      githubChanges: language === 'python' ? 0 : githubChanges(tree.rootNode),
      noStatements: statementless(tree.rootNode),
      startsOnLoad: language !== 'python' && startsOnLoad(tree.rootNode),
      holds: language === 'python' ? null : onlyHolds(tree.rootNode),
      http: language === 'python' ? null : httpFacts(tree.rootNode),
      builds: language === 'python' || isTestFile(path) ? [] : buildCalls(tree.rootNode, (node) => pathShape(node, path)),
    };
  } finally {
    tree.delete();
  }
}

// What a file of a language compiled or run by its own engine (Rust,
// GDScript) holds, read from its tree. `native` is what the file carries
// past its imports: testsInside, for a file holding its own unit tests, and
// what resolution reads once every file is known and then drops.
function nativeReadings(language, root) {
  const rust = language === 'rust' ? { ...rustImports(root), paths: rustPaths(root), calls: rustCalls(root) } : null;
  const gd = language === 'gdscript' ? gdscriptReadings(root) : null;
  return {
    imports: rust ? rust.imports : gd ? gd.imports : [],
    ...(gd ? { native: { godot: gd.godot, ...(gd.testSuite ? { testSuite: true } : {}) } } : {}),
    ...(rust ? { native: { rustModule: rust.module, ...(rust.includes.length > 0 ? { rustIncludes: rust.includes } : {}), ...(rust.paths.length > 0 ? { rustPaths: rust.paths } : {}), ...(rust.calls.calls.length + rust.calls.fields.length > 0 ? { rustCalls: rust.calls } : {}), ...(rust.tests ? { testsInside: true } : {}) } } : {}),
    landings: noLandings(),
    sequence: rust ? rustSequence(root, rust.imports) : gd ? gd.sequence : { functions: [], topLevel: [], reexports: [] },
    spawned: { commands: [], built: 0 },
    githubChanges: 0,
    noStatements: statementless(root),
    startsOnLoad: false,
    holds: null,
    http: null,
    builds: [],
  };
}

// typeof import(…) in a type, and import(…).T[], which the vendored grammar
// rejects in a type argument and before [] (found on
// xrpl-creator-capsule's mocks and forkctl's Dirent[]). The import(...) is
// rewritten to an identifier of the same length, which a type reads as a
// name, and its specifier kept as the import site a file that parses
// records for it.
// Spaces within a line only: an identifier holds no line break, so a
// construct spread over lines is left as it is.
const TYPEOF_IMPORT = /(\btypeof[ \t]+)(import[ \t]*\([ \t]*(['"`])([^'"`\n]*)\3[ \t]*\))/g;
const IMPORT_ARRAY = /\bimport[ \t]*\([ \t]*(['"`])([^'"`\n]*)\1[ \t]*\)(?=(?:[ \t]*\.[ \t]*[A-Za-z_$][\w$]*)+[ \t]*\[[ \t]*\])/g;
// abstract read as a name (let abstract: string; abstract = ...), which the
// grammar takes for the modifier at the start of a statement; the modifier
// itself is followed by what it modifies.
const ABSTRACT_NAME = /\babstract\b(?!\s+[A-Za-z_$])/g;
// A decimal character reference past five digits (&#128274;, a padlock),
// which the grammar does not read, though HTML and JSX do.
const LONG_REFERENCE = /&#[0-9]{6,};/g;
// A bare & in JSX text, and a comparison the grammar reads as the start of a
// type argument list, are rewritten one error at a time, this many at most.
const REPAIR_ROUNDS = 16;

/**
 * A file the vendored grammar cannot read for a construct TypeScript
 * accepts, read again with each such construct rewritten to a form the
 * grammar reads, of the same length, so every byte offset, line and column
 * the readings record is the original's: typeof import(…) as a type
 * argument, import(…).T[], abstract as a name, which becomes abstrac$; a
 * decimal character reference past five digits and a bare & in JSX text,
 * which become spaces; and a comparison < with a space
 * after it on a line that stops the parse, which becomes <= so that
 * { left: dx < -3, right: dx > 3 } reads as two comparisons, not a call with
 * type arguments.
 * Returns the tree and the import sites the rewrite took out of the text,
 * or null when the file still does not parse, and the original's error
 * stands, named as before.
 *
 * @param {string} source
 * @param {(text: string) => object} parse
 * @returns {null | { tree: object, sites: Array<{ specifier: string, kind: string, line: number }> }}
 */
function repairSource(source, parse) {
  const sites = [];
  const lineAt = (offset) => source.slice(0, offset).split('\n').length;
  let text = source.replace(TYPEOF_IMPORT, (match, lead, call, quote, specifier, offset) => {
    sites.push({ specifier, kind: 'dynamic-literal', line: lineAt(offset) });
    return `${lead}${'_'.repeat(call.length)}`;
  });
  text = text.replace(IMPORT_ARRAY, (call, quote, specifier, offset) => {
    sites.push({ specifier, kind: 'dynamic-literal', line: lineAt(offset) });
    return '_'.repeat(call.length);
  });
  text = text.replace(ABSTRACT_NAME, () => 'abstrac$');
  text = text.replace(LONG_REFERENCE, (reference) => ' '.repeat(reference.length));
  let tree = parse(text);
  for (let round = 0; round < REPAIR_ROUNDS && tree != null && tree.rootNode.hasError; round += 1) {
    const at = jsxAmpersands(text, tree.rootNode);
    const compared = at.length > 0 ? [] : comparisons(text, tree.rootNode);
    if (at.length === 0 && compared.length === 0) break;
    for (const index of at) text = `${text.slice(0, index)} ${text.slice(index + 1)}`;
    for (const index of compared) text = `${text.slice(0, index)}<=${text.slice(index + 2)}`;
    tree.delete();
    tree = parse(text);
  }
  if (tree == null) return null;
  if (tree.rootNode.hasError) {
    tree.delete();
    return null;
  }
  return { tree, sites };
}

// The offsets of each bare & in JSX text on a line where the parse stops:
// one that starts the error, or one between a tag's > and the next <. A &&
// and a character reference are left alone.
function jsxAmpersands(text, root) {
  const lines = text.split('\n');
  const starts = [];
  for (let i = 0, at = 0; i < lines.length; i += 1) {
    starts.push(at);
    at += lines[i].length + 1;
  }
  const out = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'ERROR' && !node.isMissing) {
      const row = node.startPosition.row;
      const line = lines[row] ?? '';
      for (let column = line.indexOf('&'); column !== -1; column = line.indexOf('&', column + 1)) {
        if (line[column + 1] === '&' || line[column - 1] === '&' || ENTITY.test(line.slice(column))) continue;
        const between = /^[^<>{}]*$/.test(line.slice(line.lastIndexOf('>', column) + 1, column)) && line.lastIndexOf('>', column) !== -1;
        if (column === node.startPosition.column || between || /^\s*[^<>{}=();]*$/.test(line.slice(0, column))) out.add(starts[row] + column);
      }
      continue;
    }
    for (const child of node.children) stack.push(child);
  }
  return [...out].sort((a, b) => a - b);
}

// Names a top-level call starts a program by: main().catch(...), run(); and
// what a server does to start: await server.connect(transport), app.listen().
const STARTERS = new Set(['main', 'run', 'cli', 'start']);
const SERVES = new Set(['connect', 'listen']);

/**
 * Whether a module runs a program the moment it loads: a statement at its
 * top, behind no condition, that parses the command line (program.parse(
 * process.argv), yargs(hideBin(process.argv)).parse()), calls the module's
 * own main(), or starts a server (await server.connect(transport)).
 */
function startsOnLoad(root) {
  const local = new Set();
  for (const child of root.namedChildren) {
    const declaration = child.type === 'export_statement' ? child.childForFieldName('declaration') : child;
    if (declaration?.type === 'function_declaration') local.add(declaration.childForFieldName('name')?.text);
  }
  const starts = (node) => {
    if (!node) return false;
    if (node.type === 'await_expression' || node.type === 'parenthesized_expression') return starts(node.namedChildren[0]);
    if (node.type === 'unary_expression' && node.childForFieldName('operator')?.text === 'void') return starts(node.childForFieldName('argument'));
    if (node.type !== 'call_expression') return false;
    const fn = node.childForFieldName('function');
    if (fn?.type === 'identifier') return STARTERS.has(fn.text) && local.has(fn.text);
    if (fn?.type !== 'member_expression') return false;
    const property = fn.childForFieldName('property')?.text;
    if ((property === 'parse' || property === 'parseAsync') && node.text.replace(/\s+/g, '').includes('process.argv')) return true;
    if (SERVES.has(property)) return true;
    // main().catch(...) and main().then(...) start main.
    return (property === 'catch' || property === 'then' || property === 'finally') && starts(fn.childForFieldName('object'));
  };
  return root.namedChildren.some((child) => child.type === 'expression_statement' && starts(child.namedChildren[0]));
}

/**
 * What the commands and packages a manifest installs are, past the files
 * they run. A package every file of which it exports runs a program as it
 * loads is no library: an import runs the program. runsCommand names the
 * command its entry is, when one of its manifest's commands runs that file,
 * and is true otherwise. A package that also exports modules that start
 * nothing (a server beside the functions it serves) is a library still. A
 * command a private workspace member declares is installed by no one: when
 * a file of a package that publishes names the command's built file by its
 * path, the command is bundled into that package (bundledInto), and
 * otherwise it is no door.
 * Mutates the doors it keeps.
 */
function settleInstalled(doors, files, repoPath, tracked) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifests = new Map();
  const manifestOf = (dir) => {
    if (!manifests.has(dir)) {
      let pkg = null;
      try {
        const path = dir ? `${dir}/package.json` : 'package.json';
        pkg = tracked.has(path) ? JSON.parse(readFileSync(join(repoPath, path), 'utf8')) : null;
      } catch {
        pkg = null;
      }
      manifests.set(dir, pkg && typeof pkg === 'object' ? pkg : null);
    }
    return manifests.get(dir);
  };
  // The package a file belongs to: the nearest directory above it with a manifest.
  const ownerOf = (path) => {
    for (let at = path.lastIndexOf('/'); ; at = path.lastIndexOf('/', at - 1)) {
      const dir = at <= 0 ? '' : path.slice(0, at);
      if (tracked.has(dir ? `${dir}/package.json` : 'package.json')) return manifestOf(dir);
      if (at <= 0) return null;
    }
  };
  const kept = [];
  for (const door of doors) {
    if (door.kind === 'package' && door.entry != null && (door.exported ?? []).every((path) => byPath.get(path)?.startsOnLoad)) {
      const command = doors.find((other) => other.kind === 'command' && other.file === door.file && !other.privateMember && (other.runs ?? []).some((run) => run.path === door.entry));
      door.runsCommand = command ? command.name : true;
    }
    delete door.exported;
    if (door.privateMember) {
      const into = new Set();
      for (const file of files) {
        if (isTestMaterial(file.path) || !(file.builtNames ?? []).includes(door.declared)) continue;
        const owner = ownerOf(file.path);
        if (owner && owner.private !== true && typeof owner.name === 'string' && owner.name !== '') into.add(owner.name);
      }
      delete door.privateMember;
      delete door.declared;
      if (into.size === 0) continue;
      door.bundledInto = [...into].sort();
    }
    kept.push(door);
  }
  for (const file of files) {
    delete file.builtNames;
    delete file.startsOnLoad;
  }
  return kept;
}

// The offsets of each < on a line where the parse stops that has a space on
// both sides, as a comparison is written and a type argument list is not.
function comparisons(text, root) {
  const lines = text.split('\n');
  const starts = [];
  for (let i = 0, at = 0; i < lines.length; i += 1) {
    starts.push(at);
    at += lines[i].length + 1;
  }
  const rows = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'ERROR' || node.isMissing) rows.add(node.startPosition.row);
    else for (const child of node.children) stack.push(child);
  }
  const out = [];
  for (const row of [...rows].sort((a, b) => a - b)) {
    const line = lines[row] ?? '';
    for (let column = line.indexOf(' < '); column !== -1; column = line.indexOf(' < ', column + 1)) out.push(starts[row] + column + 1);
  }
  return out;
}

// A module with nothing but comments, or a Python docstring, runs nothing.
// Rust names its comments line_comment and block_comment.
function statementless(root) {
  const statements = root.namedChildren.filter((child) => !/comment$/.test(child.type));
  if (statements.length === 0) return true;
  return statements.length === 1 && statements[0].type === 'expression_statement' && statements[0].namedChildren[0]?.type === 'string';
}

/**
 * A module that does no work of its own: a barrel whose every statement hands
 * on what another file exports ('reexports'), or one that holds a single
 * constant ('constant'): a version string, or one object or array a tool
 * reads (content.config.ts's collections), beside the imports that build it.
 * A value that is a function, or a call made as the module loads, is work. A
 * reader following the work passes over both, to what the barrel hands on.
 */
function onlyHolds(root) {
  const statements = root.namedChildren.filter((child) => child.type !== 'comment');
  if (statements.length === 0) return null;
  if (statements.every((statement) => statement.type === 'export_statement' && statement.childForFieldName('source') != null)) return 'reexports';
  const own = statements.filter((statement) => statement.type !== 'import_statement');
  if (own.length !== 1) return null;
  const declaration = own[0].type === 'export_statement' ? own[0].childForFieldName('declaration') : own[0];
  if (declaration?.type !== 'lexical_declaration' && declaration?.type !== 'variable_declaration') return null;
  const declarators = declaration.namedChildren.filter((child) => child.type === 'variable_declarator');
  if (declarators.length !== 1) return null;
  let value = declarators[0].childForFieldName('value');
  while (value?.type === 'as_expression' || value?.type === 'satisfies_expression' || value?.type === 'parenthesized_expression') value = value.namedChildren[0];
  const literal = ['string', 'number', 'true', 'false', 'null', 'object', 'array'].includes(value?.type)
    || (value?.type === 'template_string' && !value.namedChildren.some((child) => child.type === 'template_substitution'));
  // One literal held beside nothing it imports is the version string case;
  // an object or array beside imports is a tool's config, and still no work.
  return literal ? 'constant' : null;
}

const PY_SPAWNS = /(^|\.)(run|call|check_call|check_output|Popen)$/;

/**
 * The command lines a Python file hands to a child process that run a
 * module under the interpreter running the file: subprocess.run([
 * sys.executable, "-m", "pytest", ...]), or with the interpreter held in a
 * name (py = sys.executable). Read as python -m <module> with the words
 * spelled out, up to the first one built at run time.
 */
function pythonSpawns(root) {
  const interpreters = new Set();
  walkNamed(root, (node) => {
    if (node.type !== 'assignment') return;
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    if (left?.type === 'identifier' && right?.text === 'sys.executable') interpreters.add(left.text);
  });
  // A function of the file that hands one of its parameters to subprocess
  // (def _run(label, cmd): subprocess.run(cmd)) runs the list each call
  // hands it there.
  const helpers = new Map();
  walkNamed(root, (node) => {
    if (node.type !== 'function_definition') return;
    const params = (node.childForFieldName('parameters')?.namedChildren ?? []).map((child) => (child.type === 'identifier' ? child.text : child.namedChildren.find((inner) => inner.type === 'identifier')?.text ?? null));
    walkNamed(node.childForFieldName('body'), (inner) => {
      if (inner.type !== 'call' || !PY_SPAWNS.test(inner.childForFieldName('function')?.text ?? '')) return;
      const first = inner.childForFieldName('arguments')?.namedChildren.find((child) => child.type !== 'comment');
      const at = first?.type === 'identifier' ? params.indexOf(first.text) : -1;
      if (at !== -1) helpers.set(node.childForFieldName('name')?.text, at);
    });
  });
  const commands = new Set();
  walkNamed(root, (node) => {
    if (node.type !== 'call') return;
    const callee = node.childForFieldName('function')?.text ?? '';
    const args = node.childForFieldName('arguments')?.namedChildren.filter((child) => child.type !== 'comment') ?? [];
    let list = null;
    if (helpers.has(callee)) list = args[helpers.get(callee)] ?? null;
    else if (PY_SPAWNS.test(callee)) list = args[0] ?? null;
    if (list?.type !== 'list') return;
    const items = list.namedChildren.filter((child) => child.type !== 'comment');
    const head = items[0];
    if (!(head?.text === 'sys.executable' || (head?.type === 'identifier' && interpreters.has(head.text)))) return;
    const words = ['python'];
    for (const item of items.slice(1)) {
      if (item.type !== 'string') break;
      const text = item.namedChildren.filter((child) => child.type === 'string_content').map((child) => child.text).join('');
      if (/[\s'"]/.test(text) || text === '') break;
      words.push(text);
    }
    if (words[1] === '-m' && words[2]) commands.add(words.join(' '));
  });
  return { commands: [...commands].sort(), built: 0 };
}

function walkNamed(root, visit) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    visit(node);
    const children = node.namedChildren;
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

function lineOf(node) {
  return node.startPosition.row + 1;
}

// The constructs the vendored grammars are known not to read, found on
// ai-rpg-engine, where the newest tree-sitter-typescript build (0.23.2, the
// same bytes as the vendored one) fails on all of them. A file is named by
// the line its first error starts on; one that matches none is counted
// without a name.
const UNREAD = [
  ['import-type-array', (line) => /\bimport\(\s*(['"`])[^'"`]*\1\s*\)(\s*\.\s*[A-Za-z_$][\w$]*)+\s*\[\s*\]/.test(line)],
  ['typeof-import-argument', (line) => /<\s*typeof\s+import\(/.test(line)],
  // Rasterize & Edit in JSX text: the grammar reads & there as the start of
  // a character reference, found on glyphstudio. At the error, or failing
  // that (a column counted past a wide character), between a tag's > and <.
  ['jsx-ampersand', (line, column) => (line[column] === '&' && !ENTITY.test(line.slice(column)))
    || />[^<>{}]*&(?![A-Za-z][A-Za-z0-9]*;|#[0-9]+;|#x[0-9A-Fa-f]+;)[^<>{}]*</.test(line)],
];
const ENTITY = /^&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);/;

function unreadSyntax(root, source) {
  let first = null;
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.type === 'ERROR' || node.isMissing) {
      if (first == null || node.startIndex < first.startIndex) first = node;
      continue;
    }
    for (const child of node.children) stack.push(child);
  }
  if (first == null) return null;
  const line = source.split('\n')[first.startPosition.row] ?? '';
  return UNREAD.find(([, test]) => test(line, first.startPosition.column))?.[0] ?? null;
}

// A string literal passed to import() or require() names its module as surely
// as an import statement does, so it resolves as one, kind dynamic-literal.
// Anything else passed is a dynamic site, left unresolved.
function collectScript(root) {
  const imports = [];
  walkNamed(root, (node) => {
    if (node.type === 'import_statement' || node.type === 'export_statement') {
      const literal = jsString(node.childForFieldName('source'));
      if (literal == null) return;
      const site = { specifier: literal, kind: 'static', line: lineOf(node) };
      // export * from './x' hands on every name x exports, which is what a
      // barrel index does; export * as ns names one binding, so it is not.
      if (node.type === 'export_statement' && node.children.some((child) => child.type === '*')) site.reexportsAll = true;
      imports.push(site);
      return;
    }
    if (node.type !== 'call_expression') return;
    const fn = node.childForFieldName('function');
    if (!fn) return;
    if (isResolveCall(fn)) {
      const literal = jsString(firstArgument(node));
      if (literal != null) imports.push({ specifier: literal, kind: 'dynamic-literal', line: lineOf(node), locates: true, ...(optionalCall(node) ? { optional: true } : {}) });
      return;
    }
    const isImport = fn.type === 'import';
    const isRequire = fn.type === 'identifier' && fn.text === 'require';
    if (!isImport && !isRequire) return;
    // A comment beside the argument (import(/* @vite-ignore */ name)) is no
    // part of it, and a const the argument names holds what it loads.
    const first = firstArgument(node);
    const bound = first?.type === 'identifier' ? constValue(root, first.text) : null;
    const literal = jsString(first) ?? jsString(bound);
    const optional = optionalCall(node) ? { optional: true } : {};
    if (literal != null) {
      imports.push({ specifier: literal, kind: 'dynamic-literal', line: lineOf(node), ...optional });
      return;
    }
    // require(join(ROOT, 'package.json')) reads the manifest for its fields;
    // it loads no module.
    if (manifestPath(bound ?? first)) {
      imports.push({ specifier: 'package.json', kind: 'manifest', line: lineOf(node) });
      return;
    }
    // import(COMMANDS[name]), or import(path) after const path =
    // COMMANDS[name], where COMMANDS is a const object literal of paths:
    // every path the table holds is one the call may load.
    const table = tableValues(root, first);
    if (table.length > 0) {
      for (const specifier of table) imports.push({ specifier, kind: 'dynamic-literal', line: lineOf(node), table: true });
      return;
    }
    imports.push({ specifier: first ? first.text : '', kind: 'dynamic', line: lineOf(node) });
  });
  return imports;
}

// The first argument of a call, past any comment beside it.
function firstArgument(call) {
  return call.childForFieldName('arguments')?.namedChildren.find((child) => child.type !== 'comment') ?? null;
}

// A load the code is ready to go without: inside a try, or with a .catch on
// what it returns.
function optionalCall(call) {
  if (call.parent?.type === 'member_expression' && call.parent.childForFieldName('property')?.text === 'catch') return true;
  for (let node = call.parent; node != null; node = node.parent) {
    if (node.type === 'try_statement') return true;
    if (node.type === 'function_declaration' || node.type === 'arrow_function' || node.type === 'function_expression' || node.type === 'method_definition') return false;
  }
  return false;
}

// join(ROOT, 'package.json') and its kin: a path call whose last argument
// is a package.json.
function manifestPath(node) {
  if (node?.type !== 'call_expression') return false;
  const name = node.childForFieldName('function')?.text ?? '';
  if (!/(^|\.)(join|resolve)$/.test(name)) return false;
  const args = node.childForFieldName('arguments')?.namedChildren.filter((child) => child.type !== 'comment') ?? [];
  const last = jsString(args[args.length - 1] ?? null);
  return last != null && /(^|\/)package\.json$/.test(last);
}

/**
 * The string values of the const object literal a dynamic import's argument
 * looks up: TABLE[key] itself, or a const bound to TABLE[key]. Empty when
 * the argument is anything else, or the name is declared more than once.
 */
function tableValues(root, arg) {
  let lookup = arg;
  if (lookup?.type === 'identifier') lookup = constValue(root, lookup.text);
  if (lookup?.type !== 'subscript_expression') return [];
  const object = lookup.childForFieldName('object');
  if (object?.type !== 'identifier') return [];
  const table = constValue(root, object.text);
  if (table?.type !== 'object') return [];
  const values = [];
  for (const pair of table.namedChildren) {
    if (pair.type !== 'pair') continue;
    const value = jsString(pair.childForFieldName('value'));
    if (value != null && !values.includes(value)) values.push(value);
  }
  return values;
}

// The value a const declares for a name, when the file declares it once.
function constValue(root, name) {
  const found = [];
  walkNamed(root, (node) => {
    if (node.type !== 'variable_declarator' || node.childForFieldName('name')?.text !== name) return;
    const declaration = node.parent;
    if (declaration?.type === 'lexical_declaration' && declaration.children.some((child) => child.type === 'const')) found.push(node.childForFieldName('value'));
    else found.push(null);
  });
  return found.length === 1 ? found[0] : null;
}

// require.resolve('@scope/pkg/json/x.json') and import.meta.resolve(...) load
// nothing, but the file they locate has to be there at run time, which is a
// dependency on its package as surely as an import is. One built at run time
// names no module, and unlike a dynamic import runs no code, so it is not a site.
function isResolveCall(fn) {
  if (fn.type !== 'member_expression' || fn.childForFieldName('property')?.text !== 'resolve') return false;
  const object = fn.childForFieldName('object');
  return (object?.type === 'identifier' && object.text === 'require') || object?.type === 'meta_property';
}

function jsString(node) {
  if (!node || node.type !== 'string') return null;
  const parts = node.namedChildren.filter((child) => child.type === 'string_fragment');
  if (parts.length === 0) return node.text === "''" || node.text === '""' ? '' : null;
  return parts.map((part) => part.text).join('');
}

const PYTHON_IMPORT_CALLS = new Set(['importlib.import_module', 'import_module', '__import__']);
const PYTHON_LOCATION_CALLS = new Set(['importlib.util.spec_from_file_location', 'util.spec_from_file_location', 'spec_from_file_location']);

// importlib.import_module and __import__ with a string literal name their
// module; spec_from_file_location names its file, read the way a landing's
// path is read (joins, __file__, .parent), and counts when that is exactly
// one tracked file. Either is kind dynamic-literal and resolves as an import.
function collectPython(root, path, places) {
  const imports = [];
  walkNamed(root, (node) => {
    if (node.type === 'import_statement') {
      for (const child of node.namedChildren) {
        const specifier = pythonImported(child);
        if (specifier == null) continue;
        imports.push({ specifier, kind: 'static', line: lineOf(node) });
      }
      return;
    }
    if (node.type === 'import_from_statement') {
      const module = node.childForFieldName('module_name');
      if (!module) return;
      const wildcard = node.namedChildren.some((child) => child.type === 'wildcard_import');
      imports.push({
        specifier: module.text,
        kind: wildcard ? 'wildcard' : 'static',
        line: lineOf(node),
      });
      return;
    }
    if (node.type !== 'call') return;
    const name = pythonCallee(node.childForFieldName('function'));
    const args = node.childForFieldName('arguments');
    if (PYTHON_IMPORT_CALLS.has(name)) {
      const first = args?.namedChildren[0] ?? null;
      const literal = pythonLiteral(first);
      if (literal) imports.push({ specifier: literal, kind: 'dynamic-literal', line: lineOf(node) });
      else imports.push({ specifier: pythonDynamicSpecifier(first), kind: 'dynamic', line: lineOf(node) });
      return;
    }
    if (!PYTHON_LOCATION_CALLS.has(name)) return;
    const location = pythonArgument(args, 1, 'location');
    const named = location ? [...new Set(pythonPathValues(location, path))].filter((value) => places.files.has(value)) : [];
    if (named.length === 1) imports.push({ specifier: named[0], kind: 'dynamic-literal', line: lineOf(node), location: true });
    else imports.push({ specifier: location ? location.text : '', kind: 'dynamic', line: lineOf(node) });
  });
  return imports;
}

function pythonLiteral(node) {
  if (node?.type !== 'string') return null;
  if (node.namedChildren.some((child) => child.type === 'interpolation' || child.type === 'escape_sequence')) return null;
  const text = node.namedChildren.filter((child) => child.type === 'string_content').map((child) => child.text).join('');
  return text === '' ? null : text;
}

function pythonArgument(args, index, keyword) {
  if (!args) return null;
  const children = args.namedChildren.filter((child) => child.type !== 'comment');
  const named = children.find((child) => child.type === 'keyword_argument' && child.childForFieldName('name')?.text === keyword);
  if (named) return named.childForFieldName('value');
  const positional = children.filter((child) => child.type !== 'keyword_argument');
  return positional[index] ?? null;
}

function pythonImported(node) {
  if (node.type === 'dotted_name' || node.type === 'relative_import') return node.text;
  if (node.type === 'aliased_import') return node.childForFieldName('name')?.text ?? null;
  return null;
}

function pythonCallee(fn) {
  if (!fn) return null;
  if (fn.type === 'identifier') return fn.text;
  if (fn.type !== 'attribute') return null;
  const object = pythonCallee(fn.childForFieldName('object'));
  const attribute = fn.childForFieldName('attribute');
  return object && attribute ? `${object}.${attribute.text}` : null;
}

function pythonDynamicSpecifier(node) {
  if (!node) return '';
  if (node.type === 'string') {
    const content = node.namedChildren.find((child) => child.type === 'string_content');
    return content ? content.text : '';
  }
  return node.text;
}
