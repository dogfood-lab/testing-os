/**
 * protocol-atlas.test.mjs — how swarms/PROTOCOL.md names Atlas.
 *
 * The protocol leans on a repository's Atlas map in five places: the domain
 * map drafted from its parts, the lane briefs' blast radius, the structural
 * delta before a confirming audit, the serial verify's `atlas check`, and the
 * Full Treatment's adoption step. Atlas is never a prerequisite, and a reader
 * who meets one of those sections without the other half of the rule would
 * think a repository without a map cannot be swarmed. So every section that
 * names Atlas must also say what happens without it, and this file holds the
 * protocol to that: a section that names Atlas and drops the clause reds.
 *
 * It also pins the pieces of the Phase 10 step that the fleet waves earned
 * (init, map, check, the CI step, the pull-request shape, the "Odd:" read
 * whose findings go to testing-os as a slice brief), and that the version the
 * protocol tells a coordinator to run is the one the swarm's own runner runs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROTOCOL = readFileSync(join(ROOT, 'swarms', 'PROTOCOL.md'), 'utf-8');

const NAMES_ATLAS = /\bAtlas\b|\batlas (?:check|map|diff|init|explain)\b/;
// The ways the protocol states the no-map path. A new wording is added here
// on purpose, never by loosening the section rule.
const NO_MAP_CLAUSE = /never a prerequisite|without a boundary file|without `atlas\/boundaries\.yaml`|without an Atlas map/;

/** Split markdown into sections at every heading; fences stay in their section. */
function sections(markdown) {
  const out = [];
  let current = { heading: '(preamble)', body: [] };
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,6} /.test(line)) {
      out.push(current);
      current = { heading: line.replace(/^#+ /, ''), body: [] };
      continue;
    }
    current.body.push(line);
  }
  out.push(current);
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n') }));
}

function sectionsNamingAtlasWithoutTheNoMapPath(markdown) {
  return sections(markdown)
    .filter((s) => NAMES_ATLAS.test(s.body) && !NO_MAP_CLAUSE.test(s.body))
    .map((s) => s.heading);
}

function section(markdown, heading) {
  const found = sections(markdown).find((s) => s.heading.startsWith(heading));
  assert.ok(found, `PROTOCOL.md has a section headed "${heading}"`);
  return found.body;
}

describe('swarms/PROTOCOL.md names Atlas only with the no-map path beside it', () => {
  it('names Atlas in the places the protocol leans on it', () => {
    const naming = sections(PROTOCOL).filter((s) => NAMES_ATLAS.test(s.body)).map((s) => s.heading);
    for (const heading of [
      'Phase 1: HEALTH AUDIT', 'Phase 3: AMEND', 'Phase 5: FEATURE-FOCUSED AUDIT',
      'Execution', 'When the repository has an Atlas map', 'The structural delta, before the confirming audit',
    ]) {
      assert.ok(naming.some((h) => h.startsWith(heading)), `the section "${heading}" names Atlas; got ${naming.join(' | ')}`);
    }
  });

  it('says what happens without a map in every section that names Atlas', () => {
    assert.deepEqual(sectionsNamingAtlasWithoutTheNoMapPath(PROTOCOL), []);
  });

  it('reds on a section that names Atlas and drops the clause', () => {
    const mutated = `${PROTOCOL}\n\n## A new section\n\nRun atlas check before the freeze.\n`;
    assert.deepEqual(sectionsNamingAtlasWithoutTheNoMapPath(mutated), ['A new section']);
  });
});

describe('Phase 10 adopts Atlas', () => {
  const execution = section(PROTOCOL, 'Execution');

  it('names init, map and check, pinned', () => {
    for (const verb of ['init', 'map', 'check']) {
      assert.match(execution, new RegExp(`npx --yes @dogfood-lab/atlas@\\d+\\.\\d+\\.\\d+ ${verb}`), verb);
    }
  });

  it('adds the check to the existing CI job and atlas/** to the paths filter', () => {
    assert.match(execution, /CI step/);
    assert.match(execution, /`atlas\/\*\*`/);
  });

  it('gives the pull request the fleet shape, ending in the "Odd:" read', () => {
    assert.match(execution, /"What this is"/);
    assert.match(execution, /"What comes in"/);
    assert.match(execution, /\*\*Odd:\*\*/);
  });

  it('sends what the newcomer read finds to testing-os as a slice brief, never into the page by hand', () => {
    assert.match(execution, /slice brief/);
    assert.match(execution, /never edited into the page by hand/);
  });

  it('carries the adoption and the serial-verify delta in the coordinator checklist', () => {
    const checklist = section(PROTOCOL, 'Coordinator Checklist');
    assert.match(checklist, /atlas init/);
    assert.match(checklist, /structural delta/);
  });
});

describe('the Atlas version the protocol tells a coordinator to run', () => {
  it('is the version the swarm runner pins', () => {
    const runner = readFileSync(join(ROOT, 'packages', 'dogfood-swarm', 'lib', 'atlas.js'), 'utf-8');
    const pinned = /export const ATLAS_VERSION = '([^']+)'/.exec(runner)?.[1];
    assert.ok(pinned, 'lib/atlas.js declares ATLAS_VERSION');
    const named = new Set([...PROTOCOL.matchAll(/@dogfood-lab\/atlas@(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
    assert.deepEqual([...named], [pinned]);
  });
});
