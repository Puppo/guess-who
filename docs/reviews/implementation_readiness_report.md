# Goldfish Review Report — Stage 9: Implementation Readiness Test

**Target:** [guess-who-project-plan.md](../guess-who-project-plan.md#L217-L300) (`217-300`, `DetailedRange`)
**Goldfish Context:** [decisions-api-explainer.md](./decisions-api-explainer.md)
**Standards:** `egm-implementation-readiness` → `implementation-readiness-standard`, `egm-codebase-details` → `implementation-readiness-standard`, `egm-style` → editorial & claim-calibration audit

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### IR-1-1: Missing Repository-Relative File Boundary Manifest (`Create` / `Modify` / `Delete`) - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L217-L253) (`## 9. Implementation milestones`), [guess-who-project-plan.md](../guess-who-project-plan.md#L287-L296) (`## 11. Deliverables`)
* **Discrepancy Description:** The workspace at `/Users/puppo/dev/guess-who` currently contains only [README.md](../../README.md#L1) (`# guess-who`), [LICENSE](../../LICENSE#L1-L21), and [guess-who-project-plan.md](../guess-who-project-plan.md). Neither `## 9` nor `## 11` provides an explicit list of repository-relative file paths marked `Create`, `Modify`, or `Delete`, failing *Target Scope & File Boundary* in `implementation-readiness-standard.md`.
* **Rationale & Recommendation:** Add an explicit repository-relative write allowlist marking [README.md](../../README.md) as `Modify` (leaving [LICENSE](../../LICENSE) untouched) and enumerating every `Create` path across build/config files (`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`), source modules (`src/data/characters.ts`, `src/engine/decisionAdapter.ts`, `src/engine/policy.ts`, `src/state/gameState.ts`, UI components, styles), character portrait assets, fixtures, test files, and documentation deliverables.

### IR-1-2: Deferred Decisions API Runtime Selection, Greenfield Scaffolding, and Toolchain Choices - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L217-L253) (`## 9. Implementation milestones`), [guess-who-project-plan.md](../guess-who-project-plan.md#L266-L285) (`## 10. Validation and acceptance criteria`), [guess-who-project-plan.md](../guess-who-project-plan.md#L287-L300) (`## 11`–`## 12`)
* **Discrepancy Description:** Line 221 delegates runtime discovery and dependency selection to implementation (*"Recheck the linked explainer and identify a usable implementation"*), ignoring the concrete candidates already listed in [decisions-api-explainer.md](./decisions-api-explainer.md#L321-L340) (`built-in-ai-task-apis-polyfills` / WebAI Extension running `litert-community/laya-LiteRT` or `openjev/openjev`, and `nico-martin/open-jev` via Transformers.js ONNX). Furthermore, in an empty repository with no `package.json`, Section 9 never schedules project scaffolding, leaves package manager, UI library, unit test runner, and browser E2E runner unpinned, and omits executable verification gates per phase—violating the *Zero-Decision Rule* and *Phasing & Checkpoints*.
* **Rationale & Recommendation:** Pin the exact target runtime/polyfill package, model checkpoint ID, native-vs-polyfill precedence, and browser execution setup for Phase 1's probe; pin the package manager, TypeScript/Vite/React stack, Vitest, and Playwright; add repository scaffolding to Phase 1; and specify exact build/typecheck/test verification commands at the end of every phase.

### IR-1-3: Unspecified `DecisionModel` Schema Text, Session Lifecycle, Input Serialization, and Confidence Thresholds - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L219-L244) (`## 9` → Phases 1–3), [guess-who-project-plan.md](../guess-who-project-plan.md#L262), [guess-who-project-plan.md](../guess-who-project-plan.md#L272-L274) (`## 10`)
* **Discrepancy Description:** Phases 1–3 require schema handling, low-confidence gating, and reset cleanup, yet neither `DetailedRange` nor `FeatureRange` specifies the exact `DecisionModel.create(schema)` payload required by [decisions-api-explainer.md](./decisions-api-explainer.md#L91-L168): `expectedInputs: [{ type: "text", languages: ["en"] }]`, exact `prompt` strings, per-option `{ label, description }` copy, exact context/input serialization, per-round vs. app-lifetime session lifecycle (`availability()`, user-activated `create()` with `monitor` progress, `AbortSignal` cancellation, `destroy()`), or concrete confidence threshold values and fallback rules when `confidence`/`probabilities` are absent.
* **Rationale & Recommendation:** Define the exact schema object, prompt/description strings, session creation and reset teardown lifecycle, `AbortController` behavior, and numeric confidence thresholds (or exact Phase 2 threshold-selection rule and missing-field fallback).

### IR-1-4: Incomplete 12-Character Dataset, Portrait Asset Format, and Evaluation Fixture Specification - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L229-L236) (`## 9` → `### Phase 2`), [guess-who-project-plan.md](../guess-who-project-plan.md#L258), [guess-who-project-plan.md](../guess-who-project-plan.md#L282-L285) (`## 10`), [guess-who-project-plan.md](../guess-who-project-plan.md#L289), [guess-who-project-plan.md](../guess-who-project-plan.md#L292) (`## 11`)
* **Discrepancy Description:** Phase 2 instructs the implementer to *"Complete 12 profiles"* (from only 4 seed rows in Section 4), deliver *"original character assets"* (line 289), and *"Prepare at least 40 human-labeled cases"* split across tuning and held-out sets. Leaving the implementer to invent 8 characters, write 12 biographies and overlapping fact matrices, pick an asset format (inline/static SVG vs. raster) without introducing portrait-vs-fact visual contradictions, design the fixture schema, and author ground-truth test cases violates the *Zero-Decision Rule*.
* **Rationale & Recommendation:** Pre-define all 12 characters (exact `id`, `name`, `biography`, `facts`, `portraitAlt`, and avatar/SVG specification aligned with the chosen visual-question rule) and specify the exact evaluation fixture schema and labeled prompt set.

### IR-1-5: Summary-Level Phase 3/4 Bullets and Underspecified Mock/Test Harness Infrastructure - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L238-L252) (`## 9` → Phases 3–4), [guess-who-project-plan.md](../guess-who-project-plan.md#L258-L285) (`## 10`)
* **Discrepancy Description:** Phases 3 and 4 contain six summary bullets instead of file-level *Actionable Steps*, leaving open exact player-facing UI strings, mobile character-detail presentation (dialog vs. expandable card from line 161), responsive grid breakpoints, Game/Demo view vs. Inspector toggle wiring, eliminated-card guess behavior, keyboard/ARIA focus rules, and cache normalization (if kept). Meanwhile, Section 10 requires unit tests, a mocked UI round test, and a real-runtime smoke test without specifying mock injection/isolation boundaries, mock `DecisionModel` interface helpers, CI vs. local real-model script separation, or an explicit happy-path and edge-case test matrix.
* **Rationale & Recommendation:** Expand Phases 3–4 into file-level implementation steps with every UI/policy choice pre-decided, specify test-only mock `DecisionModel` injection and separate npm scripts for offline deterministic CI tests vs. real-runtime browser smoke tests, and enumerate the exact unit and UI test cases to implement.

### IR-1-6: Unspecified Browser Execution Architecture and Warm-Latency Protocol for Evaluation Runner - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L229-L236) (`## 9` → `### Phase 2`), [guess-who-project-plan.md](../guess-who-project-plan.md#L281-L284) (`## 10`), [guess-who-project-plan.md](../guess-who-project-plan.md#L292-L293) (`## 11`)
* **Discrepancy Description:** Because `window.DecisionModel` runs in a browser context rather than Node.js, running evaluation fixtures through the real engine and recording accuracy and warm-inference timings requires an explicit browser execution harness (e.g., Playwright script driving Chromium against a local Vite route) and a defined warm-up protocol, both of which are omitted.
* **Rationale & Recommendation:** Specify the exact browser runner mechanism, CLI command, warm-up call count before timing warm inference, and output destination.

### IR-1-7: Subjective Phase 2 Exit Gate and Hedged Acceptance Criteria (`CALIBRATE` / `DROP`) - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L232-L236) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L283-L285) (`## 10`)
* **Discrepancy Description:** Line 236 (`"documented observed quality and a defensible interpretation policy"`) is subjective and unverifiable. Line 283 places `"Proposed demo target: at least 90% accuracy ... accepting at least 70% ..."` inside a required acceptance checkbox, then adds redundant `"These are goals, not measured results"`, leaving unclear whether scoring below 90%/70% blocks sign-off. Line 284's second sentence names no target artifact, and line 285 leaves human approval unrecorded while adding redundant `"; passing automated tests alone is insufficient"`.
* **Rationale & Recommendation:** `CALIBRATE` line 236 to concrete artifacts (selected thresholds and recorded fixture results); `CALIBRATE` line 283 to state deterministic pass/fail vs. documented-limitation rules and `DROP` `"These are goals, not measured results"`; specify where measured timings on line 284 are recorded (`README.md`); and separate manual human sign-off on line 285 from automated agent completion gates while dropping the redundant second clause.

### IR-1-8: Cross-Section Redundancy in `## 12. Instruction for the implementing agent` (`RELOCATE` / `DROP`) - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-implementation-readiness`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L298-L300) (`## 12. Instruction for the implementing agent`)
* **Discrepancy Description:** Section 12 repeats requirements already stated in Sections 1, 3, 6, 9, 10, and 11 while framing the agent's task around open-ended runtime exploration rather than executing a pre-decided plan. Only `"Begin with Phase 1, not visual polish"` adds sequential phase gating.
* **Rationale & Recommendation:** `RELOCATE` sequential phase gating to `## 9. Implementation milestones` (*"Execute phases sequentially; do not begin Phase 2 or UI work until Phase 1's exit gate passes"*) and `DROP` Section 12.

### IR-1-9: Subjective and Informal Wording in Acceptance Checkboxes (`CALIBRATE` / `DROP`) - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L263-L264), [guess-who-project-plan.md](../guess-who-project-plan.md#L274), [guess-who-project-plan.md](../guess-who-project-plan.md#L279) (`## 10. Validation and acceptance criteria`)
* **Discrepancy Description:** `"usable with keyboard and touch"` (line 263), `"announced accessibly"` (line 264), `"fail clearly without pretending to run AI"` (line 274), and `"explicitly marked as mocked"` (line 279) use subjective or informal wording instead of concrete verification criteria.
* **Rationale & Recommendation:** `CALIBRATE` lines 263–264 to specify full keyboard operability without focus traps, touch operability at desktop/mobile target widths, and ARIA live-region announcements; `CALIBRATE` line 274 to require displaying missing capability details and setup instructions while dropping `"without pretending to run AI"`; and `CALIBRATE` line 279 to name the exact test suite/label boundary.

### IR-1-10: Unspecified Locations and Example Bindings for Documentation Deliverables - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L250) (`## 9`), [guess-who-project-plan.md](../guess-who-project-plan.md#L290-L294) (`## 11. Deliverables`)
* **Discrepancy Description:** Lines 290–294 list `README`, decision schema/policy documentation, evaluation report, and demo walkthrough without stating whether they are sections inside [README.md](../../README.md) or standalone files under `docs/`, or tying the walkthrough to specific characters/questions.
* **Rationale & Recommendation:** Pin exact file paths (or `README.md` sections) for each deliverable and bind the demo walkthrough to concrete prompts from the 12-character dataset.

### IR-1-11: Imprecise Umbrella Terms and Event-Based Phase 4 Exit Condition (`CALIBRATE`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L223), [guess-who-project-plan.md](../guess-who-project-plan.md#L242), [guess-who-project-plan.md](../guess-who-project-plan.md#L246-L252) (`## 9. Implementation milestones`)
* **Discrepancy Description:** Line 223 uses umbrella terms (`"supported English input"`, `"uncertainty fields"`, `"lifecycle"`) instead of concrete `DecisionModel` members; line 242 compresses low-confidence handling into `"Implement ... uncertainty"`; line 246 includes filler (`"showcase experience"`); and line 252 defines Phase 4's exit gate as `"a live walkthrough"` event rather than a verifiable repository artifact.
* **Rationale & Recommendation:** Name concrete API constructs (`availability()`, `expectedInputs`, `probabilities`, `confidence`, `create()`, `decide()`, `destroy()`, `AbortSignal`), write `"low-confidence rephrase handling"` on line 242, rename Phase 4 to `"Add inspector, accessibility, and demo script"`, and `CALIBRATE` line 252 to a verified walkthrough artifact and passing test suite.

### IR-1-12: Misplaced Post-MVP Exclusions Inside `## 11. Deliverables` (`RELOCATE`) - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L296) (`## 11. Deliverables`)
* **Discrepancy Description:** Line 296 places post-MVP non-goals inside `Deliverables`, uses redundant `"Future ideas, outside the MVP"`, and writes `"other verified languages"` instead of `"additional runtime-supported languages"`.
* **Rationale & Recommendation:** `RELOCATE` line 296 to the consolidated Non-Goals section and tighten the phrasing.

### IR-1-13: Inconsistent Imperative Voice in `### Tests and evaluation` Checkboxes - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** [guess-who-project-plan.md](../guess-who-project-plan.md#L282-L284) (`## 10. Validation and acceptance criteria`)
* **Discrepancy Description:** Lines 258–281 write checkboxes as declarative pass states, whereas lines 282–284 switch to imperatives and fragments (`"Report per-label accuracy..."`, `"Record warm inference median..."`).
* **Rationale & Recommendation:** Rewrite lines 282–284 as declarative pass conditions matching lines 258–281.
