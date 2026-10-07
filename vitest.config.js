import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html'], // Muestra la tabla en consola y crea un HTML
      exclude: ['node_modules/**', 'database.db**', 'vitest.config.js'],
    },
  },
});