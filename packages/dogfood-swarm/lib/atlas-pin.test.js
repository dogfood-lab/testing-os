/**
 * atlas-pin.test.js — the Atlas the swarm runs is the one its protocol tells a
 * coordinator to run.
 *
 * ATLAS_VERSION sat at 1.15.0 for eight releases after the fleet moved to
 * 1.24.0 (2026-09-30). `swarm verify` then checked 1.24.0 maps with an engine
 * that could not read them, and failed a repository whose own pinned
 * `atlas check` passed (commandui, run swarm-1791046650-fb76, 2026-10-03).
 * PROTOCOL.md carried the same stale pin in its commands. This keeps the
 * constant and every protocol command in step, so a bump that moves one
 * without the other fails here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ATLAS_PACKAGE, ATLAS_VERSION } from './atlas.js';

const PROTOCOL = new URL('../../../swarms/PROTOCOL.md', import.meta.url);

describe('Atlas pin', () => {
  it('is an exact published version, not a range or tag', () => {
    assert.match(ATLAS_VERSION, /^\d+\.\d+\.\d+$/);
    assert.equal(ATLAS_PACKAGE, `@dogfood-lab/atlas@${ATLAS_VERSION}`);
  });

  it('is not behind the fleet engine of 2026-09-30', () => {
    const [major, minor] = ATLAS_VERSION.split('.').map(Number);
    assert.ok(major > 1 || (major === 1 && minor >= 24), `ATLAS_VERSION ${ATLAS_VERSION} is behind 1.24.0`);
  });

  it('matches every Atlas command in swarms/PROTOCOL.md', () => {
    const text = readFileSync(PROTOCOL, 'utf8');
    const pins = [...text.matchAll(/@dogfood-lab\/atlas@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    assert.ok(pins.length > 0, 'PROTOCOL.md names no pinned Atlas command');
    const stale = pins.filter((v) => v !== ATLAS_VERSION);
    assert.deepEqual(stale, [], `PROTOCOL.md pins ${[...new Set(stale)].join(', ')}; the swarm runs ${ATLAS_VERSION}`);
  });
});
