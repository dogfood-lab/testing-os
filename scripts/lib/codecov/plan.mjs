import picomatch from 'picomatch';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { checkRecipe, configProblems, filterTakes } from './check.mjs';
import {
  CHECKOUT, CHECKOUT_TAG, CLI_VERSION, CODECOV, CODECOV_TAG, CODECOV_YML, COVERAGE_ARTIFACT,
  DOWNLOAD, DOWNLOAD_TAG, EVENTS, OTHER_CONFIGS, RESULTS_ARTIFACT, UPLOAD, UPLOAD_TAG,
} from './recipe.mjs';
import { reportEdit } from './runners.mjs';

const SUPPORTED = new Set(['vitest', 'pytest', 'node --test']);
const STATUS = /^!?\s*(success|failure|always|cancelled)\(\)$/;
const UNIT = 2;

/**
 * The edit that moves a repository to recipe v2: which test step carries
 * the reports, what it and its workflow gain, and codecov.yml. Each file is
 * edited as text, where its lines are, so everything the tool does not
 * change keeps its comments and layout; the result is checked against the
 * recipe before it is offered. When the repository's shape leaves an edit
 * uncertain, the plan is for a person, with the reasons.
 *
 * @param {object} input
 * @param {Map<string, string>} input.files the recipe files (check.mjs readRecipeFiles)
 * @param {(path: string) => string | null} input.read any file of the repository
 * @param {{ workflows: object[], boundaries: object[] | null }} input.facts Atlas's facts (facts.mjs)
 * @param {string} [input.step] workflow:job:step, to name the test step
 * @returns {{ status: 'ready' | 'hand' | 'done', target: object | null, reasons: string[], changes: string[], files: Array<{ path: string, before: string | null, after: string }>, atlas: { version: string | null, remap: boolean } }}
 */
export function planRepository({ files, read, facts, step: chosen = null }) {
  const plan = { status: 'ready', target: null, reasons: [], changes: [], files: [], atlas: { version: atlasVersion(files), remap: false } };
  const hand = (...reasons) => ({ ...plan, status: 'hand', reasons, changes: [], files: [] });
  if (checkRecipe(files).problems.length === 0) return { ...plan, status: 'done' };
  for (const path of OTHER_CONFIGS) {
    if (files.has(path)) return hand(`${path} holds Codecov settings; recipe v2 keeps them in codecov.yml alone, so merge it by hand`);
  }
  if (files.has('codecov.yml')) {
    const problems = configProblems(files.get('codecov.yml'));
    if (problems.length > 0) return hand(`codecov.yml exists and differs from recipe v2: ${problems.join('; ')}`);
  }
  const choice = chooseRun(facts, chosen);
  if (choice.reason) return hand(choice.reason);
  const { workflow, job, step, runs } = choice;
  const file = workflow.replace(/^\.github\/workflows\//, '');
  plan.target = { workflow, job, step, runner: runs[0].runner };
  const text = files.get(workflow);
  if (text == null) return hand(`${workflow} is not in the repository`);
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return hand(`${file} is not valid YAML`);
  const jobs = doc.get('jobs', true);
  const jobPair = isMap(jobs) ? jobs.items.find((pair) => keyOf(pair) === job) : null;
  const jobMap = jobPair?.value;
  const stepsPair = isMap(jobMap) ? jobMap.items.find((pair) => keyOf(pair) === 'steps') : null;
  if (!isSeq(stepsPair?.value)) return hand(`${file} has no job ${job} with steps`);
  const steps = stepsPair.value.items;
  const named = steps.filter((node) => isMap(node) && node.get('name') === step);
  const stepNode = named.length === 1 ? named[0] : named.length === 0 && /^\d+$/.test(step) ? steps[Number(step)] : null;
  if (!isMap(stepNode)) return hand(`${file} job ${job} has ${named.length} steps named "${step}"`);
  const label = describeStep(file, step);
  if (!standardIndent(text, jobPair, stepsPair, steps)) return hand(`${file} is not indented two spaces at a time, as the tool writes; edit it by hand`);
  if (isMap(jobMap.get('env', true)) && jobMap.get('env', true).has('COVERAGE_LEG')) return hand(`${file} job ${job} already sets COVERAGE_LEG; finish that edit by hand`);
  if (jobs.items.some((pair) => keyOf(pair) === 'codecov')) return hand(`${file} already has a job named codecov; finish that edit by hand`);
  for (const pair of jobs.items) {
    if (keyOf(pair) === job || !isMap(pair.value)) continue;
    const other = pair.value.get('steps', true);
    if (isSeq(other) && other.items.some(isCodecovStep)) return hand(`${file} job ${keyOf(pair)} uploads to Codecov too; fold it into the new codecov job by hand`);
  }
  for (const [path, other] of files) {
    if (path !== workflow && path.startsWith('.github/workflows/') && /codecov\/codecov-action@/.test(other)) return hand(`${path.replace(/^\.github\/workflows\//, '')} uploads to Codecov too; fold it into the new codecov job by hand`);
  }
  // A step that runs on every leg keeps the leg the old upload ran on.
  const oldUpload = steps.find(isCodecovStep);
  const leg = legOf(stepNode.get('if'), jobMap.getIn(['strategy', 'matrix']), oldUpload?.get('if'));
  if (leg.reason) return hand(`${label} runs when ${leg.reason}; the tool picks a leg only from matrix values`);
  const run = stepNode.get('run');
  if (typeof run !== 'string') return hand(`${label} runs no shell text`);
  const edit = reportEdit({
    runner: runs[0].runner,
    run,
    through: runs[0].through,
    dir: runs[0].dir ?? '',
    dirs: runs.map((entry) => entry.dir ?? ''),
    coverage: runs.some((entry) => entry.coverage),
    config: runs[0].config,
    env: envNames(doc, jobMap, stepNode),
    jobText: steps.filter(isMap).map((node) => node.get('run')).filter((value) => typeof value === 'string').join('\n'),
    read,
  });
  if (edit.reason) return hand(edit.reason);

  const edits = [];
  const insertAt = (at, added) => edits.push({ start: at, end: at, text: added, order: edits.length });
  const replace = (start, end, added) => edits.push({ start, end, text: added, order: edits.length });
  const stepCol = column(text, stepNode.items[0].key.range[0]);
  const dashCol = stepCol - 2;
  const sep = blankBetween(text, steps) ? '\n' : '';
  const expression = leg.terms.length > 0 ? `\${{ ${leg.terms.join(' && ')} && (${EVENTS}) }}` : `\${{ ${EVENTS} }}`;

  // COVERAGE_LEG, on the job.
  const legLines = [
    ...(leg.terms.length > 0
      ? ["# 'true' on the one leg whose coverage and test results go to Codecov,", '# on a pull request or a push to the default branch.']
      : ["# 'true' on a pull request or a push to the default branch, the runs", '# whose coverage and test results go to Codecov.']),
    `COVERAGE_LEG: ${expression}`,
  ];
  const jobEnv = jobMap.items.find((pair) => keyOf(pair) === 'env');
  if (jobEnv == null) {
    insertAt(leadIn(text, lineStart(text, stepsPair.key.range[0])), indent(['env:', ...legLines.map((line) => `  ${line}`)], column(text, stepsPair.key.range[0])));
  } else if (isMap(jobEnv.value) && !jobEnv.value.flow && jobEnv.value.items.length > 0) {
    insertAt(endOfLine(text, contentEnd(jobEnv.value)), indent(legLines, column(text, jobEnv.value.items[0].key.range[0])));
  } else return hand(`${file} job ${job} sets env in a way the tool does not extend; add COVERAGE_LEG by hand`);

  // The step: an id to read its outcome by, and the flags or variables that
  // make it write both reports.
  let id = stepNode.get('id');
  if (id == null) {
    const taken = new Set(steps.filter(isMap).map((node) => node.get('id')));
    id = ['tests', 'tests-for-codecov'].find((candidate) => !taken.has(candidate));
    const name = stepNode.items.find((pair) => keyOf(pair) === 'name');
    if (name) insertAt(endOfLine(text, name.value.range[1]), `${' '.repeat(stepCol)}id: ${id}\n`);
    else insertAt(stepNode.items[0].key.range[0], `id: ${id}\n${' '.repeat(stepCol)}`);
  }
  if (edit.run != null && edit.run !== run) {
    const scalar = stepNode.items.find((pair) => keyOf(pair) === 'run').value;
    const change = scalarInsert(text, scalar, run, edit.run);
    if (change.reason) return hand(`${label}: ${change.reason}`);
    insertAt(change.at, change.text);
  }
  const stepEnd = endOfLine(text, contentEnd(stepNode));
  if (edit.env) {
    const entries = Object.entries(edit.env).map(([name, value]) => `${name}: ${value}`);
    const comment = 'NODE_V8_COVERAGE' in edit.env
      ? ['# On the coverage leg every Node process the tests start leaves raw V8', '# coverage outside the tree, and the test runner also writes JUnit to', '# junit.xml where it runs; elsewhere both variables are empty, which', '# Node reads as unset.']
      : ['# On the coverage leg the test runner also writes JUnit to junit.xml', '# where it runs; elsewhere the variable is empty, which Node reads as', '# unset.'];
    const stepEnv = stepNode.items.find((pair) => keyOf(pair) === 'env');
    if (stepEnv == null) insertAt(stepEnd, indent([...comment, 'env:', ...entries.map((entry) => `  ${entry}`)], stepCol));
    else if (isMap(stepEnv.value) && !stepEnv.value.flow && stepEnv.value.items.length > 0) insertAt(endOfLine(text, contentEnd(stepEnv.value)), indent([...comment, ...entries], column(text, stepEnv.value.items[0].key.range[0])));
    else return hand(`${label} sets env in a way the tool does not extend; add ${Object.keys(edit.env).join(' and ')} by hand`);
  }
  const defaultDir = cleanDir(jobMap.getIn(['defaults', 'run', 'working-directory']) ?? doc.getIn(['defaults', 'run', 'working-directory']) ?? '');
  for (const extra of edit.after ?? []) {
    const lines = [
      ...(extra.run.includes('--temp-directory')
        ? ['# One lcov report from the raw coverage every Node process of the', '# tests left. The exact version keeps npx from fetching whichever c8', '# is newest on the day.']
        : ['# Codecov reads lcov. c8 reports again, from the coverage it has', '# just collected, in that format.']),
      `- name: ${extra.name}`,
      "  if: ${{ env.COVERAGE_LEG == 'true' }}",
      `  run: ${extra.run}`,
      ...(extra.dir !== defaultDir ? [`  working-directory: ${extra.dir === '' ? '.' : extra.dir}`] : []),
    ];
    insertAt(stepEnd, sep + indent(lines, dashCol));
  }
  insertAt(stepEnd, sep + indent([
    '# The codecov job below uploads what these two steps save; this job',
    '# never holds an OIDC token. Coverage is saved when the tests passed,',
    '# and test results whenever they ran, failures included, because a',
    '# failing test is what that report exists to show. A save step with no',
    '# file to save fails the job. overwrite lets a re-run of this job',
    "# replace the artifact its earlier attempt saved.",
    ...saveStep('Save coverage for Codecov', "${{ env.COVERAGE_LEG == 'true' }}", COVERAGE_ARTIFACT, edit.coverage),
  ], dashCol) + sep + indent(saveStep('Save test results for Codecov', `\${{ !cancelled() && env.COVERAGE_LEG == 'true' && steps.${id}.outcome != 'skipped' }}`, RESULTS_ARTIFACT, edit.results), dashCol));

  // The old uploads, gone with the comments written just above them.
  const removed = [];
  steps.forEach((node, index) => {
    if (!isCodecovStep(node)) return;
    removed.push(node.get('name') ?? `step ${index}`);
    const dashLine = lineStart(text, node.range[0]);
    let start = commentLead(text, dashLine, dashCol);
    const end = endOfLine(text, contentEnd(node));
    if (isBlank(text, previousLine(text, start)) && (end >= text.length || isBlank(text, end))) start = previousLine(text, start);
    replace(start, end, '');
  });

  // The codecov job, right after the test job.
  const checkoutStep = steps.find((node) => isMap(node) && String(node.get('uses') ?? '').startsWith('actions/checkout@'));
  const checkout = checkoutStep ? text.slice(checkoutStep.get('uses', true).range[0], endOfLine(text, checkoutStep.get('uses', true).range[1]) - 1).trimEnd() : `${CHECKOUT} # ${CHECKOUT_TAG}`;
  insertAt(jobEnd(text, jobMap, column(text, jobPair.key.range[0])), `\n${indent(codecovJob(job, checkout, edit, sep), column(text, jobPair.key.range[0]))}`);

  // codecov.yml into each paths filter.
  const joined = [];
  for (const event of ['push', 'pull_request']) {
    const trigger = doc.getIn(['on', event], true);
    if (!isMap(trigger)) continue;
    const ignored = trigger.get('paths-ignore');
    if (ignored != null && filterTakes([...(ignored.items ?? [])].map((item) => String(item.value ?? item)), 'codecov.yml')) return hand(`${file}: the ${event} paths-ignore filter leaves out codecov.yml; change it by hand`);
    const paths = trigger.get('paths', true);
    if (paths == null) continue;
    if (!isSeq(paths) || paths.flow || paths.items.length === 0) return hand(`${file}: the ${event} paths filter is written in flow style; add codecov.yml to it by hand`);
    if (filterTakes(paths.items.map((item) => String(item.value)), 'codecov.yml')) continue;
    const last = paths.items.at(-1);
    const quote = { "'": "'", '"': '"' }[text[last.range[0]]] ?? '';
    const itemCol = column(text, last.range[0]) - 2;
    insertAt(endOfLine(text, last.range[1]), indent(['# Codecov reads its status and comment settings from this file.', `- ${quote}codecov.yml${quote}`], itemCol));
    joined.push(event);
  }

  const after = applyEdits(text, edits);
  const reread = parseDocument(after);
  if (reread.errors.length > 0) return hand(`the tool's edit of ${file} is not valid YAML; edit it by hand (${reread.errors[0].message.split('\n')[0]})`);
  const out = new Map(files);
  out.set(workflow, after);
  if (!files.has('codecov.yml')) out.set('codecov.yml', CODECOV_YML);
  const left = checkRecipe(out).problems;
  if (left.length > 0) return hand(...left.map((problem) => `the tool's edit would still differ from recipe v2: ${problem}`));

  plan.files.push({ path: workflow, before: text, after });
  if (!files.has('codecov.yml')) plan.files.push({ path: 'codecov.yml', before: null, after: CODECOV_YML });
  plan.atlas.remap = !files.has('codecov.yml') && facts.boundaries != null && !facts.boundaries.some((boundary) => boundary.globs.some((glob) => picomatch(glob, { dot: true })('codecov.yml')));
  plan.changes.push(
    `${file} job ${job}: COVERAGE_LEG is true ${leg.terms.length > 0 ? `where ${leg.terms.join(' && ')}, ` : ''}on a pull request or a push to the default branch`,
    `${label}: writes coverage to ${edit.coverage.join(', ')} and test results to ${edit.results.join(', ')}`,
    ...(edit.after ?? []).map((extra) => `${file} job ${job}: step "${extra.name}" writes the lcov report`),
    `${file} job ${job}: two steps save them for Codecov on that leg`,
    ...removed.map((name) => `${file}: the old Codecov upload ${/^step \d+$/.test(name) ? name : `"${name}"`} is removed`),
    `${file}: a codecov job uploads both with OIDC, running none of the repository's code`,
    ...(joined.length > 0 ? [`${file}: codecov.yml joins the ${joined.join(' and ')} paths filter${joined.length > 1 ? 's' : ''}`] : []),
    ...(files.has('codecov.yml') ? [] : ['codecov.yml: new; both statuses informational, the comment without the project figure']),
  );
  return plan;
}

// ------------------------------------------------------------ the target

function chooseRun(facts, chosen) {
  const ci = (trigger) => trigger.event === 'pull_request' || (trigger.event === 'push' && !((trigger.tags?.length ?? 0) > 0 && (trigger.branches?.length ?? 0) === 0));
  const runs = facts.workflows
    .filter((workflow) => workflow.triggers.some(ci))
    .flatMap((workflow) => workflow.tests
      .filter((run) => !(run.through ?? []).some((hop) => hop.startsWith('.github/workflows/')))
      .map((run) => ({ ...run, workflow: workflow.file, pr: workflow.triggers.some((trigger) => trigger.event === 'pull_request') })));
  let pool;
  let kind = 'could carry the reports';
  if (chosen != null) {
    const [flow, job, ...rest] = chosen.split(':');
    pool = runs.filter((run) => (run.workflow === flow || run.workflow === `.github/workflows/${flow}`) && run.job === job && run.step === rest.join(':'));
    if (pool.length === 0) return { reason: `no test step is ${chosen}; Atlas finds ${[...new Set(runs.map(describeRun))].sort().join(', ') || 'none'}` };
  } else {
    const covered = runs.filter((run) => run.coverage);
    if (covered.length > 0) {
      pool = covered;
      kind = 'collects coverage';
    } else {
      pool = runs.filter((run) => SUPPORTED.has(run.runner));
      if (pool.length === 0) pool = runs.filter((run) => run.runner != null);
    }
    if (pool.length === 0) return { reason: runs.length === 0 ? 'Atlas finds no test step in a workflow that runs on pull requests or pushes' : 'Atlas names no runner for any test step' };
  }
  const groups = new Map();
  for (const run of pool) {
    const key = `${run.workflow}\0${run.job}\0${run.step}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  let keys = [...groups.keys()];
  if (keys.length > 1 && keys.some((key) => groups.get(key)[0].pr)) keys = keys.filter((key) => groups.get(key)[0].pr);
  if (keys.length > 1) return { reason: `more than one test step ${kind}: ${keys.map((key) => describeRun(groups.get(key)[0])).sort().join(', ')}; name one with --step workflow:job:step` };
  const [first] = groups.get(keys[0]);
  return { workflow: first.workflow, job: first.job, step: first.step, runs: groups.get(keys[0]) };
}

function describeRun(run) {
  return `${run.workflow.replace(/^\.github\/workflows\//, '')} job ${run.job} ${/^\d+$/.test(run.step) ? `step ${run.step}` : `step "${run.step}"`}`;
}

function describeStep(file, step) {
  return /^\d+$/.test(step) ? `${file} step ${step}` : `${file} step "${step}"`;
}

/**
 * The leg a step's reports are saved on: the matrix values its `if:` fixes,
 * and the first value of each axis it leaves open (an ubuntu runner first).
 * A condition that is not a matrix value leaves no leg to pick.
 */
function legOf(condition, matrix, fallback = null) {
  const terms = [];
  const fixed = new Set();
  if (fallback != null) {
    const own = legOf(condition, null);
    const old = legOf(fallback, null);
    if (!own.reason && own.terms.length === 0 && !old.reason && old.terms.length > 0) return legOf(fallback, matrix);
  }
  if (condition != null) {
    const raw = String(condition).trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
    const either = splitTop(raw, '||');
    if (either.length > 1) {
      if (!either.every((part) => STATUS.test(part.trim()))) return { reason: raw };
    } else {
      for (const term of splitTop(raw, '&&').map((part) => part.trim())) {
        if (STATUS.test(term)) continue;
        const match = /^matrix\.([A-Za-z0-9_-]+)\s*==\s*(.+)$/.exec(term);
        if (!match) return { reason: raw };
        terms.push(`matrix.${match[1]} == ${match[2].trim()}`);
        fixed.add(match[1]);
      }
    }
  }
  if (matrix == null) return { terms };
  if (typeof matrix === 'string' || !isMap(matrix)) return fixed.size > 0 ? { terms } : { reason: 'the matrix is an expression' };
  for (const pair of matrix.items) {
    const key = keyOf(pair);
    if (key === 'include' || key === 'exclude' || fixed.has(key) || !isSeq(pair.value) || pair.value.items.length < 2) continue;
    const values = pair.value.items.map((item) => item.value);
    const value = values.find((entry) => /^ubuntu/.test(String(entry))) ?? values[0];
    terms.push(`matrix.${key} == ${typeof value === 'string' ? `'${value}'` : String(value)}`);
  }
  return { terms };
}

// The parts of an expression split at an operator outside quotes and parentheses.
function splitTop(text, operator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (depth === 0 && text.startsWith(operator, i)) {
      parts.push(text.slice(from, i));
      from = i + operator.length;
      i += operator.length - 1;
    }
  }
  parts.push(text.slice(from));
  return parts;
}

// ------------------------------------------------------------ rendering

function saveStep(name, condition, artifact, paths) {
  return [
    `- name: ${name}`,
    `  if: ${condition}`,
    `  uses: ${UPLOAD} # ${UPLOAD_TAG}`,
    '  with:',
    `    name: ${artifact}`,
    ...(paths.length === 1 ? [`    path: ${paths[0]}`] : ['    path: |', ...paths.map((path) => `      ${path}`)]),
    '    if-no-files-found: error',
    '    retention-days: 3',
    '    overwrite: true',
  ];
}

function codecovJob(job, checkout, edit, sep) {
  const hashes = (paths) => paths.map((path) => `'${path}'`).join(', ');
  const uploads = (paths) => paths.map((path) => `./${path}`).join(',');
  const steps = [
    [`- uses: ${checkout}`, '  with:', '    persist-credentials: false'],
    [
      '# Each artifact unpacks where the test job wrote its files. A pattern',
      '# that matches nothing, unlike a name, does not fail: a failing test',
      '# run saves test results and no coverage.',
      '- name: Download coverage',
      `  uses: ${DOWNLOAD} # ${DOWNLOAD_TAG}`,
      '  with:',
      `    pattern: ${COVERAGE_ARTIFACT}`,
      `    path: ${ancestor(edit.coverage)}`,
    ],
    ['- name: Download test results', `  uses: ${DOWNLOAD} # ${DOWNLOAD_TAG}`, '  with:', `    pattern: ${RESULTS_ARTIFACT}`, `    path: ${ancestor(edit.results)}`],
    [
      '# After a passing test job both artifacts exist, so each upload runs,',
      '# and fails the job if its files are missing; after a failing one each',
      '# runs when its files arrived. Both sign in with OIDC, fail the job when',
      '# Codecov refuses the report, and run the Codecov CLI at a fixed version',
      '# rather than whichever is newest.',
      '- name: Upload coverage to Codecov',
      `  if: \${{ needs.${job}.result == 'success' || hashFiles(${hashes(edit.coverage)}) != '' }}`,
      `  uses: ${CODECOV} # ${CODECOV_TAG}`,
      '  with:',
      `    version: ${CLI_VERSION}`,
      '    use_oidc: true',
      '    fail_ci_if_error: true',
      '    disable_search: true',
      `    files: ${uploads(edit.coverage)}`,
    ],
    [
      '- name: Upload test results to Codecov',
      `  if: \${{ needs.${job}.result == 'success' || hashFiles(${hashes(edit.results)}) != '' }}`,
      `  uses: ${CODECOV} # ${CODECOV_TAG}`,
      '  with:',
      `    version: ${CLI_VERSION}`,
      '    use_oidc: true',
      '    fail_ci_if_error: true',
      '    report_type: test_results',
      '    disable_search: true',
      `    files: ${uploads(edit.results)}`,
    ],
  ];
  const head = [
    'codecov:',
    '  # Uploads what the test job saved, from a job of its own, so the OIDC',
    '  # token that signs in to Codecov never exists beside the install and the',
    '  # tests. The checkout, which keeps no token, is there only so Codecov can',
    '  # match report paths to files: the job installs nothing and runs none of',
    "  # the repository's code. It runs whenever the test job ran, failures",
    '  # included, so failing tests still reach Codecov, and only on the events',
    '  # that collect coverage. A run the concurrency group cancels uploads',
    '  # nothing, and each run reads only its own artifacts.',
    `  needs: ${job}`,
    `  if: \${{ !cancelled() && needs.${job}.result != 'cancelled' && needs.${job}.result != 'skipped' && (${EVENTS}) }}`,
    '  runs-on: ubuntu-latest',
    '  timeout-minutes: 10',
    '  permissions:',
    '    contents: read',
    '    id-token: write',
    '  steps:',
  ];
  const body = steps.map((lines) => lines.map((line) => `    ${line}`).join('\n')).join(sep === '' ? '\n' : '\n\n');
  return [...head, body];
}

// The directory every path lies under, where an artifact of them unpacks.
function ancestor(paths) {
  const dirs = paths.map((path) => path.split('/').slice(0, -1));
  const common = [];
  for (let i = 0; dirs.every((parts) => i < parts.length && parts[i] === dirs[0][i]); i += 1) common.push(dirs[0][i]);
  return common.length === 0 ? '.' : common.join('/');
}

function indent(lines, col) {
  return `${lines.flatMap((line) => line.split('\n')).map((line) => (line === '' ? '' : `${' '.repeat(col)}${line}`)).join('\n')}\n`;
}

// ------------------------------------------------------------ text

function applyEdits(text, edits) {
  let out = text;
  const sorted = [...edits].sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start) || b.order - a.order);
  for (const edit of sorted) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return out;
}

/**
 * Where a node's own text ends: the end of its last scalar. A collection's
 * range can run on over the comments after it, into the next key.
 */
function contentEnd(node) {
  if (isMap(node) || isSeq(node)) {
    const last = node.items.at(-1);
    if (last == null) return node.range[1];
    return contentEnd(isMap(node) ? last.value ?? last.key : last);
  }
  return node.range[1];
}

// A job's end: its last line, and the comments indented under it after that.
// A comment at the job's own indentation already belongs to the next job.
function jobEnd(text, jobMap, col) {
  let at = endOfLine(text, contentEnd(jobMap));
  let end = at;
  while (at < text.length) {
    const close = text.indexOf('\n', at);
    const next = close === -1 ? text.length : close + 1;
    const line = text.slice(at, next);
    if (line.trim() !== '') {
      if (!line.trimStart().startsWith('#') || line.length - line.trimStart().length <= col) break;
      end = next;
    }
    at = next;
  }
  return end;
}

function lineStart(text, offset) {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

// Just past the newline that ends the line holding the character before `offset`.
function endOfLine(text, offset) {
  const at = text.indexOf('\n', Math.max(0, offset - 1));
  return at === -1 ? text.length : at + 1;
}

function column(text, offset) {
  return offset - lineStart(text, offset);
}

function previousLine(text, start) {
  return start === 0 ? 0 : lineStart(text, start - 1);
}

function isBlank(text, start) {
  const end = text.indexOf('\n', start);
  return text.slice(start, end === -1 ? text.length : end).trim() === '';
}

function isComment(text, start) {
  const end = text.indexOf('\n', start);
  return text.slice(start, end === -1 ? text.length : end).trimStart().startsWith('#');
}

// The start of the blank and comment lines that lead into the line at `start`.
function leadIn(text, start) {
  let at = start;
  while (at > 0) {
    const previous = previousLine(text, at);
    if (!isBlank(text, previous) && !isComment(text, previous)) break;
    at = previous;
  }
  return at;
}

// The start of the comment lines written at a step's own indentation just above it.
function commentLead(text, start, col) {
  let at = start;
  while (at > 0) {
    const previous = previousLine(text, at);
    const line = text.slice(previous, at);
    if (!isComment(text, previous) || line.length - line.trimStart().length !== col) break;
    at = previous;
  }
  return at;
}

// Whether the job's steps are set apart by blank lines.
function blankBetween(text, steps) {
  for (let i = 1; i < steps.length; i += 1) {
    // The whole lines between one step and the next; none when they touch.
    const gap = text.slice(endOfLine(text, contentEnd(steps[i - 1])), lineStart(text, steps[i].range[0]));
    if (gap.split('\n').slice(0, -1).some((line) => line.trim() === '')) return true;
  }
  return false;
}

// Two spaces a level, and each step's `- ` two past its key, as the tool writes.
function standardIndent(text, jobPair, stepsPair, steps) {
  const jobCol = column(text, jobPair.key.range[0]);
  const stepsCol = column(text, stepsPair.key.range[0]);
  return jobCol === UNIT && stepsCol === jobCol + UNIT && steps.every((node) => {
    const start = isMap(node) ? node.items[0]?.key?.range?.[0] : node?.range?.[0];
    return start != null && column(text, start) === stepsCol + UNIT + 2 && text.slice(start - 2, start) === '- ';
  });
}

/**
 * Where to add text inside a run: value, as the scalar is written. Plain and
 * quoted scalars on one line, and literal blocks, map the value's offsets to
 * the file's; other styles fold lines, and are left for a person.
 */
function scalarInsert(text, scalar, before, after) {
  let at = 0;
  while (at < before.length && before[at] === after[at]) at += 1;
  const added = after.slice(at, at + after.length - before.length);
  if (before.slice(at) !== after.slice(at + added.length)) return { reason: 'the tool changes a run text only by adding to it' };
  const [start, end] = scalar.range;
  const source = text.slice(start, end);
  if (scalar.type === 'PLAIN' && !source.includes('\n') && source === before) return { at: start + at, text: added };
  if (scalar.type === 'QUOTE_SINGLE' && !source.includes('\n') && !source.slice(1, -1).includes("''")) return { at: start + 1 + at, text: added.replaceAll("'", "''") };
  if (scalar.type === 'QUOTE_DOUBLE' && !source.includes('\n') && !source.includes('\\')) return { at: start + 1 + at, text: added.replaceAll('"', '\\"') };
  if (scalar.type === 'BLOCK_LITERAL') {
    const header = text.indexOf('\n', start) + 1;
    const lines = text.slice(header, end).split('\n');
    const explicit = /^\|[+-]?([1-9])|^\|([1-9])/.exec(source);
    const own = explicit ? column(text, start) - column(text, start) + Number(explicit[1] ?? explicit[2]) : Math.min(...lines.filter((line) => line.trim() !== '').map((line) => line.length - line.trimStart().length));
    let offset = header;
    let seen = 0;
    for (const line of lines) {
      const value = line.length >= own ? line.slice(own) : '';
      if (at <= seen + value.length) return { at: offset + (line.length >= own ? own : line.length) + (at - seen), text: added };
      seen += value.length + 1;
      offset += line.length + 1;
    }
  }
  return { reason: `its run text is written as a ${scalar.type.toLowerCase().replace('_', ' ')} scalar, which the tool does not edit; add the flags by hand` };
}

// ------------------------------------------------------------ reading

function keyOf(pair) {
  return isScalar(pair.key) ? pair.key.value : pair.key;
}

function isCodecovStep(node) {
  return isMap(node) && /^codecov\/codecov-action@/.test(String(node.get('uses') ?? ''));
}

function envNames(doc, jobMap, stepNode) {
  const out = new Set();
  for (const env of [doc.get('env', true), jobMap.get('env', true), stepNode.get('env', true)]) {
    if (isMap(env)) for (const pair of env.items) out.add(String(keyOf(pair)));
  }
  return out;
}

function cleanDir(dir) {
  return String(dir).replace(/^\.\/?/, '').replace(/\/$/, '');
}

// The Atlas version a workflow checks the committed map with.
function atlasVersion(files) {
  for (const [path, text] of files) {
    if (!path.startsWith('.github/workflows/')) continue;
    const match = /@dogfood-lab\/atlas@(\d+\.\d+\.\d+)/.exec(text);
    if (match) return match[1];
  }
  return null;
}
