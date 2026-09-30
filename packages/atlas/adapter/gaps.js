import { isAbsolute, posix, relative } from 'node:path';
import { isRefShaped } from '../sidecar/git.js';
import { formatFailure } from './errors.js';
import { mapLine, readAnswerMap, refFields } from './explain.js';
import { count, list } from './page.js';
import { SHOWN, testGaps } from './test-gaps.js';
import { testReachOf } from './test-reach.js';

/**
 * atlas gaps [path]: what no test imports or runs, and what should reach
 * it, in the repository, one part, one directory or one file, read from the
 * committed map alone (docs/atlas-test-gaps.spec.md, "Where it answers").
 * Facts come first, then suggestions, each naming its rule, the facts that
 * triggered it and the source of what it suggests. Code gaps are ranked and
 * five are shown, with a count of the rest; hygiene items stand apart. It
 * never maps, writes nothing, and makes no network call; given --ref, it
 * answers from the map that ref holds, read with git.
 */

function parseArgs(argv) {
  let json = false;
  let target = null;
  let ref = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--ref') {
      ref = argv[i + 1];
      if (!isRefShaped(ref)) return { error: 'atlas: --ref needs a ref, such as --ref origin/main' };
      i += 1;
    } else if (arg.startsWith('--')) return { error: `atlas: unknown argument ${arg}` };
    else if (target != null) return { error: `atlas: gaps takes at most one path, got ${arg} as well` };
    else target = arg;
  }
  return { json, target, ref };
}

function clean(path) {
  const normal = posix.normalize(path).replace(/\/+$/, '');
  if (normal === '.' || normal === '' || normal === '..' || normal.startsWith('../')) return null;
  return normal.replace(/^(\.\/)+/, '');
}

// A path is tried as written from where the caller stands, then from the
// repository root, as atlas explain reads one.
function candidates(repo, prefix, raw) {
  const given = String(raw).replaceAll('\\', '/');
  if (isAbsolute(given)) return [clean(relative(repo, given).replaceAll('\\', '/'))].filter(Boolean);
  return [...new Set([clean(posix.join(prefix, given)), clean(given)].filter(Boolean))];
}

/**
 * What a question is about: the repository, a part by its name, a file, or
 * a directory holding files of the map. Null for a path the map holds none of.
 */
export function locate(structure, names) {
  const boundaries = structure.boundaries ?? [];
  const partOf = new Map();
  for (const boundary of boundaries) for (const file of boundary.files ?? []) partOf.set(file.path, boundary.name);
  const all = [...boundaries.flatMap((boundary) => boundary.files ?? []), ...(structure.unassigned ?? []), ...(structure.overlaps ?? [])].map((file) => file.path);
  for (const name of names) {
    const part = boundaries.find((boundary) => boundary.name === name);
    if (part) return { kind: 'part', path: null, part: part.name, scope: { files: new Set((part.files ?? []).map((file) => file.path)), parts: new Set([part.name]) } };
  }
  for (const name of names) {
    if (all.includes(name)) {
      // A file in a part no test reaches is answered by that part's gap.
      const part = partOf.get(name) ?? null;
      return { kind: 'file', path: name, part, scope: { files: new Set([name]), parts: new Set(part != null ? [part] : []) } };
    }
  }
  for (const name of names) {
    const under = all.filter((path) => path.startsWith(`${name}/`));
    if (under.length === 0) continue;
    const files = new Set(under);
    // A part every one of whose files lies under the directory is in it.
    const parts = boundaries.filter((boundary) => (boundary.files ?? []).length > 0 && boundary.files.every((file) => files.has(file.path))).map((boundary) => boundary.name);
    return { kind: 'directory', path: name, part: null, scope: { files, parts: new Set(parts) } };
  }
  return null;
}

/**
 * The answer to one question, as fields: what it is about, the facts, the
 * code gaps ranked with the suggestions for each (five shown, with a count
 * of the rest and of the suggestions they hold), and the hygiene items and
 * commands apart.
 *
 * @param {object} structure structure.json
 * @param {{ statistics?: object|null, repository?: string|null, target?: object|null }} [options]
 *   target is a locate() result; none asks about the repository
 */
export function gapsAnswer(structure, { statistics = null, repository = null, target = null } = {}) {
  const found = target ? { kind: target.kind, path: target.path, part: target.part } : { kind: 'repository', path: null, part: null };
  const result = testGaps(structure, { statistics, repository, scope: target?.scope ?? null });
  const reach = testReachOf(structure);
  const boundaries = structure.boundaries ?? [];
  const kindOf = new Map(result.kinds.map((entry) => [entry.part, entry]));
  const allKinds = new Map(testGaps(structure, { statistics, repository }).kinds.map((entry) => [entry.part, entry]));
  const facts = { runs: result.facts.runs, codecov: result.facts.codecov, notAttributed: result.facts.notAttributed, leftOut: result.facts.leftOut };
  if (found.kind === 'file') {
    facts.reach = reach.files.get(found.path) ?? null;
    facts.kind = found.part != null ? allKinds.get(found.part) ?? null : null;
  } else {
    const inside = boundaries.filter((boundary) => boundary.role === 'code' && kindOf.has(boundary.name) && (target == null || target.scope.parts.has(boundary.name)));
    facts.parts = inside.map((boundary) => ({ part: boundary.name, ...kindOf.get(boundary.name), runners: boundary.testRunners ?? [], reach: reach.parts.get(boundary.name) ?? null }));
  }
  facts.notRun = result.facts.notRun.filter((path) => target == null || target.scope.files.has(path));
  // Each shown gap carries its suggestions: a file its G6, a part its G1 and
  // the G6 of every file in it; a question about one file keeps its own.
  const mine = (entry) => found.kind !== 'file' || entry.path == null || entry.path === found.path;
  const items = result.gaps.items.map((gap) => ({ ...gap, suggestions: result.suggestions.filter((entry) => mine(entry) && (gap.path != null ? entry.path === gap.path : entry.part === gap.part)) }));
  const shown = items.reduce((sum, gap) => sum + gap.suggestions.length, 0);
  const suggestionsLeft = result.suggestions.filter(mine).length - shown;
  // Coverage is collected by a run, not by one file: a question about a file
  // keeps only the hygiene item that names it, a test file no workflow runs.
  const hygiene = found.kind === 'file' ? result.hygiene.filter((entry) => entry.rule === 'G2') : result.hygiene;
  return { found, facts, gaps: { items, rest: result.gaps.rest, suggestionsLeft }, hygiene, commands: result.commands };
}

// ---------- the answer in sentences ----------

function ranLine(runs) {
  const attributed = runs.filter((run) => run.runner != null);
  const out = [];
  if (attributed.length > 0) {
    const seen = new Map();
    for (const run of attributed) {
      const key = `${run.runner}\0${(run.through ?? []).join(' → ')}`;
      if (!seen.has(key)) seen.set(key, run);
      else if (run.coverage) seen.get(key).coverage = true;
    }
    const said = [...seen.values()].map((run) => {
      const through = run.through?.length > 0 ? ` through ${run.through.join(' → ')}` : '';
      const files = run.files != null ? ` (${count(run.files, 'test file')})` : '';
      return `${run.runner}${through}${files}, collecting ${run.coverage ? 'coverage' : 'no coverage'}`;
    });
    out.push(`CI runs ${list(said)}.`);
  } else if (runs.length === 0) {
    out.push('No workflow runs tests.');
  }
  for (const run of runs.filter((entry) => entry.runner == null)) {
    const through = run.through?.length > 0 ? `, through ${run.through.join(' → ')}` : '';
    out.push(`A test step Atlas cannot attribute to a runner: ${run.workflow} › ${run.job} › ${run.step}${through}.`);
  }
  return out;
}

function reachSentence(fact) {
  if (fact == null) return null;
  const by = fact.test ?? fact.step;
  const verb = fact.kind === 'imports' ? 'imports' : fact.kind === 'runs' ? 'runs' : 'holds tests a runner finds in';
  if (fact.kind === 'discovers') return `A runner finds tests inside it (${fact.basis}).`;
  // A string in a test spells the file's name: the test may run it, read
  // it, or mean another file of that name.
  if (fact.kind === 'names') {
    const named = fact.through?.length > 0 ? `the name of ${fact.through[0]} in a string, and that file imports it${fact.through.length > 1 ? ` through ${list(fact.through.slice(1))}` : ''}` : 'its name in a string';
    return `${by} spells ${named}; Atlas cannot tell whether that test runs it (${fact.basis}).`;
  }
  const through = fact.through?.length > 0 ? `, through ${list(fact.through)}` : '';
  return `${by} ${verb} it${through} (${fact.basis}).`;
}

function wouldReachText(wouldReach) {
  if (wouldReach?.runners?.length > 0) return `${list(wouldReach.runners)} would reach it`;
  if (wouldReach?.suggested) return `${wouldReach.suggested} would reach it`;
  return 'no runner here would reach it';
}

// A list joined with or, for what no test reaches: none of these.
function either(items) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function gapLine(gap, index) {
  const label = gap.path ? (gap.kind ? `${gap.part}, ${gap.kind.label}` : gap.part) : `a part of ${count(gap.files, 'code file')}${gap.kind ? `, ${gap.kind.label}` : ''}`;
  const what = gap.path ?? gap.part;
  const why = [
    gap.onDoorPath ? 'on the path of a door that ships or runs in CI' : null,
    gap.fanIn > 0 ? `imported by ${count(gap.fanIn, gap.path ? 'file' : 'part')}` : null,
    gap.changes > 0 ? `changed in ${count(gap.changes, 'commit')}` : null,
    gap.failures > 0 ? count(gap.failures, 'failure path') : null,
  ].filter(Boolean);
  return `${index + 1}. ${what} (${label}): no test imports or runs it; ${wouldReachText(gap.wouldReach)}.${why.length > 0 ? ` ${why.join('; ').replace(/^./, (ch) => ch.toUpperCase())}.` : ''}`;
}

function sourceText(source) {
  if (!source) return '';
  const from = source.from === 'house' ? 'house standard' : source.from === 'fleet' ? 'fleet practice' : 'external practice';
  return ` Source (${from}): ${source.text}.`;
}

function findingLine(entry) {
  const runner = entry.suggest?.runner ? ` Runner: ${entry.suggest.runner}.` : '';
  if (entry.rule === 'G6') return `G6 ${entry.path}: ${entry.suggest.text}.${runner}${sourceText(entry.source)}`;
  if (entry.rule === 'G1') return `G1 ${entry.part}: no runner here runs tests of its kind, ${entry.kind.label}: ${entry.suggest.text}.${runner}${sourceText(entry.source)}`;
  if (entry.rule === 'G2') return `G2 ${list(entry.facts.files.slice(0, 6))}${entry.facts.count > 6 ? ` and ${entry.facts.count - 6} more` : ''}, run by no workflow: ${entry.suggest.text}.${sourceText(entry.source)}`;
  if (entry.rule === 'G4') return `G4 CI runs ${list(entry.facts.runners)} and collects no coverage: ${entry.suggest.text}.${sourceText(entry.source)}`;
  if (entry.rule === 'G3') return `G3 ${entry.facts.command} (${entry.facts.entry}): ${entry.facts.reach}. ${entry.suggest.text.replace(/^./, (ch) => ch.toUpperCase())}.${sourceText(entry.source)}`;
  return `${entry.rule}: ${entry.suggest?.text ?? ''}`;
}

function partsLine(parts) {
  const reached = parts.filter((entry) => entry.reach);
  const unreached = parts.filter((entry) => !entry.reach);
  if (parts.length === 0) return null;
  const said = reached.map((entry) => `${entry.part} (${entry.reach.kind === 'names' ? 'spelled in a test\'s string' : entry.reach.kind}, ${entry.reach.reached} of ${count(entry.reach.files, 'file')})`);
  const first = `Tests reach ${reached.length} of ${count(parts.length, 'code part')}${said.length > 0 ? `: ${list(said)}` : ''}.`;
  return unreached.length > 0 ? `${first} No test imports or runs ${either(unreached.map((entry) => entry.part))}.` : first;
}

/** The answer as the command prints it: sentences, the map's commit last. */
export function gapsLines(answer, { mapLine }) {
  const { found, facts } = answer;
  const lines = [];
  if (found.kind === 'repository') lines.push('Test gaps in this repository, from its map.');
  else if (found.kind === 'part') lines.push(`Test gaps in the part ${found.part}, from its map.`);
  else if (found.kind === 'directory') lines.push(`Test gaps in ${found.path}/, from its map.`);
  else lines.push(`Test gaps for ${found.path} (${found.part ?? 'in no part'}${facts.kind ? `, ${facts.kind.label}` : ''}), from its map.`);
  if (found.kind === 'file') {
    const gap = answer.gaps.items.find((item) => item.path === found.path || (item.path == null && item.part === found.part));
    lines.push(reachSentence(facts.reach) ?? `No test imports or runs it; ${wouldReachText(gap?.wouldReach)}.`);
  } else {
    if (found.kind === 'repository') {
      lines.push(...ranLine(facts.runs));
      lines.push(facts.codecov.length > 0 ? `${list(facts.codecov)} ${facts.codecov.length === 1 ? 'uploads' : 'upload'} coverage to Codecov.` : 'No workflow uploads coverage to Codecov.');
    }
    const parts = partsLine(facts.parts);
    if (parts) lines.push(parts);
  }
  const { items, rest, suggestionsLeft } = answer.gaps;
  if (found.kind === 'file') {
    for (const gap of items) for (const entry of gap.suggestions) lines.push(findingLine(entry));
  } else if (items.length > 0) {
    lines.push(rest > 0 ? `Code gaps, the ${SHOWN} ranked highest of ${items.length + rest}:` : 'Code gaps, ranked:');
    items.forEach((gap, index) => {
      lines.push(gapLine(gap, index));
      for (const entry of gap.suggestions) lines.push(`   ${findingLine(entry)}`);
    });
    if (rest > 0) lines.push(`And ${count(rest, 'more code gap', 'more code gaps')}${suggestionsLeft > 0 ? `, with ${count(suggestionsLeft, 'more suggestion', 'more suggestions')}` : ''}; ask about a part, directory or file for its own.`);
  } else {
    lines.push('No code gaps: a test imports or runs every code file here.');
  }
  for (const entry of answer.commands) lines.push(findingLine(entry));
  for (const entry of answer.hygiene) lines.push(findingLine(entry));
  if (facts.leftOut?.length > 0 && found.kind === 'repository') lines.push(`Left out of CI on purpose by their runner's configuration: ${list(facts.leftOut.map((entry) => `${entry.path} (${entry.config})`))}.`);
  lines.push(mapLine);
  return lines;
}

function mapLineOf(statistics, structure, source) {
  return mapLine({
    commit: String(statistics?.generatedFrom?.commit ?? structure.generatedFrom?.commit ?? ''),
    generatedAt: String(statistics?.generatedAt ?? ''),
    source,
  });
}

/**
 * @param {string} repo the repository root
 * @param {string} prefix where the caller stands, from the root
 * @param {string[]} argv
 * @param {{ repository?: string|null }} [options] owner/name, for the house rules one repository keeps
 */
export function gapsCommand(repo, prefix, argv, { repository = null } = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stdout.write(`${args.error}\nexit 2\n`);
    return 2;
  }
  const map = readAnswerMap(repo, args.ref, 'ATLAS_GAPS_NO_MAP');
  if (!map.ok) {
    process.stdout.write(formatFailure(map.code, map.details, { exitCode: 2, whatToDo: map.whatToDo }));
    return 2;
  }
  const structure = { value: map.structure };
  const { statistics, source } = map;
  let target = null;
  if (args.target != null) {
    target = locate(structure.value, candidates(repo, prefix, args.target));
    if (!target) {
      process.stdout.write(formatFailure('ATLAS_GAPS_UNKNOWN_PATH', [`${args.target} names no file, directory or part in the map`], { exitCode: 2, whatToDo: 'check the path, or run atlas map if the files are new' }));
      return 2;
    }
  }
  const answer = gapsAnswer(structure.value, { statistics, repository, target });
  const shown = {
    ...answer,
    ...(source?.ref ? { ref: refFields(source.ref) } : {}),
    ...(source?.upstream ? { upstream: refFields(source.upstream) } : {}),
  };
  process.stdout.write(args.json ? `${JSON.stringify(shown, null, 2)}\n` : `${gapsLines(answer, { mapLine: mapLineOf(statistics, structure.value, source) }).join('\n')}\n`);
  return 0;
}
