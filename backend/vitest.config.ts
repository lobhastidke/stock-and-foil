import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // Ensures test suites run sequentially against local PGlite database
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
