import { vi } from 'vitest';

vi.mock('./walk.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('./walk.js'),
  >();
  return { ...actual };
});
