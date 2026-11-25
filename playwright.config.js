import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || 3100;
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Levanta la app con una base de datos limpia para las pruebas E2E
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `rm -f e2e-data/e2e.db* && node server.js`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: {
      PORT: String(PORT),
      DB_PATH: 'e2e-data/e2e.db',
      DISABLE_TCP: 'true',
      NODE_ENV: 'e2e',
    },
  },
});
