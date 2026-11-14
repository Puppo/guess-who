import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

type WebServerTarget = {
  port: number;
  command: string;
  reuseExistingServer: boolean;
};

function resolveWebServerTarget(): WebServerTarget {
  const customPort = process.env.GUESS_WHO_PORT?.trim();
  if (customPort && /^\d+$/.test(customPort)) {
    const port = Number(customPort);
    return {
      port,
      command: `npx vite --port ${port} --strictPort`,
      reuseExistingServer: !process.env.CI,
    };
  }

  let status = "free";
  try {
    const probeScript = `
      (async () => {
        try {
          const res = await fetch("http://localhost:5173", {
            signal: AbortSignal.timeout(1500),
          });
          const body = await res.text();
          process.stdout.write(
            res.ok && body.includes("Guess Who?") ? "guess-who" : "other"
          );
        } catch {
          process.stdout.write("free");
        }
      })();
    `;
    status = execFileSync(process.execPath, ["-e", probeScript], {
      encoding: "utf8",
      timeout: 3000,
    }).trim();
  } catch {
    status = "free";
  }

  if (status === "other") {
    return {
      port: 5179,
      command: "npx vite --port 5179 --strictPort",
      reuseExistingServer: false,
    };
  }

  return {
    port: 5173,
    command: "npm run dev",
    reuseExistingServer: !process.env.CI,
  };
}

const target = resolveWebServerTarget();
const targetUrl = `http://localhost:${target.port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: targetUrl,
    channel: process.env.CI ? undefined : "chrome",
    trace: "on-first-retry",
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
        "--enable-features=Vulkan,UseSkiaRenderer",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: target.command,
    url: targetUrl,
    reuseExistingServer: target.reuseExistingServer,
    timeout: 60_000,
  },
});
