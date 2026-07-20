# Food-photo → macro eval harness

Ranks vision models for the food-photo nutrition task through the app's LLM seam.
See `docs/decisions/ADR-0002-food-photo-eval-golden-set.md` for the design.

## Layout

- `types.ts` — golden-set + result types
- `score.ts` — pure scoring (MAE + median APE per macro; mass scored separately). Unit-tested in `test/eval/score.test.ts`.
- `run-eval.ts` — seam-driven runner: loads a manifest, runs each item through `complete({ purpose: 'vision' })` per candidate (selected via env overrides — no app changes), scores the results.
- `manifest.example.json` — the manifest shape.

## Running (manual — needs data + keys)

1. Build a manifest of `GoldenItem[]` (see `manifest.example.json`). Day-one anchor
   is **Nutrition5k** (CC-BY, weighed macros + mass); add **SNAPMe** as a separate
   realism layer. Do not pool layers — run and report them separately.
2. Provide real keys in the environment.
3. Run the gated eval test:

   ```
   RUN_EVAL=1 \
   EVAL_MANIFEST=scripts/eval/manifest.nutrition5k.json \
   EVAL_LAYER=Nutrition5k \
   OPENAI_API_KEY=... ANTHROPIC_API_KEY=... \
   npm test -- test/eval/run-eval
   ```

   Override the candidate list with `EVAL_CANDIDATES="openai:gpt-5.6-luna,openai:gpt-5.4-nano"`.

## Plug-in points

- The **Nutrition5k download + manifest builder** is not included (large dataset,
  operator-provided). Point `EVAL_MANIFEST` at your generated manifest.
- **Portion/mass**: the eval prompt asks the model for `mass_g`; mass is scored
  only when both the manifest truth and the prediction carry it.
