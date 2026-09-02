import { fileURLToPath } from "node:url";

import { defineConfig } from "playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.SFTP_E2E_PORT || 3300);
const origin = `http://${host}:${port}`;
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  outputDir: "../../test-results/sftp",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `${origin}/luna/`,
    browserName: "chromium",
    headless: true,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 }
  },
  webServer: {
    command: `pnpm exec nuxt dev --dotenv .env.development --host ${host} --port ${port}`,
    cwd: workspaceRoot,
    url: `${origin}/luna/files?tool_window=1`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
