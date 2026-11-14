# Guess Who? — Decisions API Showcase

A browser-based 12-character guessing game demonstrating on-device, single-pass natural language classification using the experimental [Decisions API](https://github.com/explainers-by-googlers/decisions-api) (`window.DecisionModel`).

Players ask free-form yes/no questions about written character biographies. The application translates single-pass option probabilities and confidence scores into deterministic game decisions (`Yes`, `No`, `Not enough information`, or a rephrase prompt), accompanied by a live technical Inspector panel showing runtime telemetry.

> **Zero Generative AI / Cloud Fallback:** This showcase strictly demonstrates System-1 option scoring via `window.DecisionModel` (with an `open-jev@0.1.2` + `onnx-community/kev-0.6b-ONNX` WebGPU `q4f16` local single-pass polyfill fallback). It does **not** use the Prompt API (`window.ai.languageModel`), cloud LLMs, keyword/regex matching, or canned production responses. Unsupported environments fail honestly and display setup instructions.

---

## Architectural Highlights

- **Per-Round Session Isolation ([ADR-002](./docs/decisions/ADR-002-per-round-session-and-segmented-decision-schema.md)):** One `DecisionModel` session per round binds the secret character's anonymous biographical facts inside trusted schema prompts (`supports_yes` and `contradicts_no`). Untrusted player input is passed purely as the input argument to `decide(question)`. Per-round session setup takes `< 0.1 ms`.
- **Orthogonal Boolean Grounding ([ADR-002](./docs/decisions/ADR-002-per-round-session-and-segmented-decision-schema.md)):** Rather than forcing an unmentioned trait into a 3-way `yes/no/unknown` softmax choice, factual verification is split into two orthogonal questions (`supports_yes` and `contradicts_no`). This eliminates `unknown`-to-`No` misclassification (observed **0** errors across all benchmarks).
- **Biographical Grounding Only ([ADR-003](./docs/decisions/ADR-003-biographical-only-character-facts-and-decorative-avatars.md)):** All gameplay is grounded in written biographical statements (occupation, routine, workspace, hobbies, pets). Each card features a 384×384 photorealistic editorial portrait (`public/avatars/*.jpg`) reflecting the character's biographical setting while intentionally omitting classic board-game props (eyewear, hats, facial hair); physical-appearance queries are routed cleanly to `needs_rephrase`.
- **Inspectable Telemetry ([ADR-004](./docs/decisions/ADR-004-frontend-stack-and-browser-evaluation-architecture.md)):** An expandable technical Inspector displays initialization vs. inference duration, raw winning labels, option probabilities, confidence scores (with explicit disclaimer: model score, not guaranteed correctness), and a stateless `<details>` `"Reveal context — spoilers"` disclosure showing the raw schema prompts without mutating round state.

---

## Prerequisites & Environment

- **Node.js:** `v26.8.1` (configured via [.nvmrc](./.nvmrc) and [.node-version](./.node-version); `package.json` specifies `"engines": { "node": ">=26.0.0" }`).
- **Browser:** Desktop Google Chrome (tested on Chrome `157` on macOS arm64 with Metal WebGPU enabled).
  - *Native Runtime:* Uses native `window.DecisionModel` when available or enabled via experimental Chrome DevTrial flags (`chrome://flags/#decisions-api`).
    - In Chrome Canary (tested up to `160`), `chrome://flags/#decisions-api` exposes **"Enabled"**, **"Enabled with All Backends"**, **"Enabled with EmbeddingGemma V1"**, and **"Enabled with Gemma 4 on CPU"**. Set it to **"Enabled with All Backends"** when testing cross-encoder backends alongside `embedding-gemma-v1`.
    - When Chrome Canary resolves to `embedding-gemma-v1` (the default **"Enabled"** option), the adapter probes `devTrialBackend` (`laya-en-wint8` -> `language-model` -> `embedding-gemma-v1`) and automatically switches to Schema `v3.1.0`'s anchor-calibrated atomic `Choice` partition (`13` `question_kind` options, `20` `supports_yes` options, `17` `contradicts_no` options within Blink's `<= 16` questions and `2..26` options limits). Offline evaluation on `onnx-community/embeddinggemma-300m-ONNX` (`q4`) scored `61/64` exact matches (`8/8` on Theo's screenshot round, `40/40` on valid trait questions, and `0` `unknown`-to-`No` errors).
  - *Local Polyfill Fallback:* Uses `open-jev@0.1.2` running `onnx-community/kev-0.6b-ONNX` (`device: "webgpu"`, `dtype: "q4f16"`, ~383 MB download), executing local forward passes via Transformers.js in WebGPU. Requires a functional WebGPU adapter (`navigator.gpu.requestAdapter()`).

---

## Quick Start & Commands

```bash
# Install dependencies
npm install

# Start Vite dev server on http://localhost:5173
npm run dev
```

### Complete Command Reference

| Command | Description |
| --- | --- |
| `npm run dev` | Start local Vite development server (`--port 5173 --strictPort`) |
| `npm run build` | Type-check and build production bundle (`tsc --noEmit && vite build`) |
| `npm run preview` | Preview production build locally (`--port 4173 --strictPort`) |
| `npm run typecheck` | Run TypeScript compiler checks (`tsc --noEmit`) |
| `npm run lint` | Lint source, scripts, and tests with Biome (`biome lint --error-on-warnings .`) |
| `npm run lint:fix` | Auto-apply safe Biome lint fixes (`biome lint --write .`) |
| `npm test` | Run offline deterministic Vitest unit & state test suite (78 tests, ~1.4s) |
| `npm run test:ui` | Run offline Playwright E2E full-round test with injected mocks |
| `npm run test:smoke:real` | Run real WebGPU smoke test in Chrome verifying full `availability -> create -> decide -> destroy` lifecycle |
| `npm run eval:browser` | Execute the 64-case browser evaluation suite in Chrome and generate [docs/evaluation-report.md](./docs/evaluation-report.md) |

---

## Model Download & Offline Cache Behavior

1. **Cold Start (First Run):**
   - On initial load, the 12 character cards and biographies render immediately in `round: 'idle'` while the engine checks availability.
   - When the engine indicates `'downloadable'`, clicking `"Initialize & start game"` triggers an explicit user-activated download of the quantized ONNX weights (~383 MB for `onnx-community/kev-0.6b-ONNX` `q4f16`).
   - A live progress bar tracks download progress.
2. **Post-Download Cache & Offline Gameplay:**
   - Model weights are cached locally in browser storage (Cache Storage / IndexedDB).
   - Subsequent page reloads and rounds skip downloading and perform a fast WebGPU session warm-up (~2.1s).
   - Per-round session creation (`createRoundSession()`) executes in memory in **`< 0.1 ms`** (`0.00–0.10 ms` observed median) with zero model weight reloads.
   - Live question inference executes in **`~270 ms`** median warm latency (`269.9 ms` in the `v3.1.0` benchmark) with **zero external network requests** during gameplay (verified by Playwright network assertions in `tests/e2e/real-runtime.smoke.spec.ts`).

---

## Evaluation Summary & Honest Failure Transparency

Model accuracy and inference latency were measured using the Playwright browser evaluation harness (`npm run eval:browser`, driving `src/eval/evalHarness.tsx` in Chrome 157 WebGPU) across 64 human-labeled cases partitioned into 28 threshold-tuning cases and 36 held-out test cases (including 11 singular/plural gender questions).

### Calibration & Pinned Thresholds (Schema `v3.1.0`)
- `questionKindThreshold`: `0.50`
- `factThreshold`: `0.50`

### Held-Out Evaluation Results (`n = 36`)

| Metric | Observed | Target | Status |
| --- | --- | --- | --- |
| Raw `question_kind` accuracy | 88.9% | — | Recorded |
| Raw `supports_yes` accuracy | 96.4% | — | Recorded |
| Raw `contradicts_no` accuracy | 92.9% | — | Recorded |
| Post-policy `unknown`-to-`No` errors | **0** | 0 | **Pass** |
| Valid-trait clarification rate | 0.0% (0/28) | <= 30.0% | **Pass** |
| Valid-trait acceptance rate | 100.0% (28/28) | >= 70.0% | **Pass** |
| Accepted factual answer accuracy | **92.9% (26/28)** | >= 90.0% | **Pass** |
| Gender questions (tuning + held-out) | 11/11 (100%) | — | **Pass** |
| Non-trait routing (`identity_guess` / `needs_rephrase`) | 6/8 | — | Recorded |
| Warm inference latency (median) | 269.9 ms | — | Recorded |
| Warm inference latency (p95) | 290.8 ms | — | Recorded |

### Transparent Held-Out Failure Analysis

Per Section 9 of the project plan, all 4 held-out failure cases from [docs/evaluation-report.md](./docs/evaluation-report.md) are documented openly:

1. **Plural Occupation Miss (`held-no-8`):**
   - *Nora / "Are they mechanics?"*: Returned `Yes` (`qk=trait_question(0.61), yes=true(0.65), no=false(0.54)`). Plural *"mechanics"* without a matching plural exclusion token in the cross-encoder prompt slipped past both `supports_yes` and `contradicts_no`. (On the bi-encoder `embedding-gemma-v1` schema, atomic per-job options explicitly pair singular and plural forms and classify this correctly as `No`.)
2. **Conservative Open-World Fallback on Occupation (`held-no-1`):**
   - *Milo / "Does this person work as an emergency paramedic?"*: Factual heads produced `supports_yes: false (0.93)` and `contradicts_no: false (0.56)`. Instead of fabricating an answer, the policy returned `"Not enough information"`.
3. **Compound / Open-Question `question_kind` Routing (2 cases):**
   - `held-comp-2` (Theo / *"Are they an illustrator and a mechanic?"*): Routed to `trait_question (0.65)`, but both factual heads fired `true (0.52)`, so policy caught the conflict and safely requested clarification instead of answering `Yes` or `No`.
   - `held-comp-3` (Omar / *"Where do they work?"*): `question_kind` routed the open wh-question to `trait_question (0.89)` with `contradicts_no: true (0.51)`, yielding `No`.

This demonstrates the core design goal of the Decisions API: deterministic application policies paired with explicit contradiction grounding and calibrated thresholds protect the user experience when compact on-device models exhibit boundary uncertainty.

---

## CI & GitHub Pages Deployment

The [Deploy to GitHub Pages](./.github/workflows/deploy-pages.yml) workflow runs on pushes to `main`, pull requests targeting `main`, and manual `workflow_dispatch` triggers using commit-SHA-pinned GitHub Actions:

1. **`quality`**: Runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:ui` (Playwright Chromium with mocked `DecisionModel`), and a `VITE_BASE_PATH` production build verification.
2. **`build-pages`** *(non-PR events)*: Configures GitHub Pages base path metadata (`actions/configure-pages`), builds `dist/` with `VITE_BASE_PATH` (`/<repo>/` or `/`), and uploads the Pages artifact.
3. **`deploy-pages`** *(non-PR events)*: Deploys the built artifact to the `github-pages` environment.

> **One-time repository setting:** In GitHub repository **Settings -> Pages**, set **Build and deployment -> Source** to **GitHub Actions** before pushing to trigger the first deployment.

---

## Documentation & Architecture Decision Records

- **Presenter Walkthrough Guide:** [docs/demo-walkthrough.md](./docs/demo-walkthrough.md) — 2–3 minute reproducible live demo script.
- **Specification & Implementation Plan:** [docs/guess-who-project-plan.md](./docs/guess-who-project-plan.md) — Complete architecture and acceptance criteria.
- **Empirical Evaluation Report:** [docs/evaluation-report.md](./docs/evaluation-report.md) — Full benchmark report and raw scores.
- **Architecture Decision Records (`docs/decisions/`):**
  - [ADR-001: Decisions API Runtime, Polyfill Qualification, and Test-Only Mocks](./docs/decisions/ADR-001-decisions-api-runtime-and-polyfill-strategy.md)
  - [ADR-002: Per-Round `DecisionModel` Session, Segmented Boolean Verification, and Uncached Live Inference](./docs/decisions/ADR-002-per-round-session-and-segmented-decision-schema.md)
  - [ADR-003: Biographical-Only Character Facts and Photorealistic Editorial Portraits](./docs/decisions/ADR-003-biographical-only-character-facts-and-decorative-avatars.md)
  - [ADR-004: Frontend Stack, Five-Module State Architecture, and Browser Evaluation Runner](./docs/decisions/ADR-004-frontend-stack-and-browser-evaluation-architecture.md)
- **Design Review Artifacts (`docs/reviews/`):**
  - [Stage 5 — Initial Zoom Out](./docs/reviews/zoom_out_report.md)
  - [Stage 6 — Comprehension Test](./docs/reviews/comprehension_report.md)
  - [Stage 7 — Critic Review](./docs/reviews/critic_report.md)
  - [Stage 8 — Intermediate Zoom Out](./docs/reviews/intermediate_zoom_out_report.md)
  - [Stage 9 — Implementation Readiness Test](./docs/reviews/implementation_readiness_report.md)
  - [Decisions API Explainer Snapshot](./docs/reviews/decisions-api-explainer.md)

---

## License

[MIT](./LICENSE)
