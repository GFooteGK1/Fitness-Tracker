# Mac scene diagnostics: request mode explains the torso miss

Greg approved publishing the reviewed 25-file selection and one unsigned Mac run.
Commit `9d3d28d8e960038e6d5d75b1535e4fffc9dd7630` was normally pushed to
`codex/auto-meal-photos-probe`; exact remote SHA and both checkout logs match.
Independent review verified all 25 paths, parent revision, Git blob identities,
working SHA-256 values and byte counts against selection SHA
`75354a087844ae3b5dc712758d3e7ac593ab074949d4661f9264fe5e8311f6a2`.

The single [run 37223402418](https://github.com/GFooteGK1/Fitness-Tracker/actions/runs/37223402418)
used `ios-compile.yml target=scene-diagnostics` on that exact commit. It succeeded:
unsigned compile job 2m58s; diagnostic job 2m25s. Both passed 27 Python contracts,
53 Swift Testing tests and five scene XCTest tests. Eight signing contracts and
unsigned app/extension compilation also passed. Native executable compilation
and raw diagnostic execution are now verified on Mac OS 26.6.2, build 25G83.
No rerun, additional dispatch, SigLIP/Core ML model download/inference, provider call, signing,
TestFlight upload, phone-policy activation, photo upload or canonical meal write
occurred. The original Apple Vision reference evaluation also ran in the existing
unsigned compile job.

## Actual raw evidence

All 32 frozen development images completed three fixed profiles: 96 profiles and
384 stages, with all results available and no retained observations/points truncated.
Recomputed diagnostic summary matches the retained JSON exactly. Every result is
`uncertain/diagnostics_only`; the summary explicitly leaves uploads unqualified.
Full-body-512 accepted counts match the original frozen scene run for all 32 cases.

| Case | Full-body 512 | Full-body 1024 maximum | Upper-body 512 |
| --- | --- | --- | --- |
| public-12, clear torso/arms | No raw observations | No raw observations; actual 960x720 | One human rectangle, confidence 0.60628, accepted |
| public-11, cropped hand | One hand, 13 accepted points | One hand, nine accepted points | One hand, 13 accepted points |
| public-20, visible forearm/hand | No raw observations | No raw observations | No raw observations |
| public-22, dog | One accepted body pose | One accepted body pose | One accepted body pose |
| public-02, utensil; public-13, ambiguous fabric | No raw observations | No raw observations | No raw observations |

`public-12` establishes a request-mode coverage difference: full-body mode produces
no observation, while upper-body mode catches the same partial person with the
unchanged 0.2 filter. Increasing resolution alone did not help. There is no evidence
that lowering confidence thresholds would recover that missing full-body result.
There were no stages with positive raw counts and zero accepted counts in this run.

The forearm case still establishes a coverage gap. The dog body-pose detections
establish false detections. Full-body-1024 also adds an accepted body pose on
`public-23`, while the other two profiles do not. These are diagnostic observations;
no new routing policy or quality score was derived from them. Empty detections
remain insufficient proof of a scene without people. The separately preserved label
audit keeps public-02 unsupported and public-13 uncertain without changing frozen
labels or denominators. Archived v3 replay remains a separate unqualified proposal.

## Receipt preservation and review

GitHub artifact 11311530549 binds run/head identity; its archive digest is
`sha256:adfa3963ba6e615a8ebe3e0a24d48304283d0d4f188fb6b7471211188054d16f`.
Three downloaded JSON receipts are preserved exactly in
`scripts/eval/local-food/results/native-macos-37223402418/`. Logs and locally
recomputed summary remain ignored under `scripts/eval/data/local-food/scene-mac-37223402418/`.
No images or model binaries were retained in the artifact. GitHub retention is 30 days.

| Receipt | SHA-256 |
| --- | --- |
| raw.json | e1409c32a64a1b5e4dab468d49149841b6519c29ddd8d7227998fbf880e00937 |
| raw.json.partial.json | 0b5d17ed9eb2ecf35f47e57f070ecfa0f06febbc41b948de25a1088214f1c5fe |
| summary.json | 472993162476452b2aeb1445df676b21df5a6826e35e2bd78c6c54a6fbc4c3dd |

The partial checkpoint correctly remains `completed=false` even though it contains
the final case; the exclusive final raw report is complete. Independent review
recomputed the summary, validated all cases/profiles/stages, source revision and
the interpretation above. No blocking finding remains for this diagnostic slice.

The first staged whitespace check incorrectly flagged intentional frozen CRLF
receipt bytes. Byte/blob identity was preserved and a per-command CRLF-aware check
passed. No global configuration or frozen receipt was changed. Local investigation:
`handoffs/investigations/scene-diagnostic-publication-20261004.md`. A later Windows
console rendering error occurred after the run log had already been saved; reading
the existing log with escaped Unicode recovered the test evidence without another
network fetch. No run failure or duplicate dispatch occurred.

These post-run JSON copies, this receipt and the local investigation are uncommitted;
the approved 25-file source commit is fully pushed. Four preexisting unrelated
diagnostic/support paths remain preserved. Beads is unavailable, so no canonical
task or milestone was closed. Board result note
`camera-scene-diagnostic-mac-result-20261004-01a0eaae` was delivered at version 196
and verified by exact subsequent readback.

## Next slice

Freeze a separately grouped, previously unused partial-person/hand challenge set
with independent pixel adjudication. Compare a fixed full-/upper-body detector
combination plus the semantic backup, preserving all prior policies and receipts.
Measure false passes and false abstentions before selecting phone behavior.
Do not retune the frozen development set, lower thresholds or qualify uploads from
this run. Physical iPhone preprocessing, locked execution, memory/battery and the
eventual Socius macro-review draft flow still need separate implementation/proof.
