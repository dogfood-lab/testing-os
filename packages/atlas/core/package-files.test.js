import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The package lists its files one by one, so a module added to the engine
// and left out of the list is missing from the published package, where the
// first import of it fails.
const PACKAGE = fileURLToPath(new URL('../', import.meta.url));
const STARTS = ['cli.js', 'index.js', 'bin/atlas-fleet.js', 'adapter/fleet.js'];

function relativeImports(source) {
  const found = [];
  for (const re of [/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?\sfrom\s*['"](\.[^'"]+)['"]/g, /(?:^|\n)\s*import\s*['"](\.[^'"]+)['"]/g, /import\(\s*['"](\.[^'"]+)['"]\s*\)/g]) {
    for (const match of source.matchAll(re)) found.push(match[1]);
  }
  return found;
}

describe('the published package', () => {
  it('lists every module its binaries and exports load', () => {
    const files = new Set(JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')).files);
    const seen = new Set();
    const queue = STARTS.map((start) => join(PACKAGE, start));
    while (queue.length > 0) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of relativeImports(readFileSync(file, 'utf8'))) {
        const target = join(dirname(file), specifier);
        if (existsSync(target)) queue.push(target);
      }
    }
    const missing = [...seen].map((file) => relative(PACKAGE, file).replaceAll('\\', '/')).filter((path) => !files.has(path)).sort();
    assert.deepEqual(missing, []);
  });
});
