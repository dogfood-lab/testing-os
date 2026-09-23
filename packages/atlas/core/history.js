import { spawnSync } from 'node:child_process';

/**
 * Churn counts every commit in the window, including merges and commits
 * that coupling drops. lines is added plus deleted. Coupling strength is
 * the shared qualifying commits divided by the commits that touch either
 * file, which is the union of the two files' qualifying commits.
 */

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) return null;
  return result.stdout;
}

export function headCommitter(repo) {
  const out = git(repo, ['show', '-s', '--format=%cI', 'HEAD']);
  return out ? out.trim() : null;
}

export function windowStart(iso, days) {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

export const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.py'];
export const SOURCE_FILE_REACH = 20;
export const SOURCE_FILE_RISE = 25;

export function isSourcePath(path) {
  const base = String(path).slice(Math.max(String(path).lastIndexOf('/'), String(path).lastIndexOf('\\')) + 1).toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => base.endsWith(ext));
}

/**
 * The shared-commit floor, strong or fallen. The source-file count moves by
 * one file at a time, so a repository near twenty would flip between the two
 * floors on successive maps and its co-change section between a list and
 * nothing. The count therefore has two thresholds: the floor falls below
 * sourceFileReach and rises again only at sourceFileRise. Which applies is
 * decided by options.priorFloor, the floor the previous map used; without
 * one, the floor falls below sourceFileReach as it always did. Thin history
 * has no band: the qualifying-commit count is not what flips.
 */
export function decideFloor(qualifyingCommits, sourceFilesReachingStrongFloor, options = {}) {
  const qualifyingMinimum = options.qualifyingMinimum ?? 30;
  const sourceFileReach = options.sourceFileReach ?? SOURCE_FILE_REACH;
  const sourceFileRise = Math.max(options.sourceFileRise ?? SOURCE_FILE_RISE, sourceFileReach);
  const sharedFloor = options.shared ?? 10;
  const fallenShared = options.fallenShared ?? 3;
  const priorFloor = options.priorFloor === 'strong' || options.priorFloor === 'fallen' ? options.priorFloor : null;
  const depthNeeded = priorFloor === 'fallen' ? sourceFileRise : sourceFileReach;
  const thin = qualifyingCommits < qualifyingMinimum;
  const shallow = sourceFilesReachingStrongFloor < depthNeeded;
  const fallen = thin || shallow;
  let floorTrigger = null;
  if (thin && shallow) floorTrigger = 'both';
  else if (thin) floorTrigger = 'thin-history';
  else if (shallow) floorTrigger = 'revision-depth';
  const depth = `${depthNeeded} source files reach ${sharedFloor} revisions`;
  let confidenceReason;
  if (!fallen) {
    confidenceReason = `at least ${qualifyingMinimum} qualifying commits, and at least ${depth}`;
  } else if (floorTrigger === 'both') {
    confidenceReason = `fewer than ${qualifyingMinimum} qualifying commits in the window, and fewer than ${depth}`;
  } else if (floorTrigger === 'thin-history') {
    confidenceReason = `fewer than ${qualifyingMinimum} qualifying commits in the window`;
  } else {
    confidenceReason = `fewer than ${depth} in the window`;
  }
  return {
    floor: fallen ? 'fallen' : 'strong',
    floorTrigger,
    confidenceReason,
    priorFloor,
    // The band held the floor where the count alone would have moved it.
    floorHeld: priorFloor === 'fallen' && !thin && shallow && sourceFilesReachingStrongFloor >= sourceFileReach,
    sharedFloorUsed: fallen ? fallenShared : sharedFloor,
  };
}

function currentName(path, renamed) {
  let name = path;
  const seen = new Set();
  while (renamed.has(name) && !seen.has(name)) {
    seen.add(name);
    name = renamed.get(name);
  }
  return name;
}

function parseNumstat(text) {
  const renamed = new Map();
  const commits = [];
  const seenHashes = new Set();
  const blocks = text.split('@@@\n').slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const hash = lines[0]?.trim();
    if (!hash || seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    const parents = lines[1]?.trim() ? lines[1].trim().split(/\s+/) : [];
    const raw = [];
    for (const line of lines.slice(2)) {
      if (!line.trim()) continue;
      const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(line);
      if (!match) continue;
      const added = match[1] === '-' ? 0 : Number(match[1]);
      const deleted = match[2] === '-' ? 0 : Number(match[2]);
      raw.push({ added, deleted, path: match[3] });
    }
    for (const row of raw) {
      const arrow = row.path.indexOf(' => ');
      if (arrow === -1) continue;
      const oldPath = row.path.slice(0, arrow);
      const newPath = row.path.slice(arrow + 4);
      renamed.set(oldPath, currentName(newPath, renamed));
    }
    const files = [];
    const seen = new Set();
    for (const row of raw) {
      const arrow = row.path.indexOf(' => ');
      const path = currentName(arrow === -1 ? row.path : row.path.slice(arrow + 4), renamed);
      if (seen.has(path)) continue;
      seen.add(path);
      files.push({ path, added: row.added, deleted: row.deleted });
    }
    commits.push({ hash, parents, files });
  }
  return commits;
}

export function readCommits(repo, { since, start } = {}) {
  const args = ['log', '-m', '--numstat', '--find-renames', '-M', '--pretty=format:@@@%n%H%n%P'];
  if (since) args.push(`--since=${since}`);
  if (start) args.push(`${start}..HEAD`);
  else args.push('HEAD');
  const text = git(repo, args);
  if (text == null) return null;
  return parseNumstat(text);
}

export function trackedCount(repo) {
  const text = git(repo, ['ls-files', '-z']);
  if (text == null) return 0;
  return text.split('\0').filter(Boolean).length;
}

export function analyzeHistory(commits, options) {
  const changeset = options.changeset ?? 50;
  const fraction = options.changesetFraction ?? 0.25;
  const sharedFloor = options.shared ?? 10;
  const strengthFloor = options.strength ?? 0.5;
  const revisionFloor = options.revisions ?? 5;
  const limit = Math.min(changeset, options.inScope * fraction);
  const churn = new Map();
  const qualifying = [];
  for (const commit of commits) {
    for (const file of commit.files) {
      const row = churn.get(file.path) ?? { commits: 0, lines: 0 };
      row.commits += 1;
      row.lines += file.added + file.deleted;
      churn.set(file.path, row);
    }
    if (commit.parents.length > 1) continue;
    if (commit.files.length > limit) continue;
    qualifying.push(commit);
  }
  const touches = new Map();
  for (const commit of qualifying) {
    for (const file of commit.files) {
      if (!touches.has(file.path)) touches.set(file.path, new Set());
      touches.get(file.path).add(commit.hash);
    }
  }
  let sourceFilesReachingStrongFloor = 0;
  for (const [path, set] of touches) {
    if (isSourcePath(path) && set.size >= sharedFloor) sourceFilesReachingStrongFloor += 1;
  }
  const decision = decideFloor(qualifying.length, sourceFilesReachingStrongFloor, options);
  const floorUsed = decision.sharedFloorUsed;
  const eligible = [...touches.entries()].filter(([, set]) => set.size >= revisionFloor);
  const pairs = [];
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const [left, leftSet] = eligible[i];
      const [right, rightSet] = eligible[j];
      let shared = 0;
      for (const hash of leftSet) if (rightSet.has(hash)) shared += 1;
      const denominator = leftSet.size + rightSet.size - shared;
      const strength = denominator === 0 ? 0 : shared / denominator;
      if (shared < floorUsed || strength < strengthFloor) continue;
      const a = left < right ? left : right;
      const b = left < right ? right : left;
      pairs.push({ a, b, shared, either: denominator, strength: round(strength) });
    }
  }
  pairs.sort((a, b) => (a.a < b.a ? -1 : a.a > b.a ? 1 : a.b < b.b ? -1 : a.b > b.b ? 1 : 0));
  return {
    qualifyingCommits: qualifying.length,
    qualifyingHashes: qualifying.map((commit) => commit.hash),
    qualifyingTouches: qualifying.map((commit) => ({ hash: commit.hash, paths: commit.files.map((file) => file.path) })),
    floor: decision.floor,
    floorTrigger: decision.floorTrigger,
    floorHeld: decision.floorHeld,
    priorFloor: decision.priorFloor,
    confidenceReason: decision.confidenceReason,
    sourceFilesReachingStrongFloor,
    sharedFloorUsed: floorUsed,
    appliedChangesetLimit: limit,
    churn: [...churn.entries()]
      .map(([path, row]) => ({ path, commits: row.commits, lines: row.lines }))
      .sort((a, b) => (a.path < b.path ? -1 : 1)),
    pairs,
  };
}

export function loadHistory(repo, parameters) {
  const when = headCommitter(repo);
  const since = parameters.pinnedStart ? null : windowStart(when, parameters.windowDays);
  const commits = readCommits(repo, { since, start: parameters.pinnedStart });
  if (!commits || !when) return null;
  const inScope = trackedCount(repo);
  const analyzed = analyzeHistory(commits, { ...parameters, inScope });
  return { ...analyzed, since, headDate: when, inScope };
}
