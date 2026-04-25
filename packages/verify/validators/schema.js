/**
 * Schema validator — validates submissions against dogfood-record-submission.schema.json
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Resolve the schemas package's json directory via its subpath export.
const SCHEMA_DIR = dirname(
  require.resolve('@dogfood-lab/schemas/json/dogfood-record-submission.schema.json')
);

let _validator = null;

function getValidator() {
  if (_validator) return _validator;

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);

    const schemaPath = `${SCHEMA_DIR}/dogfood-record-submission.schema.json`;
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

    _validator = ajv.compile(schema);
    return _validator;
  } catch (e) {
    return { __loadError: 'Schema loading failed: ' + e.message };
  }
}

/**
 * Validate a submission payload against the submission JSON Schema.
 *
 * @param {object} submission
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSubmissionSchema(submission) {
  const validate = getValidator();
  if (validate.__loadError) {
    return { valid: false, errors: [validate.__loadError] };
  }
  const valid = validate(submission);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors || []).map(err => {
    const path = err.instancePath || '/';
    return `${path} ${err.message}`;
  });

  return { valid: false, errors };
}
