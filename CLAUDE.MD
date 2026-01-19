# SociusFit - Comprehensive Reference Guide

**Last Updated:** January 18, 2026
**Status:** Production Ready
**Version:** 0.1.0

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Project Structure](#project-structure)
6. [Core Features](#core-features)
7. [API Routes](#api-routes)
8. [Component Architecture](#component-architecture)
9. [Development Principles](#development-principles)
10. [Data Flows](#data-flows)
11. [Authentication & Security](#authentication--security)
12. [Development Workflow](#development-workflow)
13. [Deployment](#deployment)
14. [Testing](#testing)
15. [Troubleshooting](#troubleshooting)
16. [Quick Reference](#quick-reference)

---

## Project Overview

### What is SociusFit?

SociusFit is a holistic AI-powered fitness companion that integrates:
- **Workout Tracking** - Multi-modal input (text, photo OCR, voice)
- **Nutrition Monitoring** - Photo-based meal logging with AI analysis
- **Program Management** - Google Sheets integration for coach programming
- **Cross-Domain Insights** - AI correlations between workouts and nutrition
- **Analytics Dashboard** - Track progress, PRs, and workout types

### Key Capabilities

- 📝 **Natural Language Logging** - Write workouts like you would on a whiteboard
- 📷 **Photo OCR** - Snap a photo of the whiteboard, AI extracts the workout
- 🎤 **Voice Input** - Speak your workout using Web Speech API
- 🍽️ **Nutrition Tracking** - Photo-based meal logging with AI macro estimation
- 🤖 **AI Parsing** - Claude automatically structures your data
- 📊 **Analytics Dashboard** - Track progress, PRs, and workout types
- 🔍 **Conversational Queries** - Ask questions about your workout history
- 📅 **Program View** - View coach programming from Google Sheets
- 📱 **Mobile-First** - Optimized for gym-floor and kitchen use
- 🔒 **Secure** - Row-level security with Supabase

### Performance Improvements Over Previous Version

| Metric | Google Apps Script | Next.js + Claude | Improvement |
|--------|-------------------|------------------|-------------|
| Parse Time | 10-15 seconds | 3-5 seconds | 3x faster |
| Database Queries | 1-3 seconds | <100ms | 10-30x faster |
| Page Load | 2-4 seconds | <1 second | 2-4x faster |

---

## Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks (useState, useEffect)
- **Auth Context**: Custom AuthContext with Supabase

### Backend
- **API**: Next.js API Routes (serverless functions)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (email/password)
- **Storage**: Supabase Storage (meal photos)
- **Real-time**: Supabase Realtime (ready, not fully implemented)

### AI/ML
- **Provider**: Anthropic
- **Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **Use Cases**:
  - Workout parsing from natural language
  - Natural language queries about workout history
  - Photo OCR for workout whiteboards
  - Meal photo analysis and macro estimation
  - Cross-domain fitness insights

### Deployment
- **Frontend/API**: Vercel (serverless, free tier)
- **Database**: Supabase (managed PostgreSQL, free tier)
- **Domain**: Vercel subdomain or custom domain

### Development Tools
- **Testing**: Vitest + @vitest/ui
- **Linting**: ESLint + Next.js config
- **Type Checking**: TypeScript strict mode
- **Package Manager**: npm

---

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER (Browser)                        │
│  📱 Mobile or 💻 Desktop                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              NEXT.JS FRONTEND (Vercel)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   Home   │  │ Workout  │  │   Food   │  │Program │ │
│  │   (/)    │  │  (/log)  │  │(/food)   │  │(/prog) │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                          │
│  React 19 + TypeScript + Tailwind CSS                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              NEXT.JS API ROUTES                          │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Workout    │  │     Food     │  │    Query     │ │
│  │   Parsing    │  │   Analysis   │  │   History    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────┬───────────────────────┬──────────────────┬────────┘
     │                       │                  │
     ↓                       ↓                  ↓
┌──────────┐      ┌──────────────────┐   ┌────────────┐
│ CLAUDE   │      │    SUPABASE      │   │  GOOGLE    │
│   API    │      │                  │   │  SHEETS    │
│          │      │  • PostgreSQL    │   │    CSV     │
│ • Parse  │      │  • Auth          │   │    API     │
│ • Vision │      │  • Storage       │   └────────────┘
│ • Query  │      │  • RLS           │
└──────────┘      └──────────────────┘
```

### Request Flow Patterns

#### 1. Workout Logging Flow
```
User Input (Text/Photo/Voice)
    ↓
Frontend Validation
    ↓
POST /api/parse-workout
    ↓
Auth Check (Supabase)
    ↓
Claude AI Processing
    ↓
Structured JSON Response
    ↓
Database Insert (workouts, block_scores, benchmark_prs)
    ↓
Frontend Update + Success Message
```

#### 2. Food Tracking Flow
```
Photo Capture (Mobile Camera)
    ↓
Image Compression (Client-side)
    ↓
POST /api/meals/upload
    ↓
Auth Check (Supabase)
    ↓
Upload to Supabase Storage
    ↓
Claude Vision Analysis
    ↓
Macro Extraction + Validation
    ↓
Database Insert (meals table)
    ↓
Frontend Update + Progress View
```

#### 3. Natural Language Query Flow
```
User Question
    ↓
POST /api/query
    ↓
Auth Check (Supabase)
    ↓
Fetch Recent Workouts (Database)
    ↓
Claude AI Analysis + Context
    ↓
Natural Language Response
    ↓
Display to User
```

---

## Database Schema

### Tables Overview

```sql
auth.users (Supabase managed)
├── id (UUID, primary key)
├── email
└── created_at

user_profiles (1:1 with auth.users)
├── user_id (UUID, FK to auth.users)
├── weight, height, age, gender
├── fitness_goals
└── created_at, updated_at

workouts (many:1 with user_profiles)
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── workout_date (DATE)
├── input_text (TEXT) - original user input
├── blocks (JSONB) - structured workout data
├── primary_score (TEXT) - human-readable score
├── total_duration_min (INTEGER)
├── tags (TEXT[])
├── notes (TEXT)
├── rpe (INTEGER, 1-10)
├── parse_confidence (DECIMAL)
└── created_at (TIMESTAMPTZ)

movements (reference data)
├── id (UUID, primary key)
├── canonical_name (TEXT) - "Pull-up"
├── category (TEXT) - "GYMNASTICS"
├── movement_pattern (TEXT)
├── aliases (JSONB) - ["pullup", "pull up", "PU"]
├── equipment (JSONB)
├── rx_standards (JSONB)
└── parameter_schema (JSONB)

block_scores (many:1 with workouts)
├── id (UUID, primary key)
├── workout_id (UUID, FK)
├── block_type (TEXT) - "AMRAP", "FOR_TIME", etc.
├── block_title (TEXT)
├── rounds_completed (INTEGER)
├── extra_reps (INTEGER)
├── time_s (INTEGER)
├── total_reps (INTEGER)
├── tonnage_lb (DECIMAL)
├── rx_status (TEXT) - "RX", "SCALED"
├── is_pr (BOOLEAN)
└── created_at (TIMESTAMPTZ)

benchmark_prs (many:1 with user_profiles)
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── benchmark_name (TEXT) - "Fran", "Grace", etc.
├── date (DATE)
├── score_value (DECIMAL) - for comparison
├── score_display (TEXT) - "9:47"
├── rx_status (TEXT)
├── is_pr (BOOLEAN)
├── workout_id (UUID, FK)
└── notes (TEXT)

meals (many:1 with user_profiles)
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── meal_name (TEXT)
├── meal_timestamp (TIMESTAMPTZ)
├── photo_url (TEXT) - Supabase Storage URL
├── meal_timing (TEXT) - "PRE_WORKOUT", "POST_WORKOUT", etc.
├── total_protein (DECIMAL)
├── total_carbs (DECIMAL)
├── total_fat (DECIMAL)
├── total_calories (INTEGER)
├── ai_analysis (JSONB) - detailed breakdown
└── created_at (TIMESTAMPTZ)

daily_targets (many:1 with user_profiles)
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── date (DATE)
├── target_protein (DECIMAL)
├── target_carbs (DECIMAL)
├── target_fat (DECIMAL)
├── target_calories (INTEGER)
└── created_at (TIMESTAMPTZ)

fitness_correlations (many:1 with user_profiles)
├── id (UUID, primary key)
├── user_id (UUID, FK)
├── correlation_type (TEXT)
├── correlation_value (DECIMAL)
├── date_range (TSTZRANGE)
└── created_at (TIMESTAMPTZ)
```

### Important Database Views

```sql
-- Daily nutrition summaries (SECURITY INVOKER - respects RLS)
daily_summaries
├── user_id
├── date
├── total_protein
├── total_carbs
├── total_fat
├── total_calories
└── meal_count

-- Combined fitness summary (SECURITY INVOKER - respects RLS)
daily_fitness_summary
├── user_id
├── date
├── workout_count
├── total_nutrition
└── energy_correlation
```

### Row Level Security (RLS)

All user tables have RLS enabled with policies that enforce:
```sql
-- Example policy pattern used across all tables
CREATE POLICY "Users can only access their own data"
  ON table_name
  FOR ALL
  USING (auth.uid() = user_id);
```

**Enabled on:**
- user_profiles
- workouts
- block_scores
- benchmark_prs
- meals
- daily_targets
- fitness_correlations

**Performance indexes on user_id columns for RLS efficiency**

---

## Project Structure

```
fitness-tracker/
├── app/                              # Next.js App Router
│   ├── api/                          # API Routes (serverless functions)
│   │   ├── adherence/
│   │   │   └── weekly/route.ts       # Weekly nutrition adherence
│   │   ├── auth/
│   │   │   ├── check-password/route.ts   # Password breach checking
│   │   │   ├── signin/route.ts       # User login
│   │   │   ├── signout/route.ts      # User logout
│   │   │   └── signup/route.ts       # User registration
│   │   ├── dashboard-stats/route.ts  # Dashboard data aggregation
│   │   ├── fitness-insights/route.ts # Cross-domain AI insights
│   │   ├── health/route.ts           # Health check endpoint
│   │   ├── meals/
│   │   │   ├── analyze/route.ts      # AI meal analysis
│   │   │   ├── cleanup/route.ts      # Orphaned photo cleanup
│   │   │   ├── daily/route.ts        # Daily meal summaries
│   │   │   ├── upload/route.ts       # Photo upload + analysis
│   │   │   └── [id]/route.ts         # Individual meal CRUD
│   │   ├── ocr-workout/route.ts      # Photo text extraction
│   │   ├── parse-workout/route.ts    # AI workout parsing
│   │   ├── profile/
│   │   │   ├── onboarding/route.ts   # Initial profile setup
│   │   │   └── route.ts              # Profile CRUD
│   │   ├── query/route.ts            # Natural language queries
│   │   ├── targets/route.ts          # Nutrition targets CRUD
│   │   ├── transcribe-audio/route.ts # Voice input transcription
│   │   └── workouts/route.ts         # Google Sheets integration
│   │
│   ├── auth/
│   │   ├── callback/route.ts         # OAuth callback handler
│   │   ├── signin/page.tsx           # Sign in page
│   │   └── signup/page.tsx           # Sign up page
│   │
│   ├── components/                   # React Components
│   │   ├── auth/
│   │   │   ├── AuthLayout.tsx        # Auth page wrapper
│   │   │   ├── ProtectedRoute.tsx    # Route protection HOC
│   │   │   ├── SignInForm.tsx        # Login form
│   │   │   └── SignUpForm.tsx        # Registration form (with breach check)
│   │   ├── Breadcrumbs.tsx           # Navigation breadcrumbs
│   │   ├── DailyProgressView.tsx     # Daily nutrition view
│   │   ├── ErrorBoundary.tsx         # Error handling component
│   │   ├── FoodTrackingIntegration.tsx  # Food tracking main component
│   │   ├── MealCameraCapture.tsx     # Photo capture interface
│   │   ├── MealDisplayExample.tsx    # Meal display component
│   │   ├── MealEditModal.tsx         # Meal editing modal
│   │   ├── MealEntryCard.tsx         # Individual meal card
│   │   ├── Navigation.tsx            # Main navigation component
│   │   ├── TargetManagement.tsx      # Nutrition target settings
│   │   ├── UserMenu.tsx              # User profile dropdown
│   │   └── WeeklyAdherenceView.tsx   # Weekly nutrition trends
│   │
│   ├── lib/                          # Utility Libraries
│   │   ├── auth/
│   │   │   ├── AuthContext.tsx       # Auth state management
│   │   │   ├── supabase-browser.ts   # Browser Supabase client
│   │   │   └── supabase-server.ts    # Server Supabase client
│   │   ├── types/
│   │   │   ├── database.types.ts     # Database type definitions
│   │   │   ├── food.types.ts         # Food tracking types
│   │   │   └── workout.types.ts      # Workout types
│   │   ├── adherence-calculator.ts   # Nutrition adherence logic
│   │   ├── error-handling.ts         # Error utilities
│   │   ├── imageUtils.ts             # Image compression utilities
│   │   ├── macro-validation.ts       # Macro validation logic
│   │   ├── meal-storage.ts           # Meal storage utilities
│   │   ├── offline-queue.ts          # Offline functionality
│   │   ├── session-management.ts     # Session utilities
│   │   ├── storage.ts                # Supabase Storage utilities
│   │   └── target-management.ts      # Target calculation logic
│   │
│   ├── dashboard/page.tsx            # Main dashboard
│   ├── food-progress/page.tsx        # Food tracking page
│   ├── log/page.tsx                  # Workout logging page
│   ├── program/page.tsx              # Coach programming view
│   ├── query/page.tsx                # Natural language query interface
│   │
│   ├── globals.css                   # Global styles + Tailwind
│   ├── layout.tsx                    # Root layout with providers
│   └── page.tsx                      # Home page
│
├── docs/                             # Documentation
│   ├── architecture/                 # System design docs
│   │   ├── ARCHITECTURE-MAP.md
│   │   ├── COMPONENT-DEPENDENCY-GRAPH.md
│   │   ├── DATA-ARCHITECTURE-REVIEW.md
│   │   ├── DEVELOPMENT-IMPACT-GUIDE.md
│   │   ├── DEVELOPMENT-PRINCIPLES.md
│   │   └── PROJECT-OVERVIEW.md
│   ├── errors/                       # Error documentation
│   │   └── 2026-01-*.md             # Dated error reports
│   ├── guides/                       # Setup & deployment guides
│   │   ├── CHECKLIST.md
│   │   ├── DEPLOYMENT-GUIDE.md
│   │   ├── DEPLOYMENT-READINESS.md
│   │   ├── MIGRATION-INSTRUCTIONS.md
│   │   ├── MIGRATION-SUMMARY.md
│   │   ├── PHOTO-STORAGE-SETUP.md
│   │   ├── PRODUCTION-TEST-CHECKLIST.md
│   │   ├── production-test-guide.md
│   │   └── SETUP-GUIDE.md
│   ├── migrations/                   # SQL migration files
│   │   ├── complete-holistic-migration.sql
│   │   ├── cross-domain-integration-migration.sql
│   │   ├── fix-food-tracking-rls-policies.sql
│   │   ├── fix-rls-policies.sql
│   │   ├── fix-user-id-nullable.sql
│   │   ├── food-tracking-migration.sql
│   │   └── supabase-migration.sql
│   ├── security/                     # Security documentation
│   └── sessions/                     # Development session logs
│       ├── CURRENT-STATE-SUMMARY.md
│       ├── MOBILE-FIRST-UI-IMPROVEMENTS.md
│       ├── PERFORMANCE-OPTIMIZATION-GUIDE.md
│       ├── PROJECT-STATUS.md
│       └── SESSION-SUMMARY-*.md
│
├── public/                           # Static assets
├── scripts/                          # Utility scripts
├── test/                             # Test files
│
├── .env.local                        # Environment variables (GITIGNORED)
├── .env.local.example                # Environment variable template
├── .eslintrc.json                    # ESLint configuration
├── .gitignore                        # Git ignore rules
├── next.config.ts                    # Next.js configuration
├── package.json                      # Dependencies
├── postcss.config.mjs                # PostCSS configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
├── vitest.config.ts                  # Vitest test configuration
└── README.md                         # Project documentation
```

---

## Core Features

### 1. Workout Tracking

**Input Methods:**
- **Text Input**: Natural language workout descriptions
- **Photo OCR**: Take photo of whiteboard, AI extracts text
- **Voice Input**: Speak workout, Web Speech API transcribes

**AI Processing:**
- Parses workout structure (blocks, movements, weights, reps)
- Detects workout type (AMRAP, For Time, Strength, Cardio, etc.)
- Calculates scores (rounds, time, tonnage, total reps)
- Identifies benchmark workouts and PRs
- Extracts RPE, notes, and tags

**Storage:**
- Structured JSONB format for flexible workout data
- Separate block_scores for performance metrics
- benchmark_prs table for personal records
- Full-text search on workout descriptions

### 2. Nutrition Tracking

**Photo-Based Logging:**
- Camera integration for meal photos
- Image compression before upload
- Supabase Storage for photo hosting
- Offline queue for network interruptions

**AI Analysis:**
- Claude Vision analyzes meal photos
- Estimates macros (protein, carbs, fat, calories)
- Identifies meal components and portions
- Provides structured JSONB analysis

**Progress Tracking:**
- Daily nutrition targets (customizable)
- Daily progress view with macro breakdown
- Weekly adherence visualization
- Meal timing tracking (pre/post workout)

### 3. Program Management

**Google Sheets Integration:**
- Fetches coach programming from Google Sheets CSV export
- Date-based workout display
- Navigation (previous/next day, date picker)
- Direct link to pre-fill workout log

### 4. Analytics Dashboard

**Metrics Displayed:**
- Total workouts logged
- Recent workout streak
- Workout type breakdown (Strength/Metcon/Cardio)
- Recent PRs and benchmarks
- Workout frequency charts
- Nutrition adherence trends

### 5. Natural Language Queries

**Query Capabilities:**
- "What's my best Fran time?"
- "When did I last deadlift?"
- "How often do I do metcons?"
- "Show my recent PRs"

**AI Processing:**
- Fetches relevant workout history
- Claude analyzes and responds conversationally
- Context-aware responses

### 6. Authentication & User Management

**Features:**
- Email/password authentication
- User profile with body metrics
- Onboarding flow for new users
- Password strength validation
- Leaked password checking (HaveIBeenPwned integration)
- Session management with httpOnly cookies

---

## API Routes

### Authentication Endpoints

#### POST /api/auth/signup
Creates new user account with email/password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "message": "User created successfully"
}
```

#### POST /api/auth/signin
Authenticates user and creates session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "message": "Signed in successfully"
}
```

#### POST /api/auth/signout
Ends user session.

#### POST /api/auth/check-password
Checks if password has been compromised (k-Anonymity model).

**Request:**
```json
{
  "password": "password123"
}
```

**Response:**
```json
{
  "isCompromised": true,
  "count": 12345
}
```

### Workout Endpoints

#### POST /api/parse-workout
Parses workout text using Claude AI.

**Request:**
```json
{
  "text": "12min AMRAP:\n5 Pull-ups\n10 Push-ups\n15 Squats\n\nGot 7+5 RPE 8",
  "date": "2026-01-18"
}
```

**Response:**
```json
{
  "parsed": {
    "blocks": [...],
    "primary_score": "7 rounds + 5 reps",
    "rpe": 8
  },
  "workoutId": "uuid"
}
```

#### POST /api/ocr-workout
Extracts text from workout whiteboard photo using Claude Vision.

**Request:**
```json
{
  "imageData": "base64_encoded_image"
}
```

**Response:**
```json
{
  "text": "Extracted workout text from photo"
}
```

#### GET /api/workouts
Fetches coach programming from Google Sheets.

**Query Params:**
- `date` - YYYY-MM-DD format

**Response:**
```json
{
  "workout": {
    "date": "2026-01-18",
    "description": "Workout text from coach"
  }
}
```

#### POST /api/query
Natural language query about workout history.

**Request:**
```json
{
  "question": "What's my best Fran time?"
}
```

**Response:**
```json
{
  "answer": "Your best Fran time is 4:32 Rx, set on Sept 3, 2024"
}
```

### Food Tracking Endpoints

#### POST /api/meals/upload
Uploads meal photo and performs AI analysis.

**Request:**
```json
{
  "imageData": "base64_encoded_image",
  "mealName": "Breakfast",
  "mealTiming": "PRE_WORKOUT"
}
```

**Response:**
```json
{
  "meal": {
    "id": "uuid",
    "total_protein": 35.5,
    "total_carbs": 45.2,
    "total_fat": 12.8,
    "total_calories": 450,
    "ai_analysis": {...}
  }
}
```

#### GET /api/meals/daily
Gets daily meal summary.

**Query Params:**
- `date` - YYYY-MM-DD format

**Response:**
```json
{
  "meals": [...],
  "totals": {
    "protein": 150,
    "carbs": 200,
    "fat": 60,
    "calories": 2100
  },
  "targets": {...},
  "adherence": 0.95
}
```

#### PUT /api/meals/[id]
Updates meal data.

#### DELETE /api/meals/[id]
Deletes meal (and associated photo).

### Profile & Settings Endpoints

#### GET /api/profile
Gets user profile.

#### PUT /api/profile
Updates user profile.

#### POST /api/profile/onboarding
Creates initial user profile with body metrics.

**Request:**
```json
{
  "weight": 180,
  "height": 70,
  "age": 30,
  "gender": "male",
  "fitnessGoals": "Build strength and improve conditioning"
}
```

#### GET /api/targets
Gets nutrition targets for date.

#### POST /api/targets
Creates/updates nutrition targets.

### Analytics Endpoints

#### GET /api/dashboard-stats
Gets aggregated dashboard statistics.

**Response:**
```json
{
  "totalWorkouts": 150,
  "recentStreak": 7,
  "workoutTypes": {
    "strength": 45,
    "metcon": 80,
    "cardio": 25
  },
  "recentPRs": [...]
}
```

#### GET /api/adherence/weekly
Gets weekly nutrition adherence data.

#### POST /api/fitness-insights
Gets cross-domain AI insights correlating workout and nutrition.

### Utility Endpoints

#### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-18T12:00:00Z"
}
```

---

## Component Architecture

### Layout Components

#### app/layout.tsx
Root layout with:
- AuthProvider for authentication state
- Navigation component
- Error boundary
- Global styles
- Metadata

#### app/components/Navigation.tsx
Main navigation bar with:
- Logo/branding
- Page links (Dashboard, Log, Food, Program, Query)
- User menu dropdown
- Mobile-responsive design

#### app/components/UserMenu.tsx
User profile dropdown:
- Profile link
- Sign out button
- User email display

### Authentication Components

#### app/components/auth/ProtectedRoute.tsx
Higher-order component for route protection:
```tsx
<ProtectedRoute>
  <YourProtectedPage />
</ProtectedRoute>
```
- Redirects to /auth/signin if not authenticated
- Shows loading state during auth check

#### app/components/auth/SignUpForm.tsx
Registration form with:
- Email/password inputs
- Password strength validation
- Leaked password checking
- Form validation
- Error handling

#### app/components/auth/SignInForm.tsx
Login form with:
- Email/password inputs
- Remember me option
- Error handling
- Link to sign up

#### app/components/auth/AuthLayout.tsx
Wrapper for auth pages:
- Centered layout
- Branding
- Responsive design

### Workout Components

#### app/log/page.tsx
Main workout logging interface:
- Text input area for natural language
- Photo OCR button
- Voice input button (Web Speech API)
- Date picker
- Submit button
- Recent workouts display
- Loading states

### Food Tracking Components

#### app/components/MealCameraCapture.tsx
Meal photo capture interface:
- Camera access
- Photo preview
- Image compression
- Upload handling
- Offline queue integration

#### app/components/DailyProgressView.tsx
Daily nutrition summary:
- Meal cards with photos
- Macro totals (protein, carbs, fat, calories)
- Progress bars vs targets
- Adherence percentage
- Add meal button

#### app/components/MealEntryCard.tsx
Individual meal display:
- Photo thumbnail
- Meal name and timestamp
- Macro breakdown
- Edit/delete buttons
- Meal timing indicator

#### app/components/MealEditModal.tsx
Meal editing interface:
- Editable macro values
- Meal name input
- Meal timing selector
- Save/cancel buttons
- Validation

#### app/components/WeeklyAdherenceView.tsx
Weekly nutrition trends:
- 7-day adherence chart
- Daily macro breakdown
- Average adherence
- Trend indicators

#### app/components/TargetManagement.tsx
Nutrition target settings:
- Macro target inputs (protein, carbs, fat)
- Calorie calculation
- Save/reset buttons
- Validation

### Dashboard Components

#### app/dashboard/page.tsx
Main dashboard with:
- Workout statistics cards
- Recent PRs list
- Workout type breakdown chart
- Recent workouts timeline
- Nutrition adherence summary
- Quick action buttons

### Utility Components

#### app/components/ErrorBoundary.tsx
React error boundary:
- Catches JavaScript errors
- Displays user-friendly error message
- Logs error details
- Provides reset/reload option

#### app/components/Breadcrumbs.tsx
Navigation breadcrumbs:
- Dynamic path display
- Clickable navigation
- Mobile-responsive

---

## Development Principles

### 0. Holistic Fitness Integration

**Principle**: SociusFit integrates workout tracking, nutrition monitoring, and AI-driven insights into a unified experience.

**Guidelines:**
- Unified user experience across domains
- Cross-domain insights enabled
- Seamless data flow between features
- Contextual intelligence (workout ↔ nutrition)
- Progressive disclosure of information

### 1. Data-Centric Architecture

**Principle**: Backend data tables must integrate efficiently to enable comprehensive fitness insights through LLM analysis.

**Guidelines:**
- Efficient database relationships
- Semantic clarity in data structures
- Comprehensive logging for insights
- API consistency across domains
- Cross-domain analytics enabled

**Implementation:**
- TypeScript interfaces mirror database schemas
- Comprehensive data validation at API boundaries
- Database indexes support LLM query patterns
- Referential integrity maintained
- Data structured for cross-domain insights

### 2. Mobile-First Fitness Experience

**Principle**: Optimized for gym-floor and kitchen use on modern smartphones.

**Guidelines:**
- Gym-floor optimized (quick logging, works with sweaty hands)
- Kitchen-friendly (seamless during meal prep)
- Touch-first design
- Responsive layout across all screen sizes
- Fast performance for quick logging
- Offline capability
- Camera integration optimized

**Implementation:**
- CSS Grid and Flexbox for responsive layouts
- Touch targets minimum 44px × 44px
- Mobile-appropriate font sizes (min 16px for inputs)
- Test on actual devices in real environments
- Service workers for offline functionality
- One-handed operation design

### 3. Learning-Oriented Error Management

**Principle**: Document errors and solutions to build institutional knowledge.

**Guidelines:**
- Comprehensive error documentation
- Solution tracking (process, not just fix)
- Pattern recognition
- Knowledge sharing
- Continuous improvement

**Implementation:**
- Detailed error reports in `/docs/errors/`
- Include stack traces and environment details
- Document debugging process
- Tag by category
- Include prevention strategies
- Regular error log review

---

## Data Flows

### Workout Logging Flow (Detailed)

```
1. USER INPUT
   ├── Text: Natural language in textarea
   ├── Photo: Camera capture → base64 encode
   └── Voice: Web Speech API → text transcription

2. FRONTEND VALIDATION
   ├── Check text not empty
   ├── Validate date format
   └── Show loading state

3. API REQUEST: POST /api/parse-workout
   ├── Headers: Authorization (session cookie)
   ├── Body: { text, date }
   └── Timeout: 30s

4. AUTHENTICATION CHECK
   ├── Supabase: auth.getUser()
   ├── If unauthorized: 401 response
   └── If valid: Continue to step 5

5. AI PROCESSING (Claude)
   ├── Build system prompt (parsing rules)
   ├── Build user prompt (workout text + date)
   ├── Call Anthropic API
   │   ├── Model: claude-sonnet-4-20250514
   │   ├── Max tokens: 4096
   │   └── Temperature: 0 (deterministic)
   ├── Parse JSON response
   └── Validate structure

6. STRUCTURED DATA EXTRACTION
   ├── blocks: Array of workout blocks
   ├── primary_score: Human-readable summary
   ├── rpe: Rate of perceived exertion
   ├── tags: Extracted tags array
   └── parse_confidence: 0.0 - 1.0

7. DATABASE OPERATIONS (Transaction)
   ├── INSERT INTO workouts
   │   ├── user_id (from auth.uid())
   │   ├── workout_date
   │   ├── input_text
   │   ├── blocks (JSONB)
   │   ├── primary_score
   │   ├── tags
   │   ├── rpe
   │   └── Returns workout_id
   ├── For each block with score:
   │   └── INSERT INTO block_scores
   │       ├── workout_id
   │       ├── block_type
   │       ├── rounds_completed
   │       ├── time_s
   │       ├── tonnage_lb
   │       └── rx_status
   └── For benchmark workouts:
       └── INSERT INTO benchmark_prs
           ├── user_id
           ├── benchmark_name
           ├── score_value
           ├── rx_status
           └── workout_id

8. API RESPONSE
   ├── Status: 200 OK
   └── Body: { parsed, workoutId }

9. FRONTEND UPDATE
   ├── Clear input form
   ├── Show success message
   ├── Display parsed workout summary
   └── Refresh recent workouts list
```

### Food Tracking Flow (Detailed)

```
1. PHOTO CAPTURE
   ├── User opens camera via MealCameraCapture component
   ├── Take photo (mobile camera API)
   ├── Preview photo
   └── User confirms or retakes

2. CLIENT-SIDE PROCESSING
   ├── Image compression (imageUtils.ts)
   │   ├── Resize to max 1200px width
   │   ├── Quality: 0.8
   │   └── Format: JPEG
   ├── Base64 encode
   └── Check network connectivity

3A. ONLINE PATH
   ├── POST /api/meals/upload
   ├── Include: imageData, mealName, mealTiming
   └── Continue to step 4

3B. OFFLINE PATH
   ├── Save to offline queue (IndexedDB)
   ├── Show "Saved for upload" message
   ├── On reconnect: Auto-retry upload
   └── Jump to step 3A when online

4. AUTHENTICATION CHECK
   ├── Supabase: auth.getUser()
   ├── If unauthorized: 401 response
   └── If valid: Continue to step 5

5. PHOTO STORAGE
   ├── Convert base64 to File object
   ├── Generate unique filename: user_id_timestamp.jpg
   ├── Upload to Supabase Storage
   │   ├── Bucket: meal-photos
   │   ├── Path: {user_id}/{filename}
   │   └── RLS: User can only access own photos
   ├── Get public URL
   └── photo_url for database

6. AI ANALYSIS (Claude Vision)
   ├── Prepare image for Claude API
   ├── Call Anthropic API with vision
   │   ├── Model: claude-sonnet-4-20250514
   │   ├── Image: base64 encoded
   │   └── Prompt: "Analyze meal, estimate macros"
   ├── Parse JSON response
   │   ├── total_protein
   │   ├── total_carbs
   │   ├── total_fat
   │   ├── total_calories
   │   └── ai_analysis (JSONB with details)
   └── Validate ranges (macro-validation.ts)

7. DATABASE INSERT
   ├── INSERT INTO meals
   │   ├── user_id (from auth.uid())
   │   ├── meal_name
   │   ├── meal_timestamp (now)
   │   ├── photo_url
   │   ├── meal_timing
   │   ├── total_protein
   │   ├── total_carbs
   │   ├── total_fat
   │   ├── total_calories
   │   └── ai_analysis (JSONB)
   └── Returns meal_id

8. API RESPONSE
   ├── Status: 200 OK
   └── Body: { meal }

9. FRONTEND UPDATE
   ├── Close camera modal
   ├── Show success message
   ├── Add meal to DailyProgressView
   ├── Update macro totals
   └── Recalculate adherence percentage
```

### Authentication Flow (Detailed)

```
1. SIGN UP FLOW
   ├── User fills SignUpForm
   │   ├── Email
   │   └── Password
   ├── Client-side validation
   │   ├── Email format check
   │   ├── Password strength (min 8 chars)
   │   └── Confirm password match
   ├── Password breach check
   │   ├── POST /api/auth/check-password
   │   ├── SHA-1 hash password
   │   ├── k-Anonymity query to HaveIBeenPwned
   │   └── Warn if compromised
   ├── POST /api/auth/signup
   ├── Supabase: auth.signUp()
   │   ├── Creates user in auth.users
   │   └── Sends confirmation email (optional)
   ├── Auto sign-in after signup
   ├── Redirect to /profile/onboarding
   └── Create user_profile record

2. SIGN IN FLOW
   ├── User fills SignInForm
   │   ├── Email
   │   └── Password
   ├── POST /api/auth/signin
   ├── Supabase: auth.signInWithPassword()
   │   ├── Validates credentials
   │   ├── Creates session
   │   └── Sets httpOnly cookie
   ├── AuthContext updates
   │   ├── user state set
   │   └── isLoading = false
   ├── Redirect to /dashboard
   └── Protected routes now accessible

3. SESSION MANAGEMENT
   ├── On page load
   │   ├── AuthContext: getSession()
   │   ├── Checks cookie validity
   │   └── Refreshes if needed
   ├── On API request
   │   ├── Include session cookie (automatic)
   │   ├── Server: createServerClient()
   │   ├── Server: auth.getUser()
   │   └── Validate session
   └── On session expiry
       ├── Redirect to /auth/signin
       └── Show "Session expired" message

4. SIGN OUT FLOW
   ├── User clicks Sign Out
   ├── POST /api/auth/signout
   ├── Supabase: auth.signOut()
   │   ├── Invalidates session
   │   └── Clears cookie
   ├── AuthContext updates
   │   ├── user = null
   │   └── Triggers re-render
   ├── Redirect to /auth/signin
   └── All protected routes now inaccessible
```

---

## Authentication & Security

### Authentication System

**Provider**: Supabase Auth

**Features:**
- Email/password authentication
- Session management with httpOnly cookies
- Automatic token refresh
- Row Level Security (RLS) integration

**Implementation Pattern:**

```typescript
// Browser context (app/lib/auth/supabase-browser.ts)
import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Server context (app/lib/auth/supabase-server.ts)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createClient = async () => {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        }
      }
    }
  )
}
```

### Security Features

#### 1. Row Level Security (RLS)

All user tables have RLS policies enforcing user isolation:

```sql
-- Example: Users can only see their own workouts
CREATE POLICY "Users can view their own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);
```

**Performance**: Indexes on `user_id` columns for efficient RLS.

#### 2. Password Security

**Features:**
- Minimum 8 characters (consider increasing to 12)
- Password strength validation
- Leaked password checking (HaveIBeenPwned integration)
- Uses k-Anonymity model (secure, no plain text sent)

**Implementation:**
```typescript
// app/api/auth/check-password/route.ts
// Hashes password with SHA-1, sends first 5 chars to API
// Checks if hash appears in compromised database
```

#### 3. Function Security

**Fixed Vulnerabilities:**
- All SECURITY DEFINER functions have `search_path` set
- Views changed from SECURITY DEFINER to SECURITY INVOKER
- SQL injection protections in place

#### 4. API Route Security

**Pattern:**
```typescript
export async function POST(request: Request) {
  const supabase = await createServerClient()

  // Authenticate
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // User is authenticated, proceed with operation
  // RLS automatically filters to user's data
}
```

#### 5. Storage Security

**Supabase Storage Policies:**
```sql
-- Users can only upload to their own folder
CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can only access their own photos
CREATE POLICY "Users can view own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### Security Best Practices

1. **Never expose credentials in code**
   - Use environment variables
   - Add sensitive files to `.gitignore`
   - Rotate API keys if exposed

2. **Validate all user input**
   - Client-side validation for UX
   - Server-side validation for security
   - Sanitize before database operations

3. **Use RLS policies consistently**
   - Enable on all user tables
   - Test with different user accounts
   - Add performance indexes

4. **Monitor for security issues**
   - Review Supabase audit logs
   - Set up error tracking (e.g., Sentry)
   - Regular security audits

---

## Development Workflow

### Local Development Setup

1. **Prerequisites:**
   ```bash
   # Required
   - Node.js 20+
   - npm
   - Supabase account
   - Anthropic API key
   ```

2. **Clone and Install:**
   ```bash
   cd fitness-tracker
   npm install
   ```

3. **Environment Variables:**
   Create `.env.local`:
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

   # Anthropic
   ANTHROPIC_API_KEY=sk-ant-your-key

   # Optional: Google Sheets
   GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/...
   ```

4. **Database Setup:**
   - Run `docs/migrations/supabase-migration.sql` in Supabase SQL Editor
   - Then run security fixes from `docs/migrations/fix-rls-policies.sql`
   - Configure storage bucket for meal photos

5. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

### Development Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Testing
npm run test             # Run tests once
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Open Vitest UI

# Database
# (Run SQL files manually in Supabase dashboard)
```

### Making Changes

#### Frontend Changes
1. Edit files in `app/` directory
2. Changes appear instantly (hot reload)
3. Check browser console for errors (F12)
4. Test on actual mobile devices

#### API Route Changes
1. Edit files in `app/api/` directory
2. Server auto-reloads
3. Test with curl or Postman
4. Check terminal for server logs

#### Database Changes
1. Write migration SQL file in `docs/migrations/`
2. Test in Supabase SQL Editor
3. Apply to database
4. Update TypeScript types if needed
5. Document in session notes

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "Descriptive message

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push to GitHub
git push origin feature/your-feature

# Create pull request on GitHub
gh pr create --title "Feature title" --body "Description"
```

### Code Review Checklist

- [ ] Does this support cross-domain LLM analysis?
- [ ] Tested on actual mobile devices?
- [ ] Error scenarios documented?
- [ ] Follows mobile-first principles?
- [ ] Data relationships optimized?
- [ ] Maintains UX consistency?
- [ ] AI parsing properly integrated?
- [ ] Works offline for core features?

---

## Deployment

### Vercel Deployment

#### Initial Setup

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Click "New Project"
   - Import from GitHub
   - Select `fitness-tracker` repository

3. **Configure Environment Variables:**
   In Vercel project settings, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ANTHROPIC_API_KEY=sk-ant-your-key
   GOOGLE_SHEETS_CSV_URL=https://docs.google.com/...
   ```

4. **Deploy:**
   - Vercel auto-deploys on push to main
   - Or click "Deploy" button manually

#### Subsequent Deployments

```bash
# Automatic on push
git push origin main

# Or manual with Vercel CLI
npm install -g vercel
vercel
```

### Database (Already Deployed)

Supabase database is already hosted and managed. No deployment needed.

**Production Checklist:**
- [ ] RLS policies enabled and tested
- [ ] Storage bucket configured
- [ ] Backup strategy in place
- [ ] Monitor connection limits

### Environment-Specific Configuration

#### Development
- Uses `.env.local`
- Local development server
- Hot reload enabled
- Verbose error messages

#### Production
- Uses Vercel environment variables
- Serverless functions
- Optimized builds
- User-friendly error messages
- Performance monitoring

---

## Testing

### Test Framework

**Vitest** - Fast unit test framework for Vite/Next.js

### Running Tests

```bash
# Run all tests once
npm run test

# Watch mode (re-run on changes)
npm run test:watch

# Open Vitest UI (visual test runner)
npm run test:ui
```

### Test Structure

```typescript
// test/example.test.ts
import { describe, it, expect } from 'vitest'
import { yourFunction } from '@/app/lib/your-module'

describe('YourFunction', () => {
  it('should do something', () => {
    const result = yourFunction(input)
    expect(result).toBe(expectedOutput)
  })
})
```

### Testing Categories

#### 1. Unit Tests
Test individual functions in isolation:
- Macro validation logic
- Adherence calculations
- Date formatting utilities
- Image compression
- Target management

#### 2. Integration Tests
Test API endpoints:
- Authentication flows
- Workout parsing
- Food tracking
- Database operations

#### 3. Manual Testing
Test user flows:
- Sign up → Onboarding → Log workout
- Capture meal photo → Verify analysis
- Mobile device testing (actual devices)
- Cross-browser testing

### Mobile Testing

**Required for all features:**

1. **Test on Real Devices:**
   - iPhone (Safari)
   - Android (Chrome)
   - Different screen sizes

2. **Test Scenarios:**
   - Camera access and photo capture
   - Touch interactions (44px targets)
   - Keyboard behavior
   - Offline functionality
   - Performance on 3G

3. **Tools:**
   - Browser DevTools (initial testing)
   - BrowserStack (cross-device testing)
   - Actual devices (final validation)

### Test Coverage Goals

- Unit tests: 80%+ coverage
- API routes: All authenticated endpoints tested
- Critical paths: 100% coverage (auth, workout logging, food tracking)
- Mobile flows: Manually tested on real devices

---

## Troubleshooting

### Common Issues

#### 1. "Session Expired" Errors

**Symptoms:**
- Redirected to sign-in unexpectedly
- API returns 401 Unauthorized
- User shown as not authenticated

**Solutions:**
```typescript
// Check auth state
const { user, isLoading } = useAuth()

// Verify session validity
const supabase = createClient()
const { data: { session } } = await supabase.auth.getSession()

// Refresh session if needed
await supabase.auth.refreshSession()

// Check browser cookies enabled
// Clear cookies and sign in again
```

#### 2. RLS Policy Violations

**Symptoms:**
- Empty data returned from queries
- "Row level security policy violation" error
- Can't access own data

**Solutions:**
```sql
-- Verify user_id matches auth.uid()
SELECT auth.uid(); -- In Supabase SQL Editor

-- Check policy definitions
SELECT * FROM pg_policies WHERE tablename = 'workouts';

-- Test policy directly
SELECT * FROM workouts WHERE user_id = auth.uid();

-- Ensure authenticated before query
-- Add index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_table_user_id ON table_name(user_id);
```

#### 3. Photo Upload Failures

**Symptoms:**
- "Upload failed" error
- Photo not appearing
- Storage error in console

**Solutions:**
```typescript
// Check Supabase Storage permissions (RLS policies)
// Verify bucket name matches: 'meal-photos'
// Check file size (limit: 5MB after compression)
// Verify network connectivity

// Test storage directly
const { data, error } = await supabase.storage
  .from('meal-photos')
  .upload(`${user.id}/test.jpg`, file)

// Check browser console for detailed error
// Verify Supabase project is not paused (free tier)
```

#### 4. Build Errors

**Symptoms:**
- `npm run build` fails
- Type errors
- Module not found

**Solutions:**
```bash
# Clear build cache
rm -rf .next
rm -rf node_modules
npm install

# Check for Node.js crypto imports (not supported in Edge Runtime)
# Use Web Crypto API instead:
# ❌ import crypto from 'crypto'
# ✅ const crypto = globalThis.crypto

# Verify all dependencies installed
npm install

# Check TypeScript errors
npm run build -- --debug
```

#### 5. AI Parsing Issues

**Symptoms:**
- Workout not parsed correctly
- Macros estimation way off
- JSON parse errors

**Solutions:**
```typescript
// Check Anthropic API key valid
// Verify model name correct: 'claude-sonnet-4-20250514'
// Check API rate limits not exceeded
// Review system prompt for parsing rules

// Test with simple input first
const simpleWorkout = "5 rounds: 10 push-ups, 20 squats"

// Check response format
console.log('Claude response:', message.content[0].text)

// Validate JSON structure before parsing
try {
  const parsed = JSON.parse(responseText)
} catch (err) {
  console.error('JSON parse error:', err)
  console.log('Raw response:', responseText)
}
```

#### 6. Mobile-Specific Issues

**Camera Not Working:**
```typescript
// Check HTTPS required for camera API (except localhost)
// Verify camera permissions granted
// Test getUserMedia support
if (!navigator.mediaDevices?.getUserMedia) {
  console.error('Camera API not supported')
}

// Check for HTTPS in production
// Add camera permissions to manifest (for PWA)
```

**Touch Issues:**
```css
/* Ensure touch targets 44px minimum */
.button {
  min-width: 44px;
  min-height: 44px;
}

/* Prevent double-tap zoom on buttons */
button {
  touch-action: manipulation;
}
```

### Debug Mode

Enable verbose logging:

```typescript
// In API route
console.log('Request body:', await request.json())
console.log('User:', user)
console.log('Database response:', data)

// In component
console.log('State:', { user, isLoading, error })
console.log('API response:', response)
```

### Logs & Monitoring

**Development:**
- Browser console (F12)
- Terminal server logs
- Network tab (API requests)

**Production:**
- Vercel logs (vercel.com dashboard)
- Supabase logs (supabase.com dashboard)
- Set up error tracking (Sentry recommended)

### Getting Help

**Documentation:**
- This file (CLAUDE.MD)
- `/docs/errors/` - Past errors and solutions
- `/docs/guides/` - Setup and deployment guides
- `/docs/sessions/` - Development session notes

**External Resources:**
- Next.js docs: https://nextjs.org/docs
- Supabase docs: https://supabase.com/docs
- Anthropic docs: https://docs.anthropic.com
- Tailwind docs: https://tailwindcss.com/docs

---

## Quick Reference

### Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon/public key
ANTHROPIC_API_KEY=                 # Anthropic API key

# Optional
GOOGLE_SHEETS_CSV_URL=             # Coach programming Google Sheets CSV URL
```

### Database Quick Queries

```sql
-- Get user's recent workouts
SELECT * FROM workouts
WHERE user_id = auth.uid()
ORDER BY workout_date DESC
LIMIT 10;

-- Get today's meals
SELECT * FROM meals
WHERE user_id = auth.uid()
  AND DATE(meal_timestamp) = CURRENT_DATE;

-- Get workout type breakdown
SELECT
  jsonb_array_elements(blocks)->>'block_type' as type,
  COUNT(*) as count
FROM workouts
WHERE user_id = auth.uid()
GROUP BY type;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'workouts';

-- Verify current user
SELECT auth.uid(), auth.email();
```

### API Testing with curl

```bash
# Health check
curl http://localhost:3000/api/health

# Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Parse workout (requires auth cookie)
curl -X POST http://localhost:3000/api/parse-workout \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{"text":"5 rounds: 10 push-ups","date":"2026-01-18"}'
```

### Component Import Paths

```typescript
// Auth
import { useAuth } from '@/app/lib/auth/AuthContext'
import { createClient } from '@/app/lib/auth/supabase-browser'
import { createServerClient } from '@/app/lib/auth/supabase-server'

// Components
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import MealCameraCapture from '@/app/components/MealCameraCapture'
import DailyProgressView from '@/app/components/DailyProgressView'

// Utilities
import { calculateAdherence } from '@/app/lib/adherence-calculator'
import { validateMacros } from '@/app/lib/macro-validation'
import { compressImage } from '@/app/lib/imageUtils'

// Types
import type { Workout, Meal, UserProfile } from '@/app/lib/types/database.types'
```

### Tailwind CSS Common Patterns

```tsx
// Mobile-first responsive container
<div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

// Card pattern
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">

// Button pattern
<button className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">

// Grid layout (responsive)
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

// Touch target (44px minimum)
<button className="min-w-[44px] min-h-[44px] ...">
```

### Database Connection Patterns

```typescript
// Browser (client component)
'use client'
import { createClient } from '@/app/lib/auth/supabase-browser'
const supabase = createClient()

// Server (API route or server component)
import { createServerClient } from '@/app/lib/auth/supabase-server'
const supabase = await createServerClient()

// Query with RLS (automatic user filtering)
const { data, error } = await supabase
  .from('workouts')
  .select('*')
  .order('workout_date', { ascending: false })
  .limit(10)

// Insert with automatic user_id
const { data, error } = await supabase
  .from('workouts')
  .insert({ workout_date: '2026-01-18', input_text: '...', blocks: {...} })
```

### Cost Estimates

**Free Tier Limits:**
- Vercel: 100GB bandwidth/month
- Supabase: 500MB database, 1GB storage, 2GB bandwidth/month
- Anthropic: Pay-as-you-go (~$0.01 per workout)

**Monthly Cost (Personal Use):**
- Vercel: $0
- Supabase: $0
- Anthropic: ~$3-5/month (300-500 workouts + meals)
- **Total: ~$3-5/month**

### Performance Targets

- Page load: <3s on 3G
- API response: <200ms average
- AI parsing: 3-5 seconds
- Touch response: <100ms
- Offline functionality: Core features work without internet

### Key File Locations

```
Authentication:      app/lib/auth/
API Routes:          app/api/
Components:          app/components/
Database Types:      app/lib/types/
Utilities:           app/lib/
SQL Migrations:      docs/migrations/
Documentation:       docs/
Error Reports:       docs/errors/
Session Notes:       docs/sessions/
```

---

## Additional Resources

### Documentation Files

- **README.md** - Quick start guide
- **PROJECT-OVERVIEW.md** - High-level architecture
- **CURRENT-STATE-SUMMARY.md** - Latest project status
- **DEVELOPMENT-PRINCIPLES.md** - Core development guidelines
- **SETUP-GUIDE.md** - Step-by-step setup
- **DEPLOYMENT-READINESS.md** - Pre-deployment checklist
- **SECURITY-CHECKLIST.md** - Security verification

### Development Sessions

Recent session summaries in `docs/sessions/`:
- `SESSION-SUMMARY-2026-01-17.md` - UI improvements & security fixes
- `SESSION-SUMMARY-2026-01-11.md` - Food tracking & authentication
- `MOBILE-FIRST-UI-IMPROVEMENTS.md` - Mobile optimization
- `PERFORMANCE-OPTIMIZATION-GUIDE.md` - Performance tips

### Migration Files

SQL migrations in `docs/migrations/`:
- `supabase-migration.sql` - Initial schema
- `food-tracking-migration.sql` - Food tracking tables
- `fix-rls-policies.sql` - Security fixes
- `complete-holistic-migration.sql` - Full schema

---

## Version History

- **0.1.0** (Current) - Production-ready release
  - Complete workout tracking
  - Complete food tracking
  - Authentication system
  - Dashboard analytics
  - Program view
  - Security fixes
  - Mobile optimization

---

## Next Steps & Roadmap

### Immediate (Ready Now)
- [ ] Deploy to Vercel production
- [ ] Set up monitoring and analytics
- [ ] User acceptance testing
- [ ] Performance monitoring

### Short-term (This Week)
- [ ] Enable MFA in Supabase (optional)
- [ ] Increase password minimum to 12 characters
- [ ] Set up error tracking (Sentry)
- [ ] Create user documentation

### Medium-term (This Month)
- [ ] Voice transcription implementation
- [ ] Advanced analytics dashboard
- [ ] PWA features (offline mode)
- [ ] Social features (optional)

### Long-term (Future)
- [ ] Mobile app (React Native)
- [ ] Wearable integration
- [ ] Coach collaboration features
- [ ] Advanced AI insights

---

## Summary

**SociusFit** is a production-ready, holistic AI-powered fitness companion that seamlessly integrates workout tracking, nutrition monitoring, and coach programming into a unified, mobile-first experience.

**Key Strengths:**
- Fast, efficient AI-powered parsing and analysis
- Secure, user-isolated data with RLS
- Mobile-optimized for gym and kitchen use
- Cross-domain fitness insights
- Free tier friendly (~$3-5/month)

**Ready for:**
- Real-world personal use
- Small team/gym deployment
- Further feature development
- Mobile app extension

**Built with:**
- Next.js 15 + React 19
- TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- Claude Sonnet 4 (Anthropic)
- Deployed on Vercel

---

*Document Created: January 18, 2026*
*Last Updated: January 18, 2026*
*Maintained by: Greg (with Claude Sonnet 4.5)*
*Status: Production Ready*
