import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const CORE_INDEX = fileURLToPath(new URL('./index.js', import.meta.url));
const CORE_DIR = dirname(CORE_INDEX);
const PACKAGE_JSON = new URL('../package.json', import.meta.url);
const PERMITTED = Object.keys(JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).dependencies ?? {});

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

function permittedName(specifier) {
  return PERMITTED.find((name) => specifier === name || specifier.startsWith(`${name}/`)) ?? null;
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
        const allowed = resolved.startsWith(CORE_DIR);
        if (!allowed) throw new Error(`import left the core: ${specifier} -> ${resolved}`);
        queue.push(resolved);
        continue;
      }
      const name = permittedName(specifier);
      if (!name) throw new Error(`bare specifier is not a declared dependency: ${specifier} from ${file}`);
      const resolved = fileURLToPath(import.meta.resolve(specifier)).replaceAll('\\', '/');
      if (!resolved.includes(`/node_modules/${name}/`)) {
        throw new Error(`declared dependency resolved outside its package: ${specifier} -> ${resolved}`);
      }
      // A package that is not a workspace member cannot import a workspace
      // sibling, so its internals are not this test's concern. An Emscripten
      // runtime's glue can also contain import shapes this regex cannot resolve.
    }
  }
  return { files: [...seen], specifiers: specifiersSeen };
}

describe('core import closure', () => {
  it('imports no @dogfood-lab package and leaves core only for node: and declared dependencies', () => {
    for (const name of PERMITTED) {
      assert.equal(name.startsWith('@dogfood-lab/'), false, name);
    }
    const closure = walk(CORE_INDEX);
    for (const specifier of closure.specifiers) {
      assert.equal(specifier.startsWith('@dogfood-lab/'), false, specifier);
    }
    assert.ok(closure.files.every((file) => file.startsWith(CORE_DIR)));
    const bare = closure.specifiers.filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:'));
    assert.ok(bare.length > 0);
    for (const specifier of bare) {
      assert.ok(permittedName(specifier), specifier);
    }
  });
});
