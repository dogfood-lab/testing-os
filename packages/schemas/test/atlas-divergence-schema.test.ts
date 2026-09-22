/**
 * atlas-divergence-schema.test.ts — Ajv-validation harness for
 * atlas-divergence.schema.json, the Atlas divergence-report envelope
 * (docs/atlas.dispatch.md §5).
 *
 * The envelope is loaded exactly the way this package's other envelope
 * harnesses load theirs (stageA-agent-output-lockstep.test.ts,
 * case-file-criterion-ids.test.ts, f-fe05c6d7-dogfood-roadmap-schema.test.ts):
 * via createRequire off the package's own ./json/* subpath export, compiled
 * with createAjv() from ../src/index.js. No new `new Ajv` call is introduced,
 * so no allowlist entry in scripts/check-validator-cache-singleton.test.mjs is
 * needed — that lint already treats everything under packages/schemas/ as the
 * canonical Ajv home.
 *
 * ANTI-VACUITY discipline, matching the sibling harnesses: every rejection
 * below pins the instancePath the error must carry, and where the path alone
 * would not disambiguate a real regression, the Ajv keyword and the offending
 * property name too. A bare `valid === false` would keep passing if the
 * fixture started failing for some unrelated second reason, which is how a
 * negative test quietly stops testing what it names.
 *
 * The two fixture directories are enumerated with readdirSync rather than
 * listed by hand, so a fixture added later is covered without anyone
 * remembering to add a case here — the failure mode a hardcoded list has.
 */

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ErrorObject } from 'ajv';
import { createAjv, allSchemas } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
// packages/schemas/test → repo root is three levels up.
const repoRoot = resolve(here, '../../..');
const fixtureRoot = join(repoRoot, 'fixtures/atlas');

const require = createRequire(import.meta.url);
const divergenceSchema = require('@dogfood-lab/schemas/json/atlas-divergence.schema.json') as {
  $schema: string;
  $id: string;
  title: string;
  description: string;
  required: string[];
  additionalProperties: boolean;
  properties: Record<string, { title?: string; description?: string }>;
};

const validate = createAjv().compile(divergenceSchema);

function loadFixture(rel: string): unknown {
  return JSON.parse(readFileSync(join(fixtureRoot, rel), 'utf8'));
}

function fixtureNames(bucket: 'valid' | 'invalid'): string[] {
  return readdirSync(join(fixtureRoot, bucket))
    .filter(name => name.endsWith('.json'))
    .sort();
}

/**
 * True when some error names `instancePath`, optionally narrowed to one Ajv
 * keyword and one offending property (`missingProperty` for required,
 * `additionalProperty` for additionalProperties).
 */
function hasErrorAt(
  errors: ErrorObject[] | null | undefined,
  instancePath: string,
  keyword?: string,
  property?: string,
): boolean {
  return (errors ?? []).some(err => {
    if (err.instancePath !== instancePath) return false;
    if (keyword !== undefined && err.keyword !== keyword) return false;
    if (property === undefined) return true;
    const params = err.params as { missingProperty?: string; additionalProperty?: string };
    return params.missingProperty === property || params.additionalProperty === property;
  });
}

/** A minimal report with no rows — the first-render shape, on the strong floor. */
function makeReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    repo: 'dogfood-lab/testing-os',
    generated_from: { commit_sha: '0'.repeat(40) },
    generated_at: '2026-09-21T08:00:00Z',
    shared_commit_floor: 10,
    confidence: 'full',
    rows: [],
    ...overrides,
  };
}

/** A row carrying only the fields every rule requires; the caller adds the rule's own. */
function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dogfood-lab/testing-os:leaks:schemas',
    rule: 'leaks',
    boundary: 'schemas',
    value: 0.7,
    threshold: 0.55,
    confidence: 'full',
    state: 'open',
    first_seen: '2026-09-14T08:00:00Z',
    last_seen: '2026-09-21T08:00:00Z',
    ...overrides,
  };
}

describe('atlas-divergence.schema.json — envelope hygiene', () => {
  it('declares JSON Schema 2020-12', () => {
    expect(divergenceSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('carries the canonical monorepo $id', () => {
    expect(divergenceSchema.$id).toBe(
      'https://github.com/dogfood-lab/testing-os/packages/schemas/src/json/atlas-divergence.schema.json',
    );
  });

  it('has a title and description', () => {
    expect(divergenceSchema.title).toBeTruthy();
    expect(divergenceSchema.description).toBeTruthy();
  });

  it('is NOT registered in allSchemas (swarm-internal envelope, mirrors agent-output/case-file/dogfood-roadmap)', () => {
    expect(Object.values(allSchemas)).not.toContain(divergenceSchema);
    expect(Object.keys(allSchemas)).toHaveLength(8);
  });

  it('is closed at the top level', () => {
    expect(divergenceSchema.additionalProperties).toBe(false);
  });

  it('every top-level property carries a title and a description', () => {
    for (const [name, def] of Object.entries(divergenceSchema.properties)) {
      expect(def.title, `${name} missing title`).toBeTruthy();
      expect(def.description, `${name} missing description`).toBeTruthy();
    }
  });
});

describe('atlas-divergence.schema.json — report shell', () => {
  it('accepts the first-render shape (zero rows)', () => {
    expect(validate(makeReport()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('REJECTS a report with no rows key at all — an absent array would be indistinguishable from "the comparison never ran"', () => {
    const report = makeReport();
    delete report.rows;
    expect(validate(report)).toBe(false);
    expect(hasErrorAt(validate.errors, '', 'required', 'rows'), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it('REJECTS a non-UTC RFC 3339 timestamp, non-vacuously (the pattern keyword, which `format: date-time` alone would let through)', () => {
    const report = makeReport({ generated_at: '2026-09-21T10:00:00+02:00' });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/generated_at', 'pattern'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('accepts both defined floors and only those two', () => {
    expect(validate(makeReport({ shared_commit_floor: 10 }))).toBe(true);
    expect(validate(makeReport({ shared_commit_floor: 3, confidence: 'low' }))).toBe(true);
    expect(validate(makeReport({ shared_commit_floor: 7 }))).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/shared_commit_floor', 'enum'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });
});

describe('atlas-divergence.schema.json — the fallen floor forces the low-confidence label', () => {
  it('REJECTS floor 3 with report confidence "full", non-vacuously (the const keyword on confidence)', () => {
    const report = makeReport({ shared_commit_floor: 3, confidence: 'full' });
    expect(validate(report)).toBe(false);
    expect(hasErrorAt(validate.errors, '/confidence', 'const'), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it('REJECTS a full-confidence ROW on a floor-3 report — all four rules carry the label on the fallen floor', () => {
    const report = makeReport({
      shared_commit_floor: 3,
      confidence: 'low',
      rows: [makeRow({ confidence: 'full' })],
    });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0/confidence', 'const'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('accepts a floor-10 report carrying a low-confidence row — the implication runs one way only', () => {
    const report = makeReport({ rows: [makeRow({ confidence: 'low' })] });
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });
});

describe('atlas-divergence.schema.json — per-rule conditionals', () => {
  it('accepts a well-formed row of each of the four rules', () => {
    const rows = [
      makeRow(),
      makeRow({
        id: 'r2',
        rule: 'two-may-be-one',
        boundary: undefined,
        boundaries: ['schemas', 'verify'],
      }),
      makeRow({
        id: 'r3',
        rule: 'file-moved',
        file: 'packages/verify/index.js',
        partner_boundary: 'schemas',
      }),
      makeRow({
        id: 'r4',
        rule: 'cohesion-dropped',
        high_water_mark: 0.9,
        current: 0.62,
        value: 0.28,
        threshold: 0.2,
      }),
    ].map(row => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)));
    expect(validate(makeReport({ rows })), JSON.stringify(validate.errors)).toBe(true);
  });

  it('REJECTS an unknown rule, non-vacuously (the enum keyword on rule)', () => {
    const report = makeReport({ rows: [makeRow({ rule: 'boundary-renamed' })] });
    expect(validate(report)).toBe(false);
    expect(hasErrorAt(validate.errors, '/rows/0/rule', 'enum'), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it('REJECTS a leaks row with no boundary', () => {
    const row = makeRow();
    delete row.boundary;
    expect(validate(makeReport({ rows: [row] }))).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0', 'required', 'boundary'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('REJECTS a two-may-be-one row carrying the singular boundary instead of a pair', () => {
    const report = makeReport({
      rows: [makeRow({ rule: 'two-may-be-one', boundaries: ['schemas', 'verify'] })],
    });
    expect(validate(report)).toBe(false);
    expect(hasErrorAt(validate.errors, '/rows/0/boundary'), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it('REJECTS a two-may-be-one row whose pair holds one name, non-vacuously (the minItems keyword)', () => {
    const row = makeRow({ rule: 'two-may-be-one', boundaries: ['schemas'] });
    delete row.boundary;
    expect(validate(makeReport({ rows: [row] }))).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0/boundaries', 'minItems'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('REJECTS a file-moved row missing its partner boundary', () => {
    const report = makeReport({
      rows: [makeRow({ rule: 'file-moved', file: 'packages/verify/index.js' })],
    });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0', 'required', 'partner_boundary'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('REJECTS a cohesion-dropped row missing the high-water mark it dropped from', () => {
    const report = makeReport({
      rows: [makeRow({ rule: 'cohesion-dropped', current: 0.62, value: 0.28, threshold: 0.2 })],
    });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0', 'required', 'high_water_mark'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('REJECTS a leaks row that smuggles in the cohesion fields — the conditionals forbid, not merely omit', () => {
    const report = makeReport({ rows: [makeRow({ high_water_mark: 0.9, current: 0.62 })] });
    expect(validate(report)).toBe(false);
    expect(hasErrorAt(validate.errors, '/rows/0/high_water_mark'), JSON.stringify(validate.errors)).toBe(
      true,
    );
  });

  it('REJECTS a cohesion ratio above 1', () => {
    const report = makeReport({
      rows: [
        makeRow({ rule: 'cohesion-dropped', high_water_mark: 1.4, current: 0.62, value: 0.78 }),
      ],
    });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0/high_water_mark', 'maximum'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('REJECTS an empty row id — identity is what lets a standing row update and a resolved one close', () => {
    const report = makeReport({ rows: [makeRow({ id: '' })] });
    expect(validate(report)).toBe(false);
    expect(
      hasErrorAt(validate.errors, '/rows/0/id', 'minLength'),
      JSON.stringify(validate.errors),
    ).toBe(true);
  });

  it('accepts a cleared row — a resolved disagreement closes, it does not vanish', () => {
    const report = makeReport({ rows: [makeRow({ state: 'cleared' })] });
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });
});

describe('atlas-divergence.schema.json — committed fixtures (fixtures/atlas/)', () => {
  const valid = fixtureNames('valid');
  const invalid = fixtureNames('invalid');

  it('finds both fixture buckets (sanity — the per-fixture cases below would otherwise pass vacuously)', () => {
    expect(valid.length).toBeGreaterThanOrEqual(2);
    expect(invalid.length).toBeGreaterThanOrEqual(5);
  });

  for (const name of valid) {
    it(`valid/${name} validates`, () => {
      const valid = validate(loadFixture(`valid/${name}`));
      expect(valid, JSON.stringify(validate.errors)).toBe(true);
    });
  }

  // Each entry names the instancePath the rejection must carry, so a fixture
  // that starts failing for a different reason than the one its filename
  // claims goes red instead of silently still "passing".
  const offending: Record<string, { path: string; keyword?: string; property?: string }> = {
    'unknown-rule-value.json': { path: '/rows/0/rule', keyword: 'enum' },
    'two-may-be-one-with-one-boundary.json': { path: '/rows/0/boundaries', keyword: 'minItems' },
    'cohesion-dropped-missing-high-water-mark.json': {
      path: '/rows/0',
      keyword: 'required',
      property: 'high_water_mark',
    },
    'shared-commit-floor-of-five.json': { path: '/shared_commit_floor', keyword: 'enum' },
    'unexpected-top-level-property.json': {
      path: '',
      keyword: 'additionalProperties',
      property: 'findings',
    },
  };

  it('every invalid fixture has a declared offending path (no fixture escapes the pin below)', () => {
    expect(invalid.sort()).toEqual(Object.keys(offending).sort());
  });

  for (const name of invalid) {
    it(`invalid/${name} fails, with an error naming ${offending[name]?.path || 'the document root'}`, () => {
      const pin = offending[name];
      expect(validate(loadFixture(`invalid/${name}`))).toBe(false);
      expect(
        hasErrorAt(validate.errors, pin.path, pin.keyword, pin.property),
        JSON.stringify(validate.errors),
      ).toBe(true);
    });
  }
});
