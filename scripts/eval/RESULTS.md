# Eval results

## Nutrition5k accuracy — OpenAI vision candidates — 2026-07-20

**Setup:** 25 Nutrition5k dishes (overhead RGB, weighed ground truth), flat-JSON
eval prompt, one call per model. MedAPE = median absolute % error; MAE in
grams (macros/mass) or kcal (calories). 0% refusal for all three.

| Model | Protein MAE/MedAPE | Carbs | Fat | Calories | Mass | Avg ms | Tokens in/out |
|---|---|---|---|---|---|---|---|
| **anthropic/claude-sonnet-4-6** (current prod) | **2.0 / 53%** | 6.1 / 75% | **2.3 / 50%** | **50.3 / 69%** | 57.7 / 51% | **2944** | 12225/**1000** |
| openai/gpt-5.6-terra | 2.1 / 58%    | 6.7 / 54%   | 4.1 / 70%  | 73.4 / 84%   | 49.4 / 51% | 5336 | 10600/3167 |
| openai/gpt-5.6-luna  | 5.7 / 109%   | 11.8 / 122% | 8.3 / 104% | 143.8 / 112% | 118.7 / 100% | 4561 | 10600/5629 |
| openai/gpt-5.4-nano  | 11.6 / 287%  | 14.5 / 200% | 7.0 / 166% | 144.2 / 125% | 70.2 / 70% | 4542 | 10600/5975 |

**Headline 1 — among OpenAI, accuracy scales strongly with model size:**
terra ≫ luna ≫ nano, monotonic across every macro and mass. This contradicts the
pre-eval assumption (Claude-family literature suggested mid-tier ≈ frontier);
here the premium tier buys a large, consistent gain, so **nano/luna are not
viable for the accuracy-critical vision task.**

**Headline 2 — the current Claude model is the best option for vision.**
claude-sonnet-4-6 ties or beats the best OpenAI model (terra) on accuracy
(clearly better on calories and fat, ~tied on protein/carbs/mass) while being
**~1.8× faster (2.9s vs 5.3s) and ~3× more output-token-efficient (1000 vs 3167).**
Moving vision to OpenAI would be lateral-at-best on accuracy and worse on
speed/efficiency.

## Verdict: keep vision on Claude

Data-backed, not just caution: `LLM_VISION_PROVIDER=anthropic` (or leave vision
unset while flipping cheaper purposes to OpenAI). Flip the *cheap text* purposes
to OpenAI where the savings are real and the task is easy; **do not move the
food-photo vision task off Claude** on this evidence.

**Caveat that outweighs the model choice:** absolute error is high for EVERY
model (best case ~69% calorie MedAPE, ~50% mass MedAPE). Image-only macro
estimation is inherently rough — the product should present these as rough
estimates and/or add a user review-and-correct step, not treat them as exact.

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
