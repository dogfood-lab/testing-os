import { createHash } from 'node:crypto';
import { isTestPath } from './templates.js';

const DAY_MS = 86400000;
const WITHDRAW_DAYS = 28;
const NEIGHBOUR_CAP = 8;
const PAIR_CAP = 25;
const DEFAULT_BUDGET = 2500;

const ROLE_GLYPH = { code: '⌘', test: '⚗', docs: '¶', config: '⚙' };

const LEGEND = [
  '────────▶   import        one boundary statically imports another',
  '────────▣   chunk         same, recovered from a bundle; boundary grain, file unknown',
  '· · · · ·   co-change     changed together, no import; width = strength',
  '⚠           low confidence: the words "low confidence" precede every number that rests on the fallen floor',
].join('\n');

const RULE = [
  'rule: if now (UTC) is after withdraw-after, do not load the statistics file;',
  '      withdrawn numbers are not evidence that files are uncoupled',
].join('\n');

function cmp(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function doc(parts) {
  return `${parts.filter((part) => part != null && part !== '').join('\n\n')}\n`;
}

function table(headers, rows) {
  const cell = (value) => String(value).replace(/\|/g, '/');
  const head = `| ${headers.map(cell).join(' | ')} |`;
  const rule = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

function shortSha(commit) {
  return String(commit ?? '').slice(0, 7);
}

export function withdrawStamp(generatedAt) {
  const then = Date.parse(generatedAt);
  if (!Number.isFinite(then)) return generatedAt ?? '';
  const stamp = new Date(then + WITHDRAW_DAYS * DAY_MS).toISOString();
  if (/\.\d+Z$/.test(generatedAt)) return stamp;
  return stamp.replace(/\.\d+Z$/, 'Z');
}

function ageLine(ctx) {
  const generatedAt = ctx.statistics.generatedAt ?? '';
  const then = Date.parse(generatedAt);
  const at = ctx.now.getTime();
  const elapsed = Number.isFinite(then) ? Math.floor((at - then) / DAY_MS) : 0;
  const days = Math.max(elapsed, 0);
  const relative = days === 1 ? '1 day ago' : `${days} days ago`;
  let line = `◷ numbers as of ${generatedAt.slice(0, 10)} · ${relative}`;
  if (Number.isFinite(then) && at > then + WITHDRAW_DAYS * DAY_MS) {
    line += ' · historical';
    if (ctx.publicRepository) line += ' · the central page has the newer copy (a future surface)';
  }
  return line;
}

function confidenceLine(ctx) {
  return ctx.low ? '⚠ low confidence' : null;
}

function fanInCounts(structure) {
  const counts = new Map();
  for (const boundary of structure.boundaries ?? []) counts.set(boundary.name, 0);
  for (const edge of structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
  }
  return counts;
}

function chooseStart(structure, fanIn) {
  const boundaries = structure.boundaries ?? [];
  const pick = (status) => boundaries
    .filter((boundary) => boundary.status === status)
    .sort((a, b) => (fanIn.get(b.name) - fanIn.get(a.name)) || cmp(a.name, b.name))[0];
  return pick('accepted') ?? pick('proposed') ?? pick('deferred') ?? null;
}

function locateFiles(structure) {
  const map = new Map();
  for (const boundary of structure.boundaries ?? []) {
    for (const file of boundary.files ?? []) map.set(file.path, boundary.name);
  }
  return map;
}

function churnCounter(structure, statistics) {
  const lines = new Map();
  for (const file of statistics.churn?.files ?? []) lines.set(file.path, file.lines ?? 0);
  const totals = new Map();
  for (const boundary of structure.boundaries ?? []) {
    let sum = 0;
    for (const file of boundary.files ?? []) sum += lines.get(file.path) ?? 0;
    totals.set(boundary.name, sum);
  }
  return (name) => totals.get(name) ?? 0;
}

function budgetOf(document) {
  const value = document?.machine_budget;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  return DEFAULT_BUDGET;
}

function buildContext({ structure, statistics, document, now, testCommand, publicRepository }) {
  const fanIn = fanInCounts(structure);
  return {
    structure,
    statistics,
    document,
    now,
    testCommand,
    publicRepository: publicRepository === true,
    low: statistics.confidence?.level === 'low',
    fanIn,
    start: chooseStart(structure, fanIn),
    locate: locateFiles(structure),
    churn: churnCounter(structure, statistics),
    byName: new Map((document.boundaries ?? []).map((boundary) => [boundary.name, boundary])),
    breakage: new Map((statistics.boundaries ?? []).map((boundary) => [boundary.name, boundary])),
    withdraw: withdrawStamp(statistics.generatedAt),
    budget: budgetOf(document),
  };
}

function whatThisIs(ctx) {
  const summary = typeof ctx.document.summary === 'string' ? ctx.document.summary.trim() : '';
  const sentence = summary || 'unnamed: what this repository is';
  const boundaries = ctx.structure.boundaries ?? [];
  const unnamed = boundaries.filter((boundary) => boundary.status !== 'accepted').length;
  const noun = boundaries.length === 1 ? 'boundary' : 'boundaries';
  return `${sentence}\n${boundaries.length} ${noun}. ${unnamed} still unnamed.`;
}

function captions() {
  return [
    'If you maintain this repository: this is the map you would draw from memory, checked against the tree. Start where it disagrees with you.',
    'If you are new here: you have not opened this repository before. Start with the three actions below; each one tells you what to expect.',
  ].join('\n');
}

function orderedNeighbours(ctx, name) {
  const imports = new Set();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from === name) imports.add(edge.to);
    else if (edge.to === name) imports.add(edge.from);
  }
  imports.delete(name);
  const ordered = [...imports].sort(cmp);
  const seen = new Set([name, ...ordered]);
  const coChange = new Set();
  for (const pair of ctx.statistics.pairs ?? []) {
    const left = ctx.locate.get(pair.a);
    const right = ctx.locate.get(pair.b);
    if (!left || !right || left === right) continue;
    const other = left === name ? right : right === name ? left : null;
    if (other && !seen.has(other)) coChange.add(other);
  }
  return [...ordered, ...[...coChange].sort(cmp)];
}

function pictureEdges(ctx, visible) {
  const edges = [];
  for (const edge of ctx.structure.edges ?? []) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue;
    if (edge.kind === 'chunk') edges.push({ from: edge.from, to: edge.to, style: 'chunk' });
    else if (edge.kind === 'file') edges.push({ from: edge.from, to: edge.to, style: 'import' });
  }
  const seen = new Set();
  for (const pair of ctx.statistics.pairs ?? []) {
    const left = ctx.locate.get(pair.a);
    const right = ctx.locate.get(pair.b);
    if (!left || !right || left === right) continue;
    if (!visible.has(left) || !visible.has(right)) continue;
    const [from, to] = cmp(left, right) <= 0 ? [left, right] : [right, left];
    const key = `${from}\0${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, style: 'co-change' });
  }
  edges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.style, b.style));
  return edges;
}

function filteredPicture(ctx) {
  const neighbours = ctx.start ? orderedNeighbours(ctx, ctx.start.name) : [];
  const shown = neighbours.slice(0, NEIGHBOUR_CAP);
  const visible = new Set(shown);
  if (ctx.start) visible.add(ctx.start.name);
  return {
    nodes: (ctx.structure.boundaries ?? []).filter((boundary) => visible.has(boundary.name)),
    edges: pictureEdges(ctx, visible),
    unassigned: (ctx.structure.unassigned ?? []).length,
    overflow: neighbours.length > NEIGHBOUR_CAP ? neighbours.length - NEIGHBOUR_CAP : 0,
  };
}

function fullPicture(ctx) {
  const visible = new Set((ctx.structure.boundaries ?? []).map((boundary) => boundary.name));
  return {
    nodes: ctx.structure.boundaries ?? [],
    edges: pictureEdges(ctx, visible),
    unassigned: (ctx.structure.unassigned ?? []).length,
    overflow: 0,
  };
}

function freshId(name, used) {
  const base = `n_${String(name).replace(/[^A-Za-z0-9]/g, '_')}`;
  let id = base;
  let n = 2;
  while (used.has(id) || id === 'unassigned' || id === 'more') {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

function escapeLabel(label) {
  return label.replace(/"/g, "'").replace(/\]/g, ')').replace(/\r?\n/g, ' ');
}

function mermaid(picture) {
  const used = new Set(['unassigned', 'more']);
  const ids = new Map();
  const lines = ['flowchart LR'];
  const nodes = [...picture.nodes].sort((a, b) => cmp(a.name, b.name));
  for (const node of nodes) {
    const id = freshId(node.name, used);
    ids.set(node.name, id);
    const glyph = ROLE_GLYPH[node.role] ?? '·';
    lines.push(`${id}["${escapeLabel(`${glyph} ${node.name} · ${node.files.length}`)}"]`);
  }
  if (picture.overflow > 0) lines.push(`more["${escapeLabel(`+ ${picture.overflow} more`)}"]`);
  lines.push(`unassigned["${escapeLabel(`· unassigned · ${picture.unassigned}`)}"]:::unassigned`);
  for (const edge of picture.edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (!from || !to) continue;
    if (edge.style === 'co-change') lines.push(`${from} -.-> ${to}`);
    else if (edge.style === 'chunk') lines.push(`${from} -->|chunk| ${to}`);
    else lines.push(`${from} --> ${to}`);
  }
  lines.push('classDef unassigned stroke-dasharray: 4 3');
  return ['```mermaid', ...lines, '```'].join('\n');
}

function importConfidenceNote(nodes) {
  const low = nodes.filter((node) => node.importConfidence === 'low').map((node) => node.name).sort(cmp);
  if (low.length === 0) return null;
  return `⚠ low confidence: ${low.join(', ')}`;
}

function mapSection(ctx, filtered) {
  const picture = filtered ? filteredPicture(ctx) : fullPicture(ctx);
  const lines = ['## Map'];
  if (!filtered && (ctx.structure.boundaries ?? []).length > 20) lines.push('The matrix is on the site.');
  lines.push(mermaid(picture));
  const note = importConfidenceNote(picture.nodes);
  if (note) lines.push(note);
  if (picture.overflow > 0) lines.push(`[+ ${picture.overflow} more](atlas/dev.md)`);
  return lines.join('\n\n');
}

function squash(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function entryPoint(ctx, boundary) {
  const authored = ctx.byName.get(boundary.name);
  if (authored && typeof authored.start_here === 'string' && authored.start_here.trim()) return authored.start_here.trim();
  if (boundary.entryPoints?.length > 0) return boundary.entryPoints[0];
  return 'no entry point derived';
}

function breakSentence(ctx, boundary) {
  const authored = ctx.byName.get(boundary.name);
  const text = authored && typeof authored.will_break === 'string' ? squash(authored.will_break) : '';
  const sentence = text || 'no will_break sentence';
  if (authored && authored.will_break_from === 'human' && text) return sentence;
  return `${sentence} (derived)`;
}

function filesWord(count) {
  return count === 1 ? '1 file' : `${count} files`;
}

function coverLine(ctx, start) {
  const parts = [];
  const own = (start.files ?? []).filter((file) => isTestPath(file.path)).length;
  if (own > 0) parts.push(`its own (${filesWord(own)})`);
  const incoming = new Set();
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.to === start.name) incoming.add(edge.from);
  }
  const covers = (ctx.structure.boundaries ?? []).filter((boundary) => (
    boundary.role === 'test' && boundary.name !== start.name && incoming.has(boundary.name)
  ));
  covers.sort((a, b) => cmp(a.name, b.name));
  for (const boundary of covers) parts.push(`${boundary.name} (${filesWord(boundary.files.length)})`);
  if (parts.length === 0) return 'not covered by any test boundary';
  return parts.join(' · ');
}

function actions(ctx) {
  const start = ctx.start;
  const open = start ? entryPoint(ctx, start) : 'no entry point derived';
  const sentence = start ? breakSentence(ctx, start) : 'no will_break sentence (derived)';
  const cover = start ? coverLine(ctx, start) : 'not covered by any test boundary';
  return [
    '## Where to start',
    `1. OPEN ${open}`,
    `2. RUN ${ctx.testCommand}`,
    '   passes when: exit 0',
    `3. BREAK ${sentence}`,
    `   tests that cover it: ${cover}`,
  ].join('\n');
}

function namesCell(names) {
  return names && names.length > 0 ? names.join(' · ') : 'none';
}

function breakageTable(row) {
  return table(['relationship', 'boundaries'], [
    ['imports & co-changes', namesCell(row?.importsAndCoChanges)],
    ['imports only', namesCell(row?.importsOnly)],
    ['co-changes only', namesCell(row?.coChangesOnly)],
  ]);
}

function breakageSection(ctx, boundaries, heading) {
  const lines = [heading, ageLine(ctx)];
  const marker = confidenceLine(ctx) ?? 'confidence: full';
  lines.push(marker);
  const ordered = [...boundaries].sort((a, b) => cmp(a.name, b.name));
  for (const boundary of ordered) {
    if (ordered.length > 1) lines.push(`### ${boundary.name}`);
    const row = ctx.breakage.get(boundary.name)?.breakage;
    if (row?.collapsed) lines.push('The table fell to fan-in.');
    lines.push(breakageTable(row));
  }
  return lines.join('\n\n');
}

function stillUnnamed(ctx) {
  const unnamed = (ctx.structure.boundaries ?? []).filter((boundary) => boundary.status !== 'accepted').length;
  const files = (ctx.structure.unassigned ?? []).length;
  const fileWord = files === 1 ? '1 unassigned file' : `${files} unassigned files`;
  return ['## Still unnamed', `${unnamed} still unnamed. ${fileWord}.`, 'atlas/boundaries.yaml'].join('\n');
}

function renderOrientation(ctx) {
  const start = ctx.start;
  const breakage = start
    ? breakageSection(ctx, [start], `## What you will break — ${start.name}`)
    : breakageSection(ctx, [], '## What you will break');
  return doc([
    ageLine(ctx),
    ['## What this is', whatThisIs(ctx)].join('\n\n'),
    captions(),
    mapSection(ctx, true),
    ['## Legend', LEGEND].join('\n\n'),
    actions(ctx),
    breakage,
    stillUnnamed(ctx),
  ]);
}

function hotspots(ctx) {
  const rows = [...(ctx.structure.boundaries ?? [])]
    .sort((a, b) => (ctx.churn(b.name) - ctx.churn(a.name)) || cmp(a.name, b.name))
    .map((boundary) => {
      const row = ctx.breakage.get(boundary.name);
      const cohesion = row?.cohesion == null ? 'none' : String(row.cohesion);
      return [boundary.name, String(ctx.churn(boundary.name)), cohesion, String(boundary.unresolvedSites ?? 0), boundary.importConfidence ?? 'full'];
    });
  const lines = [
    '## Hotspots',
    ageLine(ctx),
    confidenceLine(ctx),
    'churn is the sum of lines, added plus deleted, over the boundary\'s files.',
    table(['boundary', 'churn', 'cohesion', 'unresolved sites', 'import confidence'], rows),
  ];
  return lines.filter((line) => line != null).join('\n\n');
}

function pairRows(ctx) {
  return [...(ctx.statistics.pairs ?? [])].sort((a, b) => (
    (b.strength - a.strength) || cmp(a.a, b.a) || cmp(a.b, b.b)
  ));
}

function pairsSection(ctx) {
  const ranked = pairRows(ctx);
  const lines = [
    '## Pairs',
    ageLine(ctx),
    confidenceLine(ctx),
    table(['a', 'b', 'shared', 'either', 'strength'], ranked.slice(0, PAIR_CAP).map((pair) => [
      pair.a, pair.b, String(pair.shared), String(pair.either), String(pair.strength),
    ])),
    `${ranked.length} pairs`,
  ];
  return lines.filter((line) => line != null).join('\n\n');
}

function pendingRebaseline(ctx) {
  const names = [];
  for (const boundary of ctx.document.boundaries ?? []) {
    const wanted = boundary.rebaseline || null;
    const recorded = ctx.breakage.get(boundary.name)?.rebaseline || null;
    if (wanted !== recorded) names.push(boundary.name);
  }
  names.sort(cmp);
  return names;
}

function divergenceSection(ctx) {
  const dropped = (ctx.statistics.boundaries ?? [])
    .filter((boundary) => boundary.cohesionDropped === true)
    .map((boundary) => boundary.name)
    .sort(cmp);
  const droppedLine = dropped.length === 0
    ? '0 boundaries with cohesion dropped.'
    : `${dropped.length} boundaries with cohesion dropped: ${dropped.join(', ')}.`;
  const pending = pendingRebaseline(ctx);
  const pendingLine = pending.length === 0 ? 'pending rebaseline: none' : `pending rebaseline: ${pending.join(', ')}`;
  const lines = ['## Divergence', ageLine(ctx), confidenceLine(ctx), droppedLine, pendingLine];
  return lines.filter((line) => line != null).join('\n\n');
}

function nestedList(paths) {
  const root = { children: {} };
  for (const path of paths) {
    let node = root;
    for (const part of String(path).split('/')) {
      node.children[part] ??= { children: {} };
      node = node.children[part];
    }
  }
  const lines = [];
  function walk(node, depth) {
    for (const name of Object.keys(node.children).sort(cmp)) {
      lines.push(`${'  '.repeat(depth)}- ${name}`);
      walk(node.children[name], depth + 1);
    }
  }
  walk(root, 0);
  return lines.join('\n');
}

function roster(ctx) {
  const lines = ['## Roster'];
  const boundaries = [...(ctx.structure.boundaries ?? [])].sort((a, b) => cmp(a.name, b.name));
  for (const boundary of boundaries) {
    lines.push(`### ${boundary.name} (${boundary.files.length})`);
    const list = nestedList((boundary.files ?? []).map((file) => file.path));
    if (list) lines.push(list);
  }
  const unassigned = ctx.structure.unassigned ?? [];
  if (unassigned.length > 0) {
    lines.push(`### unassigned (${unassigned.length})`);
    const list = nestedList(unassigned.map((file) => file.path));
    if (list) lines.push(list);
  }
  return lines.join('\n\n');
}

function renderDev(ctx) {
  const sha = shortSha(ctx.statistics.generatedFrom?.commit ?? ctx.structure.generatedFrom?.commit);
  const legend = `<details>\n<summary>Legend</summary>\n\n${LEGEND}\n</details>`;
  return doc([
    `${ageLine(ctx)} · structure @ ${sha}`,
    mapSection(ctx, false),
    hotspots(ctx),
    breakageSection(ctx, ctx.structure.boundaries ?? [], '## Breakage'),
    pairsSection(ctx),
    divergenceSection(ctx),
    roster(ctx),
    legend,
  ]);
}

function edgeList(ctx, name, direction) {
  const items = [];
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    const hit = direction === 'out' ? edge.from === name : edge.to === name;
    if (!hit) continue;
    const other = direction === 'out' ? edge.to : edge.from;
    items.push(edge.kind === 'chunk' ? `${other} (chunk)` : other);
  }
  items.sort(cmp);
  return items.length > 0 ? items.join(', ') : 'none';
}

function entryList(boundary) {
  return boundary.entryPoints?.length > 0 ? boundary.entryPoints.join(', ') : 'none';
}

function coarseLine(ctx, boundary) {
  const low = boundary.importConfidence === 'low' ? '⚠ low confidence  ' : '';
  return [
    boundary.name,
    boundary.role,
    boundary.status,
    `files ${boundary.files.length}`,
    `${low}imports → ${edgeList(ctx, boundary.name, 'out')}`,
    `← imported by ${edgeList(ctx, boundary.name, 'in')}`,
    `entry points: ${entryList(boundary)}`,
  ].join('  ');
}

function touchingEdges(ctx, name) {
  const edges = [];
  for (const edge of ctx.structure.edges ?? []) {
    if (edge.kind !== 'file' && edge.kind !== 'chunk') continue;
    if (edge.from !== name && edge.to !== name) continue;
    const kind = edge.kind === 'chunk' ? 'chunk' : 'import';
    edges.push(`${edge.from} → ${edge.to} (${kind})`);
  }
  edges.sort(cmp);
  return edges;
}

function fineBlock(ctx, boundary) {
  const lines = [
    `### ${boundary.name}`,
    `entry points: ${entryList(boundary)}`,
    `unresolved sites: ${boundary.unresolvedSites ?? 0}`,
  ];
  if (boundary.importConfidence === 'low') lines.push('⚠ low confidence');
  const edges = touchingEdges(ctx, boundary.name);
  lines.push(edges.length > 0 ? `edges:\n${edges.map((edge) => `- ${edge}`).join('\n')}` : 'edges: none');
  const files = (boundary.files ?? []).map((file) => file.path).sort(cmp);
  lines.push(files.length > 0 ? `files:\n${files.map((file) => `- ${file}`).join('\n')}` : 'files: none');
  return lines;
}

function rankedBoundaries(ctx) {
  return [...(ctx.structure.boundaries ?? [])].sort((a, b) => (
    (ctx.fanIn.get(b.name) - ctx.fanIn.get(a.name)) || (ctx.churn(b.name) - ctx.churn(a.name)) || cmp(a.name, b.name)
  ));
}

function fineBody(ctx) {
  const comment = '<!-- tokens estimated as characters divided by four -->';
  const lines = [comment];
  const ranked = rankedBoundaries(ctx);
  for (let i = 0; i < ranked.length; i += 1) {
    const block = fineBlock(ctx, ranked[i]);
    let added = 0;
    for (const line of block) {
      const next = [...lines, line].join('\n');
      if (next.length / 4 > ctx.budget) {
        if (added > 0) lines.push(`truncated within ${ranked[i].name}`);
        const notStarted = ranked.length - i - (added > 0 ? 1 : 0);
        if (notStarted > 0) lines.push(`truncated: ${notStarted} boundaries omitted`);
        return lines.join('\n');
      }
      lines.push(line);
      added += 1;
    }
  }
  return lines.join('\n');
}

function confidenceHeader(ctx) {
  if (!ctx.low) return 'confidence: full';
  const reason = ctx.statistics.confidence?.reason ?? '';
  return reason ? `confidence: low — ${reason}` : 'confidence: low';
}

function renderMachine(ctx, hash) {
  const commit = ctx.statistics.generatedFrom?.commit ?? ctx.structure.generatedFrom?.commit ?? '';
  const boundaries = ctx.structure.boundaries ?? [];
  const unresolved = boundaries.reduce((sum, boundary) => sum + (boundary.unresolvedSites ?? 0), 0);
  const header = [
    `generated: ${shortSha(commit)}  ${ctx.statistics.generatedAt}`,
    `structure: ${boundaries.length} boundaries · ${(ctx.structure.unassigned ?? []).length} unassigned · ${unresolved} unresolved sites`,
    `statistics: atlas/machine-stats.txt · sha256 ${hash} · withdraw-after: ${ctx.withdraw}`,
    RULE,
    confidenceHeader(ctx),
  ].join('\n');
  const coarse = ['## Coarse', ...[...boundaries].sort((a, b) => cmp(a.name, b.name)).map((boundary) => coarseLine(ctx, boundary))];
  return `${header}\n\n${coarse.join('\n')}\n\n## Fine\n\n${fineBody(ctx)}\n`;
}

function renderStats(ctx) {
  return doc([RULE, `withdraw-after: ${ctx.withdraw}`, pairsSection(ctx), breakageSection(ctx, ctx.structure.boundaries ?? [], '## Breakage')]);
}

export function renderAll(input) {
  const ctx = buildContext(input);
  const stats = renderStats(ctx);
  const hash = createHash('sha256').update(stats).digest('hex');
  return {
    orientation: renderOrientation(ctx),
    dev: renderDev(ctx),
    machine: renderMachine(ctx, hash),
    stats,
  };
}

export function statedHashProblem(machineText, statsBytes) {
  const actual = createHash('sha256').update(statsBytes).digest('hex');
  const match = String(machineText).match(/^statistics: .*sha256 ([0-9a-f]{64}) · /m);
  if (!match || match[1] !== actual) return 'the hash in atlas/machine.md does not equal the hash of atlas/machine-stats.txt';
  return null;
}
