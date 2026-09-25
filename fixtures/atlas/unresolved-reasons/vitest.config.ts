import { defineConfig } from 'vitest/config';

let coverage;
try {
  require.resolve('@vitest/coverage-v8');
  coverage = { provider: 'v8' };
} catch {
  coverage = undefined;
}

export default defineConfig({ test: { coverage } });
