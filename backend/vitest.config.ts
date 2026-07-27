import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Unit tests only — no database required for pricing and validation tests.
    // Integration tests (booking creation, check-in flow, etc.) require a
    // PostgreSQL test database. See TESTING.md for setup instructions.
    testTimeout: 10000,
    reporter: 'verbose',
  },
  resolve: {
    // Support .js extensions on TypeScript imports (ESM requirement)
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
  },
});
