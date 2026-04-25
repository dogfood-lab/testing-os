import { describe, expect, it } from 'vitest';
import {
  allSchemas,
  doctrineSchema,
  findingSchema,
  patternSchema,
  policySchema,
  recommendationSchema,
  recordSchema,
  recordSubmissionSchema,
  scenarioSchema,
  type SchemaName,
} from '../src/index.js';

const SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

describe('@dogfood-lab/schemas', () => {
  it('exports all 8 schemas', () => {
    const names: SchemaName[] = [
      'record',
      'recordSubmission',
      'finding',
      'pattern',
      'recommendation',
      'doctrine',
      'policy',
      'scenario',
    ];
    for (const name of names) {
      expect(allSchemas[name]).toBeDefined();
    }
    expect(Object.keys(allSchemas)).toHaveLength(8);
  });

  it('every schema declares JSON Schema 2020-12', () => {
    for (const [name, schema] of Object.entries(allSchemas)) {
      expect(schema.$schema, `${name} missing $schema`).toBe(SCHEMA_2020_12);
    }
  });

  it('every schema has a title and description', () => {
    for (const [name, schema] of Object.entries(allSchemas)) {
      expect(schema.title, `${name} missing title`).toBeTruthy();
      expect(schema.description, `${name} missing description`).toBeTruthy();
    }
  });

  it('record schema has the expected required envelope fields', () => {
    expect(recordSchema.required).toContain('schema_version');
    expect(recordSchema.required).toContain('repo');
    expect(recordSchema.required).toContain('overall_verdict');
    expect(recordSchema.required).toContain('verification');
  });

  it('individual named exports match the allSchemas map', () => {
    expect(allSchemas.record).toBe(recordSchema);
    expect(allSchemas.recordSubmission).toBe(recordSubmissionSchema);
    expect(allSchemas.finding).toBe(findingSchema);
    expect(allSchemas.pattern).toBe(patternSchema);
    expect(allSchemas.recommendation).toBe(recommendationSchema);
    expect(allSchemas.doctrine).toBe(doctrineSchema);
    expect(allSchemas.policy).toBe(policySchema);
    expect(allSchemas.scenario).toBe(scenarioSchema);
  });
});
