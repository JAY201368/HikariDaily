import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "wide", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "narrow", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "reduced-motion", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" } },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    env: { HIKARI_E2E_DIST: "1" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
  },
});
