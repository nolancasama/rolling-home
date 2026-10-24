import { defineConfig } from 'vitest/config';

// Reports and simulations that are run by hand (not part of `npm test`).
export default defineConfig({
  test: {
    include: ['tools/**/*.test.ts'],
    environment: 'node',
  },
});
