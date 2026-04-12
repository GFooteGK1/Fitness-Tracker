---
inclusion: fileMatch
fileMatchPattern: '**/components/**/*.tsx'
---

# Component Patterns & UI Guidelines

## Mobile-First Design

### Touch Targets
```tsx
// Minimum 44px × 44px for touch targets
<button className="min-w-[44px] min-h-[44px] px-4 py-3">
  Click Me
</button>
```

### Responsive Layouts
```tsx
// Mobile-first responsive container
<div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  {/* Content */}
</div>

// Grid layout (responsive)
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Cards */}
</div>
```

### Font Sizes
```tsx
// Minimum 16px for inputs (prevents zoom on iOS)
<input className="text-base" /> {/* text-base = 16px */}

// Readable body text
<p className="text-base sm:text-lg">Content</p>
```

## Common Component Patterns

### Card Pattern
```tsx
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
  <h3 className="text-lg font-semibold mb-2">Title</h3>
  <p className="text-gray-600 dark:text-gray-300">Content</p>
</div>
```

### Button Pattern
```tsx
<button className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
  Submit
</button>
```

### Form Pattern
```tsx
<form onSubmit={handleSubmit} className="space-y-4">
  <div>
    <label htmlFor="input" className="block text-sm font-medium mb-1">
      Label
    </label>
    <input
      id="input"
      type="text"
      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-base"
      required
    />
  </div>
  <button type="submit" className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg">
    Submit
  </button>
</form>
```

### Timezone & Date Handling

**Always use `app/lib/timezone-utils` for dates in UI components:**

```tsx
import { getLocalDate, getTimezoneOffset } from '@/app/lib/timezone-utils'

// Get today's local date as YYYY-MM-DD
const today = getLocalDate()

// For date picker values from a Date object, use manual formatting (NOT toLocaleDateString)
const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

// Pass timezone offset to API calls
const tzOffset = getTimezoneOffset()
fetch(`/api/dashboard-stats?tzOffset=${tzOffset}`)
```

**Forbidden in components:**
- `new Date().toLocaleDateString('en-CA')` - locale-dependent, fails in some environments
- `new Date().toISOString().split('T')[0]` - returns UTC date, wrong near midnight

### Loading State
```tsx
{isLoading ? (
  <div className="flex items-center justify-center py-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
) : (
  <div>{content}</div>
)}
```

### Error State
```tsx
{error && (
  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
    <p className="font-medium">Error</p>
    <p className="text-sm">{error}</p>
  </div>
)}
```

## Authentication Components

### Protected Route Pattern
```tsx
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'

export default function ProtectedPage() {
  return (
    <ProtectedRoute>
      <YourContent />
    </ProtectedRoute>
  )
}
```

### Using Auth Context
```tsx
'use client'
import { useAuth } from '@/app/lib/auth/AuthContext'

export default function Component() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>

  return <div>Hello {user.email}</div>
}
```

## Camera Integration

### Photo Capture Pattern
```tsx
'use client'
import { useState, useRef } from 'react'

export default function CameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setStream(mediaStream)
    } catch (err) {
      console.error('Camera access denied:', err)
    }
  }

  const capturePhoto = () => {
    const canvas = document.createElement('canvas')
    const video = videoRef.current
    if (!video) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(video, 0, 0)

    return canvas.toDataURL('image/jpeg', 0.8)
  }

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline className="w-full" />
      <button onClick={startCamera}>Start Camera</button>
      <button onClick={capturePhoto}>Capture</button>
    </div>
  )
}
```

## Data Display Patterns

### List with Empty State
```tsx
{items.length === 0 ? (
  <div className="text-center py-8 text-gray-500">
    <p>No items found</p>
    <button className="mt-4 text-blue-600">Add First Item</button>
  </div>
) : (
  <div className="space-y-4">
    {items.map(item => (
      <ItemCard key={item.id} item={item} />
    ))}
  </div>
)}
```

### Progress Bar
```tsx
<div className="w-full bg-gray-200 rounded-full h-2">
  <div
    className="bg-blue-600 h-2 rounded-full transition-all"
    style={{ width: `${percentage}%` }}
  />
</div>
```

### Modal Pattern
```tsx
{isOpen && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg max-w-md w-full p-6">
      <h2 className="text-xl font-bold mb-4">Modal Title</h2>
      <div className="mb-4">{content}</div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-gray-600">
          Cancel
        </button>
        <button onClick={onConfirm} className="px-4 py-2 bg-blue-600 text-white rounded">
          Confirm
        </button>
      </div>
    </div>
  </div>
)}
```

## Performance Optimization

### Image Optimization
```tsx
import Image from 'next/image'

<Image
  src={photoUrl}
  alt="Meal photo"
  width={400}
  height={300}
  className="rounded-lg"
  loading="lazy"
/>
```

### Prevent Double-Tap Zoom
```css
button {
  touch-action: manipulation;
}
```

## Accessibility

- Use semantic HTML (`<button>`, `<nav>`, `<main>`)
- Include `aria-label` for icon-only buttons
- Ensure keyboard navigation works
- Maintain color contrast ratios (WCAG AA)
- Test with screen readers

## Import Patterns

```typescript
// Auth
import { useAuth } from '@/app/lib/auth/AuthContext'
import { createClient } from '@/app/lib/auth/supabase-browser'

// Components
import ProtectedRoute from '@/app/components/auth/ProtectedRoute'
import Navigation from '@/app/components/Navigation'

// Utilities
import { compressImage } from '@/app/lib/imageUtils'
import { validateMacros } from '@/app/lib/macro-validation'

// Types
import type { Workout, Meal } from '@/app/lib/types/database.types'
```
