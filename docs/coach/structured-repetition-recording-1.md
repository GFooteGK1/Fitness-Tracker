# Structured repetition recording, version 1

This follows [ADR-0045](../decisions/ADR-0045-structured-repetition-source.md). ChatGPT selects and interprets source data; Socius validates, persists and retrieves it. No model, external fetch, trace upload or UI completion step is invoked.

## Source and storage

An existing performed `sets` or `set_details` member in `workouts.blocks` JSONB can hold `velocity.recording`. No table or migration is added. Existing scalar velocity fields and unknown siblings survive unchanged; recording-only velocity does not fabricate scalar summaries. The old scalar amendment preserves the recording.

The local `parseQwikArrayRecordings` adapter supports `qwik-ios-array-1`: our version of the observed array contract, not an asserted vendor version. The separate wrapped 1.10 adapter/observation flow remains unchanged; it already retains optional phase metrics in rep metadata. This amendment does not promote adaptive programming evidence.

The recording retains:

- Schema/parser/source identities; original filename, exact UTF-8 SHA-256, byte length, inert artifact reference and zero-based source array index.
- Available original set ID, exercise name/type, distinct `date` and `date_performed`, weight/unit, plate diameter, raw RPE text (including inequalities), notes/tags/archive state. These do not overwrite workout facts.
- Ordered repetitions with contiguous one-based `ordinal`; optional or nullable `concentricRepetition` and `eccentricRepetition`. Each phase keeps its own `id`, source `rep_number`, `is_concentric`, `average_velocity`, `peak_velocity`, signed `range_of_motion_meters`, `duration_millis`, peak/start/end frames and pauses (`pause_number/start_frame/end_frame`). Source rep numbers need not equal ordinals. Phase IDs cannot repeat within a recording.
- Explicit format-convention units: m/s velocity, m ROM, ms duration and frame index. Eccentric signs survive. Plate diameter unit is unknown (`null`); no device, export time, FPS, centimeters or pause duration is invented.
- Raw `bar_path` state (`absent`, `null`, `array`) and numeric scalar-element count. Coordinate meaning/units and point/sample counts are not asserted.
- Parser-observed `starts_at_frame_one` flags by phase/ordinal. A caveat does not invalidate or exclude a measurement.

Missing and null phases/optional values remain distinct; recorded zero remains zero. All supported source scalar values are retained without unit conversion. Mean and peak are separate, in both phases.

Raw traces and unknown vendor fields stay in the **original user-retained file**, bound by hash and reference. Hashing reserialized JSON would lose byte identity. Socius does not upload, fetch or guarantee retention of this file. Keeping traces outside revisions avoids multiplying large arrays whose coordinate conventions are unverified. A future managed artifact store requires its own retention/access decision.

## Amendment and recovery

Use `amend_workout` with the owned entity ID, freshly read `expectedRevision`, original `requestId`, `changes.setRecordings` and `provenance.fields={}` when no other fields change. Each patch supplies `blockIndex/segmentIndex/eventIndex/collection/setIndex`, `recording`, `expectedRecording` and provenance. Exact positions bind to that revision; no name search, new set or fabricated ID. Numeric source load/count must match the selected set when available. Matching does not independently establish exercise variation.

For first attachment use `expectedRecording=null`. For deliberate replacement supply the prior `{fileSha256,sourceSetId}` and current workout revision. An unchanged recording under a new request rejects as already attached. The same hash/set-ID identity cannot occupy two sets in one workout. This is workout-scoped deduplication, not global uniqueness across exports/workouts.

Existing owner checks, request fingerprints, transactional canonical revision/receipt and immutable readback apply. Exact original retries recover before consulting newer state. Changed arguments under the same request reject; stale revisions conflict. After uncertainty use `get_activity_write_status` with the original request ID and retry only the exact original command. Receipt absence is unresolved, never permission to create a replacement request or duplicate workout. `get_activity_record` separately reads current state.

Imported leaves use `origin=imported_unverified`, `reviewState=unreviewed` (or `corrected` for deliberate correction). Exact descendant provenance changes without relabeling block/quantity roots or estimated measurement leaves. A parent replacement cannot erase an estimated descendant. The external reader compresses homogeneous stored leaf origins/review states as `subtreeOverrides[path].scope=all_recording_leaves`; mixed origins remain per leaf. No independent completion or numeric-policy authority is implied.

Closed schemas bound strings, 100 reps/recording, 30 pauses/phase, 20 patches and 48,000 JSON characters/command (transport: 65,536 bytes). Original local files are at most 5 MB/1,000 sets; select only relevant sets. The existing capture limit of 250 KB serialized record/provenance still applies. Oversized data rejects without silent truncation. Select fewer sets across fresh revision-bound commands; an individually oversized recording needs a separate storage extension. No arbitrary raw metadata, owner fields or accepted-plan/goal changes are allowed. Recording/scalar patches cannot share a target or accompany replacement blocks/occurrence provenance.

The external factual reader validates the closed recording before exposure. Invalid recordings produce `invalid_structured_rep_recording` while other sets/scalars remain. Its normal 64,000-character budget yields explicit coverage notices when evidence cannot fit; direct owner lookup returns complete retained data.

## Derived method

The pure `summarizeRepRecording(recording, phase, metric)` returns `method=rep-arithmetic-summary-1`, selected phase, `average_velocity` **or** `peak_velocity`, m/s, included/missing counts and arithmetic mean/min/max. Only numeric values of that phase/metric participate; absent/null count as missing, zero participates and eccentric signs remain. Empty selection gives null statistics. Boundary values participate under `boundaryPolicy=include_with_caveat`.

This is a mean of rep measurements, not a duration-weighted mean or raw-sample average. It never mixes phases/metrics or derives peak from mean. Results stay separate from source and scalar summaries. Fatigue/velocity-loss models, trace analysis and programming policy remain outside this slice.

## Release boundary

Installed migration `20261022164908_activity_measurement_corrections.sql` already excludes the entire velocity object when comparing projection inputs. Tests exercise that unchanged function with projection-write guards, complete snapshots and receipt recovery. No SQL, grants, flags, credentials, network, storage or integration changes are proposed.

This branch needs separately approved merge/deployment and tool-catalog refresh. Automatic database deployment stays as configured. Implementation performs no production athlete write. After deployment, re-read the existing workout and map source sets, obtain specific import approval, send one amendment and verify all eight sets plus unchanged notes/load/reps/projections. The old notes-only proposal is superseded; do not create a duplicate workout.
