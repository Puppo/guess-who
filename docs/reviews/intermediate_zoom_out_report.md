# Goldfish Review Report — Stage 8: Intermediate Zoom Out

**Target:** [guess-who-project-plan.md](../guess-who-project-plan.md) (`1-300`, full file)
**Goldfish Context:** [decisions-api-explainer.md](./decisions-api-explainer.md)
**Baseline Reference:** [zoom_out_report.md](./zoom_out_report.md), [comprehension_report.md](./comprehension_report.md), [critic_report.md](./critic_report.md)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

## File Modification & Stage 5 Baseline Status

[guess-who-project-plan.md](../guess-who-project-plan.md#L1-L300) has not been modified since Stage 5. All nine Stage 5 findings (`ZO-1` through `ZO-9`) remain open, and several Stage 6 and Stage 7 findings require simplicity guardrails so remediation reduces complexity rather than expanding non-MVP scope:

| Stage 5 ID | Summary | Status | Stage 6 / Stage 7 Simplicity Guardrail |
| --- | --- | --- | --- |
| `ZO-1` | `DecisionModel` schema vs. `decide(input)` trust boundary | Open | Reject `CR-1-4`'s delimiter-stripping workaround on concatenated inputs |
| `ZO-2` | Three-way `answer` choice pits `unknown` against `no` | Open | Cap schema at 3 questions / 2 thresholds; avoid 4-head split from `CR-1-5` |
| `ZO-3` | In-round question cache and cache telemetry | Open | Delete caching instead of adding normalization rules (`Comp-6`, `CR-1-11`) |
| `ZO-4` | Dedicated evaluation runner and 40-case tuning/held-out split | Open | Replace with 20–25 fixture check instead of expanding metric formulas (`Comp-5`) |
| `ZO-5` | Production simulation mode and duplicate Game/Demo views | Open | Collapse views and put engine badge in header (`Comp-4`, `CR-1-12`) |
| `ZO-6` | Omitted explainer polyfills in Section 1 and Phase 1 | Open | Name concrete explainer polyfills to resolve `Comp-1` directly |
| `ZO-7` | Blocking card inspection behind model initialization | Open | Show static board in `round: 'idle'` rather than `playing × loading` states |
| `ZO-8` | Unused `fact.id` and manual `roundId`/`requestId` counters | Open | Keep `string[]` facts and standard `AbortController` teardown |
| `ZO-9` | `spoiled` round state and conditional visual-trait scope | Open | Reject `CR-1-6` visual-badge encoding; scope strictly to written biographies |

## Prioritized Findings (Blockers -> Major -> Nits)

### IZO-1: Unresolved Trust-Boundary Contradiction and Anti-Workaround Guardrail on Input Sanitization - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L98-L116), [guess-who-project-plan.md](../guess-who-project-plan.md#L142) (`## 5. Decision design`)
* **Discrepancy Description:** `ZO-1` remains open: lines 100–102 send both secret character facts and the player's question in `Input` while claiming developer instructions remain separate from untrusted player text, even though `window.DecisionModel` isolates trust strictly between `DecisionModel.create(schema)` and `model.decide(input)` ([decisions-api-explainer.md](./decisions-api-explainer.md#L313)). Stage 7 `CR-1-4` suggests stripping structural delimiters/newlines from player input before concatenating facts and player text as a fallback.
* **Rationale & Recommendation:** Reject regex/delimiter sanitization over concatenated `Facts + Question` strings (`zoom-out-standard.md` §1 & §3): stripping newlines or `"Facts:"` labels neither blocks natural-language fact spoofing in a shared input string nor stops biography statements from interfering with `question_kind`. Create a per-round `DecisionModel` session (`DecisionModel.create(roundSchema)`) that places secret character facts in the factual question `prompt`(s) and passes only `playerQuestion` to `model.decide(playerQuestion)`, calling `model.destroy()` on reset. Document single-session concatenation only as a rejected option under `Alternatives Considered` (or, if Phase 1 proves a polyfill reloads model weights on every `create()`, isolate `question_kind` in its own static session instead of writing input sanitizers).

### IZO-2: Unbounded Polyfill Rule vs. Concrete Explainer Runtimes - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L11-L21) (`## 1`), [guess-who-project-plan.md](../guess-who-project-plan.md#L219-L228) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L268-L270) (`## 10`), [guess-who-project-plan.md](../guess-who-project-plan.md#L298-L300) (`## 12`)
* **Discrepancy Description:** `ZO-6` remains open, and Stage 6 Finding 1 identifies a Blocker contradiction between allowing a `"Decisions API-compatible local polyfill"` (line 17) and forbidding `"a compatible-looking interface, or an unrelated AI service"` (line 300) without naming valid candidates.
* **Rationale & Recommendation:** Define a valid polyfill directly by execution model—a local, single-pass, non-autoregressive option-scoring encoder implementing `DecisionModel`'s schema and probability contract (excluding generative `LanguageModel`/LLM wrappers, cloud APIs, and heuristics)—and name the concrete candidates already listed in [decisions-api-explainer.md](./decisions-api-explainer.md#L322-L340): `built-in-ai-task-apis-polyfills` / WebAI Extension (`litert-community/laya-LiteRT` or `openjev/openjev`) and `nico-martin/open-jev` (Transformers.js ONNX), evaluated after native Chrome DevTrial `window.DecisionModel`.

### IZO-3: Decision Schema and Threshold Proliferation Risk - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L44) (`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L104-L143) (`## 5`), [guess-who-project-plan.md](../guess-who-project-plan.md#L173-L176) (`## 6`), [guess-who-project-plan.md](../guess-who-project-plan.md#L234) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L282-L283) (`## 10`)
* **Discrepancy Description:** Combining `ZO-2` (splitting `answer` into two booleans) with Stage 7 `CR-1-5`'s suggestion to also split `question_kind` into a validity `boolean` plus an intent `choice` would create a four-question schema with four confidence thresholds and multi-way conflict rules for a two-minute demo.
* **Rationale & Recommendation:** Cap the single-pass schema at three questions and at most two thresholds:
  1. **Merge `off_topic` into `needs_rephrase`:** Keep `question_kind` as a three-label `choice` (`trait_question`, `identity_guess`, `needs_rephrase`) where compound, non-yes/no, off-topic, and prompt-injection inputs all route to `needs_rephrase` (no question-count increment; prompt the player to ask one yes/no trait question). This resolves Stage 6 Finding 2 and `CR-1-9` row 6 without adding a fourth schema head.
  2. **Gate `question_kind` first:** Check `question_kind.confidence >= questionKindThreshold` before routing on `question_kind.label`; only when `trait_question` passes, evaluate `supports_yes` and `contradicts_no` booleans with one shared `factThreshold` (mapping both-`"false"` to `"Not enough information"`, and low confidence or both-`"true"` conflict to a rephrase/uncertainty message).

### IZO-4: Delete-Rather-Than-Specify Guardrail on In-Round Question Caching - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L49) (`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L144) (`## 5`), [guess-who-project-plan.md](../guess-who-project-plan.md#L154), [guess-who-project-plan.md](../guess-who-project-plan.md#L177) (`## 6`), [guess-who-project-plan.md](../guess-who-project-plan.md#L262) (`## 10`)
* **Discrepancy Description:** `ZO-3` remains open, and Stage 6 Finding 6 plus Stage 7 `CR-1-8` and `CR-1-11` ask to relocate cache rules and specify normalization algorithms, cache-hit question counting, and duplicate history handling.
* **Rationale & Recommendation:** Delete in-round caching, cache-hit Inspector fields, and cache reset tests altogether rather than specifying normalization and accounting rules (`zoom-out-standard.md` §2). Rounds take four to six explicit submissions, Q&A history is already visible, and live demos benefit from re-running real inference when repeating a question.

### IZO-5: Delete-Rather-Than-Expand Guardrail on Evaluation Runner and Split Gates - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L195) (`## 7`), [guess-who-project-plan.md](../guess-who-project-plan.md#L229-L237) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L281-L285) (`## 10`), [guess-who-project-plan.md](../guess-who-project-plan.md#L292-L293) (`## 11`)
* **Discrepancy Description:** `ZO-4` remains open, while Stage 6 Finding 5 flags undefined metric denominators (`per-label accuracy`, `clarification rate`), conflicting pass/fail vs. "goal" language on the 90%/70% checkbox, and small held-out sample sizes across 40 split cases.
* **Rationale & Recommendation:** Do not resolve Stage 6 Finding 5 by expanding the dataset, adding statistical metric formulas, or building larger browser-benchmarking tooling. Drop the dedicated `Evaluation fixtures` module, tuning/held-out split, 90%/70% gate, p95 latency requirement, and standalone evaluation report; replace them with a single 20–25 case browser fixture check in Phase 2 to choose working thresholds and record pass/fail counts, warm median latency, and failure examples in `README.md`.

### IZO-6: Interactive Simulation Mode and Duplicate Game/Demo View Concepts - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L17-L19) (`## 1`), [guess-who-project-plan.md](../guess-who-project-plan.md#L152-L178) (`## 6`), [guess-who-project-plan.md](../guess-who-project-plan.md#L248) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L271) (`## 10`)
* **Discrepancy Description:** `ZO-5` remains open, causing Stage 6 Finding 4 and Stage 7 `CR-1-12`: the spec defines an interactive `"Simulation — no model inference"` mode/build alongside both a `"Collapsible inspection panel"` and `"Game view"` / `"Demo view"` modes that hide `"Engine identity"` when collapsed (conflicting with line 17's requirement to always label a polyfill).
* **Rationale & Recommendation:** Restrict mocks strictly to dependency injection in automated UI tests (deleting interactive simulation mode/builds/banners), merge `"Game view"` and `"Demo view"` into the single collapsible Inspector panel, and keep one always-visible engine badge in the top header showing both readiness and backend identity (e.g., `Ready · Native DecisionModel` or `Ready · Polyfill (laya-LiteRT)`).

### IZO-7: Premature `DedicatedWorker` Isolation and Unscoped Mobile Inference - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L148), [guess-who-project-plan.md](../guess-who-project-plan.md#L157-L163) (`## 6`), [guess-who-project-plan.md](../guess-who-project-plan.md#L185-L216) (`## 7`–`## 8`), [guess-who-project-plan.md](../guess-who-project-plan.md#L263) (`## 10`)
* **Discrepancy Description:** Stage 7 `CR-1-2` identifies mobile RAM/browser limits and main-thread polyfill stalls, and recommends isolating polyfills in a `DedicatedWorker`. Meanwhile, lines 157–163 and 263 require mobile usability without separating responsive CSS layout from on-device ML runtime support.
* **Rationale & Recommendation:**
  1. **Skip `DedicatedWorker` plumbing in the MVP:** Submissions run one at a time while the form is disabled, card flips occur manually after inference finishes, native `DecisionModel` worker exposure is still open ([decisions-api-explainer.md](./decisions-api-explainer.md#L284-L286)), and worker `postMessage` + `AbortSignal` bridging splits native vs. polyfill adapter paths before any stall is measured. Document main-thread latency as an accepted MVP risk unless Phase 1 shows an unacceptable freeze.
  2. **Scope ML runtime support to desktop browsers:** Keep responsive mobile layout and keyboard/touch controls (`lines 157–163, 263`), while stating in `Risks & Constraints` and `§8` that `DecisionModel`/polyfill execution targets desktop browsers only; unsupported mobile browsers show the standard unsupported-environment screen (`line 211`).

### IZO-8: Separate `Inspector` Module Layer and Spec-Bloat Risk in Structural Additions - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L5-L52) (`## 1`–`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L94-L132) (`## 5`), [guess-who-project-plan.md](../guess-who-project-plan.md#L183-L204) (`## 7`)
* **Discrepancy Description:** `## 7` lists `Inspector` as a separate top-level module beside `Game state` and `UI`, encouraging duplicate state tracking instead of rendering turn records already stored in `Game state`. In addition, adding Stage 7's required sections (`Problem Statement`, `Goals & Non-Goals`, `Alternatives Considered`, `Risks, Constraints & Mitigations`, schema types, and data flow) on top of existing scattered caveats risks bloating the spec and dropping into code-level weeds.
* **Rationale & Recommendation:** Collapse the module table to five modules (`Character data`, `Decisions API adapter`, `Decision policy`, `Game state`, `UI`, with the Inspector rendered inside `UI` from raw result and timing fields on each `Game state` turn), fold existing scattered caveats and exclusions into the new standard sections instead of duplicating them, and keep the `## 5` code block to schema/result type contracts and the `## 7` data flow to module-boundary steps.

### IZO-9: Static Board Visibility via `round: "idle"` Instead of `playing × loading` Cross-States - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L39) (`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L199) (`## 7`), [guess-who-project-plan.md](../guess-who-project-plan.md#L205-L210) (`## 8`)
* **Discrepancy Description:** `ZO-7` remains open alongside Stage 6 Finding 6b (undefined `round: 'idle'`) and Stage 7 `CR-1-10` (missing `downloadable` engine state). Entering `round: 'playing'` while `engine: 'loading'` (`ZO-7`) adds concurrent `(playing × loading | error)` UI states.
* **Rationale & Recommendation:** Add `downloadable` to engine states (`'uninitialized' | 'downloadable' | 'loading' | 'ready' | 'unavailable' | 'error'`) and render the 12 character cards and public biographies during `round: 'idle'` while the engine downloads or initializes, transitioning to `round: 'playing'` (secret selection, round session creation, and active input) only once `engine === 'ready'`.

### IZO-10: Visual-Trait Encoding, Custom Illustration Scope, `spoiled` State, and Bookkeeping Weeds - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L55), [guess-who-project-plan.md](../guess-who-project-plan.md#L71-L92) (`## 4`), [guess-who-project-plan.md](../guess-who-project-plan.md#L148), [guess-who-project-plan.md](../guess-who-project-plan.md#L179) (`## 6`), [guess-who-project-plan.md](../guess-who-project-plan.md#L194-L201) (`## 7`), [guess-who-project-plan.md](../guess-who-project-plan.md#L289) (`## 11`)
* **Discrepancy Description:** `ZO-8` and `ZO-9` remain open, while `CR-1-6` offers an option to encode structured visual badges across all 12 portraits and lines 55, 92, 148, and 289 require original illustrations cross-checked against facts.
* **Rationale & Recommendation:** Reject structured visual-attribute encoding (`CR-1-6` option B), scope MVP gameplay strictly to written biographical facts with a short UI notice (*"Questions are answered from written biographies only"*), allow simple stylized SVG/geometric avatars instead of custom illustrations, make `"Reveal context — spoilers"` a stateless `<details>` disclosure without a `spoiled` round flag, change `Character.facts` to `string[]`, and replace manual `roundId`/`requestId` counters with `AbortController` cancellation.
