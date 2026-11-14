import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    trace: "on-first-retry",
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-angle=metal",
        "--enable-features=Vulkan,UseSkiaRenderer",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
