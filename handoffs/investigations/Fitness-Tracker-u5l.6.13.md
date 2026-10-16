# Actual Next authentication integration

September28. Retained fixture run0b932874-d4a1-4e6c-804e-fec25b5adf1c.
Generated runtime d1ef6e95-87a4-46ab-8590-8bd1a3d3582c under
output/app-quality-release. Canonical numerical policy remains disabled.

Preparation sandbox denied mkdir before copying; authorized elevated preparation
passed. Initial never-launched copy0d59df57 retained. Independent review required
global inbound Host/Origin restriction; generated middleware added and verified
before launch. No fixture creation/reset/password change occurred.

Actual Next anonymous protected page redirected to /auth/signin and reviewed
GET/POST returned401. Diagnostics exposed `cookies() should be awaited before
using its value` in supabase-server.ts. Installed Next15.5.25 returns Promise
cookies while auth-helpers0.8.7 reads its callback synchronously. Await cookies
before creating that adapter; bridge the legacy declaration only at this boundary.
Preserve readonly behavior and service client. Add pending-cookie/per-request/error
regressions and record source update hashes before authenticated runtime checks.
First discovered integration defect; no repeated blind browser retries.

Resolved: helper awaits the request-local store.244 auth/route tests, full
nonincremental tsc and scoped lint passed. Independent reviewer passed12 focused
tests and verified the installed adapter and matching source/copy hashes. Actual
Next authenticated reads/replays, account switch, normal menu logout and accepted
proposal rendering passed without the cookie diagnostic.

Two test-method corrections are retained: a rendered text assertion compared
CSS-capitalized innerText; inspecting textContent confirmed the content and the
corrected read-only assertion passed. Node fetch did not establish the intended
foreign Host request; an explicit raw HTTP header probe returned403, then all
three Host/Origin checks passed. Neither required mutation retry or server change.
No unresolved repeated-failure cycle remains.

Runtime d1ef6e95 stopped after verification; port3013 listener check is empty.
See reviewed-next-auth-2026-09-28.md for proof hashes and scope limits. W5 remains
open: exact C2-R session has not yet traversed the complete persisted week path.
