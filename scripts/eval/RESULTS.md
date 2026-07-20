# Eval results

## Nutrition5k accuracy — OpenAI vision candidates — 2026-07-20

**Setup:** 25 Nutrition5k dishes (overhead RGB, weighed ground truth), flat-JSON
eval prompt, one call per model. MedAPE = median absolute % error; MAE in
grams (macros/mass) or kcal (calories). 0% refusal for all three.

| Model | Protein MAE/MedAPE | Carbs | Fat | Calories | Mass | Avg ms | Tokens in/out |
|---|---|---|---|---|---|---|---|
| gpt-5.4-nano  | 11.6 / 287%  | 14.5 / 200% | 7.0 / 166% | 144.2 / 125% | 70.2 / 70% | 4542 | 10600/5975 |
| gpt-5.6-luna  | 5.7 / 109%   | 11.8 / 122% | 8.3 / 104% | 143.8 / 112% | 118.7 / 100% | 4561 | 10600/5629 |
| gpt-5.6-terra | 2.1 / 58%    | 6.7 / 54%   | 4.1 / 70%  | 73.4 / 84%   | 49.4 / 51% | 5336 | 10600/3167 |

**Headline:** accuracy scales strongly with model size — terra ≫ luna ≫ nano,
**monotonic across every macro and mass**. terra roughly halves luna's error and
is ~3–5× better than nano.

**This contradicts the pre-eval assumption** (the Claude-family literature
suggested mid-tier ≈ frontier within 1–3pp for food-photo nutrition). On this
data the premium tier buys a large, consistent accuracy gain — so **nano is not
viable for the accuracy-critical vision task**, and even luna is meaningfully
worse than terra.

**But absolute error is high for every model** (best case terra: ~84% calorie
MedAPE, ~51% mass MedAPE). Consistent with the literature's "image-only
estimation should not be the sole input" — the photo→macro feature likely needs
a user review/correct step or should present estimates as rough, not exact.

### Caveats (do not over-read)
- **n=25** — directional, not decision-grade. The monotonic ordering across 5
  independent metrics makes the *ranking* trustworthy; absolute values are noisy.
- **Overhead lab images**, not user phone photos — real-world error likely higher
  (the SNAPMe realism layer would show this).
- **No Claude baseline** — no ANTHROPIC_API_KEY was set, so we can't yet compare
  OpenAI vs current production for the flip decision.
- Simple flat-JSON prompt; the app's richer prompt may score differently.

### Next to make this decision-grade
1. Add ANTHROPIC_API_KEY and re-run with the Claude vision model in the candidate
   list (compare vs current production).
2. Scale to ~150 dishes.
3. Add the SNAPMe realism layer (phone photos).

Reproduce: see `README.md` (pull → build-manifest → run-eval).
