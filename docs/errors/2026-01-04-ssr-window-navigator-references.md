# Error Report: Server-Side Rendering Error with Window/Navigator References

**Date**: 2026-01-04
**Category**: UI/SSR
**Severity**: High
**Environment**: Development
**Fitness Domain**: Food-Tracking

## Problem Description
When clicking "Add Meal" in the food tracking interface, users encountered a 500 server error. The error was caused by client-side JavaScript code (window.addEventListener and navigator.onLine) being executed during server-side rendering in Next.js.

## Error Details
- **Error Message**: `window.addEventListener('online', handleOnline)` - ReferenceError: window is not defined
- **Error Location**: Line 349 in `app/lib/offline-queue.ts`
- **HTTP Status**: 500 Internal Server Error on `/food-progress`
- **Root Cause**: Client-side APIs accessed during server-side rendering
- **Affected Components**: 
  - MealCameraCapture component
  - OfflineQueue class
  - useOfflineQueue hook
- **User Impact**: Meal logging completely inaccessible, "Add Meal" button non-functional

## Investigation Process
1. **Server Logs Analysis**: Found 500 error with window.addEventListener reference
2. **SSR Issue Identification**: Recognized server-side rendering problem
3. **Code Review**: Located all window and navigator references in offline-queue.ts
4. **Client-Side Check Implementation**: Added typeof window checks for SSR safety

## Root Cause
The OfflineQueue class and useOfflineQueue hook were accessing browser-specific APIs (window, navigator) without checking if they were running in a browser environment. During Next.js server-side rendering, these APIs are undefined, causing runtime errors.

**Problematic Code:**
```typescript
// ❌ Causes SSR error
window.addEventListener('online', handleOnline)
navigator.onLine
```

## Solution
Added client-side environment checks before accessing browser APIs.

**Fixed Code:**
```typescript
// ✅ SSR-safe
if (typeof window !== 'undefined') {
  window.addEventListener('online', handleOnline)
}

// ✅ SSR-safe with fallback
const isOnline = typeof window !== 'undefined' ? navigator.onLine : true
```

**Files Updated:**
- `app/lib/offline-queue.ts` - Added SSR checks for all window/navigator references
- `public/icon-192.png` - Created placeholder icon to fix 404 errors
- `public/icon-512.png` - Created placeholder icon to fix 404 errors

## Prevention
- Always check for browser environment before using client-side APIs
- Use `typeof window !== 'undefined'` checks for SSR safety
- Test components in both server and client rendering contexts
- Add ESLint rules to catch direct window/navigator usage
- Use Next.js dynamic imports with `ssr: false` for client-only components when needed

## Testing
- ✅ **RESOLVED** - Food progress page loads successfully (200 status)
- ✅ "Add Meal" button now functional
- ✅ MealCameraCapture component renders properly
- ✅ Offline queue functionality working
- ✅ No more SSR errors in server logs
- ✅ Icon 404 errors resolved

## Related Issues
- Mobile-first meal logging now fully functional
- Camera capture interface accessible
- Offline functionality working properly

## Next Steps
1. Replace placeholder icons with actual SociusFit app icons
2. Add comprehensive SSR testing to development workflow
3. Create ESLint rules for SSR-unsafe code patterns
4. Document SSR best practices for the team
5. Test all client-side hooks for similar issues