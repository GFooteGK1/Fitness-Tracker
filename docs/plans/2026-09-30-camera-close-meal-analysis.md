# Camera-close automatic meal analysis: proposed implementation plan

Date: 2026-09-30. Updated October 1: Greg authorized implementation. Slice 1 compiled and shipped as TestFlight build 9; Greg reports one unlocked and one locked native thumbnail check. Broader device qualification remains open. Slice 2 is a local discovery candidate with ten unexecuted Swift tests; compilation and device checks are pending. See `docs/verification/camera-close-slice-2.md`. Deployment remains a separate authorization boundary.

## Outcome and current evidence

Take a meal photo with Apple Camera, leave Camera, and later find an estimated macro draft in SociusFit without opening SociusFit to start analysis. The athlete reviews, corrects, accepts, or dismisses the draft. Only acceptance contributes to nutrition totals. Capture and Camera close are different events; this version starts on Camera close, not at shutter press.

Greg's device tests in this conversation proved Camera Is Closed / Run Immediately notifications, including Lock Screen use, and Get Latest Photos producing the new image while locked. Build 9 subsequently completed a custom native thumbnail check once unlocked and once locked. Batch discovery, a local classifier, upload, durable retries and analysis remain unproved on device. The thumbnail check can reuse the latest image; the next discovery candidate addresses zero and multiple captures.

Existing source evidence:

- `ios/project.yml`: Swift 6, iOS 26.4 native companion. The installed startup-only sample is a separate diagnostic target, not the feature app.
- `ios/Shared/MealPhotoIngestionState.swift`: candidate ledger and device-plus-content-hash identity exist. Durability, concurrency, receipt recovery and new transport semantics must be reviewed before reuse.
- `app/lib/nutrition/meal-photo-analysis.ts`: shared provider-neutral vision analyzer with strict output validation and totals calculated in code.
- `app/api/meals/upload/route.ts`: authenticated multipart upload calls the shared analyzer and inserts directly into `meals`. It is not a safe automatic draft endpoint.
- `docs/decisions/ADR-0005-automatic-meal-photo-native-ingestion.md`: accepted local filtering, non-food stays on phone, and review-first ingestion. Its no-Shortcut constraint has been relaxed for this pilot by Greg's choice; privacy and review requirements have not been relaxed.
- The Jev adapter exists in the separate coaching-layer worktree, is Node-only, uses a remote API, and is not a production route integration. Do not copy that worktree wholesale or assume it is on the target branch.

Current official TypeSafe documentation explicitly says Jev accepts text only and does not support images, audio or video: https://docs.typesafe.ai/concepts/state . API: https://docs.typesafe.ai/api . Therefore Jev cannot directly implement photo food detection. A caption/observation producer is required first; its errors constrain Jev's judgment. Base64 in JSON does not make image support available.

Apple documents that App Is Closed includes switching away: https://support.apple.com/en-za/guide/shortcuts/apde31e9638b/ios . Locked custom action execution and continued work after action completion still require physical-device proof.

## Approaches

| Approach | Benefit | Main problem | Decision |
| --- | --- | --- | --- |
| Continue PhotoKit extension as sole trigger | Native setup and possible library-wide coverage | Device scheduling remains unproven; no dependable near-capture latency evidence | Preserve existing investigation; do not block this pilot on it |
| Shortcut sends every new photo to cloud vision, then Jev routes text | Faster cloud-only prototype | Non-food photos leave phone before filtering; Jev still needs vision upstream | Reject under current privacy requirement; reconsider only with explicit policy change |
| Camera-close Shortcut invokes narrow native processing action, local filter, private ingestion and existing analyzer | Builds on device proof; durable state belongs in code; preserves local image screening | Custom action while locked, classifier quality, and delivery scheduling need spikes | Recommended, medium confidence until those spikes pass |

Proposed flow:

Camera close -> native processing action -> durably discover new candidates -> local food decision -> permitted candidate upload -> private ingestion record -> existing macro analyzer -> review draft -> explicit acceptance into meals.

Keep the Shortcut small: one processing action, plus temporary diagnostics during qualification. The native companion owns photo discovery, stable identities, local screening, queueing and transport. Do not maintain a second production ledger in Shortcut files. Do not assume an App Intent gives unlimited background runtime.

Jev is an optional downstream text judgment: for example, whether visible-food observations support analysis or whether a draft needs more context. First evaluate it in shadow mode against the same cases without affecting routing. Keep it only if it improves useful drafts, accuracy or cost enough to justify another dependency. Never use it to calculate macros. Descriptions can contain sensitive information too; any remote observation flow needs a defined data policy.

## Ordered slices and learning gates

### 1. Prove the processing handoff while locked

Add a narrow App Intent to the feature companion, provisionally `ProcessNewMealPhotosIntent.swift`. Its first version only records invocation, obtains one permitted local image, and records completion without storing image bytes in diagnostics or making network requests. Use the proven Camera-close automation to invoke it. Explicitly distinguish runtime entry, resource read and completion.

Test unlocked, Camera from Lock Screen without subsequent unlock, app absent from foreground, permission denied/limited, and after reboot both before and after first unlock. Repeat happy cases ten times each, log exact OS/build and failed steps. Passing notification/latest-photo tests does not satisfy this gate. Stop and choose a different handoff if custom execution requires unlock; do not add downstream work to hide the failure.

### 2. Discover every new photo once

Native photo discovery begins at an explicit enrollment baseline, with no historical backfill. Persistent library changes feed a durable, bounded local ledger; identifiers stay local. Save candidates before advancing the discovery checkpoint. Use overlapping discovery/reconciliation if necessary to handle delayed asset availability; do not rely on capture timestamp alone. Serialize concurrent invocations. Separate discovery checkpoint from per-photo processing and server acknowledgement.

Test zero, one and five shots; rapid close/reopen; delayed library availability; concurrent invocations; crash after discovery; deleted asset; and iCloud-only resource. Explicitly define scope: newly added still photos since enrollment, including possible imports, until reliable source filtering is proved. Videos are excluded; Live Photos contribute their still resource. Return a clear deferred/unsupported state rather than silently losing work. Queue capacity exhaustion must be visible.

Acceptance: no stale photo when no new asset exists, no duplicate processing of the same asset, and every controlled eligible shot is accounted for as pending, skipped, deferred or complete.

### 3. Evaluate local food screening before automatic upload

Select a local vision/Core ML candidate after checking available model, license, package size, supported hardware and deployment target. No existing classifier is assumed. Start observation-only on an explicitly selected local dataset: meals, drinks, packaged food, mixed scenes, pets, people, documents, screens displaying food, empty dishes and low-light shots. Label food presence separately from suitability for macro estimation.

Use approximately 100 varied pilot images, then a separate held-out set. Keep bursts and near-duplicates together when splitting; tune thresholds on the development set only. Record food recall, non-food false passes, uncertain cases, device latency and resource use. Start with local outcomes `food_candidate`, `non_food`, `uncertain`, and `error`; uncertain/error remain local for later manual selection. Never silently equate errors with non-food.

Proposed pilot gate: at least 95% recall on clear meal photos, no false passes in the sensitive non-food challenge set, and measured false-pass counts for the broader non-food set. These are targets, not achieved results or guarantees. A probabilistic classifier cannot guarantee no non-food ever leaves the phone. If the requirement means literal zero leakage, retain explicit image approval before upload until a different accepted policy exists.

### 4. Deliver one approved candidate safely

Build an authenticated ingestion contract and verify it with a manually approved meal image before enabling automatic delivery. Native sign-in pairs a revocable device credential to the current owner; no provider key, service-role key or permanent bearer secret belongs in the Shortcut. Reject revoked, expired, malformed and cross-owner requests.

Normalize orientation and format, resize, strip metadata, and preserve capture instant plus capture timezone separately. Hash a defined stable representation and preserve the same owner/device/key across retries. The server must atomically enforce uniqueness and return the same ingestion receipt for repeated requests, including a lost response after successful acceptance.

Persist local retry state before delivery. A server receipt means accepted, not analyzed. Durable server processing needs an explicitly selected job mechanism, bounded retry policy and stuck-job recovery; Next.js work after a returned response is not assumed reliable. If private image staging is necessary, specify retention, cleanup and access controls before enabling it. Existing manual uploads do not persist meal photos; this feature introduces a new retention decision.

Test offline then reconnect, timeout before/after acceptance, duplicate requests, concurrent delivery, oversized/invalid content and disable/signout. Prove the selected iOS transfer mechanism's actual wake/retry behavior on device; automatic work resumption on reconnect is a hypothesis until tested.

### 5. Analyze into a review draft

Reuse `analyzeMealPhoto`, not the direct-to-meals upload route. Proposed new ingestion domain owns received/queued/analyzing/review-ready/failed/dismissed/accepted states and model/prompt versions. New owner-scoped database records require migrations and RLS; verify with real authenticated owner and other-user cases before release.

Present recognized food, portion assumptions, estimated macros, capture time and analysis status. Failed/schema-invalid output is visible and cannot enter totals. Acceptance is idempotent and links the ingestion to exactly one canonical meal. Dismissal contributes nothing. Reanalysis creates a version and never silently overwrites an accepted meal.

Test correction, accept twice, concurrent acceptance, dismiss, analysis timeout, invalid output, capture near midnight and timezone changes. Distinct photos of the same meal remain separate candidates in the first pilot; provide review/dismissal and evaluate grouping separately. Exact transport deduplication cannot establish that two different images depict one eaten meal.

### 6. Qualify the connected flow in daily use

Use a seven-day one-device pilot after previous gates pass. Keep an independent capture log so discovery misses are measurable. Measure capture-to-trigger, trigger-to-local-decision, receipt-to-draft and total delay separately, plus missed candidates, duplicate drafts, false passes, food misses, correction burden, costs and battery impact. Compare estimates with known portions/reference meals on a subset; schema validity and model confidence do not establish nutrition accuracy.

Initial release gates: every controlled test capture accounted for, zero duplicate canonical meals under retry/concurrency tests, no cross-owner access, no totals before acceptance, documented image deletion behavior, and physical proof for the locked scenario. Set a latency promise from observed data; do not advertise instant shutter analysis. Use pilot results to choose rollout scope, thresholds, retry windows and whether Jev adds value. A one-phone week is limited evidence, not general iOS qualification.

## Recovery, rollout and boundaries

Each slice is reversible. Device automation can be disabled; local collection, uploads and server analysis need separate controls. Disabling must prevent new uploads and give a clear decision for already accepted server jobs. Revoke device access on signout; keep owner evidence minimal and do not log photo bytes, filenames, location or PhotoKit IDs remotely. Reconcile ambiguous provider attempts rather than blindly launching duplicate billable inference.

Before implementation, record an ADR amending the trigger/setup boundary. Do not overwrite the diagnostic sample or reset the existing PhotoKit investigation. Check current main and relevant worktrees before choosing an implementation base; the probe branch is not assumed to contain all current product changes.

Implementation remains subject to normal code review, focused tests, macOS compilation and physical-device checks. Signing/TestFlight, production migrations, deployment, new credentials and live provider/image transmission require their explicit target-specific authority. No commits, pushes or production changes were made while preparing this plan.

Beads remains authoritative. `bd prime` is unavailable in this Windows session (command not recognized), so proposed slices are not represented as created or claimed issues. First implementation step is to restore tracker access and attach slices to the existing automatic-meal-photo epic. Board reporting summarizes this proposal without replacing the canonical plan or changing unrelated work.

Recommended starting build: slice 1, followed by slice 2. Run slice 3's local model selection/evaluation as a separate experiment. Do not add Jev, cloud delivery and nutrition persistence in one change.
