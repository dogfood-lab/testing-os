import { checkPolicy, loadPolicy } from './policy.js';
import { checkSchema, loadSchema, schemaVersion } from './schema.js';

export function writeRecord(id) {
  checkSchema(id);
  checkPolicy(id);
  schemaVersion();
  loadPolicy();
  return { id };
}

export function rebuildIndex() {
  loadSchema();
  checkPolicy('index');
  schemaVersion();
  return [];
}

export function sealRecord(id) {
  checkSchema(id);
  checkPolicy(id);
  loadSchema();
  loadPolicy();
  return schemaVersion();
}
