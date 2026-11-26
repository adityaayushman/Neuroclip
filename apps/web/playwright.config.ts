import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 5173);
const url = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  webServer: { command: `pnpm dev --port ${port} --strictPort`, url, reuseExistingServer: !process.env.CI },
  use: { baseURL: url },
});
