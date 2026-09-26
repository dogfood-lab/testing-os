import { posix } from 'node:path';
import { gapsAnswer, locate } from '../adapter/gaps.js';
import { byBasis, group } from './answer.js';
import { cannotSeeFor, cannotSeeSentence } from './limits.js';

/**
 * atlas_test_gaps: what no test imports or runs in the repository, a part, a
 * directory or a file, and what should reach it (docs/atlas-test-gaps.spec.md),
 * from the map the sidecar answers from. The same reading as atlas gaps,
 * given as facts in groups of one basis, then the suggestions apart, each
 * naming its rule, the facts that triggered it and the source of what it
 * suggests. What CI runs is declared by the workflows; what tests reach is
 * parsed from the code, or declared where a test starts a command by the
 * name a manifest installs.
 */

// A path as the asker wrote it, from the repository root.
function clean(path) {
  const normal = posix.normalize(String(path).replaceAll('\\', '/')).replace(/\/+$/, '');
  if (normal === '.' || normal === '' || normal === '..' || normal.startsWith('../')) return null;
  return normal.replace(/^(\.\/)+/, '');
}

// The repository a map names on its page, owner/name, for the house rules
// one repository keeps for itself.
function repositoryOf(snapshot) {
  const named = snapshot.page?.repo;
  return typeof named === 'string' && /^[^/\s]+\/[^/\s]+$/.test(named) ? named : null;
}

function gapItem(gap) {
  return {
    ...(gap.path != null ? { path: gap.path } : {}),
    part: gap.part,
    kind: gap.kind?.kind ?? null,
    ...(gap.files != null ? { files: gap.files } : {}),
    wouldReach: gap.wouldReach,
    onDoorPath: gap.onDoorPath,
    fanIn: gap.fanIn,
    changes: gap.changes,
    failures: gap.failures,
  };
}

// What reaches one file, as one sentence. A test that names the file in a
// string may run it, or only mention it, which Atlas cannot tell.
function reachSentence(reach, path) {
  const by = reach.test ?? 'a workflow\'s test step';
  if (reach.kind === 'names') {
    const named = reach.through?.length > 0 ? `${reach.through[0]} in a string, and that file imports ${path}` : `${path} in a string`;
    return `Atlas: ${by} names ${named}; it cannot tell whether that test runs it (${reach.basis}).`;
  }
  return `Atlas: ${by} ${reach.kind === 'imports' ? 'imports' : reach.kind === 'runs' ? 'runs' : 'finds tests in'} ${path} (${reach.basis}).`;
}

/**
 * @param {object} snapshot from sidecar/map.js
 * @param {object} repo the repository answered for
 * @param {string|undefined} path a file, directory or part; none asks about the repository
 */
export function testGapsAnswer(snapshot, repo, path) {
  const { structure } = snapshot;
  let target = null;
  if (path != null) {
    const named = clean(path);
    target = named == null ? null : locate(structure, [named]);
    if (!target) {
      return { ok: false, error: { code: 'ATLAS_GAPS_UNKNOWN_PATH', details: [`${path} names no file, directory or part in the map`], whatToDo: 'check the path, or run atlas map if the files are new' } };
    }
  }
  const answer = gapsAnswer(structure, { statistics: snapshot.statistics ?? null, repository: repositoryOf(snapshot), target });
  const { found, facts } = answer;
  const groups = [];

  if (found.kind === 'repository') {
    groups.push(group('testRuns', 'declared', facts.runs.map((run) => ({
      workflow: run.workflow, job: run.job, step: run.step, runner: run.runner,
      ...(run.through ? { through: run.through } : {}), ...(run.coverage ? { coverage: true } : {}), ...(run.junit ? { junit: true } : {}), ...(run.files != null ? { files: run.files } : {}),
    }))));
    groups.push(group('codecovUploads', 'declared', facts.codecov));
  }
  if (found.kind === 'file') {
    if (facts.reach) groups.push(group('reach', facts.reach.basis, [{ path: found.path, ...facts.reach }]));
  } else {
    groups.push(...byBasis('partReach', facts.parts.filter((entry) => entry.reach).map((entry) => ({
      item: { part: entry.part, kind: entry.kind, reach: entry.reach.kind, reached: entry.reach.reached, files: entry.reach.files, runners: entry.runners },
      basis: entry.reach.basis,
    }))));
    groups.push(group('partsNoTestReaches', 'parsed', facts.parts.filter((entry) => !entry.reach).map((entry) => ({ part: entry.part, kind: entry.kind, runners: entry.runners }))));
  }
  const { items, rest, suggestionsLeft } = answer.gaps;
  groups.push({ ...group('codeGaps', 'parsed', items.map(gapItem)), total: items.length + rest, complete: rest === 0 });
  const sites = items.flatMap((gap) => gap.suggestions.filter((entry) => entry.rule === 'G6').flatMap((entry) => entry.facts.constructs.map((construct) => ({ path: entry.path, construct }))));
  if (sites.length > 0) groups.push(group('failurePathsNoTestReaches', 'parsed', sites));
  if (facts.notRun.length > 0) groups.push(group('testFilesNoWorkflowRuns', 'declared', facts.notRun));
  if (found.kind === 'repository' && facts.leftOut.length > 0) groups.push(group('testFilesLeftOutByTheirRunner', 'declared', facts.leftOut));
  if (answer.commands.length > 0) groups.push(group('commandsNothingRuns', 'declared', answer.commands.map((entry) => ({ command: entry.facts.command, path: entry.facts.entry, manifest: entry.facts.manifest }))));
  groups.forEach((entry) => {
    if (entry.fact === 'codeGaps' && entry.items.length === 0) entry.complete = true;
  });

  const suggestions = [...items.flatMap((gap) => gap.suggestions), ...answer.commands, ...answer.hygiene].map((entry) => ({
    rule: entry.rule,
    ...(entry.path != null ? { path: entry.path } : {}),
    ...(entry.part != null ? { part: entry.part } : {}),
    ...(entry.kind ? { kind: entry.kind.kind } : {}),
    facts: entry.facts,
    suggest: entry.suggest,
    source: entry.source,
  }));

  // What Atlas cannot see for the question: what the files and parts asked
  // about, and the tests that would reach them, do that the map cannot
  // follow; and the test steps whose runner it cannot name, any of which
  // may be the one that runs the tests a fact says nothing runs.
  const tests = (structure.boundaries ?? []).filter((boundary) => boundary.role === 'test').map((boundary) => boundary.name);
  const asked = found.kind === 'repository' ? [] : found.kind === 'part' ? [found.part] : found.part != null ? [found.part] : [...(target?.scope.parts ?? [])];
  const cannotSee = cannotSeeFor(snapshot, { files: found.kind === 'file' ? [found.path] : [], parts: [...new Set([...asked, ...tests])] });
  const unnamed = facts.notAttributed.map((run) => `${run.workflow} › ${run.job} › ${run.step}`);
  if (unnamed.length > 0) cannotSee.push({ basis: 'unresolved', what: 'command', grain: 'door', count: unnamed.length, named: unnamed, reason: 'a test step whose runner Atlas cannot name' });

  const where = found.kind === 'repository' ? 'this repository' : found.kind === 'part' ? `the part ${found.part}` : found.kind === 'directory' ? `${found.path}/` : found.path;
  const sentences = [
    found.kind === 'file'
      ? (facts.reach ? reachSentence(facts.reach, found.path) : `Atlas: no test imports or runs ${found.path}.`)
      : `Atlas: ${items.length + rest === 0 ? 'a test imports or runs every code file in' : `${items.length + rest} code ${items.length + rest === 1 ? 'gap' : 'gaps'} in`} ${where}${rest > 0 ? `; the ${items.length} ranked highest are listed, with ${suggestionsLeft > 0 ? `${suggestionsLeft} more suggestions among the rest` : 'none of the rest'}` : ''}.`,
    ...(suggestions.length > 0 ? [`Atlas: ${suggestions.length} ${suggestions.length === 1 ? 'suggestion follows' : 'suggestions follow'}, each with its rule, the facts that triggered it and its source.`] : []),
    ...cannotSee.map((entry) => (entry.reason === 'a test step whose runner Atlas cannot name'
      ? `Atlas cannot name the runner of ${entry.count === 1 ? 'a test step' : `${entry.count} test steps`}, listed as data; ${entry.count === 1 ? 'it' : 'any of them'} may run the tests a fact says nothing runs.`
      : cannotSeeSentence(entry))),
  ];
  return {
    ok: true,
    answer: { question: { path: path ?? null }, found, facts: groups, suggestions, cannotSee },
    sentences,
    files: found.kind === 'file' ? [found.path] : [],
  };
}
