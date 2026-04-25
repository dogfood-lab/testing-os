/**
 * Schema validation for pattern, recommendation, and doctrine artifacts.
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);
// Resolve the schemas package's json directory via its subpath export.
const SCHEMAS_DIR = dirname(
  require.resolve('@dogfood-lab/schemas/json/dogfood-pattern.schema.json')
);

const _validators = {};

function getValidator(schemaFile) {
  if (!_validators[schemaFile]) {
    const schema = JSON.parse(readFileSync(`${SCHEMAS_DIR}/${schemaFile}`, 'utf-8'));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    _validators[schemaFile] = ajv.compile(schema);
  }
  return _validators[schemaFile];
}

export function validatePattern(data) {
  const validate = getValidator('dogfood-pattern.schema.json');
  const valid = validate(data);
  return { valid, errors: valid ? [] : (validate.errors || []).map(e => ({ path: e.instancePath || '/', message: e.message })) };
}

export function validateRecommendation(data) {
  const validate = getValidator('dogfood-recommendation.schema.json');
  const valid = validate(data);
  return { valid, errors: valid ? [] : (validate.errors || []).map(e => ({ path: e.instancePath || '/', message: e.message })) };
}

export function validateDoctrine(data) {
  const validate = getValidator('dogfood-doctrine.schema.json');
  const valid = validate(data);
  return { valid, errors: valid ? [] : (validate.errors || []).map(e => ({ path: e.instancePath || '/', message: e.message })) };
}
