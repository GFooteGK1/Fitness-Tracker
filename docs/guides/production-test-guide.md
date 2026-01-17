# Production Testing Guide

## 🚀 Start Production Server
```cmd
npm start
```
**Expected**: Server starts on http://localhost:3000

## 🧪 Critical Test Scenarios

### Test 1: Home Page & Navigation
- [ ] **Visit**: `http://localhost:3000`
- [ ] **Check**: Page loads without errors
- [ ] **Check**: Navigation menu works
- [ ] **Check**: No console errors (F12 → Console)

### Test 2: Authentication Flow
- [ ] **Go to**: Sign Up page
- [ ] **Create**: New test account (use unique email)
- [ ] **Verify**: Form validation works
- [ ] **Verify**: Success/error messages display
- [ ] **Check**: Redirects properly after signup

### Test 3: Sign In Flow
- [ ] **Go to**: Sign In page  
- [ ] **Test**: Wrong credentials (should show error)
- [ ] **Test**: Correct credentials (should redirect)
- [ ] **Verify**: User stays logged in

### Test 4: Onboarding Flow (CRITICAL)
- [ ] **Complete**: Welcome screen
- [ ] **Body Metrics**:
  - [ ] **Weight Input**: Can enter weight (OUR MAIN FIX!)
  - [ ] **Height Input**: Works properly
  - [ ] **Age Input**: Accepts valid age
  - [ ] **Gender**: Can select option
  - [ ] **Unit Toggle**: Metric ↔ Imperial conversion works
- [ ] **Goals Selection**:
  - [ ] **Fitness Goals**: Can select multiple
  - [ ] **Activity Level**: Can select one
- [ ] **Complete**: Saves and redirects to dashboard

### Test 5: Profile Management
- [ ] **Visit**: `/profile` page
- [ ] **Edit Weight**: Change weight value (CRITICAL TEST)
- [ ] **Edit Other Fields**: Height, age, gender
- [ ] **Unit Switching**: Toggle between metric/imperial
- [ ] **Save**: Changes persist after refresh

### Test 6: Dashboard
- [ ] **Access**: Dashboard loads for authenticated user
- [ ] **Content**: Shows user-specific data
- [ ] **Navigation**: All menu items work
- [ ] **Sign Out**: Properly logs out

### Test 7: Mobile Responsiveness
- [ ] **Open**: Browser dev tools (F12)
- [ ] **Toggle**: Device toolbar (mobile view)
- [ ] **Test**: Touch targets are large enough
- [ ] **Test**: Forms work on mobile
- [ ] **Test**: Navigation works on mobile

### Test 8: Error Handling
- [ ] **Visit**: Non-existent page (should show 404)
- [ ] **Test**: Network disconnection
- [ ] **Test**: Invalid form data
- [ ] **Check**: Error boundaries work

## 🔍 Performance Checks

### Loading Speed
- [ ] **Home Page**: Loads in < 3 seconds
- [ ] **Dashboard**: Loads in < 3 seconds  
- [ ] **Profile**: Loads in < 3 seconds

### Console Errors
- [ ] **No Red Errors**: In browser console
- [ ] **No 404s**: For critical resources
- [ ] **No 500s**: For API calls

## 🚨 Show Stoppers (Must Fix Before Deploy)

### Critical Issues:
- ❌ **Weight input doesn't work** (our main fix)
- ❌ **Authentication broken**
- ❌ **Onboarding fails**
- ❌ **Pages don't load**
- ❌ **Console errors**

### Minor Issues (Can deploy with):
- ⚠️ **Slow loading** (but functional)
- ⚠️ **Minor UI glitches**
- ⚠️ **Non-critical 404s** (icons, etc.)

## ✅ Ready to Deploy When:

- [ ] All critical tests pass
- [ ] Weight input specifically works
- [ ] No show-stopper issues
- [ ] Performance is acceptable
- [ ] Mobile experience is smooth

## 📋 Test Results

**Date**: ___________
**Production Build**: ⬜ Pass ⬜ Fail
**Weight Input**: ⬜ Works ⬜ Broken
**Authentication**: ⬜ Works ⬜ Broken
**Onboarding**: ⬜ Works ⬜ Broken
**Mobile**: ⬜ Works ⬜ Issues

**Critical Issues Found**:
_________________________________
_________________________________

**Ready for Deployment**: ⬜ Yes ⬜ No