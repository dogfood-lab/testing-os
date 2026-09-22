import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const CORE_INDEX = fileURLToPath(new URL('./index.js', import.meta.url));
const CORE_DIR = dirname(CORE_INDEX);
const PICOMATCH_ROOT = dirname(fileURLToPath(import.meta.resolve('picomatch')));

function specifiers(source) {
  const found = [];
  const fromRe = /(?:^|\n)\s*(?:import|export)\s[^'"\n]*?\sfrom\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [fromRe, bareRe, dynamicRe]) {
    for (const match of source.matchAll(re)) found.push(match[1]);
  }
  return found;
}

function resolveRelative(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, join(base, 'index.js')];
  const hit = candidates.find((candidate) => existsSync(candidate));
  if (!hit) throw new Error(`cannot resolve ${specifier} from ${fromFile}`);
  return hit;
}

function walk(startFile) {
  const seen = new Set();
  const specifiersSeen = [];
  const queue = [startFile];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const specifier of specifiers(source)) {
      specifiersSeen.push(specifier);
      if (specifier.startsWith('@dogfood-lab/')) {
        throw new Error(`sibling import: ${specifier} from ${file}`);
      }
      if (specifier.startsWith('node:')) continue;
      if (specifier.startsWith('.')) {
        const resolved = resolveRelative(file, specifier);
        const allowed = resolved.startsWith(CORE_DIR) || resolved.startsWith(PICOMATCH_ROOT);
        if (!allowed) throw new Error(`import left the core and picomatch: ${specifier} -> ${resolved}`);
        queue.push(resolved);
        continue;
      }
      if (specifier !== 'picomatch' && !specifier.startsWith('picomatch/')) {
        throw new Error(`third-party import other than picomatch: ${specifier} from ${file}`);
      }
      const resolved = fileURLToPath(import.meta.resolve(specifier));
      if (!resolved.startsWith(PICOMATCH_ROOT)) {
        throw new Error(`picomatch specifier resolved outside picomatch: ${resolved}`);
      }
      queue.push(resolved);
    }
  }
  return { files: [...seen], specifiers: specifiersSeen };
}

describe('core import closure', () => {
  it('imports no @dogfood-lab package and leaves core only for node: and picomatch', () => {
    const closure = walk(CORE_INDEX);
    for (const specifier of closure.specifiers) {
      assert.equal(specifier.startsWith('@dogfood-lab/'), false, specifier);
    }
    assert.ok(closure.files.every((file) => file.startsWith(CORE_DIR) || file.startsWith(PICOMATCH_ROOT)));
    assert.ok(closure.specifiers.includes('picomatch'));
  });
});
