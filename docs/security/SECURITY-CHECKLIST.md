# SociusFit Security Checklist

## ✅ Required Fixes (Do These Now)

### 1. Fix RLS Policies & Functions ⚠️ CRITICAL
- [ ] Run `fix-all-security-warnings.sql` in Supabase SQL Editor
- [ ] Verify no errors in execution
- [ ] Run verification queries at end of script
- **Time:** 2 minutes
- **Impact:** Fixes data privacy breach

### 2. Enable Leaked Password Protection ⚠️ HIGH
- [ ] Go to Supabase Dashboard
- [ ] Navigate to: **Authentication → Policies** (or Settings)
- [ ] Find "Leaked password protection" toggle
- [ ] **Turn it ON**
- [ ] Click **Save**
- **Time:** 30 seconds
- **Impact:** Prevents compromised passwords

---

## 🧪 Testing After Fixes

### Test 1: Verify RLS Works
- [ ] Sign in as your account
- [ ] Check dashboard - should see your data
- [ ] Create a second test account
- [ ] Sign in as test account
- [ ] Verify you DON'T see first account's data
- **Expected:** Complete data isolation between users

### Test 2: Verify App Functions
- [ ] Dashboard loads correctly
- [ ] Food tracking works (add/edit/delete meals)
- [ ] Workout logging works
- [ ] Profile updates work
- [ ] Program view loads workouts
- **Expected:** Everything works normally

### Test 3: Verify Password Protection
- [ ] Try to register with weak password like "password123"
- [ ] Should get error about compromised password
- [ ] Try with strong unique password
- [ ] Should work fine
- **Expected:** Weak passwords rejected

---

## 📊 Verification Queries

Run these in Supabase SQL Editor to confirm fixes:

### Check RLS is Enabled
```sql
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN (
    'workouts', 'meals', 'daily_targets', 
    'user_profiles', 'benchmark_prs'
  );
```
**Expected:** All should show `rls_enabled = true`

### Check Policies are Secure
```sql
SELECT 
  tablename,
  policyname,
  qual as using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('workouts', 'meals', 'user_profiles')
ORDER BY tablename;
```
**Expected:** Should see `auth.uid() = user_id` in policies, NOT `true`

### Check Functions Have search_path
```sql
SELECT 
  proname as function_name,
  proconfig as configuration
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('set_user_id', 'update_updated_at_column', 'get_meals_around_workout');
```
**Expected:** Should see `search_path` in configuration

---

## 🚨 If Something Breaks

### App won't load or shows errors:
1. Check browser console for errors
2. Look for RLS policy violations
3. Verify user is authenticated (auth.uid() is set)
4. Check Supabase logs for detailed errors

### Users can't sign up:
1. Check if they're using a weak/leaked password
2. Verify email confirmation settings
3. Check Supabase Auth logs

### Data not showing:
1. Verify RLS policies are correct
2. Check that `user_id` column matches `auth.uid()`
3. Run verification queries above

---

## 🎯 Security Status

### Before Fixes:
- ❌ Any user could see any other user's data
- ❌ Functions vulnerable to SQL injection
- ❌ Users could register with compromised passwords
- **Risk Level:** CRITICAL

### After Fixes:
- ✅ Users can only see their own data
- ✅ Functions protected from injection attacks
- ✅ Compromised passwords blocked
- **Risk Level:** LOW (with proper auth)

---

## 📝 Next Steps (Optional but Recommended)

### Short Term (This Week):
- [ ] Enable Multi-Factor Authentication (MFA)
- [ ] Set password minimum to 12+ characters
- [ ] Enable email confirmations
- [ ] Review session timeout settings

### Medium Term (This Month):
- [ ] Audit user accounts for suspicious activity
- [ ] Set up monitoring/alerts for failed login attempts
- [ ] Document security policies for team
- [ ] Consider adding rate limiting on auth endpoints

### Long Term (Ongoing):
- [ ] Regular security audits
- [ ] Keep Supabase and dependencies updated
- [ ] Monitor Supabase security advisories
- [ ] Review and update RLS policies as features evolve

---

## 🆘 Support

If you encounter issues:
1. Check Supabase Dashboard → Logs
2. Check browser console for errors
3. Review the detailed `SECURITY-FIX-INSTRUCTIONS.md`
4. Check Supabase documentation: https://supabase.com/docs/guides/auth

---

**Last Updated:** January 10, 2026
**Status:** Ready to apply fixes
