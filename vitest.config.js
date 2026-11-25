import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['server.test.js', 'tests/**/*.test.js'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/backend-junit.xml' },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json-summary'],
      include: ['server.js', 'database.js', 'observability.js'],
    },
  },
});
