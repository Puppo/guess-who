# Decisions API Browser Evaluation Report

## Provenance & Environment

- **Date:** 2026-11-14
- **Node.js:** v26.8.1
- **Runtime / Polyfill:** `open-jev@0.1.2` (Polyfill (open-jev · kev-0.6b))
- **Model Checkpoint:** `onnx-community/kev-0.6b-ONNX` (device: `webgpu`, dtype: `q4f16`)
- **Schema Version:** `3.1.0`
- **Browser:** `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36`
- **OS / Architecture:** macOS 27.2 (arm64)
- **Warm-up Protocol:** 3 `decide()` calls discarded before measuring warm inference timings
- **Initialization / Download Duration:** 3933.8 ms
- **Per-Round `createRoundSession()` Median Duration:** 0.00 ms

## Pinned Policy Thresholds (Calibrated on Tuning Split `n = 28`)

- `questionKindThreshold`: `0.50`
- `factThreshold`: `0.50`

## Tuning Split Summary (`n = 28`)

| Metric | Value |
| --- | --- |
| Raw `question_kind` accuracy | 96.4% |
| Raw `supports_yes` accuracy | 100.0% |
| Raw `contradicts_no` accuracy | 100.0% |
| Valid single-trait acceptance rate | 100.0% (23/23) |
| Accepted factual answer accuracy | 100.0% (23/23) |
| Post-policy `unknown`-to-`No` error count | 0 |
| Non-trait routing accuracy | 4/5 |

## Held-Out Evaluation Results (`n = 36`)

| Metric | Observed | Benchmark Target | Status |
| --- | --- | --- | --- |
| Raw `question_kind` label accuracy | 88.9% | — | Recorded |
| Raw `supports_yes` label accuracy | 96.4% | — | Recorded |
| Raw `contradicts_no` label accuracy | 92.9% | — | Recorded |
| Post-policy `unknown`-to-`No` error count | 0 | Minimize (0 ideal) | Recorded |
| Valid-trait clarification rate | 0.0% (0/28) | <= 30.0% | Pass |
| Valid-trait acceptance rate | 100.0% (28/28) | >= 70.0% | Pass |
| Accepted factual answer accuracy | 92.9% (26/28) | >= 90.0% | Pass |
| Non-trait routing (`identity_guess` / `needs_rephrase`) | 6/8 | — | Recorded |
| Warm inference latency (median) | 269.9 ms | — | Recorded |
| Warm inference latency (p95) | 290.8 ms | — | Recorded |

## Held-Out Failure Listing

| Fixture ID | Category | Character | Question | Expected | Actual | Raw Model Output |
| --- | --- | --- | --- | --- | --- | --- |
| `held-no-8` | no | nora | Are they mechanics? | No | Yes | `qk=trait_question(0.61), yes=true(0.65), no=false(0.54)` |
| `held-no-1` | no | milo | Does this person work as an emergency paramedic? | No | Not enough information | `qk=trait_question(0.89), yes=false(0.93), no=false(0.56)` |
| `held-comp-2` | compound_or_ambiguous | theo | Are they an illustrator and a mechanic? | needs_rephrase -> clarification | trait_question -> clarification | `qk=trait_question(0.65), yes=true(0.52), no=true(0.52)` |
| `held-comp-3` | compound_or_ambiguous | omar | Where do they work? | needs_rephrase -> clarification | trait_question -> answered (No) | `qk=trait_question(0.89), yes=false(0.59), no=true(0.51)` |
