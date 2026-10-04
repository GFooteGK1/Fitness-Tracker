# Actual Next authentication and reviewed-page verification

September 28, 2026. Canonical task `Fitness-Tracker-u5l.6.13`.

The actual Next pages, AuthProvider, ProtectedRoute and reviewed route wrappers
passed against the retained synthetic local Auth/PostgreSQL fixture. This closes
the Next authentication integration gap. W5 remains open for the separate C2-R
whole-week reconciliation task `Fitness-Tracker-u5l.6.14`.

## Defect and fix

Next 15 returned asynchronous cookies; the installed auth-helpers 0.8 adapter
read its callback synchronously. Real reviewed requests exposed the diagnostic
`cookies() should be awaited before using its value`. The server helper now
awaits the request-local cookie store before passing it to the legacy adapter.
The narrow type bridge matches that installed adapter's runtime. No auth policy,
service client, package version or numerical capability changed.

Deferred-cookie, request-isolation and error-propagation regressions pass.
Auth and reviewed-route coverage passed 244 tests across 24 suites; full
nonincremental TypeScript and scoped lint passed. An independent reviewer
confirmed the adapter behavior and separately passed 12 focused tests.
Actual Next requests after the fix produced no synchronous-cookie diagnostic.
Canonical and tested-copy auth file SHA256:
`bcb45d49600df2e48d8ac38bbf720ccdc8d59e565980e014545f107fb315f13f`.

## Runtime evidence

- Default-off source: anonymous protected page redirects to sign-in; reviewed
  GET and POST return 401. Authenticated requests return 409 disabled, including
  attempts to enable behavior through request query/body fields.
- Isolated enabled copy: actual browser cookie session survives server restart;
  owned session and saved proposal reads return 200. Completed session retains
  both immutable reports and the latest correction (5 reps, RPE 7.5, 180s rest).
- Exact original completion replay and resolution return the original workout
  `c460523f-d9ac-43ee-8d48-faf315a24ee4`. Report history is unchanged.
- Foreign reads return 404; account-switch completion returns 409; forged owner
  returns 404. Actual application User menu > Sign Out redirects to sign-in and
  subsequent GET/POST return 401 while the test copy remains enabled.
- Restoring the original actor renders the accepted next-week proposal, dates,
  target effort and rest. Session and proposal fit a 390px viewport without
  horizontal overflow; completed mobile session screenshot was visually reviewed.
- Explicit foreign Host, missing Origin and foreign Origin probes each return
  403. These are generated local-server restrictions, not production middleware.

Safe proof: `output/playwright/next-auth-integration-proof.json`, SHA256
`BF9A535DECA1838B215AE6BFFC0C634EB6C9D19518DF38D6FD5A9AFAE163C45D`.
Inbound proof: `output/playwright/next-inbound-boundary.json`.
Visual: `output/playwright/next-completed-mobile.png`.
Copy manifest: `output/app-quality-release/reviewed-next-d1ef6e95-87a4-46ab-8590-8bd1a3d3582c/receipt.json`.
Original fixture: `0b932874-d4a1-4e6c-804e-fec25b5adf1c`.

## Isolation and limits

`scripts/release/reviewed-next-local.mjs` copies and hashes current source into an
ignored runtime without env/git/Vercel state. It restricts the server to loopback
3013 and local Supabase 55321, verifies original actor identity, and uses the real
app browser auth helper. Enabling is restricted to the generated development
copy with its unique opt-in ID. Canonical policy remains false and registry empty;
the generated copy also has no recipe registry. No new recipe was issued here.

Password/email-delivery UX, expired-token renewal, new issuance through Next,
hosted behavior and coaching-quality acceptance are not established by this
check. No new workout/set, reset, reseed, migration, hosted write or paid call
occurred. Both temporary Next servers are stopped; port 3013 has no listener.
Local database rows and all receipts remain retained. Nothing was committed or
pushed in this batch.
