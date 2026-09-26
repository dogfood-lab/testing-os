import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { parse } from 'yaml';
import { CLI_VERSION, CODECOV, CODECOV_TAG, DOWNLOAD, DOWNLOAD_TAG, OTHER_CONFIGS, UPLOAD, UPLOAD_TAG } from './recipe.mjs';

/**
 * The files recipe v2 is read from: every workflow, codecov.yml, and any
 * other file Codecov would read its settings from.
 *
 * @param {string} root a checkout
 * @returns {Map<string, string>} repository path to text
 */
export function readRecipeFiles(root) {
  const out = new Map();
  const dir = join(root, '.github', 'workflows');
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (/\.ya?ml$/.test(name)) out.set(`.github/workflows/${name}`, readFileSync(join(dir, name), 'utf8'));
    }
  }
  for (const path of ['codecov.yml', ...OTHER_CONFIGS]) {
    if (existsSync(join(root, path))) out.set(path, readFileSync(join(root, path), 'utf8'));
  }
  return out;
}

/**
 * How a repository's CI differs from recipe v2 (`recipe.mjs`), one sentence
 * each, and a note of when each report is saved.
 *
 * @param {Map<string, string>} files as readRecipeFiles returns them
 * @returns {{ problems: string[], notes: string[] }}
 */
export function checkRecipe(files) {
  const problems = [];
  const notes = [];
  const jobs = [];
  for (const path of [...files.keys()].filter((key) => key.startsWith('.github/workflows/')).sort()) {
    const file = path.slice('.github/workflows/'.length);
    const doc = readYaml(files.get(path));
    if (doc == null) {
      problems.push(`${file}: it is not valid YAML`);
      continue;
    }
    for (const [name, job] of Object.entries(isMapping(doc.jobs) ? doc.jobs : {})) {
      if (stepsOf(job).some((step) => actionOf(step) === 'codecov/codecov-action')) jobs.push({ file, doc, name, job });
    }
  }
  if (jobs.length === 0) return { problems: [...problems, 'no job uses codecov/codecov-action'], notes };
  for (const { file, doc, name, job } of jobs) {
    const where = `${file} job ${name}`;
    const steps = stepsOf(job);
    if (!exactly(job.permissions, { contents: 'read', 'id-token': 'write' })) problems.push(`${where}: its permissions are not exactly contents: read and id-token: write`);
    if (steps.some((step) => 'run' in step)) problems.push(`${where}: it has a run: step`);
    const checkout = steps.find((step) => actionOf(step) === 'actions/checkout');
    if (checkout == null) problems.push(`${where}: it has no checkout (recipe v2 checks out with persist-credentials: false)`);
    else if (checkout.with?.['persist-credentials'] !== false) problems.push(`${where}: its checkout keeps credentials (persist-credentials is not false)`);
    const needs = typeof job.needs === 'string' ? [job.needs] : Array.isArray(job.needs) ? job.needs : [];
    const patterns = steps.filter((step) => actionOf(step) === 'actions/download-artifact' && step.with?.pattern != null).map((step) => picomatch(String(step.with.pattern), { dot: true }));
    const saved = [];
    for (const need of needs) {
      // The saves this job downloads; the needed job's other artifacts are its own business.
      const saves = stepsOf(doc.jobs?.[need]).filter((step) => actionOf(step) === 'actions/upload-artifact' && (patterns.length === 0 || patterns.some((match) => match(String(step.with?.name ?? '')))));
      if (saves.length === 0) problems.push(`${file} job ${need}: it saves no artifact for Codecov`);
      for (const save of saves) {
        const inputs = isMapping(save.with) ? save.with : {};
        const artifact = inputs.name ?? '(unnamed)';
        saved.push(String(artifact));
        if (save.uses !== UPLOAD) problems.push(`${file} job ${need}: save ${artifact} is at ${save.uses}, not ${short(UPLOAD)} (${UPLOAD_TAG})`);
        for (const [key, want] of [['if-no-files-found', 'error'], ['retention-days', 3], ['overwrite', true]]) {
          if (inputs[key] !== want) problems.push(`${file} job ${need}: save ${artifact} has ${key} ${shown(inputs[key])}, not ${want}`);
        }
        notes.push(`${file} job ${need}: saves ${artifact} ${save.if == null ? 'on every run' : `if ${save.if}`}`);
      }
    }
    for (const download of steps.filter((step) => actionOf(step) === 'actions/download-artifact')) {
      const inputs = isMapping(download.with) ? download.with : {};
      if (download.uses !== DOWNLOAD) problems.push(`${where}: download-artifact is at ${download.uses}, not ${short(DOWNLOAD)} (${DOWNLOAD_TAG})`);
      if (inputs.pattern == null) problems.push(`${where}: a download names an artifact instead of a pattern`);
      else if (needs.length > 0 && !needs.some((need) => stepsOf(doc.jobs?.[need]).some((step) => actionOf(step) === 'actions/upload-artifact' && picomatch(String(inputs.pattern), { dot: true })(String(step.with?.name ?? ''))))) {
        problems.push(`${where}: the download pattern ${inputs.pattern} matches no artifact ${needs.length === 1 ? `job ${needs[0]}` : `jobs ${needs.join(', ')}`} saves`);
      }
    }
    const kinds = [];
    for (const upload of steps.filter((step) => actionOf(step) === 'codecov/codecov-action')) {
      const inputs = isMapping(upload.with) ? upload.with : {};
      if (upload.uses !== CODECOV) problems.push(`${where}: codecov-action is at ${upload.uses}, not ${short(CODECOV)} (${CODECOV_TAG})`);
      for (const [key, want] of [['version', CLI_VERSION], ['use_oidc', true], ['fail_ci_if_error', true], ['disable_search', true]]) {
        if (inputs[key] !== want) problems.push(`${where}: an upload has ${key} ${shown(inputs[key])}, not ${want}`);
      }
      if (inputs.files == null || String(inputs.files).trim() === '') problems.push(`${where}: an upload names no files`);
      if ('token' in inputs) problems.push(`${where}: an upload passes a token`);
      kinds.push(String(inputs.report_type ?? 'coverage'));
    }
    kinds.sort();
    if (kinds.join() !== 'coverage,test_results') problems.push(`${where}: it uploads ${kinds.length === 1 ? `${kinds[0]} only` : kinds.join(' and ')}; recipe v2 uploads coverage and test_results`);
    for (const event of ['push', 'pull_request']) {
      const trigger = isMapping(doc.on) ? doc.on[event] : null;
      if (!isMapping(trigger)) continue;
      if (Array.isArray(trigger.paths) && !filterTakes(trigger.paths, 'codecov.yml')) problems.push(`${file}: the ${event} paths filter leaves out codecov.yml`);
      if (Array.isArray(trigger['paths-ignore']) && filterTakes(trigger['paths-ignore'], 'codecov.yml')) problems.push(`${file}: the ${event} paths-ignore filter leaves out codecov.yml`);
    }
  }
  if (!files.has('codecov.yml')) problems.push('no codecov.yml');
  else problems.push(...configProblems(files.get('codecov.yml')).map((problem) => `codecov.yml: ${problem}`));
  for (const path of OTHER_CONFIGS) {
    if (files.has(path)) problems.push(`${path}: Codecov reads settings from here too; recipe v2 keeps them in codecov.yml alone`);
  }
  return { problems: [...new Set(problems)], notes: [...new Set(notes)] };
}

/**
 * How a codecov.yml differs from recipe v2's settings: both statuses
 * informational, and the comment without the project figure.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function configProblems(text) {
  const config = readYaml(text);
  if (config === undefined) return ['it is not valid YAML'];
  const problems = [];
  for (const kind of ['project', 'patch']) {
    if (config?.coverage?.status?.[kind]?.default?.informational !== true) problems.push(`the ${kind} status is not informational`);
  }
  if (config?.comment?.hide_project_coverage !== true) problems.push('hide_project_coverage is not true');
  return problems;
}

/**
 * A reader of a checkout's files by repository path; null for a file that
 * is not there.
 *
 * @param {string} root
 * @returns {(path: string) => string | null}
 */
export function fileReader(root) {
  return (path) => {
    try {
      return readFileSync(join(root, path), 'utf8');
    } catch {
      return null;
    }
  };
}

/**
 * Whether a paths filter takes a file: its patterns in order, a later
 * `!pattern` taking back what an earlier one took, as GitHub reads them.
 */
export function filterTakes(patterns, path) {
  let taken = false;
  for (const raw of patterns) {
    const pattern = String(raw);
    const negated = pattern.startsWith('!');
    if (picomatch(negated ? pattern.slice(1) : pattern, { dot: true })(path)) taken = !negated;
  }
  return taken;
}

// A workflow's text as data; undefined when it is not valid YAML.
function readYaml(text) {
  try {
    return parse(text);
  } catch {
    return undefined;
  }
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stepsOf(job) {
  return isMapping(job) && Array.isArray(job.steps) ? job.steps.filter(isMapping) : [];
}

function actionOf(step) {
  return typeof step.uses === 'string' ? step.uses.replace(/@.*$/, '') : null;
}

function exactly(value, want) {
  if (!isMapping(value)) return false;
  const keys = Object.keys(value);
  return keys.length === Object.keys(want).length && keys.every((key) => value[key] === want[key]);
}

function shown(value) {
  return value === undefined || value === null ? 'unset' : String(value);
}

// A pinned action's commit, short, for a sentence.
function short(ref) {
  return ref.replace(/^.*@/, '').slice(0, 8);
}
