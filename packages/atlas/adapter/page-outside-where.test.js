import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPage } from './page.js';

// What the page says of writes to the caller's places, from the places each
// part's readings named (core/landings.js whereSet).

function limits(parts) {
  const structure = { boundaries: parts.map((part, index) => ({ files: [], name: `p${index}`, role: 'code', ...part })), doors: [], edges: [], landings: [] };
  return JSON.parse(buildPage({ structure, statistics: {}, document: {}, repoName: 'fixture/outside-where' }).json).limits;
}

describe('where the writes to the caller\'s places go', () => {
  it('names the places a kind of place is spelled with when every write of that kind names one', () => {
    assert.deepEqual(limits([{ outsideWrites: 3, outsidePlaces: [{ reads: 0, where: ['cwd:saves/'], writes: 2 }, { reads: 0, where: ['cwd:saves'], writes: 1 }] }]), [
      '3 writes go to the directory the command is run in (saves/), not to this repository.',
    ]);
  });

  it('names none when one write of the kind names none, since the others are not all of where they go', () => {
    assert.deepEqual(limits([{ outsideWrites: 3, outsidePlaces: [{ reads: 0, where: ['cwd:saves/'], writes: 2 }, { reads: 0, where: ['cwd'], writes: 1 }] }]), [
      '3 writes go to the directory the command is run in, not to this repository.',
    ]);
  });

  it('says what no reading placed as every place it may be', () => {
    assert.deepEqual(limits([{ outsideWrites: 2, outsidePlaces: [{ reads: 0, where: ['home'], writes: 1 }] }]), [
      '1 write goes to the home directory, not to this repository.',
      '1 write goes to the directory the command is run in, the home directory, a temporary directory or a path its caller passes, not to this repository.',
    ]);
  });
});
