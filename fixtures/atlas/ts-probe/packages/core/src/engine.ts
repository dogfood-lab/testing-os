export function createEngine(seed: number) {
  return { seed, turn: 0 };
}

export function advance(engine: { turn: number }) {
  engine.turn += 1;
  return engine;
}
