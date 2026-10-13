import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['collected/**/test_*.mjs'],
  },
});
