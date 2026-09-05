# SociusFit Architecture Map

> **Purpose**: This document provides a comprehensive map of how features, components, and systems are interconnected in the SociusFit application. Use this to understand the impact of changes before making modifications.

## 🏗️ **High-Level Architecture Overview**

```
┌─────────────────────────────────────────────────────────────────┐
│                        SociusFit App                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 15)     │  Backend (API Routes)             │
│  ├─ Authentication System  │  ├─ Auth APIs                     │
│  ├─ Profile Management     │  ├─ Profile APIs                  │
│  ├─ Dashboard              │  ├─ Dashboard Stats               │
│  ├─ Food Tracking          │  ├─ Meal APIs                     │
│  ├─ Workout Tracking       │  ├─ Workout APIs                  │
│  └─ Shared Components      │  └─ Utility APIs                  │
├─────────────────────────────────────────────────────────────────┤
│                    External Services                            │
│  ├─ Supabase (Database + Auth)                                 │
│  ├─ Anthropic + OpenAI via app/lib/llm (AI Analysis)           │
│  └─ Vercel (Hosting + Deployment)                              │
└─────────────────────────────────────────────────────────────────┘
```

## 🔐 **Authentication System**

### **Core Components:**
- **AuthContext** (`app/lib/auth/AuthContext.tsx`) - Central auth state management
- **Supabase Clients** (`app/lib/auth/supabase-*.ts`) - Database connections
- **Protected Routes** (`app/components/auth/ProtectedRoute.tsx`) - Route guards

### **Pages & Forms:**
```
Authentication Flow:
├─ Sign Up (`app/auth/signup/page.tsx`)
│  └─ SignUpForm (`app/components/auth/SignUpForm.tsx`)
├─ Sign In (`app/auth/signin/page.tsx`)
│  └─ SignInForm (`app/components/auth/SignInForm.tsx`)
├─ Auth Callback (`app/auth/callback/route.ts`)
└─ Onboarding (`app/onboarding/page.tsx`)
   ├─ BodyMetricsForm (`app/components/profile/BodyMetricsForm.tsx`)
   └─ GoalsSelection (`app/components/profile/GoalsSelection.tsx`)
```

### **API Routes:**
- `/api/profile/onboarding` - Complete profile setup

_(Auth itself is handled client-side via Supabase in `AuthContext`; there are no `/api/auth/*` route handlers.)_

### **Dependencies:**
- **Database**: `user_profiles` table in Supabase
- **External**: Supabase Auth service
- **Types**: `app/lib/auth/types.ts`

### **Impact Analysis:**
⚠️ **High Impact**: Changes to AuthContext affect ALL protected pages
⚠️ **Medium Impact**: Changes to auth forms affect user onboarding flow
⚠️ **Low Impact**: Changes to individual auth pages are isolated

---

## 👤 **Profile Management System**

### **Core Components:**
```
Profile System:
├─ Profile Page (`app/profile/page.tsx`)
├─ Body Metrics Form (`app/components/profile/BodyMetricsForm.tsx`)
├─ Goals Selection (`app/components/profile/GoalsSelection.tsx`)
└─ User Menu (`app/components/UserMenu.tsx`)
```

### **API Routes:**
- `/api/profile` (GET/PUT) - Fetch/update user profile
- `/api/profile/onboarding` (POST) - Complete initial setup

### **Data Flow:**
```
User Input → Form Component → AuthContext.updateProfile() → API Route → Supabase → UI Update
```

### **Dependencies:**
- **AuthContext** for profile state
- **Supabase** `user_profiles` table
- **Types** from `app/lib/auth/types.ts`

### **Impact Analysis:**
⚠️ **High Impact**: Profile API changes affect onboarding AND profile editing
⚠️ **Medium Impact**: Form component changes affect user experience
⚠️ **Low Impact**: UI styling changes are isolated

---

## 📊 **Dashboard System**

### **Core Components:**
```
Dashboard:
├─ Dashboard Page (`app/dashboard/page.tsx`)
├─ Dashboard Stats API (`app/api/dashboard-stats/route.ts`)
├─ Deterministic Aggregates (`app/lib/aggregates/dashboard.ts`)
├─ Versioned View Templates (`app/lib/view-templates.ts`)
├─ View Template API (`app/api/view-templates/[viewType]/route.ts`)
├─ Async Narrative Component (`app/components/DashboardNarrative.tsx`)
├─ Narrative API (`app/api/dashboard-narrative/route.ts`)
├─ Compute-vs-Compose Guard (`app/lib/dashboard-narrative.ts`)
├─ Narrative Orchestration (`app/lib/dashboard-narrative-service.ts`)
├─ User-Scoped Cache Adapter (`app/lib/dashboard-narrative-store.ts`)
└─ Error Boundary (`app/components/ErrorBoundary.tsx`)
```

### **Hybrid Render Invariant:**
```
Supabase domain tables/views → app-computed facts → deterministic cards (immediate)
                                  └─ versioned template + LLM seam → validated narrative (async)
                                                                       └─ view_compositions cache
```

The app remains authoritative for every number. The model can only compose a
bounded headline, summary, and section-tagged highlights; output containing a
number absent from the deterministic facts is rejected. The narrative cache is
private per user and keyed by local day, template version/content, and facts
content. A relevant new log changes the facts fingerprint and causes a cache
miss without write-path invalidation hooks. If the API, cache, or provider is
unavailable, the existing numeric dashboard remains usable.

### **Data Sources:**
- **Workouts** from `workouts` table
- **Block Scores** from `block_scores` table (optional)
- **User Profile** for personalization
- **Compact workout/recovery facts** from `get_programming_readiness_context`
- **Local-day nutrition facts** regrouped from user-scoped `meals` using the
  caller timezone offset, plus current `daily_targets`
- **Recent records** from `personal_records`
- **Ephemeral composition cache** from `view_compositions` (presentation only)

### **Dependencies:**
- **Authentication** (protected route)
- **Multiple Database Tables** (workouts, block_scores, user_profiles)
- **Provider-neutral LLM seam** (`app/lib/llm/client.ts`) for narrative composition
- **Error Handling** for graceful failures

### **Impact Analysis:**
⚠️ **Medium Impact**: Dashboard changes affect main user landing page
⚠️ **Low Impact**: Stats API changes are isolated to dashboard

---

## 🍽️ **Food Tracking System**

### **Core Components:**
```
Food Tracking:
├─ Food Progress Page (`app/food-progress/page.tsx`)
├─ Meal Components:
│  ├─ FastMealLogger (`app/components/FastMealLogger.tsx`)
│  ├─ MealCameraCapture (`app/components/MealCameraCapture.tsx`)
│  ├─ MealEntryCard (`app/components/MealEntryCard.tsx`)
│  ├─ MealEditModal (`app/components/MealEditModal.tsx`)
│  └─ MealDisplayExample (`app/components/MealDisplayExample.tsx`)
├─ Progress Views:
│  ├─ DailyProgressView (`app/components/DailyProgressView.tsx`)
│  └─ WeeklyAdherenceView (`app/components/WeeklyAdherenceView.tsx`)
└─ Integration (`app/components/FoodTrackingIntegration.tsx`)
```

### **API Routes:**
```
Meal Management:
├─ /api/meals/common - Deterministic common/recent meal projection
├─ /api/meals/quick-log - Idempotent snapshot copy with a fresh timestamp
├─ /api/meals/upload - Photo upload & AI analysis
├─ /api/meals/analyze - AI nutrition analysis
├─ /api/meals/daily - Daily meal summaries
├─ /api/meals/[id] - Individual meal CRUD
└─ /api/meals/cleanup - Photo cleanup

Reviewed Food Facts:
└─ /api/foods/log - Manual-label catalog upsert and deterministic meal log
```

### **Supporting Systems:**
```
Target Management:
├─ TargetManagement (`app/components/TargetManagement.tsx`)
├─ /api/targets - Nutrition targets CRUD
└─ target-management.ts (`app/lib/target-management.ts`)

Adherence Tracking:
├─ /api/adherence/weekly - Weekly adherence calculation
└─ adherence-calculator.ts (`app/lib/adherence-calculator.ts`)
```

### **Native Automatic Meal Photos (local compile harness; not deployed):**
```
Apple Camera
  └─ PhotoKit background-upload extension (`ios/BackgroundUpload`)
       ├─ full read-write authorization + enable/disable host UI (`ios/App`)
       ├─ deterministic pending/processed ledger (`ios/Shared`)
       ├─ future on-device food gate (not implemented)
       └─ future private review-first ingestion endpoint (not implemented)
```

ADR-0005 owns this boundary. The current native target contains a fail-closed
physical-device protocol probe. Its committed upload URL is
`https://example.invalid`, so it cannot upload in repository configuration.
With a separately approved private HTTPS endpoint, it baselines persistent
changes, selects at most the newest inserted image, and registers one PhotoKit
upload job. The disposable endpoint contract answers `OPTIONS` with `501`,
discards the POST body, and never creates a meal. A credential-free GitHub macOS
workflow generates the project from `ios/project.yml`, runs the pure ledger and
signing-contract tests, and compiles the app and extension without signing. A
separate manual-only workflow can sign and upload one internal TestFlight build
after approval in the protected `TestFlight` environment. Apple portal records,
signing material, the upload endpoint, workflow dispatch, device credentials,
server ingestion, and automatic meal creation remain outside the active runtime.
The canary does not use an App Group unless Apple proves one is required.

### **Utility Libraries:**
- **Storage** (`app/lib/storage.ts`) - File management
- **Meal Storage** (`app/lib/meal-storage.ts`) - Meal data persistence
- **Macro Validation** (`app/lib/macro-validation.ts`) - Nutrition validation
- **Meal Photo Analysis** (`app/lib/nutrition/meal-photo-analysis.ts`) -
  provider-neutral vision prompt plus one bounded parser that validates every
  item, total, and confidence value and recomputes canonical totals before the
  upload or analyze route can persist nutrition data
- **Offline Queue** (`app/lib/offline-queue.ts`) - Offline support

### **Dependencies:**
- **Provider-neutral LLM seam** (`app/lib/llm`) for per-task Anthropic/OpenAI analysis
- Meal images are analyzed in-request and discarded; `photo_url` remains null
- Common meals are derived from exact non-review-pending `meals` snapshots; no
  LLM or mutable common-meal template is involved
- Manual nutrition-label facts are review-gated and stored in private
  `food_catalog_entries`; logged meal items retain immutable macro snapshots
- **Database Tables**: `meals`, `food_catalog_entries`, `daily_targets`, `daily_summaries`
- **Types**: `app/lib/types/food-tracking.ts`

### **Impact Analysis:**
⚠️ **High Impact**: Changes to meal storage affect ALL food tracking features
⚠️ **High Impact**: API route changes affect mobile app functionality
⚠️ **Medium Impact**: Component changes affect specific UI areas
⚠️ **Low Impact**: Individual meal component changes are isolated

---

## 🏋️ **Workout Tracking System**

### **Core Components:**
```
Workout System:
├─ Log Workout Page (`app/log/page.tsx`)
├─ Coach Conversation (`app/coach/page.tsx`, shared V2 client)
├─ Legacy Query Redirect (`app/query/page.tsx` → `/coach`)
├─ Workout APIs:
│  ├─ Parse Workout (`app/api/parse-workout/route.ts`)
│  ├─ OCR Workout (`app/api/ocr-workout/route.ts`)
│  ├─ Workouts Data (`app/api/workouts/route.ts`)
│  ├─ Transcribe Audio (`app/api/transcribe-audio/route.ts`)
│  └─ Query Interface (`app/api/query/route.ts`)
└─ Fitness Insights (`app/api/fitness-insights/route.ts`)
```

### **Input Methods:**
```
Multi-Modal Workout Logging:
├─ Manual Text Entry (traditional typing)
├─ Photo Capture & OCR (whiteboard extraction)
├─ Voice Recording (Web Speech API)
└─ Google Sheets Integration (external data source)
```

### **Data Flow:**
```
Workout Input → Processing → Storage → Query/Analysis
├─ Photo → OCR API → Text Extraction → Parse Workout
├─ Voice → Web Speech API → Text → Parse Workout  
├─ Manual → Direct Text → Parse Workout
└─ Google Sheets → CSV Import → Workout Data
```

### **Dependencies:**
- **AI Services**: provider-neutral `complete()` seam for OCR text extraction
- **Browser APIs**: Web Speech API for voice input
- **External Data**: Google Sheets for workout templates
- **Database Tables**: `workouts`, `movements`, `benchmark_prs`
- **Cross-Domain Types** (`app/lib/types/cross-domain.ts`)
- **Image Processing**: `app/lib/imageUtils.ts` for photo compression

### **Impact Analysis:**
⚠️ **High Impact**: OCR API changes affect photo-based workout logging
⚠️ **Medium Impact**: Workout parsing changes affect all input methods
⚠️ **Medium Impact**: Query system changes affect workout analysis features
⚠️ **Low Impact**: Individual input method changes are mostly isolated

---

## 🎨 **UI & Layout System**

### **Core Layout:**
```
App Structure:
├─ Root Layout (`app/layout.tsx`)
│  ├─ Navigation (mobile-first)
│  ├─ AuthProvider wrapper
│  ├─ ToastProvider wrapper
│  └─ ErrorBoundary wrapper
├─ Global Styles (`app/globals.css`)
└─ Shared Components:
   ├─ Toast (`app/components/Toast.tsx`)
   ├─ Breadcrumbs (`app/components/Breadcrumbs.tsx`)
   ├─ UserMenu (`app/components/UserMenu.tsx`)
   └─ OfflineQueueStatus (`app/components/OfflineQueueStatus.tsx`)
```

### **Design System:**
- **Mobile-First** responsive design
- **Dark Mode** support via Tailwind
- **Touch Targets** minimum 44px (mobile accessibility)
- **Error Boundaries** for graceful failure handling

### **Impact Analysis:**
⚠️ **High Impact**: Layout changes affect ALL pages
⚠️ **High Impact**: Global CSS changes affect entire app styling
⚠️ **Medium Impact**: Shared component changes affect multiple pages
⚠️ **Low Impact**: Individual component styling is isolated

---

## 🔧 **Utility & Infrastructure**

### **Session Management:**
- **Session Management** (`app/lib/session-management.ts`) - User session handling
- **Error Handling** (`app/lib/error-handling.ts`) - Centralized error management

### **API Infrastructure:**
- **Health Check** (`app/api/health/route.ts`) - System health monitoring
- **Supabase Clients** - Database connection management

### **Impact Analysis:**
⚠️ **High Impact**: Session management changes affect ALL authenticated features
⚠️ **Medium Impact**: Error handling changes affect user experience
⚠️ **Low Impact**: Health check changes are isolated

---

## 🗄️ **Database Schema Dependencies**

### **Core Tables:**
```
Database Relationships:
├─ user_profiles (1:1 with auth.users)
│  └─ Referenced by: meals, workouts, daily_targets
├─ meals (many:1 with user_profiles)
├─ food_catalog_entries (many:1 with auth.users; private reviewed label facts)
├─ workouts (many:1 with user_profiles)
├─ daily_targets (1:1 with user_profiles)
├─ movements (reference data)
└─ benchmark_prs (many:1 with user_profiles)
```

### **Migration Files:**
- `complete-holistic-migration.sql` - Full schema setup
- `cross-domain-integration-migration.sql` - Cross-feature integration
- `food-tracking-migration.sql` - Food tracking tables
- `fix-food-tracking-rls-policies.sql` - Security policies

### **Impact Analysis:**
⚠️ **Critical Impact**: Schema changes require careful migration planning
⚠️ **High Impact**: RLS policy changes affect data security
⚠️ **Medium Impact**: New tables require API route updates

---

## 🔄 **Data Flow Patterns**

### **Authentication Flow:**
```
User → Auth Form → API Route → Supabase Auth → AuthContext → Protected Routes
```

### **Profile Update Flow:**
```
User → Form Component → AuthContext.updateProfile() → API Route → Supabase → State Update
```

### **Food Tracking Flow:**
```
User → Camera → Upload API → Strict Shared Photo Analysis → Meal Storage → Progress Views
```

### **Workout Tracking Flow:**
```
Multi-Modal Input → AI Processing → Structured Data → Storage → Query/Analysis

Photo Input:
User → Camera Capture → Image Compression → OCR API → Text Extraction → Parse Workout

Voice Input:
User → Web Speech API → Real-time Transcription → Text Processing → Parse Workout

Manual Input:
User → Text Entry → Direct Processing → Parse Workout

Query Flow:
User Question → Query API → Database Search → AI Analysis → Natural Language Response
```

---

## ⚠️ **Critical Dependencies & Risk Areas**

### **High-Risk Changes:**
1. **AuthContext modifications** - Affects entire app
2. **Supabase client changes** - Affects all data operations
3. **Database schema changes** - Requires migration planning
4. **API route authentication** - Security implications
5. **Layout component changes** - Affects all pages
6. **OCR/AI processing changes** - Affects workout photo logging
7. **Image compression utilities** - Affects photo upload performance

### **Medium-Risk Changes:**
1. **Individual API routes** - Affects specific features
2. **Form components** - Affects user workflows
3. **Shared utility functions** - Multiple feature impact
4. **Error handling patterns** - User experience impact

### **Low-Risk Changes:**
1. **Individual page styling** - Isolated impact
2. **Static content updates** - No functional impact
3. **Individual component logic** - Feature-specific impact
4. **Documentation updates** - No code impact

---

## 🧪 **Testing Strategy by Component**

### **Critical Path Testing:**
1. **Authentication Flow** - Sign up → Onboarding → Dashboard
2. **Profile Management** - Weight input, profile editing
3. **Food Tracking** - Photo upload → AI analysis → Progress tracking
4. **Mobile Responsiveness** - Touch targets, navigation

### **Integration Testing:**
1. **Auth + Profile** - Onboarding completion
2. **Profile + Food Tracking** - Target setting + meal logging
3. **Dashboard + All Systems** - Data aggregation display

---

## 📋 **Change Impact Checklist**

Before making changes, consider:

### **Authentication Changes:**
- [ ] Will this affect user login/logout?
- [ ] Do protected routes need updates?
- [ ] Are there database schema implications?
- [ ] Will existing users be affected?

### **API Changes:**
- [ ] Are there breaking changes to request/response format?
- [ ] Do frontend components need updates?
- [ ] Are there authentication/authorization implications?
- [ ] Will this affect mobile app functionality?

### **Component Changes:**
- [ ] Which pages use this component?
- [ ] Are there shared dependencies?
- [ ] Will this affect mobile responsiveness?
- [ ] Are there accessibility implications?

### **Database Changes:**
- [ ] Is a migration script needed?
- [ ] Will this affect existing data?
- [ ] Are RLS policies impacted?
- [ ] Do API routes need updates?

---

## 🔍 **Debugging Guide by System**

### **Authentication Issues:**
1. Check AuthContext state
2. Verify Supabase connection
3. Check API route responses
4. Validate database user_profiles

### **Profile Issues:**
1. Check form validation
2. Verify API route functionality
3. Check database updates
4. Validate AuthContext updates

### **Food Tracking Issues:**
1. Check photo upload process
2. Verify AI API responses
3. Check meal storage
4. Validate progress calculations

### **Dashboard Issues:**
1. Check API data aggregation
2. Verify database queries
3. Check error handling
4. Validate user permissions

---

*Last Updated: January 6, 2026*
*Next Review: After major feature additions*

---

## 🧪 **Testing Infrastructure**

### **Test Suite Organization:**
```
Testing Framework:
├─ Vitest Configuration (`vitest.config.ts`)
├─ Test Setup (`test/setup.ts`)
└─ Test Categories:
   ├─ Unit Tests (individual functions)
   ├─ Integration Tests (API + database)
   ├─ Performance Tests (load + response time)
   └─ Real Implementation Tests (end-to-end workflows)
```

### **Test Coverage Areas:**
```
Food Tracking Tests:
├─ adherence-scoring.test.ts - Nutrition adherence calculations
├─ ai-analysis.test.ts - AI meal analysis accuracy
├─ macro-calculation.test.ts - Nutrition macro calculations
├─ photo-lifecycle.test.ts - Photo upload and processing
├─ target-validation.test.ts - Nutrition target validation
└─ weekly-aggregation.test.ts - Weekly progress aggregation

System Tests:
├─ data-validation.test.ts - Data integrity validation
├─ integration-performance.test.ts - API performance testing
├─ manual-override.test.ts - Manual data override scenarios
├─ performance.test.ts - System performance benchmarks
└─ real-implementation.test.ts - End-to-end user workflows
```

### **Testing Dependencies:**
- **Vitest** for test runner and assertions
- **Test Database** for isolated testing
- **Mock APIs** for external service testing
- **Performance Benchmarks** for regression detection

### **Impact Analysis:**
⚠️ **High Impact**: Test infrastructure changes affect development workflow
⚠️ **Medium Impact**: New test categories require setup updates
⚠️ **Low Impact**: Individual test additions are isolated

---

## Adaptive Coach System

### Core modules

```
Adaptive Coach:
|- Machine-readable doctrine (`app/lib/coach/reference.ts`)
|- Complete-programming evidence and composition contract (`app/lib/coach/programming-reference.ts`)
|- Generic adaptive goal, quality, assessment, protocol, observation, evidence,
|  hypothesis, unit, and comparability contracts
|  (`app/lib/coach/adaptive-programming-contracts.ts`)
|- Immutable goal, quality-emphasis, hypothesis, assessment, and evaluation trace
|  (`app/lib/coach/adaptive-plan.ts`)
|- Legacy deterministic policy and planner v0.2 (`app/lib/coach/policy.ts`, `planner.ts`)
|- Structured v0.3 intake and profile construction (`app/lib/coach/complete-intake.ts`)
|- v0.3 profile, coverage, and prescription contracts (`app/lib/coach/programming-schema.ts`)
|- v0.3 dose, progression, review, and time policy (`app/lib/coach/programming-policy.ts`)
|- Versioned movement definitions and substitution graph (`app/lib/coach/movement-catalog.ts`)
|- Goal-to-week coverage ledger and day assignment (`app/lib/coach/weekly-coverage.ts`)
|- Role-based complete session composition (`app/lib/coach/session-composer.ts`)
|- Legacy eight-week and rolling one-week draft assembly (`app/lib/coach/complete-program.ts`)
|- Whole-plan completeness gate (`app/lib/coach/program-validator.ts`)
|- Bounded athlete context (`app/lib/coach/athlete-context.ts`)
|- Deterministic session feedback and weekly review (`app/lib/coach/execution-feedback.ts`)
|- Socius prompt and tools (`app/lib/agents/`)
|- Persistent setup, proposal, and active-plan view (`app/program/`)
|- Authenticated coach workflow routes (`app/api/coach/`)
|- Canonical user state (Supabase coach tables)
`- Atomic memory, proposal, plan, and session-result transitions (database RPCs)
```

### Authority and data flow

```
Athlete statements + logged facts
  -> Program setup and explicit assessment or memory confirmation
  -> user-scoped Supabase state
  -> deterministic planning policy
  -> atomic immutable proposed weekly plan version + sessions
  -> persistent athlete preview
  -> athlete acceptance RPC
  -> active prescribed sessions
  -> check-ins and logged results
  -> next inspectable adaptation proposal
```

Supabase is canonical for adaptive programming. New rolling programs persist a
durable goal, quality emphasis, and hypothesis but only one Monday-through-Sunday
prescription at a time. Future weeks are not generated or hidden. Google Sheets
is not imported or synchronized into this system. Global doctrine and numeric policy remain
version-controlled application assets; stored plans retain their doctrine and
policy versions. The LLM selects context, asks questions, and composes concise
coaching language. Application policy computes numeric prescriptions, and only
an explicit atomic acceptance transition can activate a plan.

Execution feedback follows the same authority boundary. Completing or skipping
a prescribed session and storing its concise RPE, energy, pain, outcome, and
note check-in is one idempotent database transition. The app computes the
current-week review directly from accepted session statuses and canonical
check-ins; opening Program does not invoke an LLM. A review may preview
continuation, a lower-stress replacement, or a safety pause, but it never edits
future prescriptions. Any multi-session adjustment still requires a separately
generated and explicitly accepted replacement plan.

`/program` is the durable review surface; `/coach` is the canonical
conversational surface for questions and explanation. `/v2` remains a
compatibility alias to the same client component, and `/query` redirects to
`/coach`; none of these entry points creates a second chat-state owner. The
versioned planning kernel emits
domain-specific session roles, timed blocks, equipment-supported movement
choices, working ranges, effort, rest, stop, substitutions, and progression.
Saved strength assessments add labeled percentage and rounded load ranges only
when the prescribed movement matches the assessment. The model does not invent
these values.

ADR-0007 separates the durable direction, accepted weekly dose, and session
autoregulation clocks. A deterministic `coach_weekly_reviews` record owns
every weekly conclusion, including continuation and insufficient-evidence
outcomes. A review uses the current week for execution tolerance and
protocol-defined rolling windows for repeated performance evidence. Every next
week requires explicit acceptance. Existing accepted eight-week plans keep their
stored policy and payload until the athlete accepts a rolling replacement.
The authenticated `/api/coach/weekly` surface reads state and creates the first
weekly proposal. `/review` records the immutable current-week conclusion and may
create the adjacent proposal. `/reviews/[id]/proposal` reconstructs a lost
proposal response only when that review belongs to the currently accepted plan.
`/convert` creates an inactive rolling replacement for a legacy plan. None of
these routes activates a plan; the existing explicit proposal-acceptance route
remains the only activation boundary.

The broader doctrine describes what each adaptation requires. The separate
complete-programming reference records the evidence and product contract for
assembling weeks and sessions: completeness is defined by adaptation roles,
weekly coverage, and the athlete's time and recovery budget rather than a fixed
exercise count. The v0.3 schema normalizes one lead goal and at most
two secondary goals, per-day time budgets, traceable weekly requirements, and
role-based prescription details. The v0.3 policy owns numeric starting
bounds and review behavior. The movement catalog owns equipment, skill, cost,
constraint, coverage, assessment-alias, substitution, and progression tags;
substitutions must preserve the requested domain and coverage target. These
definitions feed the weekly coverage scheduler, which creates requirements
before movements are chosen, accounts for dose and estimated time, separates
incompatible exposures when possible, and emits explicit time, recovery,
equipment, constraint, experience, or unsupported gaps. The session composer
turns assigned coverage into task-specific preparation,
priority, secondary, assistance/capacity, and conditioning blocks with
inspectable selection reasons, policy dose, recovery, stop conditions, and
equivalent substitutions. The legacy eight-week draft assembler preserves the
same profile snapshot across eight independently inspectable weekly ledgers and
leaves weeks 4 and 8 pending athlete review rather than fabricating a uniform
deload. The rolling assembler builds only the next weekly ledger from the accepted
direction, prior dose, and immutable weekly review. The completeness gate rejects unaccounted coverage, invalid sequencing,
time or dose drift, ineligible movements, false substitutions, vague interval
work, unproven loads, and missing review state. The proposal route builds a
structured v0.3 profile, runs this gate, and only then invokes the
existing atomic proposal RPC. The storage compatibility migration broadens the
immutable prescription check to accept both legacy v0.2 and complete v0.3
formats without changing RLS, grants, triggers, or RPC authority. The active
Program view renders by stored format, so already accepted legacy sessions
remain readable and are never silently upgraded or recomputed. The database
migration must precede the matching application deployment.

An active program does not block future programming. The athlete may create an
immutable replacement proposal against the current accepted version while that
version remains active. A separate stale-base-checked acceptance transition
supersedes it and updates program metadata atomically.

### Approved layered evidence extension

ADR-0006 defines the evidence and memory boundary for the adaptive coach. The
versioned generic goal, quality, assessment, protocol, observation, evidence,
hypothesis, unit, and comparability contracts live in
`app/lib/coach/adaptive-programming-contracts.ts`. The existing
`coach_memories`, `coach_strength_assessments`, `workouts`,
`prescribed_sessions`, `coach_checkins`, plan-version, proposal, and WHOOP
records remain canonical. The additive
`docs/migrations/layered-adaptive-evidence-migration.sql` migration introduces
versioned `measurement_imports`, append-only `performance_observation_groups`
and `performance_observation_values`, owner-safe
`performance_observation_links`, and effective/review timestamps on confirmed
memory. Authenticated clients have owner-scoped read access only. The complete
plan builder now attaches a versioned adaptive trace from each goal through its
quality emphasis, hypothesis, assessment schedule, repeated expected signals,
evaluation policy, and composed coverage requirements. Assessment catalog
version 0.2.0 defines session RPE as a typed training signal with the
`session-rpe-ten-point` protocol; it is evidence input, not a standalone plan
decision.

Completion contract v2 closes the canonical-workout gap. The authenticated
session-completion route validates performed work and typed observations, then
the `record_coach_session_result_v2` transaction creates or replays one workout,
one check-in, one automatic session-RPE observation, any supplied observations,
and the prescribed-session link. It commits the session terminal state last.
Skipped sessions create no workout or performance evidence. Legacy completion
remains readable and callable without fabricating historical workout links.

The proposal route stores the trace in the immutable plan intent. Legacy v0.2
and v0.3 session prescriptions remain unchanged. Completion contract v2 and
the context selector implement the bounded write and purpose-specific read
transitions. The deterministic adaptation evaluator adds evidence snapshots
and review-gated replacement drafts.

The Program page projects each accepted adaptive assessment schedule onto one
compatible prescribed session without mutating the plan. Its mobile-first
Today card collects advisory readiness, only the scheduled measurement, and a
minimal terminal result. The client builds and validates completion contract v2
before calling the atomic route. An interrupted save freezes the full request
and idempotency key for exact replay; editing explicitly abandons that pending
key. The server response replaces the client context and exposes the terminal
canonical-workout link. The Qwik adapter adds the first reviewed external
measurement-import path. The trust center makes confirmed memory, import review,
quality progress, and adaptation explanations athlete-visible and correctable.

`app/lib/coach/qwik-import.ts` supports only the fixture-backed
`qwik-vbt-json-1.10` format. The browser reads, hashes, parses, and previews the
file locally. `app/program/qwik-import-panel.tsx` owns the athlete-facing file
picker and normalized preview inside the Program trust center. It sends only
the sanitized normalized submission to the authenticated import route, which
rejects raw-text and bar-path keys and uses `record_qwik_import_v1` to store an
idempotent manifest plus normalized load, repetition, and per-repetition mean
concentric velocity observations. Interrupted saves retain the exact request
body and idempotency key. Every row starts pending review and unverified.
Ambiguous or unmapped movements remain incomplete and non-comparable. Raw JSON,
full vendor payloads, and bar-path arrays are never included in the supported
upload flow; the Qwik raw-artifact policy is `user_retained_not_uploaded`. The
original file remains with the athlete.
The canonical barbell-bench definition is `evidence_only`: Qwik can map
comparable bench observations to it, but adding the alias does not alter the
versioned deterministic programming catalog or existing generated plans.

`app/lib/coach/trust-center.ts` builds the bounded four-part trust read model.
`app/api/coach/trust/route.ts` authenticates before parsing writes, rejects raw
measurement keys recursively, and routes authority-changing actions through
idempotent database transitions. `app/program/coach-trust-center.tsx` preserves
the exact request and idempotency key after an interrupted save. The
`coach_memory_review_events`, `measurement_import_review_events`, and
`adaptation_proposal_review_events` tables retain append-only athlete decisions.
Memory correction creates a new confirmed version. Withdrawal and rejection
retain reason-bearing history. An explicit ambiguous Qwik selection may create
one athlete-confirmed comparable replacement group; the original pending group
is superseded and its old values are excluded. The UI keeps targets, estimates,
proxies, training signals, and direct outcomes visually distinct.

Adaptation proposal rationale now stores the evaluator's bounded explanation,
confidence, included observation count, and exclusion reasons. A proposal is a
draft. The existing acceptance RPC remains the only plan activation boundary,
and response-loss retry can replay an already accepted proposal safely.

Neither the contracts, storage tables, nor evaluation criteria can activate
plans. The approved layers are:

| Data owner | Write authority | Lifecycle and retention | Required provenance |
| --- | --- | --- | --- |
| Version-controlled doctrine and protocol policy | Reviewed application change | Retain every version referenced by stored data; supersede instead of rewriting | Policy, protocol, schema, and algorithm version or content hash |
| Confirmed athlete facts and typed assessments in Supabase | Explicit authenticated athlete confirmation, including confirmation of an imported candidate | Create a new version for corrections; exclude superseded, withdrawn, or expired values from active use; retain history while the account and referencing decisions remain | Source, effective time, confirmation, status, fingerprint, and supersession link |
| Canonical `workouts`, prescribed-session link, `coach_checkins`, and existing WHOOP tables | Authenticated logging, one atomic completion flow, or a reviewed integration | Retain for the account lifetime unless the athlete deletes it; make corrections explicit and invalidate dependent evidence; never create a competing workout or WHOOP store | Stable IDs, observed and captured time, input source, schema version, and idempotency key |
| Append-only normalized performance observations and private source-import manifests | Validated logger or athlete-confirmed idempotent importer | Supersede or exclude instead of overwriting; retain normalized rows and manifests with the account; require a declared raw-artifact retention class and duration before production activation | Source record ID, content hash, unit, protocol and version, variation, comparability tags, status, and artifact retention class |
| Deterministic derived evidence and disposable read models | Versioned application evaluator only | Retain evidence referenced by a decision; regenerate or evict unreferenced projections; invalidate on source correction | Observation IDs, window, sample count, exclusions, evaluator version, freshness, confidence, and content hash |
| Immutable programming hypotheses, adaptation proposals, and plan versions | Deterministic policy proposes; explicit athlete acceptance RPC activates | Append-only for the account lifetime; replace rather than edit | Evidence IDs, policy version, rationale, decision time, and accepted plan version |

Promotion is one-way and gated. Conversation or model inference can create a
review candidate only. Stable facts require explicit confirmation. Measurements
require explicit logging or athlete-confirmed import. Evidence requires compatible active
observations and a deterministic evaluator. One session or readiness score cannot
change block emphasis. Insufficient, stale, or incompatible evidence holds the
plan and requests only the smallest measurement that can change the decision.
Only explicit acceptance can activate a replacement plan.

Coach retrieval is purpose-specific. Planning, session execution, adaptation
review, and explanation each assemble a bounded structured packet with source,
freshness, protocol, confidence, exclusions, and missingness. Arbitrary recent
memory and vector similarity are not numeric authority.
`app/lib/coach/evidence-context.ts` defines six deterministic read models:
today session, weekly review, adaptation review, new planning, metric history,
and general coaching. Each packet carries an as-of time, active-plan scope,
selected memory and observation IDs, sample counts, source verification,
protocol and comparability identity, algorithm version, hard limits, and
explicit missingness. Expired or overdue memory, future-captured data,
unverified observations, superseded imports, stale-plan sessions, and
cross-user rows are excluded. Truncated or failed reads are never labeled
complete.

`app/lib/coach/adaptation-evaluator.ts` converts an adaptation-review packet
into a versioned continue, progress, maintain, redirect, recover, hold, or pause
decision. It canonicalizes units, counts distinct exposures instead of sets,
keeps direct outcomes separate from proxies, estimates provisional variability,
and requires repeated directional agreement. Its content-addressed snapshot
records included and excluded observation IDs, protocol signatures, windows,
sample and exposure counts, safety sources, confidence, and algorithm versions.
The adaptation-review API may store that snapshot in a new immutable replacement
draft, but the accepted plan remains unchanged until explicit acceptance.
Raw vendor payloads, bar-path arrays, images, and video stay outside
hot relational queries and model context; a private raw artifact is allowed
only under a source-specific retention policy. Import manifests retain hashes
and status after raw content expires. A source may instead declare that raw
content is not uploaded. Qwik uses that policy and retains only normalized
metrics, bounded provenance, and the source SHA-256 in Supabase.

Corrections never rewrite history. A fact or observation is superseded or
excluded, dependent evidence is invalidated, and a new evaluation or proposal is
created. A plan rollback is a newly accepted replacement version. Code rollback
does not reinterpret stored records under a different policy version. Import
retries must match their source fingerprint or fail closed. All user-owned tables
and private objects remain tenant-scoped; new tables require RLS, `FORCE ROW LEVEL
SECURITY`, composite ownership constraints, least-privilege grants, and bounded
idempotent transitions.

APEX remains a proving example rather than a scoring ontology. APEX scoring
tables, vendor-controlled programming decisions, chat history as source of
truth, automatic memory promotion, duplicated WHOOP data, default video
retention, medical diagnosis, and silent plan activation are non-goals.

### Critical invariants

- Existing eight-week plans retain their recorded week 4 and week 8 review-led
  behavior. New rolling programs have no fixed deload week; recovery changes are
  evidence-led.
- New rolling programs store and expose only one accepted Monday-Sunday dose.
- Every completed weekly review is immutable and reproducible, including a
  decision to continue or collect more evidence.
- Goal horizons, rolling evidence windows, and weekly prescription windows are
  separate contracts.
- Durable memory is explicit, versioned, correctable, provenance-bearing, and
  idempotent; inferred conversation is not silently persisted.
- Accepted plan and prescription content is immutable.
- Stored legacy and v0.3 prescriptions render from their accepted payload; the
  app does not recompute either format under a newer policy.
- RLS and composite ownership constraints keep all athlete state user-scoped.
- Stale proposals fail rather than overwriting a newer accepted plan.
- Proposal creation never mutates the currently accepted plan.
- A terminal prescribed-session result and its check-in are recorded atomically.
- Weekly reviews are deterministic and do not spend LLM tokens.
- Adaptation previews never invent numeric changes or mutate future sessions.
- Structured facts, observations, evidence, and decisions never collapse into
  one flexible memory or transcript store.
- Performance evidence never changes block emphasis from one noisy session or
  one readiness value.

See `docs/decisions/ADR-0003-adaptive-coach-state-and-authority.md`.
See `docs/decisions/ADR-0006-layered-adaptive-programming-evidence-and-memory.md`.
The current deterministic numeric and selection ranges are recorded in
`docs/coach/programming-policy-0.2.0.md`.
The researched construction contract and v0.3 implementation boundary are
recorded in `docs/coach/complete-programming-evidence-research.md` and
`docs/coach/programming-kernel-v0.3-spec.md`.


## Logging and accepted-plan boundary (2026-09-04)

ADR-0008 extends shared logging to the agent, text parsing, and meal-photo routes.
`app/lib/client/logging-request.ts` freezes request identity/input/time for retry.
`app/lib/logging/server.ts` claims and finalizes authenticated database receipts;
`save_logged_activity` owns canonical workout/block or meal inserts. Uncertain
writes stop processing and remain reconcilable through their saved entity IDs.
Photo response persistence shares the meal transaction. No worker automatically
re-executes a claimed request. See the release notes for precise scope/limitations.

`app/lib/coach/todays-program.ts` projects the accepted runtime plan into Coach's
summary and trainer context. Trainer receives the stored prescription; neither
consumer substitutes hardcoded Google Sheets programming. Program remains the
execution and explicit plan-acceptance surface.

The `verify` CI job includes executable PGlite migration/transaction tests and
mobile Chromium retry journeys with simulated external services. Production
canaries remain a release step. See `docs/releases/app-quality-2026-09-04.md`.
