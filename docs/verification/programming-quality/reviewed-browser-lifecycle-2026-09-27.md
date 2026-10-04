# Reviewed browser lifecycle — local verification complete

Updated: September28, 2026. Tracker Fitness-Tracker-u5l.6.12.

## Final resumed verification

Greg approved the revised fresh-snapshot/single-action method. The old browser,
server and local VM had stopped. Existing local services restarted without reset;
the independently reviewed resume helper verified the exact original synthetic
actors and owned program/base before recovering Auth. No new fixture, migration
replay, password change or hosted operation occurred.

The same run now has durable assertion evidence:
`output/playwright/reviewed-browser-0b932874-d4a1-4e6c-804e-fec25b5adf1c/resumed-browser-receipt.json`.

- One correction appended revision2: 5 reps, 175lb, RPE7.5, rest180s. Original
  revision1 (6 reps, RPE7) remains unchanged; missing velocity stays unknown.
- Completion used exactly the latest report ID. The real handler returned200
  after commit; deliberately losing that response preserved request
  `e9db7a36-e59a-4e2b-b3ac-230e3dea34b1` across reload. Explicit resolution recovered
  workout `c460523f-d9ac-43ee-8d48-faf315a24ee4`. Other sets stayed unreported.
- Completed history is readable, with disabled save/correction controls. Same-week
  replacement preserved all five execution IDs and the saved workout; next-week
  acceptance created five fresh planned sessions without copying actual reports.
- Anonymous GET/POST returned401. Foreign session/proposal reads returned404;
  replay under a changed account returned409/account_changed; replacing expected
  owner with the foreign actor still returned404. Foreign UI showed only owned
  session unavailable. Restoring the athlete retained the same history and plan.
- Accepted-week and completed-session pages fit390x844 with content width390.
  Screenshots `reviewed-browser-next-week-mobile.png` and
  `reviewed-browser-completed-mobile.png` were visually inspected: readable
  wrapping, no horizontal clipping, completed status and corrected actuals shown.
  Console errors corresponded to deliberate response loss and denied access;
  no unexpected application error was observed.

Resume helper build/full nonincremental typecheck/scoped lint passed. Independent
review found no implementation blocker and reran26 route-wrapper/UI regressions,
all passing. Prior168 focused regressions and408 real database checks remain the
implementation baseline; no runtime application code changed during this resume.

One resumed readback assertion incorrectly required completed controls to be
absent. Inspection showed correctly disabled controls; the corrected read-only
assertion passed without repeating a save. A later inline screenshot-position
command failed Windows argument parsing before execution; file-based invocation
passed. Prior failures remain in the investigation. No unresolved failure cycle.

The original phase1 pass below is retained historical evidence; its browser-memory
assertion object did not survive browser closure. Its script, server HTTP receipt
and screenshot remain. The resumed assertions are independently persisted above.

This closes local component/HTTP-handler lifecycle verification only. Actual Next
SSR cookie/page integration is an explicit pre-activation task
`Fitness-Tracker-u5l.6.13`; W5 stays open. W10 quality evaluation, P0/P1 and rollout
are separate gates. Default numerical policy remains false and registry empty.
No hosted change, activation, commit or push occurred.

Canonical `.12` closed after final independent receipt/claim audit. Board87
delivered/read back event `164fe946-4f4a-40e5-9739-1dcb126ad4d9`.
Receipt SHA256: `79B0FCDEC840B8293376914F80F0DBCD637F339EE76DFB52EF32BD3A1BC5D59D`.
Temporary server stopped; live port3012 readback found zero listeners. Its
last-written server receipt still says listening (interruption did not run the
graceful-save callback). Preserve that historical log; do not infer live state.

## Harness scope

`scripts/release/reviewed-browser-{server,fixture,entry}` composes existing React
components and the actual reviewed HTTP handler factory with real synthetic local
Supabase Auth/PostgREST. Fixed server-owned recipes only. Credentials stay in
server memory; the browser uses an opaque HttpOnly SameSite cookie. Bind, Host,
Origin and database fetch checks restrict traffic to loopback; redirects fail.
Only exact static artifact routes are served. No application enable flag or
production registry change exists. This is component/handler browser proof, not
Next SSR cookie integration or hosted-release proof.

Bundle and full TypeScript check passed. Independent pre-launch review caught
a session-path mismatch and redirect-following gap; both were fixed before launch.

## Earlier verification and retained evidence

Server receipt:
`output/playwright/reviewed-browser-0b932874-d4a1-4e6c-804e-fec25b5adf1c/server-receipt.json`.
Loopback server 127.0.0.1:3012; database API 127.0.0.1:55321.
Named Playwright CLI browser: `reviewed-local`, 390x844.

`output/playwright/reviewed-phase1.js` passed. It drove the real proposal manager,
let issuance/acceptance reach the HTTP server and commit, then aborted each
response. Reload preserved exact pending identities. Issuance replay recovered
one proposal; acceptance resolution confirmed the active target. Owned DB readback
proved one accepted proposal and the matching active pointer. Full target/base
prescriptions displayed and the page fit390px. Screenshot:
`output/playwright/reviewed-browser-accepted.png`.

The session screen loaded the accepted bench-volume prescription with working-set
RPE/rest and unknown actual inputs. Phase2 reached set save and original retry
(both HTTP200), then timed out while filling the correction note. Do not claim
correction, completion, next-week transition or full browser acceptance yet.

## Historical stop and approved replacement method

Three automation attempts failed in this phase. They involved unsupported CLI
sandbox URL construction, exact label selection for a select, and the correction
note after recovery/refresh. See the issue investigation for evidence and counts.
Browser and synthetic rows are retained; no fixture reset or deletion occurred.
The revised method uses a fresh snapshot and one action at a time, with persisted
revision checks between stages. Approval was subsequently received and the
verification above completed. The original stop is retained for audit history.
