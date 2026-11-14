# ADR-002: Per-Round `DecisionModel` Session, Segmented Boolean Verification, and Uncached Live Inference

## Status
Accepted (verified on Node v26.8.1 and Chrome 157 WebGPU, 2026-11-13)

## Date
2026-11-13

## Context
Each player turn evaluates an untrusted natural-language question (for example, *"Does this person work after dark?"*) against the secret character's written facts without revealing the character's name or ID to the model. Three design problems emerged during architectural review of the initial plan:

1. **Trust boundary and cross-question interference:** In `window.DecisionModel`, structural separation between trusted developer instructions and untrusted user text exists strictly between `DecisionModel.create(schema)` (`questions[].prompt` and `options[].description`) and `model.decide(input)`, which accepts a single input string. Serializing both secret character facts and the player's question into `model.decide(input)` mixes ground-truth facts and untrusted player text in one channel (allowing spoofed `"Fact: ..."` lines) and forces `question_kind` to classify an input mostly filled with declarative biography statements.
2. **Open-world `unknown` vs. `no` competition:** Modeling factual grounding as a single 3-way `choice` (`yes`, `no`, `unknown`) pits open-world absence (`unknown`) against explicit negation (`no`) in one softmax distribution whenever a trait is unmentioned. In compact encoders, this either misclassifies `unknown` as `no` or splits probability mass across both labels, depressing confidence and asking the player to "rephrase" an already clear question.
3. **Live-demo transparency vs. question caching:** Caching normalized questions within a 4–6 question round solves no real latency bottleneck (inference runs only on form submission), adds normalization/history-accounting rules, and suppresses real on-device inference when a presenter intentionally repeats a question during a live technical demo.

## Decision
1. **Per-round session with schema-bound facts:** Create one `DecisionModel` session per round (`DecisionModel.create(roundSchema)`) that embeds the secret character's anonymous fact list inside the developer `prompt` of the factual verification questions, and pass **only** the untrusted `playerQuestion` string to `model.decide(playerQuestion)`. Release the session via `model.destroy()` (and cancel any in-flight `decide()` via `AbortController`) on round reset or teardown.
   - *Contingency for Phase 1:* If Phase 1 measurements show that the selected polyfill reloads full model weights on every `create()` call rather than reusing loaded weights across sessions, fall back to a two-session split: run `question_kind` in a dedicated static session (`questionKindModel.decide(playerQuestion)`) before calling the fact-grounded verification session, rather than writing regex delimiter sanitizers over a single concatenated input.
2. **Three-question single-pass schema:** Use `DecisionModel`'s parallel single-pass multi-question execution with three questions and at most two calibrated confidence thresholds:
   - `question_kind` (`choice` with three mutually exclusive labels: `trait_question`, `identity_guess`, `needs_rephrase`). Compound questions, non-yes/no questions, off-topic prompts, and prompt-injection attempts all route to `needs_rephrase` because they trigger the same application behavior (do not increment question count; ask the player for a single yes/no trait question).
   - `supports_yes` (`boolean`): `"true"` only when the supplied facts explicitly state or directly entail the player's proposition.
   - `contradicts_no` (`boolean`): `"true"` only when the supplied facts contain an explicit negative statement or mutually exclusive fact that contradicts the proposition (omission alone is `"false"`).
3. **Confidence-first policy order:** Validate schema conformance first, then check `question_kind.confidence >= questionKindThreshold` *before* branching on `question_kind.label`. Only when `question_kind` is a confident `trait_question`, evaluate `supports_yes` and `contradicts_no` against `factThreshold`:
   - `supports_yes === "true"` and `contradicts_no === "false"` (both confident) → `"Yes"` (`answered`, increments question count).
   - `contradicts_no === "true"` and `supports_yes === "false"` (both confident) → `"No"` (`answered`, increments question count).
   - `supports_yes === "false"` and `contradicts_no === "false"` (both confident) → `"Not enough information"` (`unknown`, increments question count).
   - Low boolean confidence or anomalous `true` + `true` conflict → clarification/uncertainty response (`clarification`, does not increment question count).
4. **No in-round question caching:** Execute a live `decide()` call on every valid submission and remove in-round question caching and cache-hit Inspector fields.

## Alternatives Considered

### Single Global Session Concatenating Facts and Player Question in `decide(input)`
- Pros: Calls `DecisionModel.create()` once per page load with zero per-round session setup cost.
- Cons: Collapses `DecisionModel`'s native `create(schema)` vs. `decide(input)` trust boundary, exposes the shared string to spoofed fact injection, and pollutes `question_kind` input with declarative biography text. Regex delimiter stripping does not stop natural-language spoofing.
- Rejected: Violates the API's own security boundary when per-round `create()` can bind facts inside trusted schema prompts.

### Two-Question Schema (`question_kind` 4-Way Choice + `answer` 3-Way `yes`/`no`/`unknown` Choice)
- Pros: Only two schema questions and one factual label to inspect.
- Cons: `off_topic` and `needs_rephrase` overlap on adversarial or unclear inputs without distinct game actions, and `no` vs. `unknown` softmax competition on unmentioned traits causes `unknown`-to-`no` errors or artificially low confidence.
- Rejected: Merging `off_topic` into `needs_rephrase` and splitting factual grounding into `supports_yes` and `contradicts_no` uses parallel single-pass scoring to separate entailment from explicit contradiction while keeping the schema to three questions.

### Four-Head Schema (Adding a Separate `is_valid_single_question` Boolean)
- Pros: Separates structural question validity from intent routing.
- Cons: Expands the schema to four heads with extra threshold calibration and conflict combinations for no distinct UI outcome.
- Rejected: Over-engineered for a 2–3 minute game when three `question_kind` options already partition player actions cleanly.

### Retaining In-Round Normalized Question Caching
- Pros: Saves ~50–200 ms if a player submits the exact same question twice in one round.
- Cons: Requires string normalization rules, duplicate-history/counter rules, cache-hit telemetry in the Inspector, and blocks presenters from re-running a question to demonstrate live local inference latency.
- Rejected: Premature optimization that hurts live-demo ergonomics.

## Consequences
- `playerQuestion` is evaluated cleanly without biography text in `decide(input)`, and secret facts stay inside the round schema (hidden in UI unless the presenter opens the stateless `"Reveal context — spoilers"` disclosure in the Inspector).
- Phase 1 must verify maximum schema `prompt` token capacity across all 12 character fact lists plus option descriptions, and measure per-round `create()` / `destroy()` overhead.
- Phase 2 threshold tuning selects two concrete numbers (`questionKindThreshold` and `factThreshold`) on the tuning split and tests `unknown`-to-`no` error rates on the held-out split.

## Verification & Empirical Notes (2026-11-13)

- **Per-round session latency:** In `tests/e2e/real-runtime.smoke.spec.ts` and `scripts/run-browser-eval.ts`, `createRoundSession()` measured `0.00–0.10 ms` median latency because `open-jev` loads weights once during `adapter.initialize()` and binds new schema prompts in memory without reloading weights across rounds.
- **Negation polarity collision (`noul` vs. `choice`):** In schema `v1.0` through `v1.4`, `contradicts_no` was typed as `boolean` (`noul` in `open-jev`, answering `["no", "yes"]`). Because `kev-0.6b`'s `noul` head maps positive polarity to `"yes"`, asking *"Do these facts contradict the question?"* caused severe polarity confusion (`0/6` on explicit negation tests).
- **Resolution in Schema `v2.0.0`:** Redefined `contradicts_no` as a 2-option `choice` with explicit labels `"false"` (*"The facts either agree with the question OR do not mention that topic at all"*) and `"true"` (*"The facts state the opposite (such as explicitly does not, dislikes, owns no pets, or a different job)"*) positioned immediately after `supports_yes`.
- **Observed held-out performance (`n = 28`):**
  - Raw `supports_yes`: `100.0%`
  - Raw `contradicts_no`: `85.0%`
  - Post-policy `unknown`-to-`No` errors: `0`
  - Valid-trait acceptance rate: `75.0%` (`>= 70.0%` target passed)
  - Non-trait routing: `8/8` (`100%`)
  - Warm inference latency: `172.3 ms` median, `177.4 ms` p95
  - Accepted factual accuracy: `86.7%` (13/15) against the `>= 90.0%` target. This gap is driven by open-domain mutual-exclusivity misses (`held-no-4` where Lin is a botanical archivist and the player asked about sound engineering, and `held-no-3` where Theo is an illustrator and the player asked about a hilltop observatory). Documented in `docs/evaluation-report.md` for explicit waiver rather than hidden.

### Schema v3.0.0 Update (2026-11-14)

- **Explicit contradiction derivation & gender/open-world parity:** Updated `deriveExplicitContradictions()` in `src/engine/schema.ts` to derive deterministic contradiction statements for gender (`Gender: female / woman (not male, not a man)` and vice versa), the closed 12-role career domain (`Explicitly does not work as: ...`), workplace exclusivity (`work from home` vs. `onsite at a hilltop observatory`), and single-pet open-world guards (`Cat ownership is not mentioned (not contradicted)` / `Dog ownership is not mentioned (not contradicted)`).
- **Chrome Canary `devTrialBackend` negotiation & bi-encoder fallback:** Updated `createDecisionEngineAdapter()` in `src/engine/decisionAdapter.ts` to probe native backends in priority order (`laya-en-wint8` -> `language-model` -> `embedding-gemma-v1`) and switch automatically to a `choice`-partitioned bi-encoder schema (`buildBiEncoderSchema`) whenever Chrome Canary resolves to `embedding-gemma-v1`.
- **Calibrated thresholds & 56-case held-out performance (`n = 32`, `tuning = 24`, thresholds `0.50` / `0.50`):**
  - Raw `supports_yes`: `100.0%`
  - Raw `contradicts_no`: `100.0%`
  - Post-policy `unknown`-to-`No` errors: `0`
  - Valid-trait acceptance rate: `95.8%` (`23/24`, `>= 70.0%` target **Pass**)
  - Accepted factual answer accuracy: `100.0%` (`23/23`, `>= 90.0%` target **Pass**)
  - Gender questions (tuning + held-out): `8/8` (`100.0%`)
  - Warm inference latency: `223.7 ms` median, `277.8 ms` p95
