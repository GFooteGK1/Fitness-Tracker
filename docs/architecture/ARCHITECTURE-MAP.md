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
└─ Error Boundary (`app/components/ErrorBoundary.tsx`)
```

### **Data Sources:**
- **Workouts** from `workouts` table
- **Block Scores** from `block_scores` table (optional)
- **User Profile** for personalization

### **Dependencies:**
- **Authentication** (protected route)
- **Multiple Database Tables** (workouts, block_scores, user_profiles)
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
├─ /api/meals/upload - Photo upload & AI analysis
├─ /api/meals/analyze - AI nutrition analysis
├─ /api/meals/daily - Daily meal summaries
├─ /api/meals/[id] - Individual meal CRUD
└─ /api/meals/cleanup - Photo cleanup
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
- **Database Tables**: `meals`, `daily_targets`, `daily_summaries`
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
