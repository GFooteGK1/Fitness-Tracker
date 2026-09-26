# Fitness-Tracker-h5r — workout save recovery

September 26, 2026. User authorized planning and local implementation. No commit, push, hosted migration/deployment or athlete workout write is authorized or performed.

Worktree: C:/Users/foote/.codex/worktrees/workout-save-recovery/Fitness-Tracker, based on origin/main f123aa8. Other checkout work was preserved. Beads remains the authoritative tracker. Project-board reporting is not connected because this project has no exact mapping.

## Diagnosis and plan

Live read-only inspection found the completed failed legacy request and no saved workout/children. The old INTEGER cast rejects session RPE 5.5 (locally reproduced SQLSTATE 22P02). Completed failure replay explains repeated retry failure. Historical parser output/SQLSTATE are unavailable, so the exact original value is inferred, not observed.

Plan implemented: preserve fractional canonical RPE through affected manual capture writers; add owner-locked read-only proof for this exact no-write legacy failure; keep terminal identities closed; present explicit resubmission guidance; verify SQL, API, client and component behavior; prepare separate hosted rollout instructions.

Independent reviewer review_design found no actionable source defects. Suggested latest-schema and isolated child-row cases were added and pass.

## Check history

- Initial SQL test found CREATE OR REPLACE VIEW resets security reloptions unless specified: fixed by capturing and restoring options on both replacements; view identity/options/ACL/RLS regression now passes.
- Initial mutation fixture referenced an absent column: corrected to the actual payload schema; passes.
- Child-only fixture initially omitted its required draft foreign key: changed to generate a valid operation through the real freeze RPC before isolating the child guard; passes.
- Focused SQL/API/client/component run: 70 tests passed before final added edge cases.
- Latest-schema SQL migration plus capture/recommendation regression run: 74 tests passed.
- Final added API recovery and SQL child/dependency cases: 23 tests passed.
- TypeScript passed. Lint passed with the existing app/v2/page.tsx loadChatHistory hook warning.

Full regression initially found the remaining old fractional-RPE projection assertion and one coaching-page failure under unrestricted worker load. Updated the intentional RPE contract assertion; the unchanged coaching test passed in isolation. The full bounded-concurrency run then passed: 3,049 passed, 19 skipped, zero failures. No unrelated coaching change was made.

No unresolved implementation blocker remains. CLI browser help printed successfully but exited with a Windows libuv assertion; dedicated browser session subsequently opened successfully. Browser setup initially used an unavailable URL global and left an interrupted navigation; corrected URL parsing and a fresh blank session resolved this. The local 390px browser journey passed recovery message, explicit release, fresh request ID, preserved September 25/5.5 text, cleared pending storage, and visible Workout logged status. Services were simulated; this does not prove hosted transport or live saving. The date query produces an existing hydration warning from the log page's server/client prefill behavior. No horizontal overflow was observed. A later evidence assertion ran after the transient success message disappeared; the immediately captured snapshot already confirms the message.

Evidence is under output/playwright/workout-save-recovery. The final full-suite JSON is vitest-final.json. Lint, TypeScript, production build (85 pages generated) and git diff --check passed; independent source review found no actionable findings. Build used placeholder Supabase configuration, not production credentials. No commit or push was made. Beads remains in_progress pending authorized production release and live verification.

## Release boundary

See docs/releases/workout-save-recovery-2026-09-26.md and ADR-0029. Database migration precedes application release. Numeric schema must not be narrowed on rollback. Preview is not an isolated database. No live save verification has been performed. No production fix should be claimed until migration, app release and authorized real-entry readback are complete.

## Approved release continuation

Greg explicitly approved applying the production migration and deploying the fix. Main advanced to a9373b4 (PR #84); preserve that coaching release and integrate this fix before release. Rename the new ADR to 0029 because upstream now uses 0022–0028.

Browser access blocker: inventory timed out twice; after reassessment, targeted Supabase browser selection returned documentation, but the next session/tab access timed out and reset the connection. Stop further browser probes pending restored connection. User was asked to reconnect the extension and leave Supabase open. No production mutation occurred. Continue independent release-branch preparation and CI. Original investigation-era Vercel CLI credentials were expired; do not repeat unchanged credential attempts or extract browser credentials.
