---
inclusion: fileMatch
fileMatchPattern: '**/{auth,api/auth}/**/*.{ts,tsx}'
---

# Authentication & Security Guidelines

## Authentication Flow

### Sign Up Flow
```
1. User fills SignUpForm (email, password)
2. Client-side validation (email format, password strength)
3. Password breach check (HaveIBeenPwned API)
4. POST /api/auth/signup
5. Supabase: auth.signUp()
6. Auto sign-in after signup
7. Redirect to /profile/onboarding
```

### Sign In Flow
```
1. User fills SignInForm (email, password)
2. POST /api/auth/signin
3. Supabase: auth.signInWithPassword()
4. Session created (httpOnly cookie)
5. AuthContext updates
6. Redirect to /dashboard
```

### Session Management
```
1. On page load: AuthContext.getSession()
2. Check cookie validity
3. Refresh if needed
4. On API request: include session cookie (automatic)
5. Server: createServerClient() → auth.getUser()
6. On expiry: redirect to /auth/signin
```

## Server vs Browser Context

### Browser Context (Client Components)
```typescript
'use client'
import { createClient } from '@/app/lib/auth/supabase-browser'

export default function Component() {
  const supabase = createClient()
  
  // Use for client-side operations
  const { data: { user } } = await supabase.auth.getUser()
}
```

### Server Context (API Routes)
```typescript
import { createServerClient } from '@/app/lib/auth/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  
  // Authenticate
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Proceed with authenticated operation
}
```

## Password Security

### Password Requirements
- Minimum 8 characters (consider increasing to 12)
- Mix of uppercase, lowercase, numbers
- Special characters recommended

### Password Breach Checking
```typescript
// Uses k-Anonymity model (HaveIBeenPwned)
// Hashes password with SHA-1
// Sends only first 5 characters of hash
// Checks if hash appears in compromised database

const response = await fetch('/api/auth/check-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password })
})

const { isCompromised, count } = await response.json()
```

## Row Level Security (RLS)

### Standard Policy Pattern
```sql
-- Users can only access their own data
CREATE POLICY "Users can view their own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = user_id);
```

### Performance Indexes
```sql
-- Add indexes on user_id for RLS efficiency
CREATE INDEX idx_workouts_user_id ON workouts(user_id);
CREATE INDEX idx_meals_user_id ON meals(user_id);
```

## Storage Security

### Supabase Storage Policies
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

-- Users can delete their own photos
CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal-photos' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### File Upload Pattern
```typescript
// Generate unique filename
const filename = `${user.id}/${Date.now()}.jpg`

// Upload to user's folder
const { data, error } = await supabase.storage
  .from('meal-photos')
  .upload(filename, file, {
    contentType: 'image/jpeg',
    upsert: false
  })

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('meal-photos')
  .getPublicUrl(filename)
```

## Security Best Practices

### 1. Never Expose Credentials
- Use environment variables
- Add sensitive files to `.gitignore`
- Rotate API keys if exposed
- Never commit `.env.local`

### 2. Validate All User Input
```typescript
// Client-side validation (UX)
if (!email || !email.includes('@')) {
  setError('Invalid email')
  return
}

// Server-side validation (security)
if (!body.text || typeof body.text !== 'string') {
  return NextResponse.json(
    { error: 'Invalid input' },
    { status: 400 }
  )
}

// Sanitize before database operations
const sanitized = body.text.trim().slice(0, 2000)
```

### 3. Use RLS Consistently
- Enable on all user tables
- Test with different user accounts
- Add performance indexes
- Use SECURITY INVOKER for views

### 4. Function Security
```sql
-- Set search_path for SECURITY DEFINER functions
CREATE FUNCTION my_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Function body
END;
$$;
```

### 5. Monitor Security
- Review Supabase audit logs
- Set up error tracking (Sentry)
- Regular security audits
- Monitor failed login attempts

## Common Security Issues

### Session Expired Errors
```typescript
// Check auth state
const { user, isLoading } = useAuth()

// Verify session validity
const { data: { session } } = await supabase.auth.getSession()

// Refresh session if needed
await supabase.auth.refreshSession()
```

### RLS Policy Violations
```sql
-- Verify user_id matches auth.uid()
SELECT auth.uid();

-- Check policy definitions
SELECT * FROM pg_policies WHERE tablename = 'workouts';

-- Test policy directly
SELECT * FROM workouts WHERE user_id = auth.uid();
```

### Unauthorized API Access
```typescript
// Always check authentication first
const { data: { user }, error } = await supabase.auth.getUser()
if (error || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// Verify user has access to resource
const { data } = await supabase
  .from('workouts')
  .select('*')
  .eq('id', workoutId)
  .single()

if (!data) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

## Environment Variables

```bash
# Required for authentication
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Never expose service role key in client code
# Only use in server-side code if absolutely necessary
```
