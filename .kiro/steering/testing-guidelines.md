---
inclusion: fileMatch
fileMatchPattern: 'test/**/*.test.ts'
---

# Testing Guidelines

## Test Framework

**Vitest** - Fast unit test framework for Vite/Next.js

## Running Tests

```bash
# Run all tests once
npm run test

# Watch mode (re-run on changes)
npm run test:watch

# Open Vitest UI (visual test runner)
npm run test:ui
```

## Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { yourFunction } from '@/app/lib/your-module'

describe('YourFunction', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    // Cleanup after each test
  })

  it('should do something', () => {
    const result = yourFunction(input)
    expect(result).toBe(expectedOutput)
  })

  it('should handle edge case', () => {
    const result = yourFunction(edgeCase)
    expect(result).toBeDefined()
  })
})
```

## Testing Categories

### 1. Unit Tests
Test individual functions in isolation:

```typescript
// test/macro-validation.test.ts
import { validateMacros } from '@/app/lib/macro-validation'

describe('validateMacros', () => {
  it('should accept valid macros', () => {
    const result = validateMacros({
      protein: 30,
      carbs: 40,
      fat: 15,
      calories: 415
    })
    expect(result.isValid).toBe(true)
  })

  it('should reject negative values', () => {
    const result = validateMacros({
      protein: -5,
      carbs: 40,
      fat: 15,
      calories: 415
    })
    expect(result.isValid).toBe(false)
  })
})
```

### 2. Integration Tests
Test API endpoints and flows:

```typescript
// test/api/parse-workout.test.ts
import { POST } from '@/app/api/parse-workout/route'

describe('POST /api/parse-workout', () => {
  it('should parse simple workout', async () => {
    const request = new Request('http://localhost:3000/api/parse-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '5 rounds: 10 push-ups',
        date: '2026-01-23'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.parsed).toBeDefined()
    expect(data.parsed.blocks).toHaveLength(1)
  })

  it('should require authentication', async () => {
    // Test without auth
    const request = new Request('http://localhost:3000/api/parse-workout', {
      method: 'POST',
      body: JSON.stringify({ text: 'workout', date: '2026-01-23' })
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })
})
```

### 3. Property-Based Tests
Test universal properties:

```typescript
import { fc, test } from '@fast-check/vitest'

describe('Intent Classifier Properties', () => {
  test.prop([fc.string()])('should always return valid intent type', async (question) => {
    const result = await classifyIntent(question)
    expect(['WORKOUT', 'NUTRITION', 'CROSS_DOMAIN']).toContain(result.intent)
  })

  test.prop([fc.array(fc.string(), { minLength: 1 })])('should respect keyword domains', async (keywords) => {
    const question = keywords.join(' ')
    const result = await classifyIntent(question)
    expect(result.intent).toBeDefined()
  })
})
```

## Mobile Testing

### Required for All Features

**Test on Real Devices:**
- iPhone (Safari)
- Android (Chrome)
- Different screen sizes

**Test Scenarios:**
- Camera access and photo capture
- Touch interactions (44px targets)
- Keyboard behavior
- Offline functionality
- Performance on 3G

**Tools:**
- Browser DevTools (initial testing)
- BrowserStack (cross-device testing)
- Actual devices (final validation)

### Mobile Test Checklist
- [ ] Touch targets minimum 44px × 44px
- [ ] Text inputs minimum 16px font size
- [ ] Camera API works (HTTPS required)
- [ ] Gestures work (swipe, pinch, tap)
- [ ] Keyboard doesn't obscure inputs
- [ ] Works in portrait and landscape
- [ ] Performance acceptable on 3G
- [ ] Offline mode works for core features

## Mocking Patterns

### Mock Supabase Client
```typescript
import { vi } from 'vitest'

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null
    })
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null })
  })
}
```

### Mock Anthropic API
```typescript
const mockAnthropic = {
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ parsed: 'data' })
      }]
    })
  }
}
```

## Test Coverage Goals

- Unit tests: 80%+ coverage
- API routes: All authenticated endpoints tested
- Critical paths: 100% coverage (auth, workout logging, food tracking)
- Mobile flows: Manually tested on real devices

## Common Test Patterns

### Testing Async Functions
```typescript
it('should fetch data', async () => {
  const data = await fetchData()
  expect(data).toBeDefined()
})
```

### Testing Error Handling
```typescript
it('should handle errors gracefully', async () => {
  const mockFn = vi.fn().mockRejectedValue(new Error('Test error'))
  
  await expect(mockFn()).rejects.toThrow('Test error')
})
```

### Testing React Components
```typescript
import { render, screen, fireEvent } from '@testing-library/react'

it('should render button', () => {
  render(<MyButton onClick={mockFn}>Click</MyButton>)
  
  const button = screen.getByText('Click')
  expect(button).toBeInTheDocument()
  
  fireEvent.click(button)
  expect(mockFn).toHaveBeenCalled()
})
```

## Performance Testing

### API Response Time
```typescript
it('should respond within 200ms', async () => {
  const start = Date.now()
  await apiCall()
  const duration = Date.now() - start
  
  expect(duration).toBeLessThan(200)
})
```

### Image Compression
```typescript
it('should compress image to under 1MB', async () => {
  const compressed = await compressImage(largeImage)
  expect(compressed.size).toBeLessThan(1024 * 1024)
})
```

## Debugging Tests

```bash
# Run specific test file
npm run test -- workout.test.ts

# Run tests matching pattern
npm run test -- --grep "should parse"

# Run with verbose output
npm run test -- --reporter=verbose

# Debug in VS Code
# Add breakpoint, then run "Debug Test" in test file
```

## Best Practices

1. **Test behavior, not implementation**
   - Focus on what the function does, not how
   - Avoid testing internal details

2. **Keep tests isolated**
   - Each test should be independent
   - Use beforeEach/afterEach for setup/cleanup

3. **Use descriptive test names**
   - "should parse AMRAP workout correctly"
   - Not "test1" or "it works"

4. **Test edge cases**
   - Empty inputs
   - Null/undefined values
   - Maximum values
   - Invalid formats

5. **Don't over-mock**
   - Mock external dependencies (APIs, databases)
   - Don't mock the code you're testing

6. **Write tests first for bugs**
   - Reproduce bug in test
   - Fix code until test passes
   - Prevents regression
