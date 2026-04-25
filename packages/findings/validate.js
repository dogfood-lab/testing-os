/**
 * Finding schema validator.
 * Validates YAML finding files against dogfood-finding.schema.json.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

const require = createRequire(import.meta.url);

/** Load and compile the finding schema once. */
function createValidator() {
  const schemaPath = require.resolve('@dogfood-lab/schemas/json/dogfood-finding.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  return ajv.compile(schema);
}

let _validator = null;

function getValidator() {
  if (!_validator) {
    _validator = createValidator();
  }
  return _validator;
}

/**
 * Parse a YAML finding file and return the data.
 * @param {string} filePath - Absolute path to a .yaml finding file.
 * @returns {{ data: object | null, error: string | null }}
 */
export function parseFinding(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = yaml.load(raw);
    if (!data || typeof data !== 'object') {
      return { data: null, error: 'File did not parse to an object' };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: `YAML parse error: ${err.message}` };
  }
}

/**
 * Validate a parsed finding object against the schema.
 * @param {object} finding - Parsed finding data.
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string }> }}
 */
export function validateFinding(finding) {
  const validate = getValidator();
  const valid = validate(finding);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors || []).map(err => ({
    path: err.instancePath || '/',
    message: err.message || 'unknown error',
    params: err.params
  }));

  return { valid: false, errors };
}

/**
 * Parse and validate a YAML finding file in one call.
 * @param {string} filePath - Absolute path to a .yaml finding file.
 * @returns {{ valid: boolean, data: object | null, errors: Array<{ path: string, message: string }> }}
 */
export function validateFindingFile(filePath) {
  const { data, error } = parseFinding(filePath);
  if (error) {
    return { valid: false, data: null, errors: [{ path: '/', message: error }] };
  }

  const result = validateFinding(data);
  return { ...result, data };
}
