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

export function markdownUrl(repo) {
  return `https://github.com/dogfood-lab/testing-os/blob/atlas-render/indexes/atlas/${segments(repo)}/README.md`;
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
  const doors = arr(page?.doors).filter((door) => door && typeof door === 'object');
  const main = doors.find((door) => !door.parseError && door.file === page?.mainDoor) ?? null;
  return { page: page ?? {}, repo, commit, doors, main };
}

function runs(ctx, door) {
  return arr(door.runs).map((path) => ({ html: pathHtml(ctx, path), text: str(path) }));
}

function runsShown(items) {
  if (items.length <= RUNS_SHOWN) return list(items.map((item) => item.html));
  return `${items.slice(0, RUNS_SHOWN).map((item) => item.html).join(', ')} and ${items.length - RUNS_SHOWN} more`;
}

function runsShownText(items) {
  if (items.length <= RUNS_SHOWN) return list(items.map((item) => item.text));
  return `${items.slice(0, RUNS_SHOWN).map((item) => item.text).join(', ')} and ${items.length - RUNS_SHOWN} more`;
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

function fileCount(entry) {
  return `${esc(entry.boundary)} (${esc(count(Number(entry.files) || 0, 'file'))})`;
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
  if (!ctx.main) return `${parts}. Work enters through ${doors}, and none of their workflows could be read.`;
  const reach = count(arr(ctx.main.reach).length, 'part');
  return `${parts}. Work enters through ${doors}; the busiest is ${ctx.main.name}, which reaches ${reach}.`;
}

function whatThisIs(ctx, figure) {
  const body = [];
  const summary = str(ctx.page.summary).replace(/\s+/g, ' ').trim();
  if (summary) body.push(p(`${esc(summary)} (written by a person)`));
  body.push(p(esc(derivedLine(ctx))));
  if (figure) body.push(figure);
  return section('What this is', body.join('\n'));
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
  if (changes.first) return section(heading, p('This is the first map.'));
  const sentences = arr(changes.items).filter((item) => item && typeof item === 'object').map((item) => inline(item.sentence));
  if (sentences.length === 0) return '';
  return section(heading, changes.unchanged ? p(sentences.join(' ')) : ul(sentences));
}

function comesIn(ctx) {
  const items = ctx.doors.map((door) => {
    const name = `<strong>${esc(door.name)}.</strong>`;
    if (door.parseError) return `${name} This workflow could not be read.`;
    const when = capitalize(arr(door.triggers).map(str).join('; ')) || 'Nothing this map can read starts it';
    const paths = runs(ctx, door);
    const ran = paths.length > 0 ? `Runs ${runsShown(paths)}.` : 'Runs no file this map can see.';
    return `${name} ${inline(when)}. ${ran}`;
  });
  return section('What comes in', ol(items));
}

// page.json does not record which part each run belongs to, so the first step
// names the files without the markdown's "in <part>" grouping.
function doorSteps(ctx, door) {
  const steps = [];
  const paths = runs(ctx, door);
  steps.push(paths.length > 0
    ? `The workflow runs ${list(paths.map((item) => item.html))}.`
    : 'The workflow runs no file this map can see.');
  for (const level of deeper(door)) steps.push(`That reaches ${list(level.entries.map(fileCount))}.`);
  if (arr(door.landings).length > 0) steps.push(`It writes to ${placesHtml(ctx, door.landings)}.`);
  if (arr(door.stages).length > 0) steps.push(`It commits ${commitsClause(ctx, door)}.`);
  for (const send of arr(door.sends)) steps.push(`It ${inline(send)}.`);
  return steps;
}

// The name page.js gives a part, which page.json carries next to its id. A
// page.json written before the label existed falls back to the id.
function partName(item) {
  if (item?.part == null) return null;
  return item.partLabel == null ? str(item.part) : str(item.partLabel);
}

// A method called on an object is named with the object's class, "train
// (Trainer)". Another part is named after the first step that goes into it,
// once.
function stepTexts(steps, ownPart) {
  const named = new Set();
  return arr(steps).filter((step) => step && typeof step === 'object').map((step) => {
    const notes = [];
    if (step.receiver != null) notes.push(str(step.receiver));
    const part = step.part == null ? null : str(step.part);
    if (part != null && part !== ownPart && !named.has(part)) {
      named.add(part);
      notes.push(partName(step));
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
    items.push(inOrder(`Inside ${pathHtml(ctx, sequence.file)}, ${esc(sequence.phrase)} does, in order:`, stepTexts(sequence.steps, own)));
    // page.json holds only the called functions the markdown shows, in the
    // order the entry calls them. A part is named only when it is not the
    // entry file's own.
    for (const inner of arr(sequence.inner)) {
      if (!inner || typeof inner !== 'object') continue;
      const part = inner.part == null ? null : str(inner.part);
      let where = null;
      if (part != null && part !== own) where = esc(partName(inner));
      else if (part == null && inner.file) where = pathHtml(ctx, inner.file);
      const lead = `<strong>${esc(capitalize(str(inner.phrase)))}</strong>${where ? ` (${where})` : ''} runs, in order:`;
      items.push(inOrder(lead, stepTexts(inner.steps, part)));
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
      : `${target} is read by ${list(readers.map((reader) => readerHtml(ctx, reader)))}.`;
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
    clauses.push(paths.length > 0
      ? { html: `runs ${runsShown(paths)}`, text: `runs ${runsShownText(paths)}` }
      : { html: 'runs no file this map can see', text: 'runs no file this map can see' });
    const reached = [...new Set(deeper(door).flatMap((level) => level.entries.map((entry) => str(entry.boundary))))].sort(cmp);
    if (reached.length > 0) clauses.push({ html: `reaches ${list(reached.map(esc))}`, text: `reaches ${list(reached)}` });
    const landings = arr(door.landings).map(str);
    if (landings.length > 0) clauses.push({ html: `writes to ${placesHtml(ctx, landings)}`, text: `writes to ${list(landings)}` });
    const stages = arr(door.stages).map(str);
    if (stages.length > 0) {
      const text = door.pushes ? (stages.length > 1 ? `${list(stages)}, then pushes` : `${list(stages)} and pushes`) : list(stages);
      clauses.push({ html: `commits ${commitsClause(ctx, door)}`, text: `commits ${text}` });
    }
    for (const send of arr(door.sends)) clauses.push({ html: inline(send), text: str(send) });
    return p(`<strong>${esc(door.name)}</strong> ${clauseList(clauses)}.`);
  });
  return section('The other doors', paragraphs.join('\n'));
}

function breakLine(ctx, entry) {
  if (entry?.kind === 'place') {
    const writers = arr(entry.writers).map(esc);
    const readers = arr(entry.readers).map(esc);
    const comma = writers.length > 1 ? ',' : '';
    return `<strong>${pathHtml(ctx, entry.target)}</strong> is written by ${list(writers)}${comma} and read by ${list(readers)}; a hand edit reaches every reader.`;
  }
  const importedBy = arr(entry?.importedBy).map(str);
  const imported = importedBy.length === 0
    ? 'is imported by no other part'
    : `is imported by ${count(importedBy.length, 'part')} (${esc(importedBy.join(', '))})`;
  const doors = Number(entry?.doors) || 0;
  const path = doors === 0 ? 'no door' : count(doors, 'door');
  return `<strong>${esc(entry?.name)}</strong> ${imported} and sits on the path of ${path}.`;
}

function breaksSection(ctx) {
  const entries = arr(ctx.page.breaks);
  const body = entries.length > 0
    ? ul(entries.map((entry) => breakLine(ctx, entry)))
    : p('No part is imported by another part, and no part sits on the path of two doors.');
  return section('What breaks what', body);
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
    ? [ul(items.map((item) => `<strong>${esc(partName(item) ?? '')}</strong> is imported by no test.`))]
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
      return `<strong>${pathHtml(ctx, item.place)}</strong> is written by ${list(writers.map((writer) => pathHtml(ctx, writer)))}${comma} and read by nothing else in this repository.`;
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
        ? `${place} is written by ${list(writers.map((writer) => pathHtml(ctx, writer)))}.`
        : `${place} is written by code this map cannot name.`;
    }))
    : p('Nothing in this repository writes to a tracked place this map can see.');
  return section('Generated, never hand-edited', body);
}

function authoredSection(ctx) {
  const places = arr(ctx.page.authored);
  const body = places.length > 0
    ? p(`People write ${list(places.map((place) => pathHtml(ctx, place)))}. Nothing in this repository writes to them.`)
    : p('No configuration or documentation part is left to people alone.');
  return section('Hand-authored', body);
}

// page.json keeps the trigger as the sentence page.js wrote, so the noun for
// "follow one ... end to end" is read back from that sentence's fixed forms.
export function triggerNoun(door) {
  const phrases = arr(door?.triggers).map(str);
  const first = phrases.find((phrase) => phrase !== 'by hand' && phrase !== 'or by hand') ?? phrases[0];
  if (!first) return 'run';
  const event = /^when a repository sends a `(.+)` event$/.exec(first);
  if (event) return event[1].replace(/[_-]+/g, ' ');
  if (first === 'when a repository sends a dispatch') return 'dispatch';
  if (first.startsWith('on a schedule')) return 'scheduled run';
  if (first.startsWith('when a tag matching')) return 'tag push';
  if (first.startsWith('on a push')) return 'push';
  if (first === 'on a pull request') return 'pull request';
  if (first === 'by hand') return 'run by hand';
  return 'run';
}

function startSection(ctx) {
  if (!ctx.main) return section('Where to start', p('No door was found, so there is no path through this repository to follow.'));
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
 * @param {{ repo?: string }} [options] repo is the validated owner/name the
 *   page was requested for; links are built from it, never from unchecked JSON.
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
  const links = ctx.repo
    ? `<p class="links"><a href="${esc(markdownUrl(ctx.repo))}">The same page as markdown, on the render branch</a> · <a href="./">Every rendered repository</a></p>`
    : '<p class="links"><a href="./">Every rendered repository</a></p>';
  const parts = [
    `<h1>${esc(title)}</h1>`,
    `<p class="mapped">Mapped at ${esc(date)} from commit ${commitHtml}.</p>`,
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
      nodes: depthZero.map((entry) => node(str(entry.boundary), count(Number(entry.files) || 0, 'file'))),
    });
  }
  for (const level of deeper(main)) {
    columns.push({
      kind: 'parts',
      depth: level.depth,
      nodes: level.entries.map((entry) => node(str(entry.boundary), count(Number(entry.files) || 0, 'file'))),
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
      for (const reader of arr(group.readers).map(str)) {
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
  const main = context(page).main;
  const clauses = [];
  const zero = arr(main.reach).filter((entry) => Number(entry?.depth) === 0).map((entry) => str(entry.boundary));
  clauses.push(zero.length > 0 ? `runs code in ${list(zero)}` : 'runs no part this map can see');
  const levels = deeper(main).map((level) => list(level.entries.map((entry) => str(entry.boundary))));
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
 */
export function renderFleet(fleet, now) {
  const rows = arr(fleet?.repositories).filter((row) => row && typeof row === 'object');
  const head = '<h1>Atlas: how each repository works</h1>' +
    '<p class="mapped">One page per public repository that has adopted Atlas, mapped weekly from the repository alone.</p>';
  if (rows.length === 0) return `${head}${state('No public repository has adopted Atlas yet.')}`;
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
