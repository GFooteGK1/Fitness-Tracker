---
inclusion: manual
---

# Deployment Guide

For database-affecting changes, use the maintained
[migration release procedure](../../docs/migrations/README.md#migration-release-procedure)
before a triggering push, merge or release. These instructions do not establish
current provider settings or grant permission to change a live environment.

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
   - Verify the configured deployment branch and provider settings before a push
   - Or click "Deploy" button manually

### Subsequent Deployments

```bash
# With an approved release and verified integration bindings
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
- [ ] Intended target, complete pending SQL set and runner/settings verified
- [ ] Exact database scope and application/schema compatibility approved before release
- [ ] Workflow, ledger and catalog outcome inspected after release
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

Hosting and schema deployment are separate concerns. Provider-managed migration
integrations can run independently of repository CI and the application build;
this guide does not establish whether one is enabled. Follow the
[migration release procedure](../../docs/migrations/README.md#migration-release-procedure),
including pre-merge approval and fresh post-release reconciliation. Do not manually
apply an already recorded matching migration or repeat a production migration to
test idempotence.

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

3. **Database Recovery:**
   - Application rollback does not undo SQL; verify old-code/schema compatibility
     before promoting an older application or pushing a revert.
   - Follow the migration-specific, separately approved recovery/forward plan in
     the [migration release procedure](../../docs/migrations/README.md#migration-release-procedure).
     Do not blindly reverse/narrow SQL, restore a backup or manually repair history.

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
