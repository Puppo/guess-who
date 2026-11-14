# ADR-004: Frontend Stack, Five-Module State Architecture, and Browser Evaluation Runner

## Status
Accepted (verified on Node v26.8.1 and Chrome 157 WebGPU, 2026-11-13)

## Date
2026-11-13

## Context
The repository is currently greenfield (`README.md`, `LICENSE`, and `docs/`). To make the implementation plan executable without leaving toolchain, UI state, or benchmark-harness choices open, three structural decisions need to be pinned:

1. **Application and test toolchain:** `window.DecisionModel` and candidate WebGPU/WebAssembly polyfills execute only in a real browser environment, not in Node.js. We need fast unit tests for deterministic state and policy logic alongside real Chromium execution for smoke testing and Phase 2 model evaluation.
2. **UI and state boundaries:** Splitting technical telemetry into a standalone `Inspector` state module alongside `Game state`, or maintaining separate `"Game view"` / `"Demo view"` modes and `"spoiled"` round flags, duplicates state for a single-page in-memory game. Similarly, entering `round: "playing"` while the model is still downloading creates `(playing × loading | error)` cross-product states, whereas completely hiding the board during cold start leaves dead air in a live demo.
3. **Repeatable evaluation with threshold-tuning vs. held-out splits:** Because `DecisionModel` confidence scores and `unknown`-vs-`no` behavior are unverified until Phase 1/2 run against a real model, we want a repeatable 40+ case evaluation suite with separate threshold-tuning and held-out splits—executed inside a real browser context with explicit metric definitions and warm-latency measurements.

## Decision
1. **Pinned stack and package manager:** Use `npm`, TypeScript, Vite, React, and standard HTML/CSS (`prefers-reduced-motion` and CSS grid) for the application; use **Vitest** (with Testing Library) for offline deterministic unit/component tests and **Playwright** (Chromium) for mocked E2E UI tests, opt-in real-runtime smoke tests, and automated Phase 2 browser evaluation.
2. **Five-module client architecture and unified Inspector:** Organize `src/` into five modules:
   - `Character data` (`src/data/characters.ts`): 12 validated profiles and `facts: string[]`.
   - `Decisions API adapter` (`src/engine/decisionAdapter.ts`): `availability()`, user-activated `create()` with `monitor` progress, `decide()` with `AbortSignal`, structural result validation, and `destroy()`.
   - `Decision policy` (`src/engine/policy.ts`): pre-inference length checks, confidence-threshold gates, and deterministic mapping to `AppOutcome` (`answered`, `unknown`, `clarification`, `rejection`, `error`) and fixed UI copy.
   - `Game state` (`src/state/gameState.ts`): engine states (`'uninitialized' | 'downloadable' | 'loading' | 'ready' | 'unavailable' | 'error'`), round states (`'idle' | 'playing' | 'won' | 'lost'`), secret character selection, manual card eliminations, `AbortController` teardown on reset, and turn history entries (including raw decision scores and inference duration).
   - `UI` (`src/components/*`): renders the 12-card board, accessible `<dialog>` biography modal on mobile, question controls, and a single collapsible Inspector panel reading directly from `Game state` turn records (collapsed = clean game view, expanded = demo telemetry view, with a stateless `<details>` disclosure for `"Reveal context — spoilers"`).
3. **Cold-start board visibility via `round: "idle"`:** Render all 12 character cards and public biographies immediately during `round: "idle"` while `engine` is `'uninitialized'`, `'downloadable'`, or `'loading'`. Transition `round` to `'playing'` (selecting the secret character, creating the round `DecisionModel` session, and enabling question submission and card elimination) only after `engine === 'ready'`.
4. **Playwright-driven Phase 2 evaluation runner:** Store at least 48 human-labeled evaluation cases (`src/eval/fixtures.ts`) partitioned into a **20-case threshold-tuning split** and a **28-case held-out split** across all seven prompt categories (`yes`, `no`, `unknown`, paraphrases, negation, compound/ambiguous, and identity/injection). Execute them against the real browser runtime via a Playwright script driving a dev-only `?eval=1` harness (`npm run eval:browser`), discarding 3 warm-up calls before recording warm inference median and p95 latency and writing `docs/evaluation-report.md`. Keep `npm test` and `npm run test:ui` offline and deterministic in CI using injected mocks, and keep `npm run test:smoke:real` and `npm run eval:browser` as explicit local browser commands.

## Alternatives Considered

### Vanilla TypeScript DOM Manipulation Without React
- Pros: Smaller bundle size with zero UI framework dependency.
- Cons: Manual DOM synchronization across 12 interactive cards, accessible `<dialog>` focus restoration, ARIA live regions, chronological history, and collapsible Inspector tables is more error-prone to maintain and test than declarative React components.
- Rejected: React + Vite keeps component and accessibility testing straightforward with negligible overhead for a local showcase.

### Offloading Polyfill Inference to a `DedicatedWorker` in the MVP
- Pros: Prevents WASM/ONNX execution from blocking main-thread animations during `decide()`.
- Cons: Submissions run one at a time while the form is disabled, card flips occur manually after inference returns, native `DecisionModel` worker support is still an open spec issue in the explainer, and bridging `create()`, `monitor`, and `AbortSignal` over `postMessage` bifurcates native vs. polyfill adapter paths prematurely.
- Rejected for MVP: Document main-thread polyfill latency as an accepted constraint unless Phase 1 measurements show an unacceptable UI freeze.

### Lightweight 20-Case Manual Sanity Check Without Tuning/Held-Out Split
- Pros: Less evaluation code and fewer labeled fixtures to maintain.
- Cons: Choosing confidence thresholds and reporting accuracy on the same 20 examples overfits threshold selection and gives weaker evidence on `unknown`-to-`no` errors across compact models.
- Rejected: Keeping a 48-case split (20 tuning / 28 held-out) executed via Playwright provides repeatable evidence while remaining small enough to curate by hand.

## Consequences
- Every phase in the implementation plan can run deterministic verification (`npm run typecheck`, `npm test`, `npm run build`) while keeping real multi-hundred-MB model execution isolated in explicit Playwright browser scripts (`npm run test:smoke:real`, `npm run eval:browser`).
- Demo presenters can introduce the 12 characters on screen during `round: "idle"` while weights initialize, without introducing `playing × loading` state complexity.
- All technical telemetry in the collapsible Inspector comes from the single `Game state` store with zero duplicate state synchronization or `"spoiled"` round flags.

## Verification & Empirical Notes (2026-11-13)

- **Toolchain verification:** Verified `React 19.3.1`, `Vite 8.3.8`, `Vitest 5.1.0`, and `@playwright/test 1.65.0` on Node `v26.8.1` (`.nvmrc` / `.node-version`, `engines.node >= 26.0.0`).
- **Offline test execution:**
  - `npm run typecheck` (`tsc --noEmit`) passes cleanly.
  - `npm test` (`vitest run`) executes 67 deterministic unit and state tests in ~1.4s offline with zero network or GPU dependencies.
  - `npm run test:ui` (`playwright test tests/e2e/game-round.mock.spec.ts`) isolates mocked end-to-end full-round runs from production bundles.
- **Real runtime browser execution:**
  - `npm run test:smoke:real` (`tests/e2e/real-runtime.smoke.spec.ts`) runs against Google Chrome 157 on macOS arm64 using persistent WebGPU Metal profiling (`channel: "chrome"`, `--use-angle=metal`), proving the full `availability -> create -> decide -> destroy` lifecycle and zero external network traffic during inference.
  - `npm run eval:browser` (`scripts/run-browser-eval.ts`) drives the dev-only `?eval=1` browser harness (`src/eval/evalHarness.tsx`) over 48 test cases (20 tuning + 28 held-out), measuring warm inference latency after 3 discarded warm-up runs and writing `docs/evaluation-report.md`.
- **UI & state performance:**
  - Board cards and biographies render immediately on page load in `round: 'idle'` while `engine === 'downloadable'` or `'loading'`.
  - Single-page state hook (`src/state/gameState.ts`) manages round progression, manual card elimination, and Inspector telemetry without secondary synchronization.
