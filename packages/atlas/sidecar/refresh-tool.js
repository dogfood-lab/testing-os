import { ENGINE } from '../adapter/engine.js';
import { answered, CANNOT_SEE_SCHEMA, FACT_GROUP_SCHEMA, failed, provenance } from './answer.js';
import { head } from './git.js';

/**
 * atlas_refresh as a tool: each call starts a map of the checkout in the
 * background, or reports the one running (its phase and time so far), or
 * says the last one finished and that answers now use it. The provenance
 * names the snapshot answering at the moment of the call, which is the old
 * one until the new one is swapped in.
 */

export const REFRESH_ANSWER = {
  type: 'object',
  properties: {
    question: { type: 'object' },
    refresh: {
      type: 'object',
      properties: {
        state: { type: 'string', enum: ['started', 'running', 'done', 'current'] },
        head: { type: 'string' },
        startedAt: { type: 'string' },
        finishedAt: { type: ['string', 'null'] },
        elapsedMs: { type: 'integer', minimum: 0 },
        phase: { type: ['string', 'null'] },
        durationMs: { type: ['integer', 'null'] },
        lastDurationMs: { type: ['integer', 'null'] },
        snapshot: { type: ['string', 'null'] },
        cache: { type: 'string' },
        engine: { type: 'string' },
      },
      required: ['state', 'head', 'startedAt', 'finishedAt', 'elapsedMs', 'phase', 'snapshot', 'cache', 'engine'],
    },
    facts: { type: 'array', items: FACT_GROUP_SCHEMA },
    cannotSee: { type: 'array', items: CANNOT_SEE_SCHEMA },
  },
  required: ['question', 'refresh', 'facts', 'cannotSee'],
};

function seconds(ms) {
  return `${Math.round((ms ?? 0) / 100) / 10} s`;
}

/**
 * @param {object} refresher from sidecar/refresh.js
 * @param {{ root: string, from: string }} repo
 * @param {object|null} snapshot the snapshot answering now, if any
 */
export function refreshAnswer(refresher, repo, snapshot) {
  const atlas = provenance({ repo, snapshot, head: head(repo.root) });
  const started = refresher.start(repo.root);
  if (started.error) return failed(atlas, started.error);
  const { run } = started;
  if (run.state === 'failed') {
    return failed(atlas, { code: 'ATLAS_SIDECAR_REFRESH_FAILED', details: [run.error], whatToDo: 'fix what the error names; atlas_refresh maps again once the checkout changes' });
  }
  let state = started.started ? 'started' : run.state;
  if (state === 'done') {
    state = run.reported ? 'current' : 'done';
    run.reported = true;
  }
  const now = Date.now();
  const refresh = {
    state,
    head: run.head,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    elapsedMs: Math.max(0, (run.finishedAt ? Date.parse(run.finishedAt) : now) - Date.parse(run.startedAt)),
    phase: run.state === 'running' ? run.phase : null,
    durationMs: run.durationMs ?? null,
    lastDurationMs: run.lastDurationMs ?? null,
    snapshot: run.snapshot?.id ?? null,
    cache: run.dir,
    engine: ENGINE,
  };
  const answering = snapshot ? (snapshot.id === 'committed' ? 'the committed map' : snapshot.label) : 'no map';
  const last = refresh.lastDurationMs != null ? `; the last map here took ${seconds(refresh.lastDurationMs)}` : '';
  const sentences = [];
  if (state === 'started') {
    sentences.push(`Atlas: started mapping this checkout at ${run.head.slice(0, 7)} with Atlas ${ENGINE}, in the background, into a cache outside the repository (${run.dir})${last}.`);
    sentences.push(`Atlas: answers keep using ${answering} until the new map is swapped in; call atlas_refresh again for its progress.`);
  } else if (state === 'running') {
    sentences.push(`Atlas: mapping this checkout at ${run.head.slice(0, 7)}: ${refresh.phase}, ${seconds(refresh.elapsedMs)} so far${last}.`);
    sentences.push(`Atlas: answers keep using ${answering} until it finishes.`);
  } else if (state === 'done') {
    sentences.push(`Atlas: the map of this checkout at ${run.head.slice(0, 7)} finished in ${seconds(refresh.durationMs)}; answers now use it (${run.snapshot.label}).`);
  } else {
    sentences.push(`Atlas: ${run.snapshot.label} still describes this checkout; there is nothing new to map.`);
  }
  return answered(atlas, { question: {}, refresh, facts: [], cannotSee: [] }, sentences);
}
