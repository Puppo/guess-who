# Decisions API Browser Evaluation Report

## Provenance & Environment

- **Date:** 2026-11-14
- **Node.js:** v26.8.1
- **Runtime / Polyfill:** `open-jev@0.1.2` (Polyfill (open-jev · kev-0.6b))
- **Model Checkpoint:** `onnx-community/kev-0.6b-ONNX` (device: `webgpu`, dtype: `q4f16`)
- **Schema Version:** `3.0.0`
- **Browser:** `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36`
- **OS / Architecture:** macOS 27.2 (arm64)
- **Warm-up Protocol:** 3 `decide()` calls discarded before measuring warm inference timings
- **Initialization / Download Duration:** 4337.4 ms
- **Per-Round `createRoundSession()` Median Duration:** 0.00 ms

## Pinned Policy Thresholds (Calibrated on Tuning Split `n = 24`)

- `questionKindThreshold`: `0.50`
- `factThreshold`: `0.50`

## Tuning Split Summary (`n = 24`)

| Metric | Value |
| --- | --- |
| Raw `question_kind` accuracy | 95.8% |
| Raw `supports_yes` accuracy | 100.0% |
| Raw `contradicts_no` accuracy | 94.7% |
| Valid single-trait acceptance rate | 94.7% (18/19) |
| Accepted factual answer accuracy | 94.4% (17/18) |
| Post-policy `unknown`-to-`No` error count | 0 |
| Non-trait routing accuracy | 4/5 |

## Held-Out Evaluation Results (`n = 32`)

| Metric | Observed | Benchmark Target | Status |
| --- | --- | --- | --- |
| Raw `question_kind` label accuracy | 87.5% | — | Recorded |
| Raw `supports_yes` label accuracy | 100.0% | — | Recorded |
| Raw `contradicts_no` label accuracy | 100.0% | — | Recorded |
| Post-policy `unknown`-to-`No` error count | 0 | Minimize (0 ideal) | Recorded |
| Valid-trait clarification rate | 4.2% (1/24) | <= 30.0% | Pass |
| Valid-trait acceptance rate | 95.8% (23/24) | >= 70.0% | Pass |
| Accepted factual answer accuracy | 100.0% (23/23) | >= 90.0% | Pass |
| Non-trait routing (`identity_guess` / `needs_rephrase`) | 6/8 | — | Recorded |
| Warm inference latency (median) | 223.7 ms | — | Recorded |
| Warm inference latency (p95) | 277.8 ms | — | Recorded |

## Held-Out Failure Listing

| Fixture ID | Category | Character | Question | Expected | Actual | Raw Model Output |
| --- | --- | --- | --- | --- | --- | --- |
| `held-comp-3` | compound_or_ambiguous | omar | Where do they work? | needs_rephrase -> clarification | trait_question -> unknown (Not enough information) | `qk=trait_question(0.70), yes=false(0.60), no=false(0.54)` |
| `held-para-2` | paraphrase | sam | Is this person a scientist who studies marine life? | Yes | clarification (I couldn't interpret that reliably—please rephrase as one yes/no biography question.) | `qk=trait_question(0.49), yes=true(0.90), no=false(0.74)` |
| `held-comp-2` | compound_or_ambiguous | theo | Are they an illustrator and a mechanic? | needs_rephrase -> clarification | trait_question -> unknown (Not enough information) | `qk=trait_question(0.58), yes=false(0.67), no=false(0.50)` |
