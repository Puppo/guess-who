import path from "node:path";
import { chromium, expect, test } from "@playwright/test";

const PERSISTENT_PROFILE_DIR = path.resolve(
  process.cwd(),
  ".cache/playwright-real-profile"
);

test("real single-pass DecisionModel runtime executes availability -> create -> decide -> destroy", async ({
  baseURL,
}) => {
  test.setTimeout(300_000);
  const origin = baseURL ?? "http://localhost:5173";

  const context = await chromium.launchPersistentContext(
    PERSISTENT_PROFILE_DIR,
    {
      baseURL: origin,
      channel: "chrome",
      headless: true,
      args: [
        "--enable-unsafe-webgpu",
        "--use-angle=metal",
        "--enable-features=Vulkan,UseSkiaRenderer",
        "--ignore-gpu-blocklist",
      ],
    }
  );

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const inferencePhaseExternalRequests: string[] = [];
    let trackingInferenceNetwork = false;

    page.on("request", (req) => {
      if (!trackingInferenceNetwork) return;
      const url = req.url();
      if (!url.startsWith(origin)) {
        inferencePhaseExternalRequests.push(url);
      }
    });

    await page.goto(origin);

    const gpuCheck = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      return {
        hasNavigatorGpu: Boolean(navigator.gpu),
        hasAdapter: adapter !== null && adapter !== undefined,
        hasNativeDecisionModel: typeof window.DecisionModel !== "undefined",
        userAgent: navigator.userAgent,
      };
    });
    console.log("Browser environment check:", gpuCheck);
    expect(gpuCheck.hasAdapter || gpuCheck.hasNativeDecisionModel).toBe(true);

    const initAndSession1 = await page.evaluate(async () => {
      const adapterModulePath = "/src/engine/decisionAdapter.ts";
      const { createDecisionEngineAdapter } = (await import(
        adapterModulePath
      )) as typeof import("../../src/engine/decisionAdapter.ts");
      const adapter = createDecisionEngineAdapter();
      const availability = await adapter.checkAvailability();
      const progressEvents: Array<number | null> = [];
      let initDurationMs = availability.initDurationMs ?? 0;

      if (availability.readiness === "downloadable") {
        const initialized = await adapter.initialize({
          onProgress: (fraction: number | null) =>
            progressEvents.push(fraction),
        });
        initDurationMs = initialized.initDurationMs;
      }

      const backend = adapter.getBackendIdentity();
      const noraFacts = [
        "Works as an astronomer",
        "Regularly works at night",
        "Works onsite at a hilltop observatory",
        "Enjoys hiking",
        "Owns a cat",
      ];

      const session1 = await adapter.createRoundSession(noraFacts);
      const q1 = await session1.decide("Does this person work at night?");
      const q2 = await session1.decide("Is the secret person Nora?");
      session1.destroy();

      let postDestroyRejected = false;
      try {
        await session1.decide("Does this person own a cat?");
      } catch (err) {
        postDestroyRejected =
          err instanceof DOMException && err.name === "AbortError";
      }

      const session2 = await adapter.createRoundSession([
        "Works as a mechanic",
        "Repairs old radios",
        "Enjoys camping",
        "Owns a dog",
      ]);

      (
        window as unknown as { __smokeSession2?: typeof session2 }
      ).__smokeSession2 = session2;

      return {
        availabilityReadiness: availability.readiness,
        backend,
        initDurationMs,
        progressCount: progressEvents.length,
        session1CreateMs: session1.createDurationMs,
        session2CreateMs: session2.createDurationMs,
        q1,
        q2,
        postDestroyRejected,
      };
    });

    console.log("Smoke result:", JSON.stringify(initAndSession1, null, 2));

    expect(initAndSession1.backend.kind).not.toBe("unavailable");
    expect(initAndSession1.postDestroyRejected).toBe(true);
    expect(initAndSession1.session2CreateMs).toBeLessThan(100);
    expect(initAndSession1.q1.raw.question_kind.label).toBe("trait_question");
    expect(initAndSession1.q1.raw.supports_yes.label).toBe("true");
    expect(initAndSession1.q2.raw.question_kind.label).toBe("identity_guess");

    trackingInferenceNetwork = true;
    const inferenceAndAbort = await page.evaluate(async () => {
      const session2 = (
        window as unknown as {
          __smokeSession2: {
            decide(
              q: string,
              opts?: { signal?: AbortSignal }
            ): Promise<unknown>;
            destroy(): void;
          };
        }
      ).__smokeSession2;

      const q3 = await session2.decide("Does this person own a cat?");
      const ac = new AbortController();
      ac.abort(new DOMException("Cancelled by smoke test", "AbortError"));
      let abortRejected = false;
      try {
        await session2.decide("Does this person enjoy camping?", {
          signal: ac.signal,
        });
      } catch (err) {
        abortRejected =
          err instanceof DOMException && err.name === "AbortError";
      }
      session2.destroy();
      return { q3, abortRejected };
    });
    trackingInferenceNetwork = false;

    console.log(
      "Post-load inference & abort:",
      JSON.stringify(inferenceAndAbort, null, 2)
    );
    expect(inferenceAndAbort.abortRejected).toBe(true);
    expect(inferencePhaseExternalRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
