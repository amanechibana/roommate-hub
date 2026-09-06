import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: "chrome",
    trace: "retain-on-failure",
  },
});
