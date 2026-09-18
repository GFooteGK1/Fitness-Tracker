# Personalized coaching engineering scenarios

Frozen fixture revision: `engineering-scenarios-v1`, 2026-09-17. Source specification: [implementation plan](../../plans/data-to-personalized-coaching.md), especially sections 5.1–5.7 and W0/W9/W10. The system under test is the local capture-to-evidence-to-action application. The decision supported by these cases is core engineering readiness. They do not establish athlete benefit, physiological thresholds, numerical prescription fit, or release authorization.

The author inspected the current `app/lib/coach/adaptive-programming-contracts.ts`, `execution-feedback.ts`, `today-session.ts`, `session-completion.ts`, `app/lib/agents/socius-background.ts`, and existing background-pattern tests. Cases target the plan's identified failure modes rather than copying current assertions. No real athlete data, previous pilot archive, provider call, or model judgment produced these fixtures.

## Dataset and rule mapping

| File | Distinct scenarios / athletes | Counterfactual variants | Purpose |
| --- | --- | --- | --- |
| [development.json](../../../test/fixtures/personalized-coaching/development.json) | 30 | 30 | Implementation-visible engineering cases; ten per rule |
| [heldout-engineering.json](../../../test/fixtures/personalized-coaching/heldout-engineering.json) | 12 | 12 | Reserved integrated engineering cases; four per rule |
| [contracts.ts](../../../test/fixtures/personalized-coaching/contracts.ts) | Fixture schema | — | Test-only typed contract |
| [validate.mjs](../../../test/fixtures/personalized-coaching/validate.mjs) | Integrity check | — | Counts, uniqueness, expected-label shape, one-factor changes, SHA-256 |

Every base scenario has a different synthetic athlete and a materially different evidence or lifecycle failure mode. The paired variant represents the same athlete with exactly one changed fact, so it does not count as an additional distinct athlete. There are 42 distinct scenarios and 84 base/variant executions, not 84 distinct athletes.

The plan says “three recommendations” in W0 but lists four bounded action families in section 5.6. These fixtures use the three IDs frozen in [contracts.md](./contracts.md):

| Rule ID | Section 5.6 action families | Authority boundary |
| --- | --- | --- |
| `accepted_plan` | 1: execute accepted session / explicit plan state; 3: review authoritative proposal | Navigation cannot accept or rewrite a plan |
| `missing_signal` | 2: collect a defined decision-changing measurement | Evidence missingness cannot invent policy or require all optional feedback |
| `logged_nutrition` | 4: explain remaining logged intake against confirmed target | Logs and estimates cannot prove actual deficit or causation |

Unsupported personal links, HRV/recovery trends, stale wearable inputs, and capture/replay issues are cross-cutting negative assertions within these rules. They are not additional recommendation families.

## Fixture interpretation and runtime adapters

These are semantic engineering fixtures, not forged canonical database rows or a parallel production evidence API. `facts` is an explicit, flat test context. Inputs such as `protocol`, `measurementProtocol`, and `quantity` describe raw evidence distinctions. Adapters must derive comparability, ownership, eligibility, and freshness using production code; fixture expectations cannot be passed to the engine as authoritative eligibility.

For each runtime adapter:

1. Materialize the listed synthetic facts as owned canonical records or typed evidence, with explicit source IDs/revisions and fixed timestamps. Unspecified orthogonal gates may be set to ordinary eligible defaults and must be visible in the test builder. A missing required scenario fact must fail adapter preparation rather than be silently inferred.
2. Bind abstract protocol names to actual catalog IDs and complete context before claiming executable policy coverage. For example, `run_5000m_track_elapsed_seconds` describes metric `run.time`, unit `s`, distance 5000 m, and the stated track/protocol variation; it does not claim that this string is an installed protocol ID. If the catalog lacks the supported protocol, report that adapter as unsupported/blocked; do not invent a production policy to make the fixture pass.
3. Bind persisted sources to authenticated owner and immutable revisions. Synthetic names such as `obs-lark-1` are stable fixture references; a database adapter may generate deterministic UUIDs but must preserve a mapping in failure output.
4. Execute the base case. Clone its facts and replace only `counterfactual.field` with `counterfactual.value`; regenerate derived evidence from the changed facts and execute again. Never carry cached derived comparability/status across the pair.
5. Check normalized decision, destination, included/excluded source IDs, factual arithmetic, preservation of revisions, and absence of forbidden side effects. Prose assertions are semantic requirements, not mandatory UI strings or production reason-code constants.

The run date/timezone must be fixed by the adapter using project timezone utilities. Most dates use athlete-local 2026-09-17; a case's explicit local date/time overrides the builder default. Preserve raw and negated offset conventions, event time, capture time, and device measurement/sync time independently.

`decision` is the result for the isolated named rule after applicable publication/suppression gates. It is not always the global card winner. For example, a logged-nutrition action remains eligible independently of unavailable WHOOP, but an accepted session can outrank it. Integrated ranking tests must instantiate all candidates and check the section 5.6 order separately. A publication race with `abstain` means the stale worker publishes nothing; it does not assert that no fresh worker can later produce an action.

`assertions` and `forbidden` freeze observable expectations. They are not evidence supplied by the athlete. All `qualifiedCoachLabel` fields are `not_reviewed`. Numerical selection remains disabled under the separate qualified-policy gate regardless of engineering results.

## Rubric and graders

| Dimension | Pass | Fail | Grader |
| --- | --- | --- | --- |
| Authority and ownership | Owned source refs; separate acceptance; no response-created activity | Cross-user evidence, automatic acceptance, fabricated canonical records | Code assertions plus real SQL/RLS tests |
| Provenance and grounding | Exact/range/unknown, estimate origin, legacy explicitness and source revisions survive | Estimate becomes measured, inferred quantity becomes exact, legacy flag bypasses explicit-report gate | Reader/adapter assertions plus SQL readback |
| Decision relevance | Correct goal/protocol/assignment and supported gap; unrelated factor inert | Sorted-first targeting, proxy attainment, irrelevant mandatory question | Counterfactual code assertions |
| Lifecycle and concurrency | Current lease/source/response/policy/date; suppression and outcome state preserved | Old worker publishes, dismissed action returns, stale plan/date advice displays | Transaction/concurrency tests and route integration |
| Factual explanation | Logged remainder and time limits; no unsupported trend or causal claim | Under-fueling claim from sparse logs; invented target; unsupported personal link | Deterministic normalized facts plus human prose inspection |
| Domain prescription fit | Marked unreviewed unless qualified review actually exists | Passing engineering test presented as coaching validation | Qualified human review, outside fixture integrity gate |

Anchors: an approximate logged remainder that retains photo-estimate origin passes grounding; the same number described as a measured calorie deficit fails. A supported baseline request with a complete protocol passes relevance; an abstract protocol label without an executable catalog binding is **not yet evaluated**, not a pass or an invented supported capability. Optional unknown pain is allowed and stays unknown; a known concerning-pain review retains its existing safety handling even if its provenance is legacy.

No aggregate percentage may hide an authority, ownership, corruption, or forbidden numerical-policy failure. Core engineering acceptance requires all applicable assertions to pass with zero such violations and explicit reporting of every blocked/unsupported adapter. Unimplemented adapters count as unverified coverage. The fixture integrity script is not an application behavior test and must not be included in an application pass count.

Record a failed run with fixture version and SHA-256, scenario ID/base-or-counterfactual, source SHA and patch identity, adapter version, migration chain, normalized input, actual output, assertion failures, included/excluded evidence, and reviewer explanation. Use code and SQL checks before any model judge. Provider calls and paid evaluation are not authorized for this scope.

## Held-out engineering protocol

The holdout is newly authored synthetic engineering material. Its author has necessarily seen it. It is separate from development and reserved from implementation tuning; it is not a claim of statistical independence, an unseen physiological cohort, qualified labeling, or production validation.

Until W9 integrated evaluation, implementers should read the development set and fixture contract only. The integrity script reads the holdout automatically but outputs only counts and hashes. Reading scenario bodies, outputs, or failures is substantive exposure and must be logged in the acceptance report with reviewer identity/date/purpose. Do not run holdout cases while iterating rule implementations.

At integrated verification, freeze candidate source/patch and fixture hashes before the first holdout run. Record actual exposure, even if it occurred earlier than intended. If any held-out case is used to fix behavior or tune a prompt/rule/adapter, move that case into development and create a new distinct held-out case before a fresh holdout claim. Keep the original run result and contamination history. Inspected pilot archives are never replacements for unseen holdouts. Earlier passing results do not carry forward across material policy, adapter, or source changes.

These twelve engineering holdouts do not satisfy W10's qualified numerical-quality gate. That gate needs actual compiled programs, frozen reviewed policy, qualified-coach labels, disagreements, and separately protected numerical evaluation material.

## Current verification

Executed locally with no network/provider access:

```powershell
node test/fixtures/personalized-coaching/validate.mjs
```

Result: fixture integrity passed; 42 distinct synthetic athletes, 30 development scenarios plus 30 one-factor variants, and 12 reserved engineering scenarios plus 12 one-factor variants. No application scenario execution is claimed at W0.

Frozen SHA-256 values:

| Dataset | SHA-256 |
| --- | --- |
| development.json | `32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278` |
| heldout-engineering.json | `ea26eb6d3c6fc288330826ec906c288c61566f82f3a7eb2aa7e3a18afc10bc24` |

W1–W8 should add runtime adapters and focused tests for relevant development cases; W9 owns integrated held-out execution and real SQL/browser evidence. Beads owns package status, and the matching handoff owns next actions.
