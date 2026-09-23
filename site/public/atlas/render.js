/**
 * The Atlas page, rendered in the browser from page.json.
 *
 * page.json is the data twin of the committed atlas/README.md, written by
 * packages/atlas/adapter/page.js. Every sentence here is built the way that
 * module builds it, from the same fields, so the site and the markdown say the
 * same thing. Where the markdown uses a fact page.json does not carry, the
 * sentence here says only what page.json holds.
 *
 * These are pure functions from data to HTML strings. Nothing reads the clock,
 * the DOM or the network; the page shell does that and passes the results in.
 * Every string that comes from JSON is escaped before it is placed in markup.
 */

const RUNS_SHOWN = 3;
const READERS_DRAWN = 6;
const SENTENCE_STEPS = 7;
const LISTED_STEPS = 12;
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const COMMIT = /^[0-9a-f]{7,40}$/i;
const BRANCH = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;
const PATH = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*\/?$/;
const FOUND_BY_TEXT = ' (found by text)';
const REGENERATE = 'Regenerate with `npx --yes @dogfood-lab/atlas map`.';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * An owner/name pair the page may fetch. A segment made only of dots would
 * walk out of the render directory, so it is refused like any other bad value.
 */
export function isRepo(value) {
  if (typeof value !== 'string' || !REPO.test(value)) return false;
  return value.split('/').every((segment) => !/^\.+$/.test(segment));
}

function segments(path) {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

export function pageDataUrl(atlasBase, repo) {
  return `${atlasBase}indexes/atlas/${segments(repo)}/page.json`;
}

export function historyDataUrl(atlasBase, repo) {
  return `${atlasBase}indexes/atlas/${segments(repo)}/history.json`;
}

export function markdownUrl(repo) {
  return `https://github.com/dogfood-lab/testing-os/blob/atlas-render/indexes/atlas/${segments(repo)}/README.md`;
}

/**
 * The markdown twin where the page is served beside its render files, as the
 * Atlas container serves them under <base>atlas/.
 */
export function servedMarkdownUrl(base, repo) {
  return `${base}atlas/${segments(repo)}/README.md`;
}

/**
 * The base a page reads from when it is its own server's: a same-origin path
 * such as "/". Any other base, the render branch included, is the public site.
 */
export function servedBase(atlasBase) {
  const base = str(atlasBase);
  return base.startsWith('/') && !base.startsWith('//') ? base : null;
}

export function repoHref(repo) {
  return `?repo=${segments(repo)}`;
}

// A place ends in a slash and opens as a tree; anything else opens as a file.
function sourceUrl(ctx, path) {
  if (!ctx.repo || !ctx.commit || !PATH.test(path) || path.split('/').some((s) => /^\.+$/.test(s))) return null;
  const kind = path.endsWith('/') ? 'tree' : 'blob';
  return `https://github.com/${segments(ctx.repo)}/${kind}/${encodeURIComponent(ctx.commit)}/${segments(path)}`;
}

// A path is linked only when it names something in the tree: it holds a
// slash or an extension. A part name such as "root" or "ingest" stays text.
function looksLikePath(text) {
  return PATH.test(text) && (text.includes('/') || /\.[A-Za-z0-9]+$/.test(text));
}

function pathHtml(ctx, text) {
  const value = str(text);
  const href = looksLikePath(value) ? sourceUrl(ctx, value) : null;
  const code = `<code>${esc(value)}</code>`;
  return href ? `<a href="${esc(href)}">${code}</a>` : esc(value);
}

// A reader string is a path, a path marked found by text, or a part with a
// file count; only the path part becomes a link.
function readerHtml(ctx, text) {
  const value = str(text);
  if (value.endsWith(FOUND_BY_TEXT)) return `${pathHtml(ctx, value.slice(0, -FOUND_BY_TEXT.length))}${esc(FOUND_BY_TEXT)}`;
  return pathHtml(ctx, value);
}

// Backticks in page.json sentences mark code, as they do in the markdown.
function inline(text) {
  return str(text).split('`').map((piece, index) => (index % 2 === 1 ? `<code>${esc(piece)}</code>` : esc(piece))).join('');
}

function list(items, { serial = false } = {}) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const joiner = serial && items.length > 2 ? ', and ' : ' and ';
  return `${items.slice(0, -1).join(', ')}${joiner}${last}`;
}

// Joined on the plain-text form, so an "and" inside a linked list is seen.
function clauseList(clauses) {
  const html = clauses.map((clause) => clause.html);
  if (clauses.length === 1) return html[0];
  const tangled = clauses.slice(0, -1).some((clause) => clause.text.includes(' and '));
  if (clauses.length === 2) return tangled ? `${html[0]}, and ${html[1]}` : `${html[0]} and ${html[1]}`;
  return `${html.slice(0, -1).join(', ')}, and ${html[html.length - 1]}`;
}

function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function capitalize(text) {
  return text.length === 0 ? text : `${text[0].toUpperCase()}${text.slice(1)}`;
}

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function context(page, options = {}) {
  const repo = isRepo(options.repo) ? options.repo : isRepo(page?.repo) ? page.repo : null;
  const commit = COMMIT.test(str(page?.commit)) ? str(page.commit) : null;
  const doors = sharedNames(arr(page?.doors).filter((door) => door && typeof door === 'object'));
  // mainDoor is the door's id, its file for a workflow; a page.json written
  // before ids existed carries only the file, which is the id of a workflow.
  const main = doors.find((door) => !door.parseError && str(door.id ?? door.file) === str(page?.mainDoor)) ?? null;
  const labels = page?.partLabels && typeof page.partLabels === 'object' && !Array.isArray(page.partLabels) ? page.partLabels : {};
  const name = (id, fallback = null) => partLabel(labels, id, fallback);
  return { page: page ?? {}, repo, commit, doors, main, labels, name, history: options.history ?? null };
}

/**
 * The name page.js gives a part, from the one map of ids to names page.json
 * carries, so a root-level part reads "the repository root" wherever it is
 * named. A page.json written before the map existed falls back to the label
 * an entry carried beside its id, then to the id.
 */
export function partLabel(labels, id, fallback = null) {
  const key = str(id);
  if (Object.hasOwn(labels, key) && typeof labels[key] === 'string') return labels[key];
  return fallback == null ? key : str(fallback);
}

// A reader or writer that stands for many files of one part is written by
// page.js as the part's id and the count, "root (4 README files)"; the id is
// named as the page names it and the count kept.
function wordedName(ctx, text) {
  const value = str(text);
  const match = /^(.+) \((\d+ (?:\S+ )?files)\)$/.exec(value);
  if (!match || !Object.hasOwn(ctx.labels, match[1])) return value;
  return `${ctx.name(match[1])} (${match[2]})`;
}

// A door a manifest installs, a command people run or the package they
// import, has no trigger; page.js names what it is instead.
function installed(door) {
  return door?.kind === 'command' || door?.kind === 'package';
}

function installedAs(door) {
  const what = door.kind === 'package' ? 'the package people import' : 'a command people run';
  return door.sharedName ? `${what}, from ${esc(door.file)}` : what;
}

// Two commands of one name from two manifests are each named with the
// manifest that installs it, as page.js names them.
function sharedNames(doors) {
  const counts = new Map();
  for (const door of doors) if (installed(door)) counts.set(str(door.name), (counts.get(str(door.name)) ?? 0) + 1);
  return doors.map((door) => (installed(door) && counts.get(str(door.name)) > 1 ? { ...door, sharedName: true } : door));
}

function startVerb(door) {
  return door?.kind === 'package' ? 'loads' : 'runs';
}

function runs(ctx, door) {
  return arr(door.runs).map((path) => ({ html: pathHtml(ctx, path), text: str(path) }));
}

// The paths a door only checks (a linter or a type-checker reads them and
// runs none), which page.js lists apart from the ones it runs. A page.json
// written before the two were told apart lists every path under runs.
function checks(ctx, door) {
  return arr(door.checks).map((path) => ({ html: pathHtml(ctx, path), text: str(path) }));
}

// runsCount and checksCount are how many paths the door runs and checks when
// page.json lists fewer, so "and N more" counts every one.
function runTotal(door, items) {
  return Math.max(Number(door?.runsCount) || 0, items.length);
}

function checkTotal(door, items) {
  return Math.max(Number(door?.checksCount) || 0, items.length);
}

function runsShown(items, total = items.length) {
  if (total <= RUNS_SHOWN) return list(items.map((item) => item.html));
  const shown = items.slice(0, RUNS_SHOWN);
  return `${shown.map((item) => item.html).join(', ')} and ${total - shown.length} more`;
}

function runsShownText(items, total = items.length) {
  if (total <= RUNS_SHOWN) return list(items.map((item) => item.text));
  const shown = items.slice(0, RUNS_SHOWN);
  return `${shown.map((item) => item.text).join(', ')} and ${total - shown.length} more`;
}

function deeper(door) {
  const depths = new Map();
  for (const entry of arr(door.reach)) {
    const depth = Number(entry?.depth);
    if (!(depth >= 1)) continue;
    if (!depths.has(depth)) depths.set(depth, []);
    depths.get(depth).push(entry);
  }
  return [...depths.entries()].sort((a, b) => a[0] - b[0]).map(([depth, entries]) => ({
    depth,
    entries: [...entries].sort((a, b) => cmp(str(a.boundary), str(b.boundary))),
  }));
}

function fileCount(ctx, entry) {
  return `${esc(ctx.name(entry.boundary))} (${esc(count(Number(entry.files) || 0, 'file'))})`;
}

function placesHtml(ctx, places) {
  return list(arr(places).map((place) => pathHtml(ctx, place)));
}

function commitsClause(ctx, door) {
  const stages = arr(door.stages).map((place) => pathHtml(ctx, place));
  if (!door.pushes) return list(stages);
  return stages.length > 1 ? `${list(stages)}, then pushes` : `${list(stages)} and pushes`;
}

function section(heading, body) {
  return `<section><h2>${esc(heading)}</h2>\n${body}</section>`;
}

function ol(items) {
  return `<ol>${items.map((item) => `<li>${item}</li>`).join('')}</ol>`;
}

function ul(items) {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function p(text) {
  return `<p>${text}</p>`;
}

function derivedLine(ctx) {
  const parts = count(Number(ctx.page.parts) || 0, 'part');
  if (ctx.doors.length === 0) return `${parts}. No workflows were found, so this page has no doors.`;
  const doors = count(ctx.doors.length, 'door');
  if (!ctx.main && ctx.doors.some((door) => !door.parseError)) return `${parts}. Work enters through ${doors}, and none of them runs a file this map can see.`;
  if (!ctx.main) return `${parts}. Work enters through ${doors}, and none of their workflows could be read.`;
  const reach = count(arr(ctx.main.reach).length, 'part');
  // page.js follows a door that commits over a wider one that does not, and
  // says so; page.json lists the doors widest first, so the first is the widest.
  const widest = ctx.doors.find((door) => !door.parseError && arr(door.reach).length > 0);
  if (widest && widest !== ctx.main && arr(widest.reach).length > arr(ctx.main.reach).length) {
    return `${parts}. Work enters through ${doors}; the busiest is ${ctx.main.name}, which reaches ${reach} and commits into the repository (${widest.name} reaches ${arr(widest.reach).length} but commits nothing).`;
  }
  return `${parts}. Work enters through ${doors}; the busiest is ${ctx.main.name}, which reaches ${reach}.`;
}

function whatThisIs(ctx, figure) {
  const body = [p(esc(derivedLine(ctx)))];
  if (figure) body.push(figure);
  return section('What this is', body.join('\n'));
}

/**
 * Where a person edits the one line they may add: GitHub's editor for the
 * boundary file on the repository's default branch, which page.json records
 * as defaultBranch. A page.json written before it existed, or a value that is
 * not a branch name, gives main. The site never writes the file.
 */
export function summaryEditUrl(repo, branch) {
  if (!isRepo(repo)) return null;
  const name = isBranch(branch) ? branch : 'main';
  return `https://github.com/${segments(repo)}/edit/${segments(name)}/atlas/boundaries.yaml`;
}

// A branch name as git allows one in a URL path: no "..", no empty or dotted
// segment, nothing that could leave the path.
function isBranch(value) {
  if (typeof value !== 'string' || !BRANCH.test(value) || value.includes('..')) return false;
  return value.split('/').every((segment) => segment !== '' && !/^\.+$/.test(segment));
}

// The one line a person may write, at the top, where a reader looks first.
// When nobody has, the page says so and links to where it is written, so the
// absence reads as an invitation rather than as a gap.
function summaryLine(ctx) {
  const summary = str(ctx.page.summary).replace(/\s+/g, ' ').trim();
  const href = summaryEditUrl(ctx.repo, ctx.page.defaultBranch);
  if (summary) {
    const correct = href ? ` <a class="correct" href="${esc(href)}">Correct it</a>` : '';
    return `<p class="summary">${esc(summary)} (written by a person)${correct}</p>`;
  }
  const write = href ? ` <a href="${esc(href)}">Write it.</a>` : '';
  return `<p class="summary">No one has written the one line a person may add.${write}</p>`;
}

// The heading page.js writes, from the same fields of page.json's changes.
export function changesHeading(changes) {
  if (!changes || changes.first) return 'What changed since the last map';
  const date = str(changes.since?.generatedAt).slice(0, 10);
  const commit = str(changes.since?.commit).slice(0, 7);
  if (date && commit) return `What changed since ${date} (${commit})`;
  if (commit) return `What changed since commit ${commit}`;
  return date ? `What changed since ${date}` : 'What changed since the last map';
}

// The sentences are page.js's own, headline first. A page.json written before
// the section existed has no changes and shows no section.
function changesSection(ctx) {
  const changes = ctx.page.changes;
  if (!changes || typeof changes !== 'object') return '';
  const heading = changesHeading(changes);
  const strip = renderDeltaFigure(ctx.history);
  const withStrip = (body) => section(heading, strip ? `${body}\n${strip}` : body);
  if (changes.first) return withStrip(p('This is the first map.'));
  const sentences = arr(changes.items).filter((item) => item && typeof item === 'object').map((item) => inline(item.sentence));
  if (sentences.length === 0) return '';
  return withStrip(changes.unchanged ? p(sentences.join(' ')) : ul(sentences));
}

function comesIn(ctx) {
  const items = ctx.doors.map((door) => {
    const name = `<strong>${esc(door.name)}.</strong>`;
    if (door.parseError) return `${name} This workflow could not be read.`;
    const paths = runs(ctx, door);
    const checked = checks(ctx, door);
    const clauses = [];
    if (paths.length > 0) clauses.push(`${startVerb(door)} ${runsShown(paths, runTotal(door, paths))}`);
    if (checked.length > 0) clauses.push(`checks ${runsShown(checked, checkTotal(door, checked))}`);
    const ran = capitalize(clauses.length > 0 ? `${clauses.join('; ')}.` : `${startVerb(door)} no file this map can see.`);
    if (installed(door)) return `<strong>${esc(door.name)}</strong> (${installedAs(door)}). ${ran}`;
    const when = capitalize(arr(door.triggers).map(str).join('; ')) || 'Nothing this map can read starts it';
    return `${name} ${inline(when)}. ${ran}`;
  });
  return section('What comes in', ol(items));
}

// page.json does not record which part each run belongs to, so the first step
// names the runs without the markdown's "in <part>" grouping, three and a
// count as "What comes in" does, since a door that runs a test suite runs
// hundreds.
function doorSteps(ctx, door) {
  const steps = [];
  const paths = runs(ctx, door);
  const checked = checks(ctx, door);
  const subject = installed(door) ? `The ${door.kind} ${startVerb(door)}` : 'The workflow runs';
  const clauses = [];
  if (paths.length > 0) clauses.push(`${subject} ${runsShown(paths, runTotal(door, paths))}`);
  if (checked.length > 0) clauses.push(`${paths.length > 0 ? 'it' : 'The workflow'} checks ${runsShown(checked, checkTotal(door, checked))}`);
  steps.push(clauses.length > 0 ? `${clauses.join('; ')}.` : `${subject} no file this map can see.`);
  for (const level of deeper(door)) steps.push(`That reaches ${list(level.entries.map((entry) => fileCount(ctx, entry)))}.`);
  if (arr(door.landings).length > 0) steps.push(`It writes to ${placesHtml(ctx, door.landings)}.`);
  if (arr(door.stages).length > 0) steps.push(`It commits ${commitsClause(ctx, door)}.`);
  for (const send of arr(door.sends)) steps.push(`It ${inline(send)}.`);
  return steps;
}

function partName(ctx, item) {
  if (item?.part == null) return null;
  return ctx.name(item.part, item.partLabel);
}

// A method called on an object is named with the object's class, "train
// (Trainer)". Another part is named after the first step that goes into it,
// once.
function stepTexts(ctx, steps, ownPart) {
  const named = new Set();
  return arr(steps).filter((step) => step && typeof step === 'object').map((step) => {
    const notes = [];
    if (step.receiver != null) notes.push(str(step.receiver));
    const part = step.part == null ? null : str(step.part);
    if (part != null && part !== ownPart && !named.has(part)) {
      named.add(part);
      notes.push(partName(ctx, step));
    }
    const collapsed = Number(step.count) || 0;
    if (collapsed > 0) notes.push(`${collapsed} steps`);
    const phrase = str(step.phrase);
    return esc(notes.length > 0 ? `${phrase} (${notes.join(', ')})` : phrase);
  });
}

// Up to seven steps read as one sentence; more read as a numbered list of at
// most twelve, the last carrying how many were left off.
function inOrder(lead, texts) {
  if (texts.length <= SENTENCE_STEPS) return `${lead} ${list(texts)}.`;
  const items = texts.slice(0, LISTED_STEPS);
  if (texts.length > LISTED_STEPS) items[items.length - 1] += `, and ${texts.length - LISTED_STEPS} more`;
  return `${lead}${ol(items)}`;
}

function sequenceItems(ctx) {
  const items = [];
  for (const sequence of arr(ctx.page.sequences)) {
    if (!sequence || typeof sequence !== 'object') continue;
    const own = sequence.part == null ? null : str(sequence.part);
    items.push(inOrder(`Inside ${pathHtml(ctx, sequence.file)}, ${esc(sequence.phrase)} does, in order:`, stepTexts(ctx, sequence.steps, own)));
    // page.json holds only the called functions the markdown shows, in the
    // order the entry calls them. A part is named only when it is not the
    // entry file's own.
    for (const inner of arr(sequence.inner)) {
      if (!inner || typeof inner !== 'object') continue;
      const part = inner.part == null ? null : str(inner.part);
      let where = null;
      if (part != null && part !== own) where = esc(partName(ctx, inner));
      else if (part == null && inner.file) where = pathHtml(ctx, inner.file);
      const lead = `<strong>${esc(capitalize(str(inner.phrase)))}</strong>${where ? ` (${where})` : ''} runs, in order:`;
      items.push(inOrder(lead, stepTexts(ctx, inner.steps, part)));
    }
  }
  return items;
}

// The order of work inside the files the door runs sits under the step that
// runs them. A page.json written before sequences existed has none to show.
function happens(ctx) {
  const steps = doorSteps(ctx, ctx.main);
  const inside = sequenceItems(ctx);
  if (inside.length > 0) steps[0] = `${steps[0]}${ol(inside)}`;
  return section(`What happens through ${str(ctx.main.name)}`, ol(steps));
}

function readsSection(ctx) {
  const name = esc(ctx.main.name);
  if (arr(ctx.main.landings).length === 0) return section('Who reads the results', p(`${name} writes nothing this map can see.`));
  const groups = arr(ctx.page.readers);
  if (groups.length === 0) return section('Who reads the results', p(`Only ${name} itself reads what it writes.`));
  const bullets = groups.map((group) => {
    const target = `<strong>${pathHtml(ctx, group.target)}</strong>`;
    const readers = arr(group.readers);
    return readers.length === 0
      ? `${target} has no reader in this repository.`
      : `${target} is read by ${list(readers.map((reader) => readerHtml(ctx, wordedName(ctx, reader))))}.`;
  });
  return section('Who reads the results', ul(bullets));
}

function otherDoors(ctx) {
  const rest = ctx.doors.filter((door) => door !== ctx.main);
  if (rest.length === 0) return '';
  const paragraphs = rest.map((door) => {
    if (door.parseError) return p(`<strong>${esc(door.name)}.</strong> This workflow could not be read.`);
    const clauses = [];
    const paths = runs(ctx, door);
    const checked = checks(ctx, door);
    const verb = startVerb(door);
    if (paths.length > 0 || checked.length === 0) {
      clauses.push(paths.length > 0
        ? { html: `${verb} ${runsShown(paths, runTotal(door, paths))}`, text: `${verb} ${runsShownText(paths, runTotal(door, paths))}` }
        : { html: `${verb} no file this map can see`, text: `${verb} no file this map can see` });
    }
    if (checked.length > 0) {
      clauses.push({ html: `checks ${runsShown(checked, checkTotal(door, checked))}`, text: `checks ${runsShownText(checked, checkTotal(door, checked))}` });
    }
    const reached = [...new Set(deeper(door).flatMap((level) => level.entries.map((entry) => str(entry.boundary))))].sort(cmp).map((part) => ctx.name(part));
    if (reached.length > 0) clauses.push({ html: `reaches ${list(reached.map(esc))}`, text: `reaches ${list(reached)}` });
    const landings = arr(door.landings).map(str);
    if (landings.length > 0) clauses.push({ html: `writes to ${placesHtml(ctx, landings)}`, text: `writes to ${list(landings)}` });
    const stages = arr(door.stages).map(str);
    if (stages.length > 0) {
      const text = door.pushes ? (stages.length > 1 ? `${list(stages)}, then pushes` : `${list(stages)} and pushes`) : list(stages);
      clauses.push({ html: `commits ${commitsClause(ctx, door)}`, text: `commits ${text}` });
    }
    for (const send of arr(door.sends)) clauses.push({ html: inline(send), text: str(send) });
    const named = installed(door) ? `<strong>${esc(door.name)}</strong> (${installedAs(door)})` : `<strong>${esc(door.name)}</strong>`;
    return p(`${named} ${clauseList(clauses)}.`);
  });
  return section('The other doors', paragraphs.join('\n'));
}

// A part row names the part as the list in the markdown does.
function breakLabel(ctx, entry) {
  return ctx.name(entry?.name, entry?.partLabel);
}

function breakLine(ctx, entry) {
  if (entry?.kind === 'place') {
    const writers = arr(entry.writers).map((part) => esc(ctx.name(part)));
    const readers = arr(entry.readers).map((part) => esc(ctx.name(part)));
    const comma = writers.length > 1 ? ',' : '';
    return `<strong>${pathHtml(ctx, entry.target)}</strong> is written by ${list(writers)}${comma} and read by ${list(readers)}; a hand edit reaches every reader.`;
  }
  const importedBy = arr(entry?.importedBy).map((part) => ctx.name(part));
  const imported = importedBy.length === 0
    ? 'is imported by no other part'
    : `is imported by ${count(importedBy.length, 'part')} (${esc(importedBy.join(', '))})`;
  const doors = Number(entry?.doors) || 0;
  const path = doors === 0 ? 'no door' : count(doors, 'door');
  const fromTests = arr(entry?.importedByTests).map((part) => ctx.name(part));
  if (importedBy.length === 0 && fromTests.length > 0) {
    return `<strong>${esc(breakLabel(ctx, entry))}</strong> is imported only from tests, by ${count(fromTests.length, 'part')} (${esc(fromTests.join(', '))}), and sits on the path of ${path}.`;
  }
  if (fromTests.length > 0) {
    return `<strong>${esc(breakLabel(ctx, entry))}</strong> ${imported}, and by ${fromTests.length} more only from tests; it sits on the path of ${path}.`;
  }
  return `<strong>${esc(breakLabel(ctx, entry))}</strong> ${imported} and sits on the path of ${path}.`;
}

function breaksSection(ctx) {
  const entries = arr(ctx.page.breaks);
  const body = entries.length > 0
    ? ul(entries.map((entry) => breakLine(ctx, entry)))
    : p('No part is imported by another part, and no part sits on the path of two doors.');
  const figure = renderBreaksFigure(ctx.page);
  return section('What breaks what', figure ? `${body}\n${figure}` : body);
}

// "the tests part", as page.js words a part in a sentence about parts; the
// repository root is already a phrase.
function partPhrase(label) {
  const text = esc(label);
  return str(label) === 'the repository root' ? text : `the ${text} part`;
}

function relationClause(pair) {
  const [a, b] = arr(pair.partLabels).map(partPhrase);
  switch (pair.relation) {
    case 'inside': return `, inside ${a}.`;
    case 'a-imports-b': return `, and ${a} imports ${b}.`;
    case 'b-imports-a': return `, and ${b} imports ${a}.`;
    case 'both': return `, and ${a} and ${b} import each other.`;
    case 'none': return ', though neither part imports the other.';
    default: return '.';
  }
}

// The pairs, the count of files set aside with their own tests, and the
// closing lines are all as page.js wrote them; a page.json written before the
// section existed has none of them and shows no section.
function togetherSection(ctx) {
  if (!Array.isArray(ctx.page.changesTogether)) return '';
  const pairs = ctx.page.changesTogether.filter((pair) => pair && typeof pair === 'object');
  const withTests = Number(ctx.page.changesTogetherWithTests) || 0;
  const body = pairs.length > 0
    ? ul(pairs.map((pair) => `<strong>${pathHtml(ctx, pair.a)}</strong> and <strong>${pathHtml(ctx, pair.b)}</strong> changed together in ${Number(pair.shared) || 0} of ${count(Number(pair.either) || 0, 'commit')}${relationClause(pair)}`))
    : p(withTests > 0
      ? 'No two source files, other than a file and its own test, changed together often enough to name.'
      : 'No two source files changed together often enough to name.');
  const note = arr(ctx.page.changesTogetherNote).map((line) => p(esc(line)));
  return section('What tends to change together', [body, ...note].join('\n'));
}

// The three derived views. A page.json written before they existed carries
// none of their lists and shows none of them.
function untestedSection(ctx) {
  if (!Array.isArray(ctx.page.untested)) return '';
  const items = ctx.page.untested.filter((item) => item && typeof item === 'object');
  const note = arr(ctx.page.untestedNote).map((line) => p(esc(line)));
  const body = items.length > 0
    ? [ul(items.map((item) => `<strong>${esc(partName(ctx, item) ?? '')}</strong> is imported by no test.`))]
    : (Number(ctx.page.testFiles) === 0 ? [] : [p('Every code part is imported by at least one test.')]);
  return section('What no test touches', [...body, ...note].join('\n'));
}

function unreadSection(ctx) {
  if (!Array.isArray(ctx.page.unread)) return '';
  const items = ctx.page.unread.filter((item) => item && typeof item === 'object');
  const body = items.length > 0
    ? ul(items.map((item) => {
      const writers = arr(item.writers);
      const comma = writers.length > 1 ? ',' : '';
      return `<strong>${pathHtml(ctx, item.place)}</strong> is written by ${list(writers.map((writer) => pathHtml(ctx, wordedName(ctx, writer))))}${comma} and read by nothing else in this repository.`;
    }))
    : p(ctx.page.written === 0 ? 'No place this map can see is written, so none goes unread.' : 'Every written place has a reader.');
  const note = arr(ctx.page.unreadNote).map((line) => p(esc(line)));
  return section('Written but never read', [body, ...note].join('\n'));
}

function duplicatesSection(ctx) {
  if (!Array.isArray(ctx.page.duplicates)) return '';
  const items = ctx.page.duplicates.filter((item) => item && typeof item === 'object');
  const lead = items.length > 0 && ctx.page.duplicatesLead ? [p(esc(ctx.page.duplicatesLead))] : [];
  const body = items.length > 0
    ? ul(items.map((item) => {
      if (item.contract) {
        const labels = arr(item.partLabels).map((label) => esc(label));
        const shown = labels.length > 5 ? `${labels.slice(0, 5).join(', ')} and ${labels.length - 5} more` : list(labels);
        return `<strong>${esc(item.name)}</strong> is exported by ${count(labels.length, 'part')} (${shown}); with the same name in this many parts it is most likely a shared contract, not a copy.`;
      }
      const [fileA, fileB] = arr(item.files);
      const [partA, partB] = arr(item.partLabels).map((label) => esc(label));
      return `<strong>${esc(item.name)}</strong> is exported by ${pathHtml(ctx, fileA)} (${partA}) and ${pathHtml(ctx, fileB)} (${partB}); the two look alike.`;
    }))
    : p('No two parts export a helper that looks alike.');
  const note = arr(ctx.page.duplicatesNote).map((line) => p(esc(line)));
  return section('Helpers that look duplicated', [...lead, body, ...note].join('\n'));
}

function generatedSection(ctx) {
  const items = arr(ctx.page.generated);
  const body = items.length > 0
    ? ul(items.map((item) => {
      const place = `<strong>${pathHtml(ctx, item.place)}</strong>`;
      const writers = arr(item.writers);
      return writers.length > 0
        ? `${place} is written by ${list(writers.map((writer) => pathHtml(ctx, wordedName(ctx, writer))))}.`
        : `${place} is written by code this map cannot name.`;
    }))
    : p('Nothing in this repository writes to a tracked place this map can see.');
  return section('Generated, never hand-edited', body);
}

function authoredSection(ctx) {
  const places = arr(ctx.page.authored);
  // A place is a directory the part owns, or the id of a part that owns no
  // single directory, such as the root-level files, named as the markdown
  // names it.
  const shown = (place) => (looksLikePath(place) ? pathHtml(ctx, place) : esc(ctx.name(place)));
  const body = places.length > 0
    ? p(`People write ${list(places.map(shown))}. Nothing in this repository writes to them.`)
    : p('No configuration or documentation part is left to people alone.');
  return section('Hand-authored', body);
}

// page.json keeps the trigger as the sentence page.js wrote, so the noun for
// "follow one ... end to end" is read back from that sentence's fixed forms.
export function triggerNoun(door) {
  if (installed(door)) return door.kind === 'package' ? `import of ${str(door.name)}` : `run of ${str(door.name)}`;
  const phrases = arr(door?.triggers).map(str);
  const first = phrases.find((phrase) => phrase !== 'by hand' && phrase !== 'or by hand') ?? phrases[0];
  if (!first) return 'run';
  const event = /^when a repository sends a `(.+)` event$/.exec(first);
  if (event) return event[1].replace(/[_-]+/g, ' ');
  if (first === 'when a repository sends a dispatch') return 'dispatch';
  if (first.startsWith('on a schedule')) return 'scheduled run';
  if (first.startsWith('when a tag matching')) return 'tag push';
  if (first.startsWith('on a push')) return 'push';
  if (first.startsWith('on a pull request')) return 'pull request';
  if (first === 'when a release is published' || first === 'on a release event') return 'release';
  if (first === 'by hand') return 'run by hand';
  return 'run';
}

function startSection(ctx) {
  if (!ctx.main) {
    const why = ctx.doors.some((door) => !door.parseError) ? 'No door runs a file this map can see' : 'No door was found';
    return section('Where to start', p(`${why}, so there is no path through this repository to follow.`));
  }
  const chain = arr(ctx.page.startHere).map((path) => pathHtml(ctx, path));
  const body = [
    `<p class="chain">${chain.join(' <span aria-hidden="true">→</span><span class="sr">, then</span> ')}</p>`,
    p(`Read those in order to follow one ${esc(triggerNoun(ctx.main))} end to end.`),
  ];
  return section('Where to start', body.join('\n'));
}

function limitsSection(ctx) {
  const lines = [...arr(ctx.page.limits).map(str), REGENERATE];
  return section('What this map cannot see', lines.map((line) => p(inline(line))).join('\n'));
}

/**
 * @param {object} page parsed page.json
 * @param {{ repo?: string, history?: object|null, served?: string|null }} [options]
 *   repo is the validated owner/name the page was requested for; links are
 *   built from it, never from unchecked JSON. history is the parsed
 *   history.json beside it on the render branch, or null when that render left
 *   none. served is the base when the page's own server holds the renders
 *   (servedBase), so the markdown link stays on that server.
 * @returns {string} the article's inner HTML
 */
export function renderPage(page, options = {}) {
  const ctx = context(page, options);
  const title = pageTitle(page, options);
  const date = str(ctx.page.generatedAt).slice(0, 10);
  const commit = str(ctx.page.commit).slice(0, 7);
  const commitHtml = ctx.repo && ctx.commit
    ? `<a href="${esc(`https://github.com/${segments(ctx.repo)}/commit/${ctx.commit}`)}"><code>${esc(commit)}</code></a>`
    : `<code>${esc(commit)}</code>`;
  const served = servedBase(options.served);
  const markdown = !ctx.repo ? '' : served
    ? `<a href="${esc(servedMarkdownUrl(served, ctx.repo))}">The same page as markdown</a>`
    : `<a href="${esc(markdownUrl(ctx.repo))}">The same page as markdown, on the render branch</a>`;
  const links = ctx.repo
    ? `<p class="links">${markdown} · <a href="./">Every rendered repository</a></p>`
    : '<p class="links"><a href="./">Every rendered repository</a></p>';
  const parts = [
    `<h1>${esc(title)}</h1>`,
    `<p class="mapped">Mapped at ${esc(date)} from commit ${commitHtml}.</p>`,
    summaryLine(ctx),
    links,
    whatThisIs(ctx, renderFlowFigure(page)),
  ];
  const changed = changesSection(ctx);
  if (changed) parts.push(changed);
  if (ctx.doors.length > 0) parts.push(comesIn(ctx));
  if (ctx.main) {
    parts.push(happens(ctx), readsSection(ctx));
    const others = otherDoors(ctx);
    if (others) parts.push(others);
  }
  parts.push(breaksSection(ctx));
  const together = togetherSection(ctx);
  if (together) parts.push(together);
  for (const derived of [untestedSection(ctx), unreadSection(ctx), duplicatesSection(ctx)]) if (derived) parts.push(derived);
  parts.push(generatedSection(ctx), authoredSection(ctx), startSection(ctx), limitsSection(ctx));
  return parts.join('\n');
}

export function pageTitle(page, options = {}) {
  const repo = str(page?.repo) || (isRepo(options.repo) ? options.repo : '') || 'This repository';
  return `${repo}: how it works`;
}

/* ---------- the flow picture ---------- */

const FONT = 14;
const CHAR = 8.45;
const LINE = 18;
const PAD_X = 12;
const PAD_Y = 10;
const NODE_GAP = 12;
const EDGE_GAP = 56;
const BAND_GAP = 96;
const MARGIN = 16;
const LINE_CHARS = 20;
const MIN_WIDTH = 96;

function wrapWords(text, width) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  return [lines[0], `${lines.slice(1).join(' ').slice(0, width - 1)}…`];
}

// Paths wrap at slashes and keep their end, because the file name is what a
// reader recognises; a lost head is marked with an ellipsis.
function wrapPath(text, width) {
  if (text.length <= width) return [text];
  const pieces = text.split(/(?<=\/)/);
  let tail = '';
  while (pieces.length > 0 && (tail.length === 0 || (pieces[pieces.length - 1] + tail).length <= width)) tail = pieces.pop() + tail;
  if (tail.length > width) tail = `…${tail.slice(tail.length - width + 1)}`;
  if (pieces.length === 0) return [tail];
  let head = '';
  while (pieces.length > 0 && (pieces[pieces.length - 1] + head).length <= width - 2) head = pieces.pop() + head;
  return [pieces.length > 0 ? `…/${head}` : head, tail];
}

function node(label, sub, { path = false, text = false } = {}) {
  const lines = path ? wrapPath(label, LINE_CHARS) : wrapWords(label, LINE_CHARS);
  if (sub) lines.push(sub);
  return { lines, sub: Boolean(sub), text };
}

function columnWidth(nodes) {
  const longest = Math.max(0, ...nodes.flatMap((n) => n.lines.map((line) => line.length)));
  return Math.max(MIN_WIDTH, Math.ceil(longest * CHAR + PAD_X * 2));
}

function nodeHeight(n) {
  return n.lines.length * LINE + PAD_Y * 2 - 4;
}

function readerLabel(text) {
  const value = str(text);
  return value.endsWith(FOUND_BY_TEXT)
    ? { label: value.slice(0, -FOUND_BY_TEXT.length), text: true }
    : { label: value, text: false };
}

/**
 * The columns of the flow picture, before any geometry: the door, the parts
 * its runs are in, one column per further reach depth, its landing places,
 * and the files that read those places.
 */
export function flowColumns(page) {
  const ctx = context(page);
  const main = ctx.main;
  if (!main) return null;
  const reach = arr(main.reach).filter((entry) => entry && typeof entry === 'object');
  const columns = [{ kind: 'door', nodes: [node(str(main.name), null)] }];
  const depthZero = reach.filter((entry) => Number(entry.depth) === 0);
  if (depthZero.length > 0) {
    columns.push({
      kind: 'parts',
      depth: 0,
      nodes: depthZero.map((entry) => node(ctx.name(entry.boundary), count(Number(entry.files) || 0, 'file'))),
    });
  }
  for (const level of deeper(main)) {
    columns.push({
      kind: 'parts',
      depth: level.depth,
      nodes: level.entries.map((entry) => node(ctx.name(entry.boundary), count(Number(entry.files) || 0, 'file'))),
    });
  }
  const landings = arr(main.landings).map(str);
  if (landings.length > 0) {
    columns.push({ kind: 'landings', nodes: landings.map((place) => node(place, null, { path: true })) });
    const order = [];
    const edges = [];
    const groups = arr(page?.readers);
    for (const group of groups) {
      const from = landings.indexOf(str(group?.target));
      if (from === -1) continue;
      for (const reader of arr(group.readers).map((text) => wordedName(ctx, text))) {
        if (!order.includes(reader)) order.push(reader);
        edges.push({ from, reader });
      }
    }
    if (order.length > 0) {
      const drawn = order.slice(0, READERS_DRAWN);
      const hidden = order.length - drawn.length;
      const nodes = drawn.map((reader) => {
        const { label, text } = readerLabel(reader);
        return node(label, null, { path: looksLikePath(label), text });
      });
      if (hidden > 0) nodes.push(node(`+${hidden} more`, null));
      const readerEdges = [];
      for (const edge of edges) {
        const index = drawn.indexOf(edge.reader);
        const to = index === -1 ? drawn.length : index;
        if (!readerEdges.some((e) => e.from === edge.from && e.to === to)) readerEdges.push({ from: edge.from, to });
      }
      columns.push({ kind: 'readers', nodes, edges: readerEdges, total: order.length });
    }
  }
  return columns;
}

function flowSentence(page, columns) {
  const ctx = context(page);
  const main = ctx.main;
  const clauses = [];
  const zero = arr(main.reach).filter((entry) => Number(entry?.depth) === 0).map((entry) => ctx.name(entry.boundary));
  clauses.push(zero.length > 0 ? `runs code in ${list(zero)}` : 'runs no part this map can see');
  const levels = deeper(main).map((level) => list(level.entries.map((entry) => ctx.name(entry.boundary))));
  if (levels.length > 0) clauses.push(`that reaches ${levels.join(', then ')}`);
  const landings = arr(main.landings).map(str);
  if (landings.length > 0) clauses.push(`it writes to ${list(landings)}`);
  const readers = columns.find((column) => column.kind === 'readers');
  if (readers) clauses.push(`${count(readers.total, 'reader')} read those places`);
  return `${str(main.name)} (${str(main.file)}) ${clauses.join('; ')}.`;
}

function rect(x, y, w, h, n) {
  const cls = n.text ? 'node node-text' : 'node';
  const lines = n.lines.map((line, index) => {
    const last = n.sub && index === n.lines.length - 1;
    const ty = y + PAD_Y + FONT + index * LINE - 2;
    return `<text x="${x + PAD_X}" y="${ty}"${last ? ' class="sub"' : ''}>${esc(line)}</text>`;
  }).join('');
  return `<g class="${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>${lines}</g>`;
}

function edge(x1, y1, x2, y2) {
  const mid = (x1 + x2) / 2;
  return `<path class="edge" d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2 - 2} ${y2}" marker-end="url(#atlasFlowArrow)"/>`;
}

function band(x, y, w, h, label) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  return `<g class="band"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"/>` +
    `<text x="${cx}" y="${cy - 6}" text-anchor="middle">${esc(label)}</text>` +
    `<path class="edge" d="M${x + 10} ${cy + 6} L${x + w - 12} ${cy + 6}" marker-end="url(#atlasFlowArrow)"/></g>`;
}

/**
 * The flow picture as an SVG string, or '' when there is no main door.
 * Edges are drawn only where page.json states them. Between part columns,
 * and from the last part column to the landings, one band stands for the
 * whole step, because page.json does not record which part reached which.
 */
export function renderFlow(page) {
  const columns = flowColumns(page);
  if (!columns) return '';
  const geometry = columns.map((column) => {
    const width = columnWidth(column.nodes);
    const heights = column.nodes.map(nodeHeight);
    const height = heights.reduce((sum, h) => sum + h, 0) + NODE_GAP * Math.max(0, heights.length - 1);
    return { ...column, width, heights, height };
  });
  const tallest = Math.max(...geometry.map((column) => column.height));
  const height = tallest + MARGIN * 2;
  let x = MARGIN;
  geometry.forEach((column, index) => {
    column.x = x;
    column.top = MARGIN + (tallest - column.height) / 2;
    let y = column.top;
    column.boxes = column.heights.map((h) => {
      const box = { x: column.x, y, w: column.width, h, cy: y + h / 2 };
      y += h + NODE_GAP;
      return box;
    });
    const next = geometry[index + 1];
    if (next) column.gap = next.kind === 'parts' && column.kind === 'door' ? EDGE_GAP
      : next.kind === 'readers' ? EDGE_GAP : BAND_GAP;
    x += column.width + (column.gap ?? 0);
  });
  const width = x + MARGIN;

  const shapes = [];
  geometry.forEach((column, index) => {
    const next = geometry[index + 1];
    if (!next) return;
    const x1 = column.x + column.width;
    if (column.kind === 'door' && next.kind === 'parts') {
      for (const box of next.boxes) shapes.push(edge(x1, column.boxes[0].cy, next.x, box.cy));
    } else if (next.kind === 'readers') {
      for (const link of next.edges) shapes.push(edge(x1, column.boxes[link.from].cy, next.x, next.boxes[link.to].cy));
    } else {
      const top = Math.min(column.top, next.top);
      const bottom = Math.max(column.top + column.height, next.top + next.height);
      const label = next.kind === 'landings' ? 'writes to' : 'reaches';
      shapes.push(band(x1 + 8, top, column.gap - 16, bottom - top, label));
    }
  });
  for (const column of geometry) {
    column.nodes.forEach((n, index) => {
      const box = column.boxes[index];
      shapes.push(rect(box.x, box.y, box.w, box.h, n));
    });
  }

  const main = context(page).main;
  const title = `How work flows through ${str(main.name)}`;
  const desc = flowSentence(page, columns);
  return `<svg class="flow-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="atlasFlowTitle atlasFlowDesc">` +
    `<title id="atlasFlowTitle">${esc(title)}</title><desc id="atlasFlowDesc">${esc(desc)}</desc>` +
    '<defs><marker id="atlasFlowArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path class="arrow" d="M0 0 L10 5 L0 10 z"/></marker></defs>' +
    `${shapes.join('')}</svg>`;
}

function renderFlowFigure(page) {
  const svg = renderFlow(page);
  if (!svg) return '';
  const hasText = (flowColumns(page) ?? []).some((column) => column.nodes.some((n) => n.text));
  const legend = [
    'Read left to right: the door, the parts its runs are in, the parts they reach, the places it writes to, and the files that read those places.',
    'A band stands for a whole step, because the map records which parts are reached but not which part reached which.',
  ];
  if (hasText) legend.push('A dashed border marks a reader found by scanning text rather than by parsing code.');
  return `<figure class="flow">${svg}<figcaption>${legend.map(esc).join(' ')}</figcaption></figure>`;
}

/* ---------- the "what breaks what" picture ---------- */

const BAR_ROWS = 8;
const BAR_ROW = 30;
const BAR_HEIGHT = 16;
const TEST_BAR_HEIGHT = 8;
const BAR_SPAN = 320;
const BAR_UNIT_MAX = 32;
const BAR_HEAD = 28;
const DESCRIBED_ROWS = 3;

/**
 * One row per part the "What breaks what" list names, at most eight, in the
 * list's order: the parts that import it to run it, the parts that import it
 * only from tests, and the doors whose path it sits on. Places are left out;
 * they have readers, not importers.
 */
export function breaksRows(page) {
  const ctx = context(page);
  return arr(page?.breaks)
    .filter((entry) => entry && typeof entry === 'object' && entry.kind === 'part')
    .slice(0, BAR_ROWS)
    .map((entry) => ({
      name: breakLabel(ctx, entry),
      production: arr(entry.importedBy).length,
      tests: arr(entry.importedByTests).length,
      doors: Math.max(0, Math.floor(Number(entry.doors) || 0)),
    }));
}

function breakClause(row) {
  const path = row.doors === 0 ? 'no door' : count(row.doors, 'door');
  if (row.production === 0 && row.tests > 0) return `${row.name} is imported only from tests, by ${count(row.tests, 'part')}, and sits on the path of ${path}`;
  if (row.production === 0) return `${row.name} is imported by no other part and sits on the path of ${path}`;
  if (row.tests > 0) return `${row.name} is imported by ${count(row.production, 'part')} and ${row.tests} more only from tests, and sits on the path of ${path}`;
  return `${row.name} is imported by ${count(row.production, 'part')} and sits on the path of ${path}`;
}

// The picture in one sentence, from the rows it draws: the first three read
// as the list reads them, and the rest are counted.
function breaksSentence(rows) {
  const clauses = rows.slice(0, DESCRIBED_ROWS).map(breakClause);
  const rest = rows.length > DESCRIBED_ROWS ? `; ${rows.length} parts are drawn in all` : '';
  return `${clauses.join('; ')}${rest}.`;
}

// The number at a bar's end says in words what the dashed length says in line.
function barEnd(row) {
  if (row.tests === 0) return String(row.production);
  return row.production === 0 ? `${row.tests} from tests` : `${row.production} + ${row.tests} from tests`;
}

/**
 * The fan-in of the parts "What breaks what" names, as an SVG string, or ''
 * when the list names no part. Length is the only channel: a solid bar per
 * part that imports it to run it, a thinner dashed bar continuing it per part
 * that imports it only from tests (dashed is the vocabulary's mark for
 * evidence short of running code), and the doors as a numeral.
 */
export function renderBreaks(page) {
  const rows = breaksRows(page);
  if (rows.length === 0) return '';
  const labelWidth = Math.max(MIN_WIDTH, Math.ceil(Math.max(...rows.map((row) => row.name.length), 'part'.length) * CHAR + 16));
  const barX = MARGIN + labelWidth;
  const unit = Math.min(BAR_UNIT_MAX, BAR_SPAN / Math.max(1, ...rows.map((row) => row.production + row.tests)));
  const reach = Math.max(...rows.map((row) => (row.production + row.tests) * unit + 8 + barEnd(row).length * CHAR), 'imported by'.length * CHAR);
  const doorsHead = 'doors';
  const doorsRight = Math.ceil(barX + reach + 32 + doorsHead.length * CHAR);
  const width = doorsRight + MARGIN;
  const height = MARGIN * 2 + BAR_HEAD + rows.length * BAR_ROW;
  const headY = MARGIN + 14;
  const shapes = [
    `<text class="sub" x="${MARGIN}" y="${headY}">part</text>`,
    `<text class="sub" x="${barX}" y="${headY}">imported by</text>`,
    `<text class="sub" x="${doorsRight}" y="${headY}" text-anchor="end">${doorsHead}</text>`,
  ];
  rows.forEach((row, index) => {
    const cy = MARGIN + BAR_HEAD + index * BAR_ROW + BAR_ROW / 2;
    const solid = row.production * unit;
    const dashed = row.tests * unit;
    shapes.push(`<text x="${MARGIN}" y="${cy + 5}">${esc(row.name)}</text>`);
    if (solid > 0) shapes.push(`<rect class="bar" x="${barX}" y="${cy - BAR_HEIGHT / 2}" width="${solid}" height="${BAR_HEIGHT}"/>`);
    if (dashed > 0) shapes.push(`<rect class="bar bar-tests" x="${barX + solid}" y="${cy - TEST_BAR_HEIGHT / 2}" width="${dashed}" height="${TEST_BAR_HEIGHT}"/>`);
    shapes.push(`<text class="sub" x="${barX + solid + dashed + 8}" y="${cy + 5}">${esc(barEnd(row))}</text>`);
    shapes.push(`<text x="${doorsRight}" y="${cy + 5}" text-anchor="end">${row.doors}</text>`);
  });
  return `<svg class="breaks-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="atlasBreaksTitle atlasBreaksDesc">` +
    '<title id="atlasBreaksTitle">How many parts import each part, and how many doors pass through it</title>' +
    `<desc id="atlasBreaksDesc">${esc(breaksSentence(rows))}</desc>${shapes.join('')}</svg>`;
}

function renderBreaksFigure(page) {
  const svg = renderBreaks(page);
  if (!svg) return '';
  const legend = 'Each row is a part from the list above. The solid bar is how many other parts import it to run it; the thinner dashed bar continuing it is how many more import it only from tests; the number on the right is how many doors have it on their path.';
  return `<figure class="picture bars">${svg}<figcaption>${esc(legend)}</figcaption></figure>`;
}

/* ---------- the delta strip ---------- */

const STRIP_SHOWN = 52;
const STRIP_TALL = 96;
const STRIP_UNIT_MAX = 8;
const STRIP_BAR = 10;
const STRIP_PITCH_MIN = 22;
const STRIP_PITCH_MAX = 88;
const GLYPH = 12;
const DATE_CHAR = 7.2;
const DATE_GAP = 8;
const DAY = /^\d{4}-\d{2}-\d{2}/;

// A change kind gets a mark only where the glyph set has one that means it:
// an import is the import edge's arrowhead, and a new import that closes a
// cycle, the one fact a returning reader must not miss, gets the strongest.
const KIND_GLYPH = {
  cycle: 'atlasGlyphCycle',
  'import-added': 'atlasGlyphImport',
  'import-removed': 'atlasGlyphImport',
};

/**
 * The renders history.json records, oldest first, the newest fifty-two: the
 * day, how many structural changes that render's page named, and the kind of
 * its headline. An entry without a date cannot be placed and is left out.
 */
export function historyRows(history) {
  return arr(history?.entries)
    .filter((entry) => entry && typeof entry === 'object' && DAY.test(str(entry.renderedAt)))
    .slice(-STRIP_SHOWN)
    .map((entry) => ({
      date: str(entry.renderedAt).slice(0, 10),
      count: Math.max(0, Math.floor(Number(entry.itemCount) || 0)),
      kind: str(entry.headlineKind),
    }));
}

/** The sentence under the strip, and its description. */
export function deltaCaption(rows) {
  const lead = `${count(rows.length, 'render')} since ${rows[0].date}`;
  const changed = rows.filter((row) => row.count > 0);
  if (changed.length === 0) return `${lead}; none of them changed the structure.`;
  // On a tie the latest render is named, since it is the one a reader can still find.
  const largest = changed.reduce((best, row) => (row.count >= best.count ? row : best));
  return `${lead}; ${changed.length} of them changed the structure; the largest delta was ${count(largest.count, 'item')} on ${largest.date}.`;
}

// Which columns carry their date: the first, the last and every fourth,
// except a fourth whose label would run into one already placed. A date
// starts at its column's left edge, and the last ends at its right edge, so
// no label runs off the picture.
function dateLabels(rows, pitch) {
  const width = 10 * DATE_CHAR;
  const last = rows.length - 1;
  const extent = (index) => {
    const left = MARGIN + pitch * index;
    if (index === last && index > 0) return { index, anchor: 'end', x: left + pitch, from: left + pitch - width, to: left + pitch };
    return { index, anchor: 'start', x: left, from: left, to: left + width };
  };
  const kept = [extent(0)];
  if (last > 0) {
    const end = extent(last);
    if (end.from >= kept[0].to + DATE_GAP) kept.push(end);
  }
  for (let index = 4; index < last; index += 4) {
    const label = extent(index);
    if (kept.every((other) => label.to + DATE_GAP <= other.from || label.from >= other.to + DATE_GAP)) kept.push(label);
  }
  return kept.sort((a, b) => a.index - b.index);
}

// A symbol's content is drawn in the <use> element's shadow tree, where the
// page's class rules do not reach, so a mark takes its stroke from the <use>
// by inheritance and its one filled piece from an inline style.
const GLYPH_DEFS = '<defs>' +
  '<symbol id="atlasGlyphImport" viewBox="0 0 16 16"><title>an import between parts</title>' +
  '<path d="M4 3 L13 8 L4 13 Z"/></symbol>' +
  '<symbol id="atlasGlyphCycle" viewBox="0 0 16 16"><title>an import that closes a cycle</title>' +
  '<path d="M12.6 10.2 A5 5 0 1 1 11.2 4.2"/>' +
  '<path style="fill: var(--text); stroke: none" d="M9.4 1.6 L14.2 3.6 L10.4 7.4 Z"/></symbol>' +
  '</defs>';

/**
 * The delta strip as an SVG string, or '' without history: one column per
 * render whose height is how many structural changes it named, zero for a
 * render that changed nothing. Height is the only encoding.
 */
export function renderDelta(history) {
  const rows = historyRows(history);
  if (rows.length === 0) return '';
  const pitch = Math.round(Math.min(STRIP_PITCH_MAX, Math.max(STRIP_PITCH_MIN, 600 / rows.length)));
  const unit = Math.min(STRIP_UNIT_MAX, STRIP_TALL / Math.max(1, ...rows.map((row) => row.count)));
  const top = MARGIN + GLYPH + 4;
  const base = top + STRIP_TALL;
  const width = Math.max(MARGIN * 2 + pitch * rows.length, MARGIN * 2 + 10 * DATE_CHAR);
  const height = base + 20 + MARGIN;
  const shapes = [`<path class="base" d="M${MARGIN} ${base} H${MARGIN + pitch * rows.length}"/>`];
  rows.forEach((row, index) => {
    const cx = MARGIN + pitch * index + pitch / 2;
    const h = row.count * unit;
    shapes.push(`<path class="tick" d="M${cx} ${base} V${base + 4}"/>`);
    if (h > 0) shapes.push(`<rect class="col" x="${cx - STRIP_BAR / 2}" y="${base - h}" width="${STRIP_BAR}" height="${h}"/>`);
    const glyph = KIND_GLYPH[row.kind];
    if (glyph && row.count > 0) {
      shapes.push(`<use class="${row.kind === 'cycle' ? 'glyph glyph-strong' : 'glyph'}" href="#${glyph}" x="${cx - GLYPH / 2}" y="${base - h - GLYPH - 3}" width="${GLYPH}" height="${GLYPH}"/>`);
    }
  });
  for (const label of dateLabels(rows, pitch)) {
    shapes.push(`<text class="date" x="${label.x}" y="${base + 18}" text-anchor="${label.anchor}">${esc(rows[label.index].date)}</text>`);
  }
  return `<svg class="strip-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="atlasStripTitle atlasStripDesc">` +
    '<title id="atlasStripTitle">How much the structure changed at each render</title>' +
    `<desc id="atlasStripDesc">${esc(deltaCaption(rows))}</desc>${GLYPH_DEFS}${shapes.join('')}</svg>`;
}

function renderDeltaFigure(history) {
  const svg = renderDelta(history);
  if (!svg) return '';
  return `<figure class="picture strip">${svg}<figcaption>${esc(deltaCaption(historyRows(history)))}</figcaption></figure>`;
}

/* ---------- the fleet ---------- */

function ageWords(renderedAt, now) {
  const then = Date.parse(str(renderedAt));
  if (!Number.isFinite(then) || !Number.isFinite(now)) return 'map age unknown';
  const days = Math.max(0, Math.floor((now - then) / 86_400_000));
  if (days === 0) return 'mapped today';
  return `mapped ${count(days, 'day')} ago`;
}

/**
 * @param {object} fleet parsed fleet.json
 * @param {number} now milliseconds since the epoch, passed in so this stays pure
 * @param {{ served?: string|null }} [options] served, as for renderPage: the
 *   list is a private fleet's, not the public one
 */
export function renderFleet(fleet, now, options = {}) {
  const rows = arr(fleet?.repositories).filter((row) => row && typeof row === 'object');
  const served = servedBase(options.served);
  const lead = served
    ? 'One page per repository in this fleet, mapped on the schedule in fleet.yml.'
    : 'One page per public repository that has adopted Atlas, mapped weekly from the repository alone.';
  const head = `<h1>Atlas: how each repository works</h1><p class="mapped">${esc(lead)}</p>`;
  if (rows.length === 0) {
    return `${head}${state(served ? 'No repository in this fleet has been rendered yet.' : 'No public repository has adopted Atlas yet.')}`;
  }
  const sorted = [...rows].sort((a, b) => cmp(str(a.repo), str(b.repo)));
  const items = sorted.map((row) => {
    const repo = str(row.repo);
    const doors = typeof row.doors === 'number' ? count(row.doors, 'door') : 'doors not counted';
    const facts = `${esc(doors)} · ${esc(ageWords(row.renderedAt, now))}`;
    const name = isRepo(repo) ? `<a href="${esc(repoHref(repo))}">${esc(repo)}</a>` : esc(repo);
    return `${name} <span class="facts">${facts}</span>`;
  });
  return `${head}<section><h2>${esc(count(rows.length, 'repository', 'repositories'))} rendered</h2>\n${ul(items)}</section>`;
}

export function state(message) {
  return `<p class="state" role="status">${esc(message)}</p>`;
}
