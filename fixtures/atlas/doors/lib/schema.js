export const schema = { name: 'submission' };

export function checkSchema(input) {
  return typeof input === 'string';
}

export function loadSchema() {
  return schema;
}

export function schemaVersion() {
  return 1;
}
