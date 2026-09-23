import { advance, createEngine } from '@probe/core';

export function createGame(seed: number) {
  return advance(createEngine(seed));
}
