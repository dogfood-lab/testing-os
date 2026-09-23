/**
 * atlas-delta.js — what an amend wave did to the repository's structure, as
 * the Atlas map sees it, and the andon on it (swarms/PROTOCOL.md, "The
 * structural delta").
 *
 * The serial verify runs `atlas diff --base <the commit the wave was
 * dispatched at> --json` and keeps the result on the wave. Three kinds of
 * change are flagged, because each widens what a later edit can break and an
 * amend lane was sent to fix findings, not to rearrange the system: an import
 * between parts that did not exist, an import that closes or extends a cycle,
 * and a new writer to a place. A flagged delta blocks advance until the
 * Director disposes of it with `swarm advance --override --reason`, naming
 * the finding that asked for the change; nothing else about the delta is a
 * gate. Whether a finding asked for it is a judgement the verb cannot make
 * from file paths, so it is left to the person the andon stops.
 *
 * The base is the wave's own dispatch commit rather than the run's save
 * point: from the second amend wave on, a delta against the save point would
 * repeat every earlier wave's changes, and an andon already disposed of would
 * fire again.
 */

import { readAtlasMap, runAtlas as defaultRunAtlas } from './atlas.js';

export const ATLAS_DELTA_KV_PREFIX = 'atlas_delta:wave:';

const FLAGGED_KINDS = new Set(['import-added', 'cycle']);

/**
 * The items of an `atlas diff --json` result that are an andon.
 *
 * A landing item is flagged only when it adds a writer: the published
 * wording of `atlas diff` (pinned with the package, lib/atlas.js) says
 * "is now written by" or "is now also written by", and a new reader is
 * information, not a risk to the place.
 *
 * @param {{ items?: Array<{ kind: string, sentence: string }> }} diff
 */
export function flaggedItems(diff) {
  return (diff.items ?? []).filter((item) =>
    FLAGGED_KINDS.has(item.kind) || (item.kind === 'landing' && / written by /.test(item.sentence)));
}

export function readWaveDelta(db, waveId) {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(ATLAS_DELTA_KV_PREFIX + waveId);
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

function writeWaveDelta(db, waveId, delta) {
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)')
    .run(ATLAS_DELTA_KV_PREFIX + waveId, JSON.stringify(delta));
}

/**
 * Run the diff for a wave and keep it on the wave, replacing an earlier one:
 * the verify is re-run after a fix, and the delta that stands is the one of
 * the tree the wave advances with.
 *
 * @param {object} input
 * @param {Database} input.db
 * @param {object} input.run — the runs row
 * @param {object} input.wave — the waves row
 * @param {Function} [input.runAtlas]
 * @returns {object|null} the recorded delta, or null for a repository without a map
 */
export function recordWaveDelta({ db, run, wave, runAtlas = defaultRunAtlas }) {
  if (!readAtlasMap(run.local_path).adopted) return null;
  const base = wave.dispatch_sha || run.save_point_tag;
  if (!base) {
    const delta = { unavailable: 'the wave has no dispatch commit and the run no save point to diff against' };
    writeWaveDelta(db, wave.id, delta);
    return delta;
  }
  const result = runAtlas(['diff', '--base', base, '--json'], { cwd: run.local_path });
  let delta;
  if (result.status !== 0) {
    const why = (result.stdout || result.stderr || `exit ${result.status}`).trim().split(/\r?\n/).filter(Boolean).slice(0, 3).join(' ');
    delta = { base, unavailable: `${result.command} failed: ${why}` };
  } else {
    try {
      const diff = JSON.parse(result.stdout);
      delta = {
        base,
        baseCommit: diff.base?.commit ?? null,
        command: result.command,
        unchanged: !!diff.unchanged,
        fileCounts: diff.fileCounts ?? null,
        items: diff.items ?? [],
        flagged: flaggedItems(diff),
      };
    } catch {
      delta = { base, unavailable: `${result.command} printed something that is not JSON` };
    }
  }
  writeWaveDelta(db, wave.id, delta);
  return delta;
}

/**
 * The advance gate on a wave's recorded delta. An absent or unavailable delta
 * does not block, like an absent adjudication: the verify's own `atlas check`
 * step already refuses a map that no longer matches the tree.
 */
export function checkAtlasDelta(db, wave) {
  const delta = readWaveDelta(db, wave.id);
  if (!delta) return { name: 'atlas_delta', passed: true, verdict: null, reason: 'no structural delta recorded for this wave' };
  if (delta.unavailable) return { name: 'atlas_delta', passed: true, verdict: null, reason: `structural delta not recorded: ${delta.unavailable}` };
  if (delta.flagged.length === 0) {
    return { name: 'atlas_delta', passed: true, verdict: null, reason: delta.unchanged ? 'nothing structural changed' : 'no import, cycle or writer added' };
  }
  const sentences = delta.flagged.map((item) => item.sentence).join(' ');
  return {
    name: 'atlas_delta',
    passed: false,
    verdict: 'BLOCK',
    reason: `the wave changed the structure: ${sentences} Review the wave before the confirming audit; ` +
      'if an approved finding asked for this, advance with --override --reason naming that finding.',
  };
}
