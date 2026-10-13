import { appendFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ERRORS } from './errors.js';

/**
 * What atlas check says where people look when it runs in GitHub Actions
 * (docs/atlas-buildup.spec.md, AM-6). A failure email and a pull request's
 * checks tab show the annotations and the step summary, not the log, so
 * without them a red check said only "exit code 1". Each failure becomes an
 * ::error, each door notice a ::warning on the line it was read from, each
 * other notice a ::notice, and the step summary holds the fix. Outside
 * Actions nothing here runs, and the output is as it was.
 */

// GitHub shows ten annotations of each kind for a step; the tenth says how
// many more the log and the summary hold.
const PER_KIND = 10;
// The summary's lists stop here, so a failure over a data dump of thousands
// of files stays readable and far inside GitHub's 1 MiB for a step summary.
const LISTED = 50;
const SUGGESTION_LINES = 100;

const WARNING_CODES = new Set(['ATLAS_DOOR_TOOLCHAIN', 'ATLAS_DOOR_LOCKFILE_PLATFORM']);

export function inActions(env = process.env) {
  return env.GITHUB_ACTIONS === 'true';
}

/**
 * A workflow command's message, escaped as the runner reads it: a repository
 * string holding a newline and :: starts no command of its own.
 */
export function escapeData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** A workflow command's property value, where : and , also delimit. */
export function escapeProperty(text) {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/**
 * A repository path as the runner resolves file=, relative to
 * $GITHUB_WORKSPACE, or null when the repository is not inside the
 * workspace or the workspace is not known, so no annotation names a file
 * GitHub would place wrongly.
 */
export function workspacePath(repo, path, env = process.env) {
  if (!env.GITHUB_WORKSPACE) return null;
  const workspace = real(resolve(env.GITHUB_WORKSPACE));
  const rel = relative(workspace, resolve(real(repo), path));
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/**
 * The annotation lines for a check's failure and notices.
 *
 * @param {{ failure: null | { code: string, details: string[], whatToDo: string, paths?: string[] }, notices: Array<{ code: string, details: string[], whatToDo: string, file?: string, line?: number }>, repo: string, env?: Record<string, string|undefined>, summary: boolean }} input
 *   failure.paths: the repository paths the finding is about, one annotation each
 */
export function annotationLines({ failure, notices, repo, env = process.env, summary }) {
  const where = summary ? 'the log and the step summary list them all' : 'the log lists them all';
  const lines = [];
  if (failure) {
    const sentence = ERRORS[failure.code];
    if (failure.paths?.length > 0) {
      const shown = failure.paths.slice(0, PER_KIND);
      shown.forEach((path, index) => {
        const more = index === PER_KIND - 1 && failure.paths.length > PER_KIND ? ` And ${failure.paths.length - PER_KIND} more files; ${where}.` : '';
        lines.push(command('error', failure.code, workspacePath(repo, path, env), null, `${sentence} ${path}. What to do: ${annotationFix(failure, summary)}.${more}`));
      });
    } else {
      lines.push(command('error', failure.code, null, null, `${sentence} ${detailText(failure.details)} What to do: ${annotationFix(failure, summary)}.`));
    }
  }
  const byKind = { warning: [], notice: [] };
  for (const notice of notices) byKind[WARNING_CODES.has(notice.code) ? 'warning' : 'notice'].push(notice);
  for (const kind of ['warning', 'notice']) {
    const list = byKind[kind];
    list.slice(0, PER_KIND).forEach((notice, index) => {
      const more = index === PER_KIND - 1 && list.length > PER_KIND ? ` And ${list.length - PER_KIND} more notices; ${where}.` : '';
      const file = notice.file ? workspacePath(repo, notice.file, env) : null;
      lines.push(command(kind, notice.code, file, file ? notice.line ?? null : null, `${ERRORS[notice.code]} ${detailText(notice.details)} What to do: ${notice.whatToDo}.${more}`));
    });
  }
  return lines;
}

/**
 * The step summary in Markdown, or '' for a check that passed with nothing
 * to say. Repository strings are set in code spans or code blocks, so none
 * is read as Markdown.
 *
 * @param {{ failure: null | { code: string, details: string[], whatToDo: string, suggestion?: string[] }, notices: Array<{ code: string, details: string[], whatToDo: string, file?: string, line?: number }> }} input
 *   failure.suggestion: the boundary lines check printed, as lines
 */
export function stepSummary({ failure, notices }) {
  if (!failure && notices.length === 0) return '';
  const out = [failure ? '## Atlas check failed' : '## Atlas check passed, with notices', ''];
  if (failure) {
    out.push(`**${failure.code}**: ${ERRORS[failure.code]}`, '');
    for (const detail of failure.details.slice(0, LISTED)) out.push(`- ${inlineCode(detail)}`);
    if (failure.details.length > LISTED) out.push(`- and ${failure.details.length - LISTED} more`);
    out.push('', `**What to do:** ${plain(failure.whatToDo)}.`, '');
    if (failure.suggestion?.length > 0) {
      const lines = failure.suggestion.slice(0, SUGGESTION_LINES);
      if (failure.suggestion.length > SUGGESTION_LINES) lines.push(`and ${failure.suggestion.length - SUGGESTION_LINES} more lines; atlas check prints them all`);
      const fence = fenceFor(lines.join('\n'));
      out.push(`${fence}text`, ...lines, fence, '');
    }
  }
  if (notices.length > 0) {
    out.push('### Notices', '');
    for (const notice of notices.slice(0, LISTED)) {
      const at = notice.file ? ` at ${inlineCode(notice.line != null ? `${notice.file}:${notice.line}` : notice.file)}` : '';
      out.push(`- **${notice.code}**${at}: ${notice.details.map(inlineCode).join('; ')}. **What to do:** ${plain(notice.whatToDo)}.`);
    }
    if (notices.length > LISTED) out.push(`- and ${notices.length - LISTED} more`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

/**
 * Appends to the file $GITHUB_STEP_SUMMARY names: the one file check writes,
 * and never in the checkout. A summary that cannot be written leaves the
 * check's verdict and exit code as they are.
 */
export function writeStepSummary(text, env = process.env) {
  if (!text || !env.GITHUB_STEP_SUMMARY) return false;
  try {
    appendFileSync(env.GITHUB_STEP_SUMMARY, text);
    return true;
  } catch {
    return false;
  }
}

// An annotation stands apart from the log, so "the lines below" says where
// the lines are instead.
function annotationFix(failure, summary) {
  if (!failure.suggestion?.length) return failure.whatToDo;
  return failure.whatToDo.replace('the lines below', summary ? 'the boundary lines in the step summary' : 'the boundary lines in the log');
}

function command(kind, title, file, line, message) {
  const properties = [`title=${escapeProperty(title)}`];
  if (file) properties.push(`file=${escapeProperty(file)}`);
  if (file && line != null) properties.push(`line=${escapeProperty(String(line))}`);
  return `::${kind} ${properties.join(',')}::${escapeData(message)}`;
}

// A detail may end its own sentence, as a door notice's first does; the
// joined text ends once. A detail with no space is a path, kept as it is,
// since a file name may end in a dot.
function detailText(details) {
  const shown = details.slice(0, 3).map((detail) => (/\s/.test(detail) ? detail.replace(/(?<=\w)\.$/, '') : detail)).join('; ');
  return details.length > 3 ? `${shown}; and ${details.length - 3} more.` : `${shown}.`;
}

// A code span holding the text as it is: a newline shown as \n, and a fence
// longer than any run of backticks inside.
function inlineCode(text) {
  const flat = String(text).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const fence = '`'.repeat(longestRun(flat, '`') + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

// Text of the check's own wording, with what Markdown would read escaped,
// since a remedy can name a tool or a path the repository spelled.
function plain(text) {
  return String(text).replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]()#+\-.!<>|~]/g, (char) => `\\${char}`);
}

function fenceFor(text) {
  return '`'.repeat(Math.max(3, longestRun(text, '`') + 1));
}

function longestRun(text, char) {
  let longest = 0;
  let run = 0;
  for (const c of text) {
    run = c === char ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
