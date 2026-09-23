export const schema = { name: 'submission' };

export function checkSchema(input) {
  return typeof input === 'string';
}
