# ADR-0031: Attended setup lifecycle verification

Status: accepted for local preparation; hosted execution requires separate approval.
Date: 2026-09-27. Tracker: Fitness-Tracker-i40.15.1.

## Decision

Keep production verification outside the application runtime. Freeze one manifest
with the candidate deployment, migration digest, paused generation, two synthetic
owners and all request identities. An owner-only worker performs the44 reviewed
steps. A privileged operator accepts only reconstructed fixed SQL. Each fixture
transaction holds the coaching control row's shared lock through commit and
requires the exact open generation. The guardian runs in a separate execution
session, verifies worker termination, then commits and observes the global pause.

The worker has180 seconds; containment must begin by185 seconds and closed-state
observation must finish by210 seconds. These are acceptance limits, not a promise
that a disconnected database can be controlled. An uncertain response preserves
its intent and never permits automatic replay. Missing containment evidence keeps
the release failed and requires attended recovery.

Run-local DPAPI protects the AES-GCM journal key. Requests and responses remain
encrypted. Exclusive operation intents prevent replay; named cross-process
signals publish through a flushed atomic hard link. A cleanup error after signal
publication cannot invalidate that signal. Database expiry is observed using the
database clock, conservatively beyond the same millisecond, rather than inferred
from the Windows clock.

Before opening and after containment, hash all rows of eight coaching tables,
excluding only the exact two synthetic owners. Compare accepted intent, input
snapshot and session prescriptions separately. A non-synthetic difference makes
isolation evidence inconclusive; never restore athlete records to make it pass.
Recovery takes a fresh audit and exact-generation readback, preserving older
receipts. Successful verification leaves production coaching paused.

## Credential and process boundaries

The prepared hosted runner receives approved credentials through secure stdin;
it does not discover them. One fixed Management API request issues a temporary
SQL login and stores it encrypted for all independently initialized transports.
No transport invokes CLI login or rotates the shared credential. Both its stated
lifetime and database role validity must cover containment. Each pinned rootless
SQL client has TLS verification, no host mounts, no logs and a tmpfs passfile.
Cleanup checks the saved container identity and label before stopping it.

The pinned CLI 2.117.0 initializes a temporary role on its connection path and can
remove network bans after repeated pooler failures. That behavior is outside
this verification scope. The prepared direct request has no retry or unban path.
Sources: [pinned CLI source](https://raw.githubusercontent.com/supabase/cli/v2.117.0/apps/cli-go/internal/utils/flags/db_url.go)
and [temporary login API](https://supabase.com/docs/reference/api/v1-create-login-role).

## Alternatives and consequences

Setup's pre-install readback shares the fixed login-request function. Its command
requires an explicit issuance flag and secure token stdin, with no CLI fallback.
It permits only the existing read-only preflight SQL and remains separate from
the lifecycle manifest. Credential issuance still requires explicit approval.

An in-process watchdog cannot survive coordinator loss. Preview shares production
data, so it is not an isolation boundary. A synthetic-only pause exception would
change production authorization; this preparation does not add one. The existing
global switch briefly allows other athlete writes during an approved live check,
which must be disclosed in that approval.

The full lifecycle, independent-session containment, worker failure, coordinator
crash, history audits and shared provisioning passed locally. Hosted assembly and
login issuance are source-reviewed/tested with fake network responses; they have
not contacted production. See the [execution packet](../verification/programming-quality/setup-live-execution-packet-2026-09-27.md).
