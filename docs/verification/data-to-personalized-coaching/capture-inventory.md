# Capture integration inventory

Pre-W2 source inspection, 2026-09-17. This is implementation context, not package status or acceptance evidence.

| Adapter | Existing boundary | Required integration |
| --- | --- | --- |
| /api/parse-workout, /api/meals/parse-text | replayJsonRequest -> saveActivity | Shared normalized provenance, child commit/revision receipt; keep parser and response compatibility |
| /api/meals/upload | explicit beginRequest + saveActivity with response | Photo result/meal/receipt remain atomic; transient bytes; occurrence versus estimate review |
| /api/meals/quick-log | direct meals insert, log_request_id uniqueness | Existing replay does not compare full payload; reviewed_at invents fresh review; use ledger and source-preserving copy |
| /api/foods/log | catalog upsert then direct meals insert | Replay is ID-only; preserve manual-label snapshots, shared meal commit and truthful partial catalog status |
| /api/meals/analyze, /api/meals/refine, /api/meals/[id] | direct update/delete | Expected revision, amendment snapshots, deterministic totals, invalidation |
| /api/agent/process | parent ledger, model tool loop, fallback persistWorkout/persistMeal | Server-owned intent and frozen operation list; model tool calls must not create authority; no fallback writes for questions |
| agents/tools/executor | saveActivity for logs; direct updates and separate PR writes | Stable child IDs, draft collection/commit barrier, per-child receipts; updates through amendments; deterministic PR projection |
| agents/tools/agentic-loop | writes execute each model round; exhausted loop claims Done | Repeated tool calls need same child; partial failures must not claim completion; freeze all normalized authorized occurrences before first mutation |
| MealInputEnhanced, MealCameraCapture, v2 | sendLoggingRequest | Existing signature key changes on edit; reconcile original unknown create before edit/new identity; account scope |
| FastMealLogger | bespoke in-memory request IDs, direct fetch | Stable timestamp/payload across retry/reload; shared reconciliation and explicit new occurrence |
| offline-queue | global localStorage JSON queue, optional owner, serialized File | Account-scoped IndexedDB transient blob; expired legacy bytes need reselection; no canonical totals before save |

No runtime changes were made for W2 during this inspection. W1/W3 integration continues. Existing dormant workout queue is excluded.
