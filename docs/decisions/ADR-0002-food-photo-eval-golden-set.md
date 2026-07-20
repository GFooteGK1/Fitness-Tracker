# ADR-0002: Food-photo eval golden-set composition and harness design

- **Status:** Accepted
- **Date:** 2026-07-20
- **Deciders:** Greg Foote
- **Related:** ADR-0001 (AI-surface taxonomy), the OpenAI migration + per-task model-cost strategy, Phase 4 beads (`Fitness-Tracker-196`)

## Context

Before flipping the food-photo → nutrition task to OpenAI (or choosing among
`gpt-5.6-luna` / `gpt-5.6-terra` / `gpt-5.4-nano` vs the current Claude), we need
an eval that measures **macro/portion accuracy**, not just model agreement.

Two hard facts constrain the design:

1. **We have no internal ground truth.** The `meals` table stores photos with
   the model's *own* estimated macros (`total_*`, `ai_confidence`). Grading a
   model against its own past output is circular — it measures consistency, not
   accuracy. (Photos also carry a 30-day expiry, so there's no deep historical
   corpus by design.)
2. **The public dataset that matches our task does not exist.** Research
   (2026-07-20) found that no public dataset combines *in-the-wild phone photos*
   with *weighed macro ground truth*. Weighed-macro sets are lab-captured
   (Nutrition5k, FPB, MetaFood3D); the real-phone-photo set (SNAPMe) has
   self-reported, unweighed records. The intersection is empty.

Additionally, the VLM-nutrition literature consistently locates the dominant
error in **portion/mass estimation**, not macro composition.

## Decision

### Three-layer golden set, reported separately (never pooled)

| Layer | Dataset | Role | Why |
|---|---|---|---|
| 1. Accuracy anchor | **Nutrition5k** (Google) | Best-case macro + per-gram mass accuracy under clean capture | Only public set with weighed full-macro + mass ground truth **and** a commercial-safe license (CC-BY 4.0). Needs no production data → usable day one. |
| 2. Realism check | **SNAPMe** (USDA) | Accuracy degradation under real phone conditions | Real before/after phone photos; the de-facto 2025–26 VLM-nutrition benchmark. GT is self-reported (unweighed) — treat as indicative, not authoritative. |
| 3. Representative set | **In-app labeled production photos** (`196.4`) | The decision-grade eval on our real distribution | Captured at log time with known/weighed macros (barcode, restaurant nutrition, scale). A few hundred items beat any public set for *our* users. |

Layers are scored and reported **separately** because their ground-truth quality
differs; pooling would launder SNAPMe's weaker GT into the accuracy number.

### Scoring

- **Score portion/mass as its own metric**, separate from macro composition —
  the documented dominant error source. A single calorie-error number hides
  where models actually differ. Where feasible, test with vs without an in-frame
  reference object.
- Per-macro **MAE + MedAPE** (protein / carbs / fat / calories), plus
  refusal/parse-failure rate, latency, and cost per 1k (from the seam's usage log).

### Excluded datasets

- **FPB, MetaFood3D, Recipe1M+** — non-commercial licenses; keep out of anything
  informing a shipped product.
- **NutriBench** — text meal descriptions, no images.

### Licensing

- **Nutrition5k — CC-BY 4.0**: safe for internal eval and commercial use
  (attribution only).
- **SNAPMe** — USDA-hosted public data; low-risk for internal eval, but verify
  terms before shipping anything derived.

## Harness design (for `196.1`)

A script under `scripts/eval/` that:

1. Loads a golden-set manifest: `{ imagePath, groundTruth: { protein, carbs, fat, calories, mass? } }`.
2. Runs each item through the **seam** — `complete({ purpose: 'vision', ... })`
   — once per candidate model, selecting the model via the existing per-purpose
   env override (`LLM_PROVIDER` + `LLM_OPENAI_VISION_MODEL` / `LLM_ANTHROPIC_VISION_MODEL`).
   No app code changes: the harness drives the same seam the app uses.
3. Parses macros via the shared `extractJson`, then scores against ground truth.
4. Emits a comparison table: **candidate model → per-macro MAE/MedAPE + portion
   error + refusal rate + latency + cost/1k**, one section per layer.

**Candidates:** `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.4-nano`, and the current
Claude vision model as the baseline. The escalation thresholds (`Fitness-Tracker-xml.3`)
are applied to the results to pick the per-purpose winner.

## Consequences

- **The accuracy eval can start now** — Nutrition5k requires no production data
  and is commercially safe, so Phase 4's harness (`196.1`) and a first
  luna/terra/nano/Claude ranking are unblocked immediately.
- The **representative** eval still waits on the in-app labeling pipeline
  (`196.4`); that layer is what ultimately decides the production model.
- Because the harness drives the seam, adding a model or provider is an env
  change, not code.

## Follow-ups

- `196.1` — build the harness against Nutrition5k (day-one anchor).
- `196.4` — in-app labeling capture (representative layer).
- Verifier check on the exact published VLM error figures and on SNAPMe's
  commercial-use terms before either is quoted in a shipped/decision doc.
