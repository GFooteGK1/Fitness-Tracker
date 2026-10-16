# 0037 - Separate local response loss from native application completion

- Status: Accepted for offline transport preparation; live qualification pending
- Date: 2026-10-06
- Scope: Fitness-Tracker-i40.17.5.1.1; local qualification tooling only

The accepted local first-review cycle exposed a fault-injection defect. Patching
Next's ServerResponse write/end leaked successful headers and prevented the
installed writer's finish promise from resolving. Application acceptance was
saved, but whole-response loss and clean shutdown were not established.

Use a private native HTTP application response behind the browser-facing gate.
The outer gate retains exact fixture/origin/request-key admission. An in-memory,
random, one-use capability binds the private method, path/query, body and browser
headers. The private endpoint binds only loopback and strips its capability
before Next. The future operator fixes the private port to3015; native tests use
ephemeral loopback ports. No arbitrary target, redirect, upgrade or retry exists.

Consume the complete body and await the actual native handler before synchronous
evidence recording. Drop the entire successful response only after that evidence
is saved. Cookies and browser Host/Origin remain intact. Request identity is never
replaced after an uncertain write. Node HTTP receives raw encoded bytes, so the
transport requests identity encoding and rejects unexpected compression before
capture/delivery. It does not silently strip a required compression header.

Use one admission deadline through bounded request intake, native exchange,
completion, capture and delivery. Check the clock around synchronous capture.
Timeout and evidence failure remain inspect_required. Only an explicit premature
peer disconnect may receive the harmless completed-GET disposition. Native drain,
outer drain, server close and Next close have bounds; timeout never proves clean
shutdown. Existing Auth SDK overall-deadline behavior is not established here.

Keep the original operators and frozen runtime receipts. The new relay operator
retains historical eligibility and refuses the already accepted program; it is
not a ready fresh-fixture runner. A new reviewed fixture/operator packet and
explicit scoped local Auth/database authority precede real qualification.

Independent design/test critique, code review and27 passing Node tests accept
the offline fix. Native HTTP with the installed Next writer proves transport
behavior; simulated acceptance/disable is not real Auth/PostgreSQL recovery.
Evidence: ../verification/programming-quality/response-relay-integration-2026-10-06.md.
