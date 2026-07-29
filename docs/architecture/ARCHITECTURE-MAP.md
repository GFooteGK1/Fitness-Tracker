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
├─ /api/foods/barcode - Private catalog first, then bounded Open Food Facts v3 lookup
└─ /api/foods/log - Review-gated catalog upsert and deterministic meal log
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

### **Utility Libraries:**
- **Storage** (`app/lib/storage.ts`) - File management
- **Meal Storage** (`app/lib/meal-storage.ts`) - Meal data persistence
- **Macro Validation** (`app/lib/macro-validation.ts`) - Nutrition validation
- **Offline Queue** (`app/lib/offline-queue.ts`) - Offline support

### **Dependencies:**
- **Provider-neutral LLM seam** (`app/lib/llm`) for per-task Anthropic/OpenAI analysis
- Meal images are analyzed in-request and discarded; `photo_url` remains null
- Common meals are derived from exact non-review-pending `meals` snapshots; no
  LLM or mutable common-meal template is involved
- Barcode/label facts are review-gated and stored in private
  `food_catalog_entries`; logged meal items retain immutable macro snapshots
- Native UPC/EAN scanning is progressively enhanced with manual barcode and
  manual-label fallbacks
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
├─ Query Workouts Page (`app/query/page.tsx`)
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
User → Camera → Upload API → AI Analysis → Meal Storage → Progress Views
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
|- Legacy deterministic policy and planner v0.2 (`app/lib/coach/policy.ts`, `planner.ts`)
|- Structured v0.3 intake and profile construction (`app/lib/coach/complete-intake.ts`)
|- v0.3 profile, coverage, and prescription contracts (`app/lib/coach/programming-schema.ts`)
|- v0.3 dose, progression, review, and time policy (`app/lib/coach/programming-policy.ts`)
|- Versioned movement definitions and substitution graph (`app/lib/coach/movement-catalog.ts`)
|- Goal-to-week coverage ledger and day assignment (`app/lib/coach/weekly-coverage.ts`)
|- Role-based complete session composition (`app/lib/coach/session-composer.ts`)
|- Eight-week draft assembly (`app/lib/coach/complete-program.ts`)
|- Whole-plan completeness gate (`app/lib/coach/program-validator.ts`)
|- Bounded athlete context (`app/lib/coach/athlete-context.ts`)
|- Socius prompt and tools (`app/lib/agents/`)
|- Persistent setup, proposal, and active-plan view (`app/program/`)
|- Authenticated coach workflow routes (`app/api/coach/`)
|- Canonical user state (Supabase coach tables)
`- Atomic memory, proposal, and plan transitions (database RPCs)
```

### Authority and data flow

```
Athlete statements + logged facts
  -> Program setup and explicit assessment or memory confirmation
  -> user-scoped Supabase state
  -> deterministic planning policy
  -> atomic immutable proposed plan version + sessions
  -> persistent athlete preview
  -> athlete acceptance RPC
  -> active prescribed sessions
  -> check-ins and logged results
  -> next inspectable adaptation proposal
```

Supabase is canonical for adaptive programming. Google Sheets is not imported or
synchronized into this system. Global doctrine and numeric policy remain
version-controlled application assets; stored plans retain their doctrine and
policy versions. The LLM selects context, asks questions, and composes concise
coaching language. Application policy computes numeric prescriptions, and only
an explicit atomic acceptance transition can activate a plan.

`/program` is the durable review surface; `/v2` remains the conversational
surface for questions and explanation. The versioned planning kernel emits
domain-specific session roles, timed blocks, equipment-supported movement
choices, working ranges, effort, rest, stop, substitutions, and progression.
Saved strength assessments add labeled percentage and rounded load ranges only
when the prescribed movement matches the assessment. The model does not invent
these values.

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
equivalent substitutions. The eight-week draft assembler preserves the same
profile snapshot across eight independently inspectable weekly ledgers and
leaves weeks 4 and 8 pending athlete review rather than fabricating a uniform
deload. The completeness gate rejects unaccounted coverage, invalid sequencing,
time or dose drift, ineligible movements, false substitutions, vague interval
work, unproven loads, and missing review state. The unreleased proposal route
now builds a structured v0.3 profile, runs this gate, and only then invokes the
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

### Critical invariants

- Weeks 4 and 8 are review-led deloads within the initial eight-week horizon.
- Durable memory is explicit, versioned, correctable, provenance-bearing, and
  idempotent; inferred conversation is not silently persisted.
- Accepted plan and prescription content is immutable.
- Stored legacy and v0.3 prescriptions render from their accepted payload; the
  app does not recompute either format under a newer policy.
- RLS and composite ownership constraints keep all athlete state user-scoped.
- Stale proposals fail rather than overwriting a newer accepted plan.
- Proposal creation never mutates the currently accepted plan.

See `docs/decisions/ADR-0003-adaptive-coach-state-and-authority.md`.
The current deterministic numeric and selection ranges are recorded in
`docs/coach/programming-policy-0.2.0.md`.
The researched construction contract and v0.3 implementation boundary are
recorded in `docs/coach/complete-programming-evidence-research.md` and
`docs/coach/programming-kernel-v0.3-spec.md`.
