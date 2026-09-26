import { isCodePath, languageOf } from '../core/languages.js';
import { dominantLanguage, KIND_LABELS, kindsOf } from './test-kinds.js';
import { isFixture, isTest, testReachOf } from './test-reach.js';
import { COVERAGE_RECIPE, COVERAGE_TOOLS, runnerFor, SMOKE_GATE } from './test-sources.js';

/**
 * What no test reaches in a repository and what should reach it, read from
 * its map (docs/atlas-test-gaps.spec.md). Facts first, then suggestions,
 * kept apart; each suggestion names its rule, the facts that triggered it,
 * what it suggests and the source of that. Atlas points; the agent writes:
 * nothing here writes or scaffolds a test, and nothing is posted.
 *
 * Code gaps (parts and files no test imports or runs, and the failure paths
 * in them) are ranked in a fixed order: on the path of a door that ships or
 * runs in CI first, then higher fan-in, more changes in the history window,
 * more failure paths, and the path. Five are listed, with a count of the
 * rest. Hygiene items (tests no workflow runs, coverage not collected) and
 * commands no test runs are listed apart, never ranked among them.
 */

export const SHOWN = 5;
// How many failure paths a G6 suggestion names in its text.
const NAMED = 6;

// The family of code each runner runs tests for, and each language is.
const RUNNER_FAMILY = {
  vitest: 'script', jest: 'script', mocha: 'script', 'node --test': 'script', node: 'script', 'bun test': 'script', 'deno test': 'script',
  ava: 'script', tap: 'script', uvu: 'script', 'playwright test': 'script', 'cypress run': 'script', 'karma start': 'script', 'vscode-test': 'script',
  pytest: 'python', unittest: 'python', python: 'python', tox: 'python', nox: 'python',
  'cargo test': 'rust', 'cargo nextest': 'rust', gut: 'gdscript', gdUnit4: 'gdscript', 'dotnet test': 'dotnet', 'go test': 'go', bats: 'shell',
};
const LANGUAGE_FAMILY = { javascript: 'script', typescript: 'script', tsx: 'script', python: 'python', rust: 'rust', gdscript: 'gdscript' };
// Families whose runners have no coverage tool the studio uses.
const NO_COVERAGE = new Set(['gdscript', 'shell']);
// The families of code each kind's suggested runner runs, and the kind a
// file of another family takes: a Python script in a part of JavaScript is
// tested with pytest, whatever its part's kind.
const KIND_FAMILIES = {
  node: ['script'], 'ts-monorepo': ['script'], 'vscode-extension': ['script'], 'mcp-server': ['script', 'python'],
  'tauri-app': ['script', 'rust'], python: ['python'], data: ['python'], rust: ['rust'], 'godot-game': ['gdscript'],
};
const FAMILY_KIND = { script: 'node', python: 'python', rust: 'rust', gdscript: 'godot-game' };
// The module each framework's tests import, which a suggestion cites.
const FRAMEWORK_MODULES = {
  vitest: 'vitest', 'playwright test': '@playwright/test', 'node --test': 'node:test', jest: '@jest/globals', mocha: 'mocha',
  'bun test': 'bun:test', ava: 'ava', uvu: 'uvu', tap: 'tap', pytest: 'pytest', unittest: 'unittest',
};

// How each runner's own discovery would collect a test file a workflow runs
// none of, and the documentation that says so.
const DISCOVERY = {
  vitest: { text: 'let Vitest\'s own discovery collect them: run vitest from the package root without narrowing it with --dir or a path filter, or add their directory to test.include', source: "Vitest's test.include and --dir options" },
  'node --test': { text: 'let node --test find them: run it with no path, or with a glob that includes their directory', source: "Node's test runner, which with no path runs every file named as a test" },
  pytest: { text: 'let pytest\'s discovery collect them: run pytest from the root, or add their directory to testpaths', source: "pytest's test discovery and its testpaths setting" },
  jest: { text: 'let Jest\'s discovery collect them: run jest with no path filter, or widen testMatch or roots to include them', source: "Jest's testMatch and roots options" },
  mocha: { text: 'let Mocha collect them: add their directory to spec, or run mocha --recursive over it', source: "Mocha's spec option and --recursive" },
};

/**
 * @param {object} structure a map, as structure.json holds it
 * @param {{ statistics?: object | null, repository?: string | null, scope?: { files: Set<string>, parts: Set<string> } | null }} [options]
 *   statistics.json, for the history ranking; the repository, owner/name;
 *   and the files and parts an answer is narrowed to, whose gaps are ranked
 *   and cut among themselves (the rules still read the whole map)
 */
export function testGaps(structure, { statistics = null, repository = null, scope = null } = {}) {
  const reach = testReachOf(structure);
  const kinds = kindsOf(structure);
  const doors = structure.doors ?? [];
  const workflows = doors.filter((door) => !door.kind && !door.parseError);
  const runs = workflows.flatMap((door) => (door.tests ?? []).map((run) => ({ workflow: door.file, ...run })));
  const attributed = runs.filter((run) => run.runner != null);
  const notAttributed = runs.filter((run) => run.runner == null);
  const partOf = new Map();
  for (const boundary of structure.boundaries ?? []) for (const file of boundary.files ?? []) partOf.set(file.path, boundary.name);
  const fileOf = new Map([...(structure.boundaries ?? []).flatMap((boundary) => boundary.files ?? []), ...(structure.unassigned ?? []), ...(structure.overlaps ?? [])].map((file) => [file.path, file]));
  // A file among fixtures is material a test reads, never a gap.
  const codeOf = (boundary) => (boundary.files ?? []).filter((file) => !isTest(file) && isCodePath(file.path) && !isFixture(file.path));
  const familyOfPart = (boundary) => LANGUAGE_FAMILY[dominantLanguage(codeOf(boundary).map((file) => file.path))] ?? null;
  const ciFamilies = new Set(attributed.map((run) => RUNNER_FAMILY[run.runner]).filter(Boolean));
  const testFamilies = new Set([...fileOf.values()].filter(isTest).map((file) => LANGUAGE_FAMILY[languageOf(file.path)]).filter(Boolean));

  const facts = {
    runs,
    codecov: workflows.filter((door) => (door.uses ?? []).includes('codecov/codecov-action')).map((door) => door.file),
    notRun: structure.testsNotRun ?? [],
    leftOut: structure.testsLeftOut ?? [],
    notAttributed: notAttributed.map(({ workflow, job, step, through }) => ({ workflow, job, step, ...(through ? { through } : {}) })),
    parts: [...kinds].map(([part, kind]) => {
      const boundary = (structure.boundaries ?? []).find((entry) => entry.name === part);
      return { part, ...kind, runners: boundary?.testRunners ?? [], reach: reach.parts.get(part) ?? null };
    }),
  };

  // The code gaps: a code part no test reaches as a whole, and each file no
  // test reaches in a part tests do reach.
  const gaps = [];
  const suggestions = [];
  for (const boundary of structure.boundaries ?? []) {
    const kind = kinds.get(boundary.name);
    if (boundary.role !== 'code' || !kind) continue;
    const code = codeOf(boundary);
    if (code.length === 0) continue;
    const source = runnerFor(kind.kind, { repository });
    for (const file of code) {
      if (reach.files.has(file.path) || !(file.failurePaths?.length > 0)) continue;
      const constructs = file.failurePaths.map((site) => `the ${site.kind === 'match-err' ? 'Err arm' : site.kind === 'err' ? 'Err' : site.kind} in ${site.in ?? 'the module body'} (line ${site.line})`);
      const own = kindForFile(file.path, kind);
      const ownSource = own === kind ? source : runnerFor(own.kind, { repository });
      // The suggestion names the first few; the facts hold every one.
      const named = constructs.length > NAMED ? [...constructs.slice(0, NAMED), `${constructs.length - NAMED} more`] : constructs;
      suggestions.push({
        rule: 'G6',
        part: boundary.name,
        path: file.path,
        kind: own,
        facts: { constructs, reach: 'no test imports or runs this file' },
        suggest: { ...(ownSource ? { runner: ownSource.runner } : {}), text: `tests that make ${list(named)} run, with the input that sends ${file.path} down each` },
        ...(ownSource ? { source: ownSource.source } : {}),
      });
    }
    if (!reach.parts.has(boundary.name)) {
      gaps.push({ part: boundary.name, kind, files: code.length });
      const family = familyOfPart(boundary);
      const covered = notAttributed.length > 0 || (family != null && (ciFamilies.has(family) || testFamilies.has(family)));
      if (!covered && source) {
        const target = firstTarget(boundary, code, fileOf);
        suggestions.push({
          rule: 'G1',
          part: boundary.name,
          kind,
          facts: { files: code.length, reach: 'no test imports or runs any file of this part', runners: 'no runner here runs tests of this kind' },
          suggest: { runner: source.runner, text: `a first test that imports ${target.path}${target.names.length > 0 ? ` and checks what ${list(target.names)} return${target.names.length === 1 ? 's' : ''}` : ' and checks what it does'}` },
          source: source.source,
        });
      }
    } else {
      for (const file of code) if (!reach.files.has(file.path)) gaps.push({ part: boundary.name, path: file.path, kind: kindForFile(file.path, kind) });
    }
  }

  // An answer narrowed to part of the repository keeps what lies in it.
  const inScope = (path) => scope == null || scope.files.has(path);
  const partInScope = (part) => scope == null || scope.parts.has(part);
  const kept = (entry) => (entry.path != null ? inScope(entry.path) : partInScope(entry.part));
  const ranked = rank(gaps.filter(kept), { structure, statistics, fileOf, partOf });
  for (const gap of ranked) gap.wouldReach = wouldReach(gap, { structure, attributed, repository });
  const hygiene = [...notRunRule(facts.notRun, { attributed, notAttributed, partOf, kinds, repository, fileOf, leftOut: facts.leftOut, missed: workflows.flatMap((door) => door.shellMissed ?? []) }), ...coverageRule({ attributed, notAttributed })]
    .map((entry) => (entry.rule === 'G2' && scope != null ? { ...entry, facts: { ...entry.facts, files: entry.facts.files.filter(inScope), count: entry.facts.files.filter(inScope).length } } : entry))
    .filter((entry) => (entry.rule === 'G2' ? entry.facts.count > 0 : scope == null || (structure.boundaries ?? []).some((boundary) => scope.parts.has(boundary.name) && (boundary.testRunners ?? []).some((runner) => entry.facts.runners.includes(runner)))));

  return {
    kinds: [...kinds].filter(([part]) => partInScope(part)).map(([part, kind]) => ({ part, ...kind })),
    facts,
    gaps: { items: ranked.slice(0, SHOWN), rest: Math.max(0, ranked.length - SHOWN) },
    suggestions: suggestions.filter(kept),
    hygiene,
    commands: commandRule(doors, reach, workflows).filter(kept),
  };
}

// The kind a file is tested as: its part's, unless the file is of a family
// the part's kind has no runner for, when it is the kind of its own family.
function kindForFile(path, kind) {
  const family = LANGUAGE_FAMILY[languageOf(path)];
  if (family == null || (KIND_FAMILIES[kind.kind] ?? []).includes(family)) return kind;
  const own = FAMILY_KIND[family];
  return own ? { kind: own, label: KIND_LABELS[own] } : kind;
}

// G2: test files no workflow runs, grouped by the runner that would run
// them: the framework a file imports, else the runner CI runs for its
// family. Silent while a test step's runner is not attributed, since that
// step may be the one that runs them; for a file a runner CI runs may run
// though Atlas does not list its files; and for one a runner's own
// configuration leaves out on purpose, which the facts name instead.
function notRunRule(files, { attributed, notAttributed, partOf, kinds, repository, fileOf, leftOut, missed }) {
  if (files.length === 0 || notAttributed.length > 0) return [];
  const excluded = new Set(leftOut.map((entry) => entry.path));
  const groups = new Map();
  for (const path of files) {
    if (excluded.has(path)) continue;
    const family = LANGUAGE_FAMILY[languageOf(path)] ?? null;
    const framework = fileOf.get(path)?.testFramework ?? null;
    const runs = (run) => (framework != null ? run.runner === framework : RUNNER_FAMILY[run.runner] === family);
    if (attributed.some((run) => run.files == null && runs(run))) continue;
    const listed = attributed.find((run) => run.files != null && runs(run))?.runner ?? null;
    // sh reads ** as *, so a glob a shell expands can leave files out.
    const star = listed != null && missed.some((entry) => entry.twoStars && path.startsWith(entry.base));
    const key = `${listed ?? framework ?? `\0${family}`}\0${star}`;
    if (!groups.has(key)) groups.set(key, { listed, framework, family, star, files: [] });
    groups.get(key).files.push(path);
  }
  return [...groups.values()].map(({ listed, framework, family, star, files: group }) => {
    const facts = { files: group.sort(), count: group.length };
    if (listed != null && star) {
      return {
        rule: 'G2',
        facts,
        suggest: { runner: listed, text: `the shell a package script runs in reads ** in a glob as *, so the run leaves these out: quote the glob so ${listed} expands ** itself` },
        source: { from: 'external', text: 'the POSIX shell, whose pattern matching has no **' },
      };
    }
    if (listed != null) {
      const way = DISCOVERY[listed] ?? { text: `let ${listed}'s own discovery collect them, or name their directory in the run`, source: `${listed}'s test discovery` };
      return { rule: 'G2', facts, suggest: { runner: listed, text: way.text }, source: { from: 'external', text: way.source } };
    }
    if (framework != null) {
      return {
        rule: 'G2',
        facts,
        suggest: { runner: framework, text: `run them in CI with ${framework}, the runner they are written for` },
        source: { from: 'external', text: `the test framework the files import (${FRAMEWORK_MODULES[framework] ?? framework})` },
      };
    }
    const fallback = runnerFor(family === 'python' ? 'python' : kinds.get(partOf.get(group[0]))?.kind ?? 'node', { repository });
    return {
      rule: 'G2',
      facts,
      suggest: { ...(fallback ? { runner: fallback.runner } : {}), text: 'run them in CI with the runner they are written for' },
      source: fallback?.source ?? null,
    };
  });
}

// G4: CI runs a family's tests and collects no coverage. Silent for a
// family one of whose runners is named from its command alone, whose
// coverage is not read, and while a test step's runner is not attributed.
function coverageRule({ attributed, notAttributed }) {
  if (notAttributed.length > 0) return [];
  const byFamily = new Map();
  for (const run of attributed) {
    const family = RUNNER_FAMILY[run.runner];
    if (!family || NO_COVERAGE.has(family)) continue;
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(run);
  }
  const out = [];
  for (const group of byFamily.values()) {
    if (group.some((run) => run.files == null || run.coverage)) continue;
    const runners = [...new Set(group.map((run) => run.runner))].sort();
    const tools = runners.map((runner) => COVERAGE_TOOLS[runner]).filter(Boolean);
    out.push({
      rule: 'G4',
      facts: { runners, runs: group.map(({ workflow, job, step, runner }) => ({ workflow, job, step, runner })) },
      suggest: { text: `collect coverage as the studio does: ${COVERAGE_RECIPE.steps}${tools.length > 0 ? `; for ${list(runners)}, ${list(tools)}` : ''}` },
      source: COVERAGE_RECIPE.source,
    });
  }
  return out;
}

// G3: a command the repository installs that nothing runs end to end: no
// test imports or runs its entry, and no workflow starts it. A test that
// imports the entry drives it in-process with its arguments (click's
// CliRunner, main(argv)); a workflow that runs it, a dogfood run or a smoke
// step, starts it as a person does. A desktop app or a game is started by a
// person, not a test harness, and a Cargo example is no command anyone
// installs.
function commandRule(doors, reach, workflows) {
  const started = new Set(workflows.flatMap((door) => (door.runs ?? []).filter((run) => run.runKind === 'executes' && !run.built && !run.directory).map((run) => run.path)));
  const out = [];
  for (const door of doors) {
    if (door.kind !== 'command' || door.app || door.example) continue;
    const entry = (door.runs ?? []).find((run) => run.runKind === 'executes')?.path;
    if (!entry || reach.files.has(entry) || reach.ran.has(entry) || started.has(entry)) continue;
    out.push({
      rule: 'G3',
      path: entry,
      facts: { command: door.name, entry, manifest: door.file, reach: 'no test imports or runs it, and no workflow starts it' },
      suggest: { text: `an end-to-end test that runs ${door.name} as a person does: start it with its arguments and check its output and exit code` },
      source: SMOKE_GATE,
    });
  }
  return out;
}

// The order of the code gaps, fixed: on a door's path first, then fan-in,
// changes in the history window, failure paths, and the path itself.
function rank(gaps, { structure, statistics, fileOf, partOf }) {
  const doorParts = new Set((structure.doors ?? []).filter(shipsOrRunsInCi).flatMap((door) => (door.reach ?? []).map((entry) => entry.boundary)));
  const importers = new Map();
  for (const file of fileOf.values()) {
    if (isTest(file)) continue;
    for (const target of file.importsFiles ?? []) importers.set(target, (importers.get(target) ?? 0) + 1);
  }
  const partImporters = new Map();
  for (const edge of structure.edges ?? []) {
    if (edge.fromTests || edge.from === edge.to) continue;
    if (!partImporters.has(edge.to)) partImporters.set(edge.to, new Set());
    partImporters.get(edge.to).add(edge.from);
  }
  const churn = new Map((statistics?.churn?.files ?? []).map((entry) => [entry.path, entry.commits ?? 0]));
  const partFiles = (part) => [...fileOf.values()].filter((file) => partOf.get(file.path) === part && !isTest(file));
  for (const gap of gaps) {
    const files = gap.path ? [fileOf.get(gap.path)] : partFiles(gap.part);
    gap.onDoorPath = doorParts.has(gap.part);
    gap.fanIn = gap.path ? importers.get(gap.path) ?? 0 : partImporters.get(gap.part)?.size ?? 0;
    gap.changes = files.reduce((sum, file) => sum + (churn.get(file.path) ?? 0), 0);
    gap.failures = files.reduce((sum, file) => sum + (file.failurePaths?.length ?? 0), 0);
  }
  const key = (gap) => gap.path ?? gap.part;
  return gaps.sort((a, b) => Number(b.onDoorPath) - Number(a.onDoorPath) || b.fanIn - a.fanIn || b.changes - a.changes || b.failures - a.failures || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

// A workflow runs in CI; a command, package or app door ships when it is
// published or installed from this repository.
function shipsOrRunsInCi(door) {
  if (door.parseError) return false;
  if (!door.kind) return true;
  return !door.unshipped && !door.unpublished && !door.privatePackage && !door.example;
}

// What would reach a gap: the runners CI already runs for its part, else
// those it runs for code of its family, else the runner its kind suggests.
function wouldReach(gap, { structure, attributed, repository }) {
  const boundary = (structure.boundaries ?? []).find((entry) => entry.name === gap.part);
  if (boundary?.testRunners?.length > 0) return { runners: [...boundary.testRunners] };
  const family = LANGUAGE_FAMILY[dominantLanguage((boundary?.files ?? []).map((file) => file.path))];
  const runners = [...new Set(attributed.filter((run) => RUNNER_FAMILY[run.runner] === family).map((run) => run.runner))].sort();
  if (runners.length > 0) return { runners };
  const suggested = runnerFor(gap.kind.kind, { repository });
  return suggested ? { suggested: suggested.runner } : {};
}

// The file a first test for a part would import: its entry point, else the
// file most of it imports, else its first; with the names it exports.
function firstTarget(boundary, code, fileOf) {
  const inside = new Set(code.map((file) => file.path));
  const imported = new Map();
  for (const file of code) for (const target of file.importsFiles ?? []) if (inside.has(target)) imported.set(target, (imported.get(target) ?? 0) + 1);
  const entry = (boundary.entryPoints ?? []).find((path) => inside.has(path));
  const busiest = [...imported].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
  const path = entry ?? busiest ?? code[0].path;
  return { path, names: (fileOf.get(path)?.exports ?? []).slice(0, 3) };
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
