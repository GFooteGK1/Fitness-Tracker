# W5 proposal resolution verification

Workspace: `.worktrees/programming-quality`. Owner: programming-quality thread.
Scope: local synthetic fixtures only. No hosted change or migration replay.

## 2026-09-28 UTC: expiry fixture failure, attempt 1

The local transaction harness stopped at `Expired fixture proposal retained`.
Receipt: `output/app-quality-release/reviewed-proposal-e1eff76d-334a-4718-bf26-3764992fddaf/receipt.json`.
The fixture updated status to expired without decided_at. Read-only local schema
inspection confirmed `adaptation_proposals_decision_time` requires a non-null
decision time for every non-proposed status. The actual expiry function sets both.
This is a fixture defect; previous closure checks passed. Add the missing time
and retain sanitized SQL errors in fixture assertions, then rerun the harness.
Installed migration 20260928080000 remains unchanged. Attempt count: one;
next allowed action: corrected fixture verification.

## Resolution and independent review

Corrected fixture run passed 404 checks, receipt
`reviewed-proposal-b2eec0b8-6ad8-4c97-aeb7-fcff9db82c10/receipt.json`.
No remaining expiry failure. Independent review identified an overly strict race
assertion: a registration saved before closure may replay its reserved metadata.
That is intentional and grants no issuance. The assertion now allows exact
metadata replay while requiring issuance denial and no tentative target plan.
A deterministic already-registered closure check covers that branch even when
the concurrent race chooses the opposite order. This was caught in review, not
an unresolved execution failure. Next check: final corrected race harness.

Final corrected harness passed408checks, receipt
`reviewed-proposal-bc8e62fb-3703-46f8-9592-651467ebaf9f/receipt.json`.
HTTP handler closure is now verified through local Auth/PostgREST as well.
Status: resolved; no open failure cycle. Actual browser lifecycle remains a
separate acceptance check.

## Browser harness, September28 UTC

Pre-launch review fixed harness-only session path mismatch and disabled fetch
redirects. Bundle and full tsc passed. Local server run
0b932874-d4a1-4e6c-804e-fec25b5adf1c is retained. Proposal issuance and acceptance
response-loss/reload phase passed in Chromium.
CLI help printed then emitted Windows UV_HANDLE_CLOSING; named-session open passed.
Inline PowerShell quoting failed before execution; file-based invocation works.
Phase2 attempt1 failed before actions: `ReferenceError: URL is not defined`.
Replaced unnecessary constructor with splitting the observed URL. Attempt2 timed
out at exact getByLabel Movement before mutation. Fresh snapshot confirms enabled
combobox Movement; enclosing label contains option text. Reassessed selectors:
use observed accessible role/name for selects, exact labels for inputs. Server
receipt confirms no set POST. Third bounded attempt uses those selectors.

Attempt3 progressed: real set POST200 followed by original retry POST200, then
timed out filling `getByLabel('What changed and why?', { exact: true })` in the
correction flow. It did not reach correction-save or completion. Stop this
automation sequence: three attempts in this cycle. Do not rerun phase2 from its
beginning or reset pending state. Set/session evidence is retained in browser
and database. A subsequent CLI find invocation with a pipe was rejected by
Windows argument handling before inspection; use file-based invocations only.

### Revised method awaiting Greg's approval

Use one browser action per fresh snapshot. Start with the retained session and
read-only evidence of pending/history; do not create another fixture or repeat
the initial save. Wait for both pending recovery and current history to settle,
then open correction, re-snapshot and target observed input refs. Save exactly
one correction and verify its persisted revision before completion. Proceed to
completion, same/next-week continuity and foreign-account checks as separate
stages, each with explicit readback. This removes long action-chain timing and
assumed label semantics. No production writes or policy enablement. Approval
requested through async user input; no further browser probes while pending.
The existing loopback server process is retained for continuity.

### September28 approval and resumed cycle

Greg explicitly replied "approved" after the browser-method clarification.
The fresh-snapshot/single-action method is authorized for a new bounded cycle
(at most three failed substantive attempts). Prior three failures remain logged.
First continuity check: unified exec handle91448 is missing. Inspect the actual
loopback listener/process and named browser before any restart; this handle result
does not authorize a new fixture or replay of a prior save.

Original browser/server and local VM were stopped. Existing stack restarted
without reset. Reviewed resume mode verified exact original synthetic actors and
owned program/base; no new fixture or password change. Build/full tsc/lint and
independent review passed. Same run resumed at localhost3012.
Correction revision2 saved once (5 reps, RPE7.5); original revision1 retained.
Completion committed with revision2 before deliberate response loss. Reload
preserved request e9db7a36-e59a-4e2b-b3ac-230e3dea34b1; resolve recovered workout
c460523f-d9ac-43ee-8d48-faf315a24ee4.

Resumed-cycle first readback assertion wrongly expected completed controls to be
absent. Fresh snapshot showed disabled inputs/save/correction and writable=false.
Changed only that test assertion to require disabled controls. Read-only rerun
passed; no save repeated. Failure resolved. Continue separate continuity and
account-boundary stages; earlier stopped cycle remains recorded above.

Final continuation passed same/next-week identity/history checks, anonymous and
foreign rejection, changed-account retry denial, restored-owner readback, and
390px mobile checks. One later inline screenshot-position command failed Windows
argument parsing before browser execution; file-based invocation passed. No
unresolved blocker remains in this bounded local browser sequence. Receipt:
output/playwright/reviewed-browser-0b932874-d4a1-4e6c-804e-fec25b5adf1c/resumed-browser-receipt.json.
Next SSR cookie/page integration is explicitly tracked in u5l.6.13; local harness
proof does not close that gate or broader W5/W10/P0/P1/production acceptance.
