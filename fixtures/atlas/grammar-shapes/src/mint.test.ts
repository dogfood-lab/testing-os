import { vi } from 'vitest';
import { mint } from './mint.js';

vi.mock('./mint.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mint.js')>();
  return { ...actual };
});

mint('x');
