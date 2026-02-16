---
inclusion: manual
---

# Quick Reference

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon/public key
ANTHROPIC_API_KEY=                 # Anthropic API key
GOOGLE_SHEETS_API_KEY=             # Google Sheets API key (for dynamic tab detection)

# Optional
GOOGLE_SHEETS_CACHE_TTL_HOURS=4    # Cache duration for tab detection (default: 4 hours)
GOOGLE_SHEETS_CSV_URL=             # Coach programming Google Sheets CSV URL (deprecated)
```

## Common Commands

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

# Deployment
git push origin main     # Auto-deploy to Vercel
vercel                   # Manual deploy with CLI
```

## Database Quick Queries

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

-- Get daily nutrition summary
SELECT * FROM daily_summaries
WHERE user_id = auth.uid()
  AND date = CURRENT_DATE;
```

## API Testing with curl

```bash
# Health check
curl http://localhost:3000/api/health

# Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Sign in
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Parse workout (requires auth cookie)
curl -X POST http://localhost:3000/api/parse-workout \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{"text":"5 rounds: 10 push-ups","date":"2026-01-23"}'

# Query workouts
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{"question":"What is my best Fran time?"}'
```

## Component Import Paths

```typescript
// Auth
import { useAuth } from '@/app/lib/auth/AuthContext'
import { createClient } from '@/app/lib/auth/supabase-browser'
import { createServerClient } from '@/app/lib/auth/supabase-server'

// Components
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import MealCameraCapture from '@/app/components/MealCameraCapture'
import DailyProgressView from '@/app/components/DailyProgressView'
import Navigation from '@/app/components/Navigation'

// Utilities
import { calculateAdherence } from '@/app/lib/adherence-calculator'
import { validateMacros } from '@/app/lib/macro-validation'
import { compressImage } from '@/app/lib/imageUtils'

// Types
import type { Workout, Meal, UserProfile } from '@/app/lib/types/database.types'
```

## Tailwind CSS Common Patterns

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

// Loading spinner
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>

// Progress bar
<div className="w-full bg-gray-200 rounded-full h-2">
  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }} />
</div>
```

## Database Connection Patterns

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
  .insert({ workout_date: '2026-01-23', input_text: '...', blocks: {...} })
  .select()
  .single()

// Update
const { data, error } = await supabase
  .from('meals')
  .update({ total_protein: 35 })
  .eq('id', mealId)

// Delete
const { data, error } = await supabase
  .from('meals')
  .delete()
  .eq('id', mealId)
```

## AI API Patterns

```typescript
// Claude API call
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  temperature: 0,
  system: 'You are a fitness tracking assistant...',
  messages: [{
    role: 'user',
    content: 'Parse this workout: 5 rounds of 10 push-ups'
  }]
})

const responseText = message.content[0].text
```

## Error Handling Patterns

```typescript
// API route error handling
try {
  // Operation
  return NextResponse.json({ data: result })
} catch (error) {
  console.error('Operation failed:', error)
  return NextResponse.json(
    { error: 'Operation failed', details: error.message },
    { status: 500 }
  )
}

// Component error handling
try {
  const response = await fetch('/api/endpoint')
  if (!response.ok) {
    throw new Error('API request failed')
  }
  const data = await response.json()
} catch (error) {
  console.error('Error:', error)
  setError('Something went wrong. Please try again.')
}
```

## Performance Targets

- Page load: <3s on 3G
- API response: <200ms average
- AI parsing: 3-5 seconds
- Touch response: <100ms
- Offline functionality: Core features work without internet

## Key File Locations

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
Steering Files:      .kiro/steering/
```

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and commit
git add .
git commit -m "feat: descriptive message"

# Push to GitHub
git push origin feature/your-feature

# Create pull request
gh pr create --title "Feature title" --body "Description"

# Merge and deploy
git checkout main
git merge feature/your-feature
git push origin main  # Auto-deploys to Vercel
```

## Cost Estimates

**Monthly Cost (Personal Use):**
- Vercel: $0 (free tier)
- Supabase: $0 (free tier)
- Anthropic: ~$3-5/month (300-500 workouts + meals)
- **Total: ~$3-5/month**

## Support Resources

- **Next.js:** https://nextjs.org/docs
- **Supabase:** https://supabase.com/docs
- **Anthropic:** https://docs.anthropic.com
- **Tailwind:** https://tailwindcss.com/docs
- **Vitest:** https://vitest.dev
- **TypeScript:** https://www.typescriptlang.org/docs
