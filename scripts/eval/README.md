# Food-photo → macro eval harness

Ranks vision models for the food-photo nutrition task through the app's LLM seam.
See `docs/decisions/ADR-0002-food-photo-eval-golden-set.md` for the design.

## Layout

- `types.ts` — golden-set + result types
- `score.ts` — pure scoring (MAE + median APE per macro; mass scored separately). Unit-tested in `test/eval/score.test.ts`.
- `run-eval.ts` — seam-driven runner: loads a manifest, runs each item through `complete({ purpose: 'vision' })` per candidate (selected via env overrides — no app changes), scores the results.
- `manifest.example.json` — the manifest shape.

## Local keys for the live runners

The gated live tests (`RUN_EVAL` / `RUN_LLM_SMOKE` / `RUN_SUPABASE_PULL`) read
real keys from the environment. Easiest is to mirror production:

```
vercel env pull .env.local   # writes ANTHROPIC_API_KEY / OPENAI_API_KEY / Supabase vars
```

`test/live-env.ts` auto-loads `.env.local` for those runners (it never overrides
a var already set in your shell, and no-ops if the file is absent). `.env.local`
is gitignored.

## Running the accuracy layer (Nutrition5k) — one command each

1. **Pull the imagery** (not in the Nutrition5k git repo; it's in GCS):

   ```
   gsutil -m cp -r gs://nutrition5k_dataset/imagery/realsense_overhead scripts/eval/data/nutrition5k/
   # also grab metadata/dish_metadata_cafe1.csv + cafe2.csv into scripts/eval/data/nutrition5k/
   ```

2. **Build the manifest** from the metadata CSV + local imagery:

   ```
   RUN_BUILD_MANIFEST=1 \
   N5K_CSV=scripts/eval/data/nutrition5k/dish_metadata_cafe1.csv,scripts/eval/data/nutrition5k/dish_metadata_cafe2.csv \
   N5K_IMAGES=scripts/eval/data/nutrition5k/realsense_overhead \
   N5K_LIMIT=150 N5K_OUT=scripts/eval/manifest.nutrition5k.json \
   npm test -- test/eval/build-manifest
   ```

3. **Run the eval** (needs a real OpenAI key; add ANTHROPIC_API_KEY for the Claude baseline):

   ```
   RUN_EVAL=1 EVAL_MANIFEST=scripts/eval/manifest.nutrition5k.json EVAL_LAYER=Nutrition5k \
   OPENAI_API_KEY=... npm test -- test/eval/run-eval
   ```

   Override candidates with `EVAL_CANDIDATES="openai:gpt-5.6-luna,openai:gpt-5.4-nano"`.

The Nutrition5k anchor needs **no production data** — it's the day-one accuracy signal.

## Layers (report separately — do not pool)

1. **Accuracy — Nutrition5k** (CC-BY, weighed macros+mass). Day-one anchor; no
   production data needed. Build the manifest from the metadata CSV + local
   images (imagery lives in GCS `gs://nutrition5k_dataset`, not the git repo).
2. **Realism — SNAPMe** (real phone photos, self-reported GT). Indicative only.
3. **Consistency — production photos via `pull-supabase.ts`**. Uses REAL user
   photos but the `truth` is the app's stored (AI-estimated) macros, so a low
   "error" means the candidate **agrees with current production**, not that it's
   accurate. Use it to catch hard divergence before a flip.

### Consistency layer (Supabase pull)

```
RUN_SUPABASE_PULL=1 \
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_SAMPLE=100 SUPABASE_MANIFEST_OUT=scripts/eval/manifest.supabase.json \
npm test -- test/eval/pull-supabase
```

Then run it through the runner with an explicit consistency label:

```
RUN_EVAL=1 EVAL_MANIFEST=scripts/eval/manifest.supabase.json \
EVAL_LAYER="consistency-vs-production" OPENAI_API_KEY=... npm test -- test/eval/run-eval
```

## Plug-in points

- The **Nutrition5k download + manifest builder** is not included (large dataset,
  operator-provided). Point `EVAL_MANIFEST` at your generated manifest.
- **Portion/mass**: the eval prompt asks the model for `mass_g`; mass is scored
  only when both the manifest truth and the prediction carry it.
- Downloaded images + generated manifests are gitignored (`scripts/eval/data/`,
  `scripts/eval/manifest.*.json`).
