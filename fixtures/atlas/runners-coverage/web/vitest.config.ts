import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', ['junit', { outputFile: 'reports/junit.xml' }]],
    coverage: {
      enabled: true,
      provider: 'v8',
    },
  },
});
