import { defineConfig } from 'vitest/config';

// API tests share one disposable PostgreSQL database (TEST_DATABASE_URL), so
// test files run one at a time and every test starts from a truncated schema.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**'],
    globalSetup: ['./test/global-setup.js'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
