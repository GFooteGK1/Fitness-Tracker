---
inclusion: fileMatch
fileMatchPattern: '**/{agents,agent,v2}/**/*.{ts,tsx}'
---

# Agent System Development Guide

## Architecture: Passive Context + Fast Classification

This project implements a multi-agent system following passive-context architecture.
Core principle: every agent gets full context in its system prompt — no on-demand skill invocation.

## Architecture Rules

1. Every agent gets full passive context in its system prompt. Never require an agent to "decide" to fetch information.
2. The Classifier is NOT conversational. It returns JSON only. Uses Claude Haiku for speed.
3. Agents return JSON. The API route assembles responses. Agents do not format for the UI.
4. Smart defaults over follow-up questions. Only ask when impact exceeds defined thresholds.
5. Socius pattern checks are async. Fire and forget after logging.
6. Confidence values are always numeric (0.0–1.0), never string-based.
7. Context builders use inheritance: `PassiveContext` base, domain builders extend it.
8. Prompt builders are functions that take typed context and return interpolated strings.

## File Structure

```
app/
├── api/agent/process/route.ts     ← Unified entry point
├── lib/agents/
│   ├── types.ts                   ← All TypeScript interfaces
│   ├── constants.ts               ← Movement aliases, portion defaults
│   ├── classifier.ts              ← Classifier logic (Haiku)
│   ├── router.ts                  ← Routing logic
│   ├── preprocessor.ts            ← Voice/photo preprocessing
│   ├── context-builder.ts         ← Passive context builders
│   ├── chat-persistence.ts        ← Chat message CRUD
│   ├── chat-compaction.ts         ← Message compaction
│   ├── trainer-agent.ts           ← Trainer agent logic
│   ├── nutritionist-agent.ts      ← Nutritionist agent logic
│   ├── socius-agent.ts            ← Socius agent logic
│   ├── socius-background.ts       ← Background pattern detection
│   └── prompts/
│       ├── classifier.ts          ← Classifier prompt builder
│       ├── trainer.ts             ← Trainer prompt builder
│       ├── nutritionist.ts        ← Nutritionist prompt builder
│       └── socius.ts              ← Socius prompt builder
└── v2/
    ├── page.tsx                   ← Single-page mobile chat UI
    └── components/
        ├── ChatArea.tsx
        ├── InputBar.tsx
        └── BottomNav.tsx
```

## Existing Code to REUSE (do not rewrite)

- `app/lib/auth/*` — Authentication (createServerClient, AuthContext, ProtectedRoute)
- `app/lib/imageUtils.ts` — Image compression
- `app/lib/macro-validation.ts` — Macro validation
- `app/lib/adherence-calculator.ts` — Adherence calculations
- `app/lib/whoop/*` — All WHOOP integration code
- `app/api/transcribe-audio/route.ts` — Voice transcription

## Existing Code to NOT MODIFY

- `app/api/parse-workout/route.ts` — Keep as fallback
- `app/api/meals/*` — Keep as fallback
- `app/api/query/route.ts` — Keep as fallback
- `app/dashboard/*` — Must remain fully functional

## Models

- Classifier: `claude-haiku-3-20241022` (temperature 0, max_tokens 256)
- Agents: `claude-sonnet-4-20250514` (Trainer, Nutritionist, Socius)

## Database Tables (New)

- `chat_messages` — Persisted conversation with input_mode, input_type, is_compacted
- `insights` — Socius pattern detections with numeric confidence

## Agent Icons & Colors

| Agent | Icon | Label Color | Message Bg |
|-------|------|-------------|------------|
| Trainer | 🏋️ | text-blue-700 | bg-blue-50 |
| Nutritionist | 🥗 | text-green-700 | bg-green-50 |
| Socius | 🔮 | text-purple-700 | bg-purple-50 |
| System | ⚙️ | text-gray-500 | bg-gray-50 |

## Pattern IDs (Socius)

CAL_DEF, OVER_TRN, NUT_PERF, REC_VOL, PRO_REC, SLEEP_PERF, HRV_TREND, STRAIN_NUT, HYDRA, CON_PROG
