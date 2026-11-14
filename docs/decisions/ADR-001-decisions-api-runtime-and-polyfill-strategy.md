# ADR-001: Decisions API Runtime, Polyfill Qualification, and Test-Only Mocks

## Status
Accepted (verified on Node v26.8.1 and Chrome 157 WebGPU, 2026-11-13)

## Date
2026-11-13

## Context
Guess Who? is a technical showcase for the [Decisions API](https://github.com/explainers-by-googlers/decisions-api) (`window.DecisionModel`), demonstrating how free-form player questions map to bounded, non-generative classification decisions with calibrated option probabilities and confidence scores.

At the time of writing, the Decisions API is an early Chrome Built-in AI proposal that has not been approved to ship in stable browsers, and no runtime integration has been tested in this repository yet:
- Native browser prototypes exist only behind experimental Chrome DevTrial configurations (reusing the `"language-model"` `Permissions-Policy`) and target desktop environments.
- On-device decision encoders require quantized model weights in the hundreds of megabytes, making mobile browser inference unreliable due to memory ceilings and download size.
- Without clear qualification rules, "local polyfill" could be misinterpreted as wrapping a generative LLM (`LanguageModel` / Prompt API) or heuristic matcher behind a `DecisionModel`-shaped interface, defeating the purpose of the showcase.
- Including an interactive "Simulation — no model inference" mode in production builds adds parallel UI state while risking confusion during live demos if a real runtime fails to initialize.

## Decision
1. **Runtime precedence and desktop scope:** Target desktop browsers for on-device ML execution. Prefer native `window.DecisionModel` when `DecisionModel.availability(schema)` reports `"available"` or `"downloadable"`. When native `window.DecisionModel` is absent, allow an explicitly labeled local polyfill verified in Phase 1. Keep responsive CSS and touch/keyboard support on mobile widths, while surfacing the unsupported-environment setup screen whenever a browser or device cannot run a verified engine.
2. **Polyfill qualification rule:** A valid polyfill must execute a local, single-pass, non-autoregressive option-scoring encoder implementing the `DecisionModel` schema, `probabilities`, and `confidence` contract. Evaluate the existing implementations cataloged in the Decisions API explainer before considering custom runtime glue:
   - [`built-in-ai-task-apis-polyfills`](https://www.npmjs.com/package/built-in-ai-task-apis-polyfills) / [WebAI Extension](https://github.com/etiennenoel/web-ai.studio/tree/master/extension) executing `litert-community/laya-LiteRT` or `openjev/openjev` locally behind `window.DecisionModel`.
   - [`open-jev` (`nico-martin/open-jev`)](https://github.com/nico-martin/open-jev) executing quantized ONNX `kev` / `open-jev` models via Transformers.js (WebGPU / WebAssembly) behind our adapter.
    If neither native `window.DecisionModel` nor a qualifying single-pass local encoder passes Phase 1 contract checks, stop and report the integration as blocked.
3. **Always-visible engine identity:** Render a persistent engine badge in the main header showing both readiness and backend identity (for example, `Ready · Native DecisionModel` or `Ready · Polyfill (laya-LiteRT)`), so polyfill usage remains visible even when the technical Inspector panel is collapsed.
4. **Test-only mocks:** Restrict deterministic `DecisionModel` mocks strictly to dependency injection inside automated Vitest and Playwright tests. Do not ship an interactive mock mode, simulation build, or simulation banner in application code.

## Alternatives Considered

### Native Chrome DevTrial Only (No Polyfill Allowed)
- Pros: Zero polyfill dependencies or client-side model bundling; tests only the exact browser implementation.
- Cons: Unshipped DevTrial availability can change across Canary/Dev builds and blocks developers or conference attendees without a specially configured browser build from running the showcase locally.
- Rejected: Permitting a verified, clearly labeled single-pass encoder polyfill from the explainer keeps the showcase runnable while remaining faithful to the System-1 decision model architecture.

### Local Generative `LanguageModel` (Prompt API) or Cloud LLM Wrapper
- Pros: Widely available and flexible with complex phrasing.
- Cons: Autoregressive token generation is an explicit non-goal of the Decisions API explainer, carries 10–50x higher compute/memory cost, does not natively produce single-pass option probabilities, and misrepresents what `window.DecisionModel` does.
- Rejected: Violates the core showcase requirement.

### Shipping an Interactive Production Simulation Mode
- Pros: Lets visitors click through canned UI responses on unsupported mobile or locked-down browsers.
- Cons: Requires production UI banners, build flags, and Inspector simulation states for a non-AI fallback, and undermines the rule that unsupported environments fail clearly rather than simulating inference.
- Rejected: Automated UI tests get deterministic mocks via test-only adapter injection without polluting production code.

## Consequences
- Phase 1 has a concrete, bounded candidate list (`window.DecisionModel`, `built-in-ai-task-apis-polyfills` with `laya-LiteRT`/`openjev`, and `open-jev`) and an explicit blocker exit if none satisfies schema, probability, and confidence requirements.
- Unsupported mobile or desktop browsers display clear missing-capability details and setup instructions instead of falling back to simulated answers.
- The header badge guarantees honest labeling between native browser support and a named local polyfill in both collapsed and expanded Inspector states.
- Once Phase 1 completes, this ADR must be updated from `Proposed` to `Accepted` (or superseded) with the exact verified package/browser versions and any observed contract differences.

## Verification & Empirical Notes (2026-11-13)

- **Selected runtime package:** `open-jev@0.1.2` using model checkpoint `onnx-community/kev-0.6b-ONNX` (`webgpu`, quantized `q4f16`, ~383 MB download) was qualified and verified in Phase 1.
- **Comparison against alternatives:**
  - `built-in-ai-task-apis-polyfills@2.1.2`: Spawns a dedicated Web Worker on every `DecisionModel.create()` call, causing multi-hundred-MB model weights to reload per round and colliding with Vite dynamic chunk bundling and cross-origin worker script isolation.
  - `DeBERTa-v3-large` (under `open-jev`): Yielded slightly lower `question_kind` accuracy and 14/15 on `supports_yes` during preliminary probing compared to 15/15 for `kev-0.6b`.
  - `kev-4b` (`onnx-community/kev-4b-ONNX`): Weighs ~2.28 GB, which exceeds acceptable in-browser footprint and cold-start download times for a 2–3 minute interactive showcase.
- **WebGPU adapter check:** `open-jev`'s internal `device: "auto"` detection was observed to attempt WebGPU when `navigator.gpu` exists even if `navigator.gpu.requestAdapter()` returns `null` (e.g. headless setups or disabled Metal flags), throwing unhandled WebGPU device initialization errors. An explicit pre-flight `await navigator.gpu.requestAdapter()` check was introduced in `src/engine/decisionAdapter.ts` to cleanly transition to `unavailable` rather than crashing.
- **Offline cache verification:** In `tests/e2e/real-runtime.smoke.spec.ts`, after the initial ~383 MB fetch, all subsequent round sessions and inferences ran with zero external network requests (`trackingInferenceNetwork` assertion passed).
