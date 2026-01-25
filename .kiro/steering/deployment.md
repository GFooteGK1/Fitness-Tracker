---
inclusion: manual
---

# Deployment Guide

## Vercel Deployment

### Initial Setup

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

### Subsequent Deployments

```bash
# Automatic on push
git push origin main

# Or manual with Vercel CLI
npm install -g vercel
vercel
```

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing (`npm run test`)
- [ ] No TypeScript errors (`npm run build`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Code reviewed and approved

### Database
- [ ] All migrations applied
- [ ] RLS policies enabled and tested
- [ ] Indexes created for performance
- [ ] Backup strategy in place
- [ ] Storage bucket configured

### Security
- [ ] Environment variables set in Vercel
- [ ] No secrets in code
- [ ] RLS policies tested with multiple users
- [ ] Password requirements enforced
- [ ] API rate limiting considered

### Performance
- [ ] Images optimized
- [ ] API responses under 200ms average
- [ ] Mobile performance tested on 3G
- [ ] Lighthouse score > 90

### Functionality
- [ ] Authentication flow works
- [ ] Workout logging works (text, photo, voice)
- [ ] Food tracking works (photo upload, analysis)
- [ ] Dashboard displays correctly
- [ ] Program view loads from Google Sheets
- [ ] Natural language queries work
- [ ] Mobile camera access works (HTTPS)

### Monitoring
- [ ] Error tracking set up (Sentry)
- [ ] Analytics configured (optional)
- [ ] Vercel logs accessible
- [ ] Supabase logs accessible

## Environment-Specific Configuration

### Development
- Uses `.env.local`
- Local development server
- Hot reload enabled
- Verbose error messages

### Production
- Uses Vercel environment variables
- Serverless functions
- Optimized builds
- User-friendly error messages
- Performance monitoring

## Database Deployment

Supabase database is already hosted and managed. No deployment needed.

**Production Checklist:**
- [ ] RLS policies enabled and tested
- [ ] Storage bucket configured
- [ ] Backup strategy in place
- [ ] Monitor connection limits
- [ ] Check free tier limits

## Post-Deployment Verification

### Smoke Tests
1. **Authentication:**
   - Sign up new user
   - Sign in existing user
   - Sign out

2. **Workout Logging:**
   - Log workout via text
   - Log workout via photo OCR
   - View workout history

3. **Food Tracking:**
   - Upload meal photo
   - View daily progress
   - Edit meal macros

4. **Dashboard:**
   - View statistics
   - Check recent PRs
   - Verify charts load

5. **Mobile:**
   - Test on actual mobile device
   - Verify camera access
   - Check touch interactions

### Performance Checks
```bash
# Run Lighthouse audit
npx lighthouse https://your-app.vercel.app --view

# Check Core Web Vitals
# - LCP (Largest Contentful Paint) < 2.5s
# - FID (First Input Delay) < 100ms
# - CLS (Cumulative Layout Shift) < 0.1
```

## Rollback Procedure

If deployment has issues:

1. **Vercel Dashboard:**
   - Go to Deployments
   - Find previous working deployment
   - Click "Promote to Production"

2. **Git Revert:**
   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Database Rollback:**
   - Restore from Supabase backup
   - Or manually revert migrations

## Monitoring & Maintenance

### Daily Checks
- [ ] Check error logs (Vercel, Supabase)
- [ ] Monitor API response times
- [ ] Check free tier usage limits

### Weekly Checks
- [ ] Review user feedback
- [ ] Check database performance
- [ ] Update dependencies if needed
- [ ] Review security logs

### Monthly Checks
- [ ] Database backup verification
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Cost analysis

## Scaling Considerations

### Free Tier Limits
- **Vercel:** 100GB bandwidth/month
- **Supabase:** 500MB database, 1GB storage, 2GB bandwidth/month
- **Anthropic:** Pay-as-you-go (~$0.01 per workout)

### When to Upgrade
- Approaching bandwidth limits
- Database size > 400MB
- Need more concurrent connections
- Want custom domain
- Need better performance

### Upgrade Path
1. Vercel Pro ($20/month) - More bandwidth, better performance
2. Supabase Pro ($25/month) - More database, storage, bandwidth
3. Consider caching layer (Redis)
4. Consider CDN for images

## Troubleshooting Deployment

### Build Fails
```bash
# Check build logs in Vercel
# Common issues:
# - Missing environment variables
# - TypeScript errors
# - Dependency issues

# Test build locally
npm run build
```

### Runtime Errors
```bash
# Check Vercel function logs
# Check Supabase logs
# Enable verbose logging temporarily

# Test API routes locally
npm run dev
curl http://localhost:3000/api/health
```

### Database Connection Issues
```bash
# Verify Supabase project not paused
# Check connection string correct
# Verify RLS policies not blocking
# Check connection pool limits
```

## Documentation

Keep these updated after deployment:
- [ ] README.md with deployment URL
- [ ] CLAUDE.MD with production notes
- [ ] Session notes with deployment details
- [ ] Error documentation if issues found

## Support & Maintenance

**Contact Information:**
- Vercel Support: https://vercel.com/support
- Supabase Support: https://supabase.com/support
- Anthropic Support: https://support.anthropic.com

**Backup Contacts:**
- GitHub repository owner
- Database administrator
- DevOps team (if applicable)
