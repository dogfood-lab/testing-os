/**
 * init.js — `swarm init <repo-path>`
 *
 * Creates a run, auto-detects domains, saves draft, reports to coordinator.
 * Does NOT freeze domains — coordinator reviews first.
 *
 * Steps:
 * 1. Validate repo path (git repo, clean working tree)
 * 2. Read HEAD commit + branch
 * 3. Create save point tag
 * 4. Draft domains: from the Atlas parts when the repo has adopted Atlas
 *    (atlas/boundaries.yaml), else auto-detected from repo structure
 * 5. Create run + domain draft in control plane DB
 * 6. Print domain proposal for coordinator review
 *
 * Steps 4-6 are wrapped in a try/catch that deletes the step-3 save-point
 * tag before re-throwing (F-53a7d713) — see compensateOrphanedSavePointTag
 * below.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDb } from '../db/connection.js';
import { detectDomains, saveDomainDraft } from '../lib/domains.js';
import { atlasDraftReason, draftDomainsFromAtlas } from '../lib/atlas-domains.js';
import { readAtlasMap, writeAtlasLineage } from '../lib/atlas.js';
import { resolveRoadmapSeed, stampRoadmapSeedLineage } from './lib/roadmap-seed.js';

/**
 * @param {object} opts
 * @param {string} opts.repoPath — path to local repo
 * @param {string} [opts.repo] — org/repo name (auto-detected if omitted)
 * @param {string} opts.dbPath — path to control-plane.db
 * @param {string|true} [opts.seedFromRoadmap] — T4 (F-d110f547):
 *   `--seed-from-roadmap[=<run-id>|latest]`. `true` (bare flag) or the
 *   literal `'latest'` seed from whatever this checkout's
 *   dogfood/roadmap/latest.json currently names; any other string names an
 *   explicit prior run id. Absent (undefined) by default — lineage is
 *   opt-in, never inferred (T4: "seeding a new run from a prior roadmap is
 *   an explicit flag"). Resolved and schema-validated BEFORE any DB write
 *   so a bad/missing seed fails fast without leaving a half-initialized run.
 * @param {boolean} [opts.noAtlas] — draft from the hand template even when the
 *   repo has adopted Atlas
 * @param {number} [opts.domainTarget] — domains to merge the Atlas parts into
 * @param {boolean} [opts.testsDomain] — keep test-role parts as one domain
 * @returns {object} — { runId, domains, unmatched, savePointTag, roadmapSeed, atlas, atlasNote }
 */
export function init(opts) {
  const repoPath = resolve(opts.repoPath);

  // 1. Validate git repo
  if (!existsSync(resolve(repoPath, '.git'))) {
    throw new Error(`Not a git repo: ${repoPath}`);
  }

  // Check clean working tree
  const status = git(repoPath, ['status', '--porcelain']);
  if (status.trim()) {
    throw new Error(`Working tree is not clean. Commit or stash changes first.\n${status}`);
  }

  // 2. Read HEAD commit + branch
  const commitSha = git(repoPath, ['rev-parse', 'HEAD']).trim();
  const branch = git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  // Auto-detect org/repo from remote
  let repo = opts.repo;
  if (!repo) {
    try {
      const remoteUrl = git(repoPath, ['remote', 'get-url', 'origin']).trim();
      const match = remoteUrl.match(/[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
      repo = match ? match[1] : basename(repoPath);
    } catch {
      repo = basename(repoPath);
    }
  }

  // 3. Create save point tag
  const timestamp = Math.floor(Date.now() / 1000);
  const savePointTag = `swarm-save-${timestamp}`;
  git(repoPath, ['tag', savePointTag]);

  // 4-6. Auto-detect domains, create the run row, save the domain draft.
  //
  // F-53a7d713: the save-point tag above is the one IRREVERSIBLE side effect
  // init() performs before its own `runs` row exists to point at it. If any
  // of the three steps below throws (a locked/too-new control-plane.db, a
  // transient I/O error scanning the target repo, a malformed domain-
  // detection result), the tag would otherwise survive uncleaned — nothing
  // else in this package sweeps or prunes an orphaned `swarm-save-*` tag
  // (rewind.js only ever consumes one by operator-typed name). Named
  // compensator per the workflow-standards rule (Sagas, Garcia-Molina &
  // Salem 1987): undo the tag, THEN re-throw the original failure untouched
  // — the operator must see the real error, not a masked compensator result.
  let domains, unmatched, runId, roadmapSeed = null;
  let atlasDraft = null, atlasNote = null;
  try {
    // T4/F-d110f547: resolve + validate BEFORE any DB work — the fastest
    // possible fail-fast for a bad/missing seed, and it means a doomed init
    // never even reaches detectDomains' filesystem walk.
    if (opts.seedFromRoadmap) {
      roadmapSeed = resolveRoadmapSeed(repoPath, opts.seedFromRoadmap);
    }

    ({ atlasDraft, atlasNote } = tryAtlasDraft(repoPath, opts));
    if (atlasDraft) {
      domains = atlasDraft.domains;
      unmatched = [];
    } else {
      ({ domains, unmatched } = detectDomains(repoPath));
    }

    const hex = randomBytes(2).toString('hex');
    runId = `swarm-${timestamp}-${hex}`;

    const db = openDb(opts.dbPath);
    db.prepare(`
      INSERT INTO runs (id, repo, local_path, commit_sha, branch, save_point_tag, status)
      VALUES (?, ?, ?, ?, ?, ?, 'initializing')
    `).run(runId, repo, repoPath, commitSha, branch, savePointTag);

    // Save domain draft (unfrozen). The Atlas draft and its lineage land in
    // one transaction, so a run never carries parts it has no record of.
    db.transaction(() => {
      saveDomainDraft(db, runId, domains.map(d => ({
        name: d.name,
        globs: d.globs,
        ownership_class: d.ownership_class,
        description: d.description,
      })), atlasDraft ? { reason: atlasDraftReason(atlasDraft) } : {});
      if (atlasDraft) writeAtlasLineage(db, runId, atlasDraft.lineage);
    })();

    // T4/F-d110f547: records this NEW run's lineage durably (the `kv` table
    // — no schema migration; see commands/lib/roadmap-seed.js's header).
    // dispatch.js reads this back to decide the first-audit-wave
    // auto-injection gate.
    if (roadmapSeed) {
      stampRoadmapSeedLineage(db, runId, roadmapSeed);
    }
  } catch (err) {
    compensateOrphanedSavePointTag(repoPath, savePointTag);
    throw err;
  }

  return {
    runId,
    repo,
    repoPath,
    commitSha,
    branch,
    savePointTag,
    domains: domains.map(d => ({
      name: d.name,
      ownership_class: d.ownership_class,
      // An Atlas domain carries its file count; a template bucket, its files.
      matched_files: Array.isArray(d.matched_files) ? d.matched_files.length : d.files,
      globs: d.globs,
      ...(d.parts ? { parts: d.parts } : {}),
    })),
    unmatched,
    atlas: atlasDraft
      ? { mapCommit: atlasDraft.lineage.mapCommit, parts: atlasDraft.lineage.parts, placed: atlasDraft.placed, merges: atlasDraft.merges }
      : null,
    atlasNote,
    roadmapSeed: roadmapSeed
      ? { sourceRunId: roadmapSeed.sourceRunId, sequence: roadmapSeed.sequence, path: roadmapSeed.relPath }
      : null,
  };
}

/**
 * The Atlas draft when the repo has adopted Atlas and its map is usable, else
 * a note saying why the hand template was used instead. Atlas is never a
 * prerequisite: a stale or missing map degrades the draft to the template and
 * says so, and `swarm domains <run-id> --from-atlas` redrafts once it is fixed.
 */
function tryAtlasDraft(repoPath, opts) {
  if (opts.noAtlas) return { atlasDraft: null, atlasNote: null };
  if (!readAtlasMap(repoPath).adopted) return { atlasDraft: null, atlasNote: null };
  try {
    return {
      atlasDraft: draftDomainsFromAtlas(repoPath, { target: opts.domainTarget, testsDomain: opts.testsDomain }),
      atlasNote: null,
    };
  } catch (err) {
    return { atlasDraft: null, atlasNote: `atlas/boundaries.yaml is present but the draft could not come from it: ${err.message}` };
  }
}

// F-264bd9d2 (wave 20): argv-array form (execFileSync), never a shell-string
// exec. Every call site below passes only a hardcoded literal argv or a pure
// internal timestamp (`tag`, savePointTag — `swarm-save-${Date.now()}`, never
// operator or target-repo input), so this closes the THIRD documented
// instance of this class in this package (F-21240958 commands/persist.js,
// its sibling F-1f7f9de8 persist-results.js) — matching every other git/node
// invocation in the command layer (dispatch.js's execFileSync('git', [...]),
// lib/worktree.js).
function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

/**
 * Named compensator for F-53a7d713 (workflow-standards NAMED_COMPENSATORS):
 * undoes the ONE irreversible side effect init() performs before its own
 * `runs` row exists — the save-point git tag created at step 3. Owner:
 * init() itself; invoked only from its own catch block above, never called
 * standalone.
 *
 * Best-effort by design: a compensator that itself throws must never mask
 * the real failure the caller is already unwinding from — init()'s catch
 * always re-throws the original `err` regardless of what happens here. A
 * tag this fails to delete (e.g. git itself is unavailable) is not a NEW
 * failure mode — it degrades to exactly the bounded, self-announcing,
 * LOW-severity residual F-53a7d713 already documents (an operator can
 * always `git tag -d` it manually via `git tag -l 'swarm-save-*'`).
 */
function compensateOrphanedSavePointTag(repoPath, tag) {
  try {
    git(repoPath, ['tag', '-d', tag]);
  } catch { /* best effort — see docstring above */ }
}
