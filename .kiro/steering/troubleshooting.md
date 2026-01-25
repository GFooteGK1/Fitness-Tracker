---
inclusion: manual
---

# Troubleshooting Guide

## Common Issues

### 1. "Session Expired" Errors

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

### 2. RLS Policy Violations

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

### 3. Photo Upload Failures

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

### 4. Build Errors

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

### 5. AI Parsing Issues

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

### 6. Mobile-Specific Issues

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

### 7. Database Connection Issues

**Symptoms:**
- "Connection refused" errors
- Timeout errors
- Slow queries

**Solutions:**
```typescript
// Check Supabase project status (not paused)
// Verify environment variables correct
// Check connection pooling limits

// Test connection
const { data, error } = await supabase
  .from('workouts')
  .select('count')
  .single()

if (error) {
  console.error('Database connection error:', error)
}

// Add indexes for slow queries
// Monitor Supabase dashboard for performance
```

### 8. Timezone Issues

**Symptoms:**
- Dates off by one day
- Meals showing on wrong day
- Workout dates incorrect

**Solutions:**
```typescript
// Always send timezone offset from client
const tzOffset = new Date().getTimezoneOffset()

// Use timezone-aware date handling
const localDate = new Date(utcDate.getTime() - (tzOffset * 60000))

// Store timestamps in UTC, display in local time
// Use DATE type for dates without time
```

## Debug Mode

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

## Logs & Monitoring

**Development:**
- Browser console (F12)
- Terminal server logs
- Network tab (API requests)

**Production:**
- Vercel logs (vercel.com dashboard)
- Supabase logs (supabase.com dashboard)
- Set up error tracking (Sentry recommended)

## Performance Issues

**Slow Page Load:**
- Check image sizes (compress before upload)
- Reduce API calls (batch requests)
- Use pagination for large lists
- Enable caching where appropriate

**Slow API Responses:**
- Add database indexes
- Optimize queries (use select specific columns)
- Check AI API response times
- Monitor Supabase performance dashboard

## Getting Help

**Documentation:**
- CLAUDE.MD - Comprehensive reference
- `/docs/errors/` - Past errors and solutions
- `/docs/guides/` - Setup and deployment guides
- `/docs/sessions/` - Development session notes

**External Resources:**
- Next.js docs: https://nextjs.org/docs
- Supabase docs: https://supabase.com/docs
- Anthropic docs: https://docs.anthropic.com
- Tailwind docs: https://tailwindcss.com/docs

## Quick Diagnostic Commands

```bash
# Check Node version
node --version  # Should be 20+

# Check dependencies
npm list

# Clear all caches
rm -rf .next node_modules package-lock.json
npm install

# Test database connection
# (Run in Supabase SQL Editor)
SELECT auth.uid(), auth.email();

# Check environment variables
echo $NEXT_PUBLIC_SUPABASE_URL
echo $ANTHROPIC_API_KEY
```
