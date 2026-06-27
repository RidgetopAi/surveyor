import { defineConfig } from 'vitest/config';

// View-strategy logic is pure (no DOM), so the node environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
