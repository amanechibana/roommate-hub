import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  webServer: process.env.PW_MANAGED_SERVER
    ? {
        command: "npm run start -- --port 3001",
        url: "http://127.0.0.1:3001",
        reuseExistingServer: false,
        timeout: 60000,
      }
    : undefined,
  use: {
    baseURL: process.env.PW_BASE_URL || "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: process.env.PW_BROWSER_CHANNEL || "chrome",
    trace: "retain-on-failure",
  },
});
