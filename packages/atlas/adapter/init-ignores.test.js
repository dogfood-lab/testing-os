import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

// fixtures/atlas/init-ignores: a VS Code extension with a .vscodeignore (its
// last line unterminated) and a .npmignore, no files list, and prettier in
// its manifest; and a package whose manifest lists its files (see the
// fixture's README).

const CLI = fileURLToPath(new URL('../cli.js', import.meta.url));
const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/atlas/init-ignores');
const roots = [];

function adopt(name) {
  const root = mkdtempSync(join(tmpdir(), `atlas-init-ignores-${name}-`));
  roots.push(root);
  cpSync(join(FIXTURE, name), root, { recursive: true });
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stderr || result.stdout}`);
  };
  git(['init']);
  git(['config', 'core.autocrlf', 'false']);
  git(['add', '-A']);
  git(['-c', 'user.email=atlas@example.com', '-c', 'user.name=atlas', 'commit', '-m', name]);
  return root;
}

function init(root, ...args) {
  const result = spawnSync(process.execPath, [CLI, 'init', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

const read = (root, name) => readFileSync(join(root, name), 'utf8');

after(() => {
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true });
});

describe('atlas init and the ignore files', () => {
  it('keeps the map out of the VSIX, the npm package and a prettier check, and says so', () => {
    const root = adopt('extension');
    const out = init(root);
    assert.equal(read(root, '.vscodeignore'), 'src/**/*.test.js\n.github/**\natlas/**\n');
    assert.equal(read(root, '.npmignore'), 'node_modules/\natlas/\n');
    assert.equal(read(root, '.prettierignore'), 'atlas/\n');
    assert.ok(out.includes('added atlas/** to .vscodeignore, atlas/ to .npmignore, atlas/ to .prettierignore'), out);
    // Run again: nothing is added twice.
    const again = init(root, '--force');
    assert.equal(read(root, '.vscodeignore'), 'src/**/*.test.js\n.github/**\natlas/**\n');
    assert.equal(read(root, '.prettierignore'), 'atlas/\n');
    assert.equal(again.includes('added atlas'), false, again);
  });

  it('keeps the map out of markdownlint, in the ignores of a cli2 config or in .markdownlintignore', () => {
    const cli2 = adopt('cli2');
    const out = init(cli2);
    assert.equal(read(cli2, '.markdownlint-cli2.jsonc'), '{\n  // markdownlint-cli2\n  "ignores": ["atlas/**", "node_modules/**"]\n}\n');
    assert.ok(out.includes('added "atlas/**" to the ignores of .markdownlint-cli2.jsonc'), out);
    assert.equal(existsSync(join(cli2, '.markdownlintignore')), false);
    init(cli2, '--force');
    assert.equal(read(cli2, '.markdownlint-cli2.jsonc'), '{\n  // markdownlint-cli2\n  "ignores": ["atlas/**", "node_modules/**"]\n}\n');
    const mdlint = adopt('mdlint');
    init(mdlint);
    assert.equal(read(mdlint, '.markdownlintignore'), 'atlas/\n');
  });

  it('leaves an ignore file alone when the manifest lists its files, and makes none for prettier it does not use', () => {
    const root = adopt('listed');
    const out = init(root);
    assert.equal(read(root, '.npmignore'), 'coverage/\n');
    assert.equal(existsSync(join(root, '.prettierignore')), false);
    assert.equal(out.includes('added atlas'), false, out);
  });
});
