# Goldfish Review Report — Stage 5: Initial Zoom Out

**Target:** [guess-who-project-plan.md](../guess-who-project-plan.md) (`1-300`, full file)
**Goldfish Context:** [decisions-api-explainer.md](./decisions-api-explainer.md)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |
| `egm-inventive-catalyst` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### ZO-1: `DecisionModel` Schema vs. `decide(input)` Trust-Boundary Contradiction - Severity: Blocker
* **Reviewer Lens:** `egm-zoom-out`, `egm-inventive-catalyst`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L98-L116) (`## 5. Decision design`)
* **Discrepancy Description:** Lines 100–102 instruct the application to send both the player's question and the secret character's facts together in `Input`, while also requiring developer instructions and trusted context to stay separate from untrusted player text. In [decisions-api-explainer.md](./decisions-api-explainer.md#L80-L135) and its security section ([decisions-api-explainer.md](./decisions-api-explainer.md#L313)), `model.decide(input)` takes a single untrusted `input` payload; structural trust separation exists strictly between `DecisionModel.create(schema)` (`questions[].prompt` and `options[].description`) and `model.decide(input)`. Concatenating facts and player text inside `input` mixes ground-truth facts with untrusted input (allowing spoofed `"Fact: ..."` injections) and forces `question_kind` to classify an input mostly filled with declarative character traits rather than the player's question alone. Lines 106–115 also state label rules in prose rather than mapping them to `DecisionModel`'s `prompt` and `options: [{ label, description }]` schema structure.
* **Rationale & Recommendation:** Apply **Inversion** of context placement: create one `DecisionModel` session per round (`DecisionModel.create(roundSchema)`) that embeds the secret character's facts inside the trusted developer `prompt` of the factual question(s) and encodes label rules in `options[].description`, then pass only `playerQuestion` to `model.decide(playerQuestion)` and call `model.destroy()` on round reset.
  * *Secondary trade-offs:* Per-round `create()` calls require `destroy()` teardown on every reset and depend on schema/prompt length limits that Phase 1 must verify ([decisions-api-explainer.md](./decisions-api-explainer.md#L265)). If Phase 1 shows a polyfill reloads model weights on every `create()` call, use **Extraction** as a fallback: run `question_kind` in a dedicated static session (`questionKindModel.decide(playerQuestion)`) before the fact-grounded call, trading one extra local `decide()` hop on valid questions for clean input isolation.

### ZO-2: Three-Way `answer` Choice Pits Open-World Absence Against Negation - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L104-L131) (`## 5. Decision design`), [guess-who-project-plan.md](../guess-who-project-plan.md#L234) (`## 9. Implementation milestones`), [guess-who-project-plan.md](../guess-who-project-plan.md#L282-L283) (`## 10. Validation and acceptance criteria`)
* **Discrepancy Description:** Modeling factual verification as one three-way `choice` (`yes`, `no`, `unknown`) and mapping low confidence to *"ask for a rephrase"* forces a steep trade-off between accuracy and valid-question coverage (allowing up to 30% of valid single-trait questions to be rejected under the 70% acceptance target on line 283). When a trait is unmentioned in the secret character's facts, `no` and `unknown` compete in the same softmax distribution: small classifiers either misclassify `unknown` as `no` or split probability mass across both labels, lowering confidence and asking the player to rephrase an already clear question.
* **Rationale & Recommendation:** Apply **Segmentation** using `DecisionModel`'s single-pass multi-question execution ([decisions-api-explainer.md](./decisions-api-explainer.md#L72-L76), [decisions-api-explainer.md](./decisions-api-explainer.md#L260)): split `answer` into two orthogonal `boolean` questions in the same schema—`supports_yes` (facts explicitly state or entail the claim) and `contradicts_no` (facts contain an explicit negative or mutually exclusive trait contradicting the claim). When both return `"false"` with sufficient confidence, application policy maps the result to `"Not enough information"`, keeping rephrase requests reserved for low `question_kind` confidence or genuinely uncertain boolean scores.
  * *Secondary trade-offs:* Requires calibrating two boolean thresholds in Phase 2, adding a policy rule for anomalous conflict states (`supports_yes = "true"` and `contradicts_no = "true"`), and evaluating three schema questions per call instead of two.

### ZO-3: Premature In-Round Question Cache and Cache Telemetry - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L144) (`## 5. Decision design`), [guess-who-project-plan.md](../guess-who-project-plan.md#L177) (`## 6. User interface`), [guess-who-project-plan.md](../guess-who-project-plan.md#L262) (`## 10. Validation and acceptance criteria`)
* **Discrepancy Description:** The plan requires normalizing submitted questions, caching accepted answers within a round, tracking cache hits separately from inference timings, showing cache-hit status in the Inspector, and verifying cache reset behavior. Inference runs only on explicit submission (line 120), a 12-card round lasts roughly four to six questions over two to three minutes, and previous Q&A entries are already visible in chronological history (line 154).
* **Rationale & Recommendation:** Delete in-round question caching, normalization keys, and Inspector cache-hit fields. There is no proven performance bottleneck, and suppressing model execution on repeated questions gets in the way during live demos when a presenter re-runs a question to demonstrate local inference timing.

### ZO-4: Over-Sized Evaluation Runner and Noisy Small-Sample Split Gates - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L195) (`## 7. Architecture`), [guess-who-project-plan.md](../guess-who-project-plan.md#L231-L236) (`## 9. Implementation milestones`), [guess-who-project-plan.md](../guess-who-project-plan.md#L281-L285) (`## 10. Validation and acceptance criteria`), [guess-who-project-plan.md](../guess-who-project-plan.md#L292-L293) (`## 11. Deliverables`)
* **Discrepancy Description:** The plan mandates a dedicated repeatable evaluation runner module, at least 40 human-labeled examples partitioned into threshold-tuning and held-out sets across seven categories, held-out statistical gates (90% accuracy, 70% acceptance), warm median and p95 latency reporting, and a standalone evaluation report deliverable. Because `window.DecisionModel` runs in a browser rather than Node.js, this requires custom browser-automation harness work for a two-minute demo. Splitting ~40 cases also leaves ~20 held-out examples (~2–3 per category), where a single error shifts accuracy by 5%–8%.
* **Rationale & Recommendation:** Replace the tuning/held-out split, dedicated evaluation module, p95 benchmark requirements, and standalone evaluation report with a single lightweight browser fixture check (~20–25 representative cases) to verify schema behavior, choose a working confidence threshold, and record observed caveats in `README.md`.

### ZO-5: Interactive Production Simulation Mode and Duplicate View Concepts - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L19) (`## 1. Mandatory technology requirement`), [guess-who-project-plan.md](../guess-who-project-plan.md#L155-L178) (`## 6. User interface`), [guess-who-project-plan.md](../guess-who-project-plan.md#L271) (`## 10. Validation and acceptance criteria`)
* **Discrepancy Description:** Lines 19, 171, and 271 introduce an interactive mock mode / mock build in the UI with a persistent `"Simulation — no model inference"` banner and `"simulation"` Inspector engine state, even though Phase 1 stops the project if no real runtime works and mocks are needed only for automated UI tests. Separately, lines 155 and 162 define a collapsible inspection panel while lines 168–178 define separate `"Game view"` and `"Demo view"` modes for the same technical output.
* **Rationale & Recommendation:** Restrict mocks strictly to test-only dependency injection in automated UI tests and remove the interactive simulation mode, mock build, banner, and `"simulation"` badge from production code. Collapse `"Game view"` and `"Demo view"` into the single collapsible Inspector panel (collapsed = game board only, expanded = technical demo inspection).

### ZO-6: Existing Explainer Polyfills Omitted from Phase 1 Candidates - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L11-L17) (`## 1. Mandatory technology requirement`), [guess-who-project-plan.md](../guess-who-project-plan.md#L221-L225) (`## 9. Implementation milestones`)
* **Discrepancy Description:** The plan allows a verified local `Decisions API` polyfill and instructs the implementer in Phase 1 to identify a usable implementation, but omits the concrete polyfills and runtimes already documented in [decisions-api-explainer.md](./decisions-api-explainer.md#L322-L340).
* **Rationale & Recommendation:** Name the explainer's existing candidates directly in Section 1 and Phase 1—specifically `built-in-ai-task-apis-polyfills` / WebAI Extension (`etiennenoel/web-ai.studio`, executing `litert-community/laya-LiteRT` or `openjev/openjev` behind `window.DecisionModel`) and `open-jev` (`nico-martin/open-jev` via Transformers.js) alongside native Chrome DevTrial builds—so Phase 1 evaluates existing implementations instead of searching from scratch.

### ZO-7: Blocking Board Inspection Behind Full Model Initialization - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L39) (`## 3. Game rules`), [guess-who-project-plan.md](../guess-who-project-plan.md#L205-L210) (`## 8. Runtime readiness and errors`)
* **Discrepancy Description:** Blocking round start until `DecisionModel.create()` finishes downloading weights and compiling shaders prevents players and demo audiences from viewing the 12 character cards and composing a first question during cold start, even though picking a secret character and reading biographies require no model inference.
* **Rationale & Recommendation:** Apply **Preliminary Action** and **Beforehand Cushioning**: call `DecisionModel.availability()` on page load so unsupported browsers fail immediately; when `available` or `downloadable`, let the "Start Game" click both start `DecisionModel.create()` (satisfying user-activation rules in [decisions-api-explainer.md](./decisions-api-explainer.md#L266)) and show the playable board immediately, gating only question submission until `engine === "ready"`.
  * *Secondary trade-offs:* Introduces a `(round: "playing", engine: "loading" | "error")` state combination that must surface initialization retry errors without discarding drafted question text.

### ZO-8: Unused `fact.id` Field and Manual `roundId`/`requestId` Counters - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L78-L90) (`## 4. Character content`), [guess-who-project-plan.md](../guess-who-project-plan.md#L199-L201) (`## 7. Architecture`)
* **Discrepancy Description:** `Character.facts` is typed as `Array<{ id: string; statement: string }>`, but fact IDs are omitted from model context (line 100) and banned from UI display (line 181). Separately, Section 7 prescribes manual `roundId` and `requestId` counters even though duplicate submissions are disabled while a request is pending and `DecisionModel` supports standard `AbortSignal` cancellation ([decisions-api-explainer.md](./decisions-api-explainer.md#L266)).
* **Rationale & Recommendation:** Simplify `facts` to `string[]` and replace manual `roundId`/`requestId` bookkeeping in Section 7 with standard `AbortController` cancellation on round reset and teardown.

### ZO-9: Speculative `spoiled` Round State and Conditional Visual-Trait Scope - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L71-L72) (`## 4. Character content`), [guess-who-project-plan.md](../guess-who-project-plan.md#L179) (`## 6. User interface`), [guess-who-project-plan.md](../guess-who-project-plan.md#L194) (`## 7. Architecture`)
* **Discrepancy Description:** Marking a round as `spoiled` when using `"Reveal context — spoilers"` couples the Inspector to game state in an MVP without scoring, leaderboards, or anti-cheat (lines 51, 203). Conditionally supporting visual questions *"if corresponding attributes are explicitly encoded and match the artwork"* creates fragile synchronization between 12 illustrations and text statements when gameplay centers on written biographies.
* **Rationale & Recommendation:** Use a stateless `<details>` disclosure in the Inspector without mutating round state, and scope MVP questions strictly to written biographical facts while treating portraits as decorative avatars.
