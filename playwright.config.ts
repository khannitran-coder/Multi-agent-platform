import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:8001",
    viewport: { width: 1440, height: 1080 },
    headless: true,
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: ".local/evidence/browser-results.json" }],
  ],
  webServer: {
    command:
      `PLATFORM_DB=.local/browser-test-${Date.now()}.db .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001`,
    url: "http://127.0.0.1:8001/api/health",
    reuseExistingServer: false,
  },
});
