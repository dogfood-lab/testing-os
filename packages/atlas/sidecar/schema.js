/**
 * The part of JSON Schema the sidecar's own tool schemas use, and a checker
 * for tool arguments against them. The keywords are the ones draft-07 and
 * 2020-12 read alike (type, properties, required, additionalProperties,
 * items, enum, pattern, the length and range bounds, oneOf), so a client validates
 * the output schemas whichever dialect it defaults to, and no reference is
 * used, so none has to be resolved.
 */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  const types = Array.isArray(expected) ? expected : [expected];
  return types.some((type) => type === actual || (type === 'number' && actual === 'integer'));
}

/**
 * The ways value breaks schema, each a sentence naming the field; empty when
 * it fits. Only the keywords above are read.
 *
 * @param {object} schema
 * @param {unknown} value
 * @param {string} [at] the field's name in the sentences
 * @returns {string[]}
 */
export function problems(schema, value, at = 'the arguments') {
  const out = [];
  if (schema.type != null && !typeMatches(schema.type, value)) {
    out.push(`${at} must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type === 'integer' ? 'an integer' : `a${/^[aeiou]/.test(schema.type) ? 'n' : ''} ${schema.type}`}`);
    return out;
  }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${at} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) out.push(`${at} must not be empty`);
    if (schema.maxLength != null && value.length > schema.maxLength) out.push(`${at} must be at most ${schema.maxLength} characters`);
    if (schema.pattern != null && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${at} must match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) out.push(`${at} must be at least ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${at} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${at} must hold at least ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${at} must hold at most ${schema.maxItems}`);
    if (schema.items) value.forEach((item, index) => out.push(...problems(schema.items, item, `${at}[${index}]`)));
  }
  if (typeOf(value) === 'object') {
    for (const name of schema.required ?? []) if (!(name in value)) out.push(`${name} is required`);
    for (const [name, item] of Object.entries(value)) {
      const property = schema.properties?.[name];
      if (property) out.push(...problems(property, item, name));
      else if (schema.additionalProperties === false) out.push(`${String(name).slice(0, 64)} is not an argument this tool takes`);
    }
  }
  return out;
}

/** Atlas's error shape, as the tools return it. */
export const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    sentence: { type: 'string' },
    whatChanged: { type: 'array', items: { type: 'string' } },
    whatToDo: { type: 'string' },
  },
  required: ['code', 'sentence', 'whatChanged', 'whatToDo'],
  additionalProperties: false,
};

/**
 * A tool's output schema: provenance always, then the answer or the error.
 * A client checks an error's structured content against the same schema as
 * an answer's, so both shapes are in it.
 *
 * @param {object} provenance the schema of the provenance object
 * @param {object} answer the schema of the tool's answer
 */
export function outputSchema(provenance, answer) {
  return {
    type: 'object',
    properties: { atlas: provenance, answer, error: ERROR_SCHEMA },
    required: ['atlas'],
    oneOf: [{ required: ['answer'] }, { required: ['error'] }],
  };
}
