# Cutover preparation verification

Issue: Fitness-Tracker-i40.11. Owner: root. Local preparation only; production
cutover remains unapproved. Historical recovery/pause attempts are not reset.

## Revision byte preservation (local Git, cycle 1)

The reviewed local revision file has SHA256
`0a2983e79dfbfc7dada724d3af80916b74b61f50e4e0ee32056e5b7dd694f58f`.
Its 612 lines contain 588 CRLF endings and 24 bare LF endings. The prior Git blob
is LF-only, SHA256 `084ce3604b20809463c82f33a54434bd537a7f1a535ef7fe25f667a8088f544c`.
New raw-source checks would reject that checkout on Linux.

Attempt 1: set eol=crlf and inspect Git checkout filtering with autocrlf disabled.
Failed `Checkout hash mismatch`: all-CRLF bytes hash to `a3f8506e8680d0ad437101eb27d355c71a70014c9cfe43c69022d577da019c2a`.
This disproved uniform-CRLF source. No working migration bytes were changed.

Attempt 2: use -text for this exact path and ordinary targeted git add. Failed
`Reviewed bytes changed`: the index retained the old LF blob. Independent
review confirmed -text is the right policy, but ordinary add reused the existing
stat-cache entry. Read-only `git ls-files --eol` proves i/lf, w/mixed, attr/-text;
working and index hashes above remain unequal. SQL content is equal ignoring CR.

Reassessment before attempt 3: force Git's normal attribute reapplication using
`git add --renormalize -- <this exact file>`, which refreshes the tracked blob
under -text rather than editing or normalizing the working bytes. Then require
staged/checkout SHA256 exactly 0a2983 and an empty ignore-space-at-eol SQL diff.
This is the third bounded verification attempt. If it fails, stop this blocker
and request approval for a revised method. No reset, checkout or user-file deletion.

Attempt 3 passed. Targeted attribute reapplication stored the exact reviewed
0a2983 bytes. Both the staged blob and Git checkout filtering with autocrlf=false
hash to that value. The staged SQL diff is empty when line endings are ignored.
The byte-preservation blocker is resolved; no further remedy is needed.

The ordinary staged whitespace check then flagged the preserved CR characters
as trailing whitespace. A path-specific whitespace attribute identifies CR as
an end-of-line character while retaining blank-at-eol, blank-at-eof and
space-before-tab checks. No SQL byte was changed or broad whitespace check disabled.
