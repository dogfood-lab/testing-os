import { spawnSync } from 'node:child_process';

/**
 * Churn counts every commit in the window, including merges and commits
 * that coupling drops. lines is added plus deleted. Coupling strength is
 * the shared commits divided by the larger of the two files' qualifying
 * commit counts, so a pair at 3 shared out of 5 is 60 percent.
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
  const fallenShared = options.fallenShared ?? 3;
  const qualifyingMinimum = options.qualifyingMinimum ?? 30;
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
  const fallen = qualifying.length < qualifyingMinimum;
  const floorUsed = fallen ? fallenShared : sharedFloor;
  const touches = new Map();
  for (const commit of qualifying) {
    for (const file of commit.files) {
      if (!touches.has(file.path)) touches.set(file.path, new Set());
      touches.get(file.path).add(commit.hash);
    }
  }
  const eligible = [...touches.entries()].filter(([, set]) => set.size >= revisionFloor);
  const pairs = [];
  for (let i = 0; i < eligible.length; i += 1) {
    for (let j = i + 1; j < eligible.length; j += 1) {
      const [left, leftSet] = eligible[i];
      const [right, rightSet] = eligible[j];
      let shared = 0;
      for (const hash of leftSet) if (rightSet.has(hash)) shared += 1;
      const denominator = Math.max(leftSet.size, rightSet.size);
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
    floor: fallen ? 'fallen' : 'strong',
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
  const since = parameters.windowStart ? null : windowStart(when, parameters.windowDays);
  const commits = readCommits(repo, { since, start: parameters.windowStart });
  if (!commits || !when) return null;
  const inScope = trackedCount(repo);
  const analyzed = analyzeHistory(commits, { ...parameters, inScope });
  return { ...analyzed, since, headDate: when, inScope };
}
