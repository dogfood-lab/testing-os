import { readFileSync } from 'node:fs';

/**
 * The version of @dogfood-lab/atlas this copy is. A map carries it, so a
 * reader can tell which engine made the map they hold; the fleet service
 * compares it with the engine that made its last render; and the sidecar
 * names it on every answer, beside the engine that made the map it answers
 * from.
 */
export const ENGINE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
