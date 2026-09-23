import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // include: ['legacy/**/*.test.ts'],
    include: ['packages/*/src/**/*.test.ts'],
    coverage: {
      exclude: ['packages/core/**'],
    },
  },
});
