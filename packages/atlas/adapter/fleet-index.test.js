/**
 * The agent index is built from the fleet document alone: the same fleet
 * gives the same bytes in any row order, a repository appears only as the
 * fleet lists it, and what the fleet does not record is said to be missing
 * rather than guessed. The input is the fleet.json of the render fixture.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fleetIndex } from './fleet.js';

const FLEET = JSON.parse(readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/atlas-render/branch/indexes/atlas/fleet.json'),
  'utf8',
));
const RAW = 'https://raw.githubusercontent.com/dogfood-lab/testing-os/atlas-render/indexes/atlas/';

describe('agent index', () => {
  it('gives the same bytes for the same fleet in any row order, sorted by name', () => {
    const index = fleetIndex(FLEET, RAW);
    assert.equal(fleetIndex({ ...FLEET, repositories: [...FLEET.repositories].reverse() }, RAW), index);
    assert.deepEqual(
      [...index.matchAll(/^- \[([^\]]+)\]/gm)].map((match) => match[1]),
      ['dogfood-lab/testing-os', 'mcp-tool-shop-org/shipcheck', 'mcp-tool-shop-org/widgets'],
    );
    assert.ok(index.endsWith('\n') && !index.includes('\r'), 'plain LF text');
  });

  it('lists a repository only as the fleet names it, and leaves out a name it cannot link', () => {
    const unlinkable = [{ repo: 'acme/x](https://example.invalid)', doors: 1, boundaries: 1 }, { repo: '../..', doors: 1 }, null];
    assert.equal(fleetIndex({ ...FLEET, repositories: [...FLEET.repositories, ...unlinkable] }, RAW), fleetIndex(FLEET, RAW));
  });

  it('says what the fleet does not record, and words an empty fleet', () => {
    const bare = fleetIndex({ generatedAt: '2026-09-22T06:00:00.000Z', repositories: [{ repo: 'acme/old', renderedAt: 'unknown' }] }, RAW);
    assert.ok(bare.includes(`- [acme/old](${RAW}acme/old/README.md): doors not counted, parts not counted, render date unknown. [page.json](${RAW}acme/old/page.json)\n`), bare);
    assert.match(fleetIndex({ repositories: [] }, RAW), /rendered on an unknown date, 0 repositories:[\s\S]*\nNo public repository has adopted Atlas yet\.\n$/);
    assert.match(fleetIndex({ repositories: [] }, '/atlas/'), /\nNo repository in this fleet has been rendered yet\.\n$/);
  });

  it('links a served fleet on its own server, the way the page tells a served base', () => {
    const served = fleetIndex(FLEET, '/atlas/');
    assert.match(served, /^# Atlas: this fleet\n/);
    assert.ok(served.includes('- [mcp-tool-shop-org/widgets](/atlas/mcp-tool-shop-org/widgets/README.md): 3 doors, 4 parts, rendered 2026-09-15. [page.json](/atlas/mcp-tool-shop-org/widgets/page.json)\n'));
    assert.doesNotMatch(served, /https?:/);
    assert.match(fleetIndex(FLEET, '//cdn.example/'), /^# Atlas: the published fleet\n/, 'a protocol-relative base is another origin');
  });
});
