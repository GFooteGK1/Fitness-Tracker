---
inclusion: fileMatch
fileMatchPattern: '**/api/**/*.ts'
---

# API Development Guidelines

## Authentication Pattern

**Every API route must authenticate first:**

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

## Error Handling

**Standard error response pattern:**

```typescript
try {
  // Operation
} catch (error) {
  console.error('Operation failed:', error)
  return NextResponse.json(
    { error: 'Operation failed', details: error.message },
    { status: 500 }
  )
}
```

**Status codes:**
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (authenticated but not allowed)
- `404` - Not found
- `500` - Internal server error

## Input Validation

**Always validate user input:**

```typescript
const body = await request.json()

// Validate required fields
if (!body.text || typeof body.text !== 'string') {
  return NextResponse.json(
    { error: 'Invalid input: text is required' },
    { status: 400 }
  )
}

// Validate length
if (body.text.length > 2000) {
  return NextResponse.json(
    { error: 'Text too long (max 2000 characters)' },
    { status: 400 }
  )
}
```

## Database Operations

**Use Supabase client with automatic RLS:**

```typescript
// Query (RLS automatically filters to user's data)
const { data, error } = await supabase
  .from('workouts')
  .select('*')
  .order('workout_date', { ascending: false })
  .limit(10)

if (error) {
  console.error('Database error:', error)
  return NextResponse.json(
    { error: 'Database query failed' },
    { status: 500 }
  )
}

// Insert (user_id automatically set by RLS)
const { data, error } = await supabase
  .from('workouts')
  .insert({
    workout_date: date,
    input_text: text,
    blocks: parsedBlocks
  })
  .select()
  .single()
```

## AI Integration

**Claude API pattern:**

```typescript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  temperature: 0,
  system: systemPrompt,
  messages: [{
    role: 'user',
    content: userPrompt
  }]
})

// Extract text response
const responseText = message.content[0].text

// Parse JSON if expected
try {
  const parsed = JSON.parse(responseText)
} catch (err) {
  console.error('JSON parse error:', err)
  return NextResponse.json(
    { error: 'AI response parsing failed' },
    { status: 500 }
  )
}
```

## Response Format

**Consistent response structure:**

```typescript
// Success
return NextResponse.json({
  data: result,
  message: 'Operation successful'
}, { status: 200 })

// Error
return NextResponse.json({
  error: 'Error message',
  details: 'Additional context'
}, { status: 400 })
```

## Server vs Browser Context

**Server (API routes):**
```typescript
import { createServerClient } from '@/app/lib/auth/supabase-server'
const supabase = await createServerClient()
```

**Browser (client components):**
```typescript
import { createClient } from '@/app/lib/auth/supabase-browser'
const supabase = createClient()
```

## Common Patterns

### Workout Parsing Endpoint
- Authenticate user
- Validate input text and date
- Call Claude API with parsing prompt
- Parse JSON response
- Insert into database (workouts, block_scores, benchmark_prs)
- Return structured data

### Meal Upload Endpoint
- Authenticate user
- Validate image data
- Upload to Supabase Storage
- Call Claude Vision API for analysis
- Validate macro ranges
- Insert into meals table
- Return meal data

### Query Endpoint
- Authenticate user
- Validate question
- Fetch relevant data (workouts, meals, etc.)
- Call Claude API with context
- Return natural language response

## Timezone Handling

**All API endpoints that query date-scoped data must accept a `tzOffset` parameter.**

```typescript
// GET endpoint: accept from query string
const tzOffset = parseInt(searchParams.get('tzOffset') || '0', 10)

// POST endpoint: accept from request body
const { tzOffset = 0 } = await request.json()

// Validate offset
import { isValidTimezoneOffset } from '@/app/lib/timezone-utils'
if (!isValidTimezoneOffset(tzOffset)) { /* use 0 as fallback */ }
```

**For timestamp columns** (e.g., `meal_timestamp`), convert local date to UTC boundaries:
```typescript
import { localDateToUTCStart, localDateToUTCEnd } from '@/app/lib/timezone-utils'
const utcStart = localDateToUTCStart(dateStr, tzOffset)
const utcEnd = localDateToUTCEnd(dateStr, tzOffset)
// Query: .gte('meal_timestamp', utcStart.toISOString()).lt('meal_timestamp', utcEnd.toISOString())
```

**For DATE columns** (e.g., `workout_date`), compute local date string:
```typescript
const localNow = new Date(now.getTime() - tzOffset * 60000) // raw convention
const dateStr = `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, '0')}-${String(localNow.getUTCDate()).padStart(2, '0')}`
```

**Forbidden patterns:**
- `toISOString().split('T')[0]` for local date extraction
- `toLocaleDateString('en-CA')` on server (locale-dependent)
- `new Date()` getters without timezone adjustment

## Performance Considerations

- Keep API responses under 200ms average
- Use database indexes for user_id columns
- Limit query results (pagination)
- Cache frequently accessed data
- Compress images before upload
- Use JSONB for flexible data structures
