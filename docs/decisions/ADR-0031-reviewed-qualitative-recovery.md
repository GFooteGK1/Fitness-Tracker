# ADR-0031: Preserve qualitative preparation recovery

Status: accepted for local contract implementation; weekly-context review and
database application are separate and pending.
Date: September 28, 2026. Tracker: Fitness-Tracker-u5l.6.14.

The accepted C2-R preparation says rest as needed. The reviewed weekly/session
contract previously accepted numeric rests only. Coercing qualitative recovery
to zero or a fixed duration would change the reviewed prescription.

Keep numeric rest values and schema-1 sessions unchanged. Preparation activities
may instead carry `{kind:'as_needed', estimatedSeconds:number}` in the existing
rest fields. Require a positive finite explicit estimate and a reviewed session
instruction for exceeding available time. These records use session schema 2;
schema 1 rejects conditional content. The instruction and estimate are part of
the exact source-bound recipe, not caller-supplied enablement or fit authority.

The estimate contributes once to arithmetic, while the offline result and
visible session card label fit conditional. Never cap recovery using that
estimate. Working/monitoring recovery and fixed preparation windows do not allow
this form; a one-set activity cannot hide an unused qualitative between-set rest.
The corresponding database constraint migration is prepared only, preserving
parent-plan equality and all owner/registration guards. No historical rewrite.

Actual-rest reports stay numeric or unknown and are never populated from the
prescribed estimate. This change supplies representation, not physiological
feasibility, missing weekly review, new registry authority or numerical activation.

Rejected alternatives: prose-only recovery with numeric zero contradicts the
structured prescription; an optional cue beside a fixed number creates two
authorities; changing existing schema-1 snapshots would corrupt accepted history.
