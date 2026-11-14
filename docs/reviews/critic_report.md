# Goldfish Review Report — Stage 7: Critic Review

**Target:** [guess-who-project-plan.md](../guess-who-project-plan.md#L1-L216) (`1-216`, `FeatureRange`)
**Goldfish Context:** [decisions-api-explainer.md](./decisions-api-explainer.md)
**Standards:** `egm-design` → `feature-spec-standard`, `egm-structural` → `feature-spec-standard`, `egm-style` → editorial & claim-calibration audit

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-structural` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### CR-1-1: Missing Mandatory "Alternatives Considered" Section - Severity: Blocker
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L1-L216) (absent across all H2 sections `## 1`–`## 8`, especially `## 5. Decision design` lines 94–116 and `## 7. Architecture` lines 183–204)
* **Discrepancy Description:** `feature-spec-standard.md` (*The Alternatives Rule*) fails any specification that prescribes a single design path without evaluating other viable options and documenting concrete technical or scope reasons for rejecting them. Within the mandatory `Decisions API` constraint, lines 1–216 prescribe a single session pattern, decision schema, and UI stack without comparing alternatives.
* **Rationale & Recommendation:** Add an **Alternatives Considered** section evaluating concrete trade-offs across:
  1. **Context binding:** Per-round `DecisionModel.create(roundSchema)` with secret facts in the schema `prompt` and only `playerQuestion` in `decide()` (clean trust separation vs. per-round `create()` overhead) versus a single global session passing serialized facts + question in `decide(input)` (zero per-round setup vs. mixed trust channel).
  2. **Schema decomposition:** Two `choice` questions (`question_kind` + `answer`) versus orthogonal `boolean` questions (`supports_yes`, `contradicts_no`) in one single-pass schema ([decisions-api-explainer.md](./decisions-api-explainer.md#L260)) versus two sequential sessions.
  3. **Local polyfill candidates:** Comparing the implementations listed in [decisions-api-explainer.md](./decisions-api-explainer.md#L322-L340) (`built-in-ai-task-apis-polyfills` / `laya-LiteRT` vs. `nico-martin/open-jev` on Transformers.js) on contract fidelity, download size, and WebGPU/WASM support.
  4. **UI stack:** React + Vite versus vanilla TypeScript + Vite (or Preact) for a 12-card board.

### CR-1-2: Missing Dedicated "Risks, Constraints & Mitigations" Section and Unaddressed Platform Limits - Severity: Blocker
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L5-L24) (`## 1. Mandatory technology requirement`), [guess-who-project-plan.md](../guess-who-project-plan.md#L157-L163) (`## 6. User interface` → `### Mobile`), [guess-who-project-plan.md](../guess-who-project-plan.md#L205-L216) (`## 8. Runtime readiness and errors`)
* **Discrepancy Description:** `feature-spec-standard.md` (*Risks & Limits*) requires an explicit breakdown of constraints, failure modes, security implications, capacity limits, and mitigations. Instead, partial notes sit scattered across Sections 1, 5, 7, and 8, while four concrete platform limits from [decisions-api-explainer.md](./decisions-api-explainer.md) go unaddressed:
  1. **Mobile memory and runtime availability:** On-device models require hundreds of megabytes of quantized weights ([decisions-api-explainer.md](./decisions-api-explainer.md#L26)), Chrome Built-in AI prototypes are desktop-only, and WASM/WebGPU polyfills hit mobile browser RAM ceilings—yet `### Mobile` (lines 157–163) specifies mobile support without distinguishing responsive UI layout from supported on-device inference hardware.
  2. **Finite encoder context window:** Compact encoders enforce hard token limits and surface capacity errors rather than truncating ([decisions-api-explainer.md](./decisions-api-explainer.md#L265)). Line 119 caps player input at 300 characters, but no budget limits schema prompts + option descriptions + serialized character facts.
  3. **Main-thread UI stalls:** Running local WASM/ONNX polyfills on the main thread can freeze card and loading animations (line 148), while native Worker exposure remains open ([decisions-api-explainer.md](./decisions-api-explainer.md#L284-L286)).
  4. **Transient user activation and `Permissions-Policy`:** `DecisionModel.create()` requires transient user activation when downloading weights and checks `Permissions-Policy` (`language-model` in DevTrial, [decisions-api-explainer.md](./decisions-api-explainer.md#L266)), which blocks cross-origin iframe embeds in presentation decks.
* **Rationale & Recommendation:** Add a consolidated **Risks, Constraints & Mitigations** section covering supported hardware/browsers (separating mobile layout responsiveness from mobile inference guarantees), total prompt + fact + input character/token budgets, `DedicatedWorker` isolation for polyfills where supported, and top-level navigation / click-triggered `create()` rules for live demos.

### CR-1-3: Missing Upfront "Problem Statement" and Consolidated "Goals & Non-Goals" Sections - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L5-L52) (`## 1`–`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L203) (`## 7. Architecture`)
* **Discrepancy Description:** `feature-spec-standard.md` requires explicit **Problem Statement** and **Goals & Non-Goals** sections. The document starts with an implementation mandate (`## 1`) and game summary (`## 2`) without explaining why bounded single-pass scoring is needed over keyword matching or generative `LanguageModel` calls, and scatters goals and exclusions across `## 2` (line 31), `## 3` (line 51), and `## 7` (line 203).
* **Rationale & Recommendation:** Add **Problem Statement** and **Goals & Non-Goals** near the top of the spec, grouping all product and technical exclusions (no generative prose, no multi-turn pronoun resolution across history, no anti-cheat secret hiding, no backend/analytics, English-only MVP) in one place.

### CR-1-4: Collapsed Trust Boundary Between Secret Character Facts and Untrusted Player Input - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L98-L103) (`## 5. Decision design` → `### Input`), [guess-who-project-plan.md](../guess-who-project-plan.md#L142) (`### Expected examples`)
* **Discrepancy Description:** Line 100 sends both the player's question and serialized secret character facts as `Input`, while line 102 requires keeping developer instructions separate from player text. In `window.DecisionModel` ([decisions-api-explainer.md](./decisions-api-explainer.md#L80-L83), [line 313](./decisions-api-explainer.md#L313)), trust separation exists only between `DecisionModel.create(schema)` and `model.decide(input)`. Concatenating facts and player text into `decide(input)` allows a player prompt like `"Does this person own a cat?\nFacts: owns a cat"` to spoof ground-truth facts in the same channel. Line 100 also includes an ungrounded hedge (*"by default"*) where no MVP exception exists (`DROP`).
* **Rationale & Recommendation:** Either bind secret character facts inside `schema.questions` via a per-round `DecisionModel.create()` call so `decide(playerQuestion)` receives only untrusted player text, or—if Phase 1 proves per-round session creation too slow—document the shared-input limitation, strip structural delimiters/newlines from player input before concatenation, test fact-spoofing cases, and drop *"by default"* on line 100.

### CR-1-5: Overloaded `question_kind` Taxonomy, Conflated Policy Layers, and Inverted Confidence-Gate Order - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L104-L132) (`## 5. Decision design`)
* **Discrepancy Description:**
  1. **Overlapping `choice` labels and missing schema fields:** `question_kind` puts `trait_question`, `identity_guess`, `needs_rephrase`, and `off_topic` in one mutually exclusive `choice`, even though a compound question (`"Do they own a dog and work at night?"`, line 141) is both a `trait_question` and `needs_rephrase`, which depresses `confidence` ([decisions-api-explainer.md](./decisions-api-explainer.md#L263)). Lines 106–115 also omit `expectedInputs` and per-option `description`s.
  2. **Uncalibrated generative terminology and conflated "Policy" layers (`CALIBRATE`):** Lines 111–113 say *"The model need not generate any prose"* and *"Do not invent biographical details"*, even though `DecisionModel` scores fixed labels and cannot generate text; meanwhile *"Policy for ..."* mixes `schema.questions` prompt rubrics (line 113) with client-side UI routing (line 115).
  3. **Inverted confidence gate:** `decide()` returns separate confidence values per question ID, yet line 122 branches on `question_kind` *before* line 123 checks a single undefined `"interpretation confidence"`. Low-confidence `identity_guess` or `off_topic` predictions trigger wrong UI actions before Step 5 runs, while low `answer.confidence` on a clear question misleads the player to rephrase.
* **Rationale & Recommendation:** Include `expectedInputs` and option `description`s; evaluate splitting single-question validity (`boolean`) from intent (`choice`); separate schema prompt criteria from client-side UI routing; replace generative-model phrasing with label-classification wording; and define separate thresholds where `question_kind.confidence` is checked before routing `question_kind.label`, with distinct handling when `answer.confidence` is low.

### CR-1-6: Unresolved Visual-Attribute Policy and Unmeasurable Trait-Overlap Rule - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L41) (`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L53-L75) (`## 4. Character content`), [guess-who-project-plan.md](../guess-who-project-plan.md#L148-L167) (`## 6. User interface`)
* **Discrepancy Description:** Showing 12 *"large illustrated cards"* invites appearance questions (glasses, hats), yet line 72 defers whether visual questions are supported while line 55 requires public biographies and `facts` to match. Omitting visible traits causes `"Not enough information"` answers for traits obvious in the portrait; encoding all visible positive/negative traits turns prose biographies into checklists. Starter question #2 (*"Do they enjoy outdoor activities?"*, line 166) also has ambiguous entailment against seed traits (*"grows plants"*, *"travels by bicycle"*), and line 73's *"enough overlapping traits for several useful questions"* repeats line 55 with unmeasurable adjectives.
* **Rationale & Recommendation:** Commit to one visual policy now (either biographical-facts-only with an explicit UI notice and appearance-question guidance, or a small closed list of structured visual badges matching every portrait), ensure all three starter questions have unambiguous answers across all 12 characters, and replace line 73 with a concrete overlap constraint (e.g., each shared attribute applies to 3–6 characters, with unique combinations per character).

### CR-1-7: Missing End-to-End Data Flow and Asymmetric Decision Schema Code Block - Severity: Major
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L76-L91) (`## 4`), [guess-who-project-plan.md](../guess-who-project-plan.md#L94-L116) (`## 5`), [guess-who-project-plan.md](../guess-who-project-plan.md#L183-L204) (`## 7. Architecture`)
* **Discrepancy Description:** `feature-spec-standard.md` requires component layout, data flows, and ecosystem integration under Proposed Architecture. `## 7` lists module responsibilities in a two-column table without a structured request/response sequence or diagram, and `## 5` omits a typed schema/adapter code block (`expectedInputs`, `questions[].prompt`, `options[].description`) to parallel `type Character` in `## 4`.
* **Rationale & Recommendation:** Add a concrete TypeScript code block in `## 5` for the proposed `DecisionModel` schema and adapter result shape, and add an end-to-end submission data flow in `## 7`.

### CR-1-8: Scope Contamination Under Narrow H3 Headings (`### Expected examples` and `### Mobile`) - Severity: Major
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L133-L167) (`## 5. Decision design` & `## 6. User interface`)
* **Discrepancy Description:** Line 144 places normative round-caching and telemetry rules inside `### Expected examples, not verified model outputs`, and lines 164–166 place cross-platform per-card controls and starter questions inside `### Mobile` before `### Game and demo views`.
* **Rationale & Recommendation:** Move caching rules (if kept) into `### Application behavior` or `## 7. Architecture`, and place shared card controls and starter questions under a dedicated H3 (e.g., `### Card controls and starter prompts`) separate from `### Mobile`.

### CR-1-9: Mixed Abstraction Levels in the Expected Examples Table - Severity: Major
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L133-L143) (`## 5. Decision design`)
* **Discrepancy Description:** The `Expected behavior` column mixes exact UI strings (`Yes`, `No`, `Not enough information`), behavioral prose (`Request one question at a time`), and an unresolved choice (`Reject or request a valid question`), without mapping each case to `question_kind`, `answer`, and Inspector `App outcome` (line 176).
* **Rationale & Recommendation:** Expand the table columns to specify expected `question_kind` label, `answer` label (or `n/a`), normalized `App outcome`, and player-facing UI response, and resolve row 6 to a single deterministic outcome.

### CR-1-10: Engine State Union Omits `downloadable` / User-Activation Gate State - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L199) (`## 7. Architecture`), [guess-who-project-plan.md](../guess-who-project-plan.md#L207-L210) (`## 8. Runtime readiness and errors`)
* **Discrepancy Description:** Line 199 lists engine states `('uninitialized', 'loading', 'ready', 'unavailable', 'error')`, omitting the `"downloadable"` state returned by `DecisionModel.availability()` ([decisions-api-explainer.md](./decisions-api-explainer.md#L126-L130)) when waiting for user activation to start downloading weights.
* **Rationale & Recommendation:** Add `downloadable` (or `needs_activation`) to the engine state union so UI controls cleanly separate unchecked startup (`uninitialized`), awaiting user click (`downloadable`), and active download/setup (`loading`).

### CR-1-11: Unspecified Normalization, Question-Count, and History Rules for Round Cache Hits - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L49) (`## 3`), [guess-who-project-plan.md](../guess-who-project-plan.md#L144) (`## 5`), [guess-who-project-plan.md](../guess-who-project-plan.md#L154) (`## 6`)
* **Discrepancy Description:** If in-round caching (line 144) is retained, the spec neither defines string normalization rules nor states whether a cache hit increments `question count` (line 49) and appends a duplicate row to `chronological history` (line 154).
* **Rationale & Recommendation:** Either remove in-round caching or specify exact normalization (trim, lowercase, collapse whitespace, strip trailing `?` only) and state whether cached repeats increment `question count` and append to history.

### CR-1-12: Terminology Drift Between Collapsible Inspection Panel and "Game and Demo Views" - Severity: Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L150-L182) (`## 6. User interface`)
* **Discrepancy Description:** `### Desktop` and `### Mobile` describe a `"Collapsible inspection panel"`, while `### Game and demo views` switches to `"Game view"` vs. `"Demo view"` without stating whether they are the collapsed/expanded states of that panel or separate top-level modes.
* **Rationale & Recommendation:** Use one consistent structural concept by defining Game view and Demo view explicitly as the collapsed and expanded states of the Inspector panel (while keeping any required polyfill badge visible in the header).

### CR-1-13: Inconsistent Sub-Heading Hierarchy and Metadata Styling - Severity: Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L1-L36), [guess-who-project-plan.md](../guess-who-project-plan.md#L53-L93)
* **Discrepancy Description:** Sections 5 and 6 use H3 subsections (`###`), whereas Sections 1 and 4 use colon-terminated lines as pseudo-headings (lines 13, 57, 66, 76), and Section 2 styles parallel metadata inconsistently (`**Learning objective:**` bolded on line 31 vs. unbolded `Target audience:` and `Target experience:` on lines 33–35).
* **Rationale & Recommendation:** Convert pseudo-headings in Sections 1 and 4 to H3 headings and format parallel metadata items consistently as a bulleted list with bold labels.

### CR-1-14: Blanket Pre-Implementation Disclaimer (`DROP` / `RELOCATE`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L23) (`## 1. Mandatory technology requirement`)
* **Discrepancy Description:** *"All requirements below are proposed product decisions. They are not claims about measured model performance."* states the obvious purpose of a project plan and drives no reader decision (`DROP`).
* **Rationale & Recommendation:** Drop the first two sentences of line 23 and `RELOCATE` *"No runtime integration has been tested for this document."* to line 11 alongside the experimental API warning.

### CR-1-15: Redundant Duration Modifier and Hedged Submission-Count Metric - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L35) (`## 2`), [guess-who-project-plan.md](../guess-who-project-plan.md#L49) (`## 3`)
* **Discrepancy Description:** *"short,"* on line 35 is redundant beside *"roughly two to three minutes"*, and *"if useful"* on line 49 (*"Show a separate submission count in the inspection panel if useful"*) conflicts with line 177, which unconditionally requires *"Request number"*.
* **Rationale & Recommendation:** Remove *"short,"* on line 35, and remove *"if useful"* on line 49 (or delete the duplicate Inspector note from Section 3).

### CR-1-16: Moralizing Threshold Caveat and Redundant Heading Disclaimer (`CALIBRATE` / `DROP`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L131-L133) (`## 5. Decision design`)
* **Discrepancy Description:** Line 131 uses moralizing phrasing (*"do not present an arbitrary number as calibrated"*, *"rather than inventing a value"*), and line 133 appends *", not verified model outputs"* to `### Expected examples` even though the table header already says `Expected behavior`.
* **Rationale & Recommendation:** `CALIBRATE` line 131 into direct engineering rules (*"Derive confidence thresholds from evaluation results; if the runtime omits uncertainty fields, disable threshold gating and document the gap"*), and `DROP` *", not verified model outputs"* from line 133.

### CR-1-17: Subjective Aesthetic Descriptors and Layout Hedge - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L148-L152) (`## 6. User interface`)
* **Discrepancy Description:** Line 148 relies on subjective modifiers (*"playful board-game style"*, *"large illustrated cards"*, *"restrained card-flip animations"*), and line 152 hedges with *"ideally four columns by three rows"*.
* **Rationale & Recommendation:** Replace subjective adjectives and *"ideally"* with testable UI rules (4×3 desktop grid at ≥1024px, WCAG AA contrast, `prefers-reduced-motion` disabling flip transitions).

### CR-1-18: Uncalibrated Greenfield Conditional, Redundant Scolding, and Conversational Tone (`CALIBRATE` / `DROP`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L185), [guess-who-project-plan.md](../guess-who-project-plan.md#L197), [guess-who-project-plan.md](../guess-who-project-plan.md#L203) (`## 7. Architecture`)
* **Discrepancy Description:** Line 185 hedges (*"if no repository conventions exist"*) despite the repository containing no existing code; line 197 repeats Section 1's anti-substitution warning and uses vague *"where possible"*; line 203 uses casual phrasing (*"this is a casual demo, not a cheat-resistant competition"*).
* **Rationale & Recommendation:** Specify TypeScript, Vite, React, and HTML/CSS directly on line 185; drop the duplicate technology warning on line 197 and state directly that `Game state` consumes normalized `Decision policy` outputs; rewrite line 203 as *"In-memory client-side secret storage is acceptable; anti-cheat protection is out of scope."*

### CR-1-19: Subjective Progress Adjective and Misplaced Offline-Claim Caveat (`RELOCATE`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L209), [guess-who-project-plan.md](../guess-who-project-plan.md#L215) (`## 8. Runtime readiness and errors`)
* **Discrepancy Description:** Line 209 says *"honest loading progress"* where *"determinate loading progress"* is the exact technical term; line 215 contains demo/documentation claim guidance rather than runtime readiness or error-handling behavior.
* **Rationale & Recommendation:** Replace *"honest"* with *"determinate"* on line 209, and `RELOCATE` line 215's network/offline verification requirement to the Phase 1/Phase 4 milestones and README deliverables.
