import { checkSchema, loadSchema, schemaVersion } from './schema.js';
import { writeRecord } from './store.js';

export function loadPolicy() {
  loadSchema();
  checkSchema('policy');
  return { allow: true };
}

export function checkPolicy(text) {
  return text.length > 0;
}

export function auditRecord(id) {
  checkSchema(id);
  writeRecord(id);
  return schemaVersion();
}
