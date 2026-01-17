# ✅ Setup Checklist

Follow this checklist to get your fitness tracker running.

## Phase 1: Initial Setup (15 minutes)

### 1. Supabase Setup
- [ ] Go to [supabase.com](https://supabase.com) and sign up/login
- [ ] Click "New Project"
- [ ] Name it "fitness-tracker"
- [ ] Set a strong database password (save it!)
- [ ] Choose your region
- [ ] Wait for provisioning (~2 minutes)

### 2. Database Migration
- [ ] Open Supabase dashboard
- [ ] Click "SQL Editor" in sidebar
- [ ] Click "New Query"
- [ ] Open `supabase-migration.sql` from this project
- [ ] Copy ALL the SQL
- [ ] Paste into Supabase editor
- [ ] Click "Run"
- [ ] Verify: "Success. No rows returned"

### 3. Get API Credentials
- [ ] In Supabase, click Settings → API
- [ ] Copy "Project URL"
- [ ] Copy "anon public" key

### 4. Environment Variables
- [ ] Create `.env.local` file in project root
- [ ] Add Supabase URL
- [ ] Add Supabase anon key
- [ ] Add your Anthropic API key
- [ ] Save the file

### 5. Start the App
- [ ] Open terminal in `fitness-tracker` folder
- [ ] Run `npm run dev`
- [ ] Open http://localhost:3000
- [ ] Verify: Home page loads

## Phase 2: Test Core Features (10 minutes)

### 6. Test Workout Logging
- [ ] Click "Log Workout" in nav
- [ ] Enter: `Grace: 9:47 Rx`
- [ ] Click "Submit Workout"
- [ ] Wait 5-10 seconds
- [ ] Verify: Success message appears
- [ ] Check Supabase: Go to Table Editor → workouts
- [ ] Verify: New row exists

### 7. Test Queries
- [ ] Click "Query" in nav
- [ ] Click "What's my best Grace time?"
- [ ] Wait 5-10 seconds
- [ ] Verify: Answer mentions your Grace time
- [ ] Try custom question: "When did I last workout?"
- [ ] Verify: Answer is relevant

### 8. Test Complex Workout
- [ ] Go to Log Workout
- [ ] Enter:
  ```
  12min AMRAP:
  5 Pull-ups
  10 Push-ups
  15 Air Squats
  
  Got 7 rounds + 5 pull-ups
  RPE: 8/10
  ```
- [ ] Submit
- [ ] Verify: Score shows "7+5"
- [ ] Check Supabase: workouts table
- [ ] Verify: blocks JSON contains all movements

## Phase 3: Verify Database (5 minutes)

### 9. Check Tables
- [ ] Supabase → Table Editor
- [ ] Verify table exists: `workouts`
- [ ] Verify table exists: `movements`
- [ ] Verify table exists: `block_scores`
- [ ] Verify table exists: `benchmark_prs`

### 10. Check Movements
- [ ] Open `movements` table
- [ ] Verify: 10 movements seeded
- [ ] Check: Pull-up, Push-up, Air Squat, etc.

### 11. Check Block Scores
- [ ] Open `block_scores` table
- [ ] Verify: Rows exist for your test workouts
- [ ] Check: workout_id matches workouts table

## Phase 4: Troubleshooting (If Needed)

### Common Issues

#### "Failed to save workout"
- [ ] Check `.env.local` exists
- [ ] Verify Supabase URL is correct
- [ ] Verify anon key is correct
- [ ] Restart dev server (Ctrl+C, then `npm run dev`)

#### "Failed to parse workout"
- [ ] Check Anthropic API key in `.env.local`
- [ ] Verify you have credits in Anthropic account
- [ ] Check browser console for errors (F12)

#### "Relation 'workouts' does not exist"
- [ ] Go back to Supabase SQL Editor
- [ ] Re-run the migration SQL
- [ ] Verify all tables created

#### Database connection errors
- [ ] Check Supabase project is not paused
- [ ] Verify URL and key are correct
- [ ] Try refreshing Supabase dashboard

## Phase 5: Customization (Optional)

### 12. Add More Movements
- [ ] Supabase → Table Editor → movements
- [ ] Click "Insert row"
- [ ] Add your custom movements
- [ ] Include aliases for better matching

### 13. Customize UI
- [ ] Edit `app/globals.css` for colors
- [ ] Edit `app/layout.tsx` for nav
- [ ] Edit page files for layout changes
- [ ] Changes appear instantly (hot reload)

### 14. Test on Mobile
- [ ] Find your local IP (run `ipconfig` in terminal)
- [ ] On phone, go to `http://YOUR-IP:3000`
- [ ] Test logging a workout
- [ ] Verify responsive design works

## Phase 6: Deployment (Optional)

### 15. Deploy to Vercel
- [ ] Install Vercel CLI: `npm i -g vercel`
- [ ] Run `vercel` in project folder
- [ ] Follow prompts
- [ ] Add environment variables in Vercel dashboard
- [ ] Verify: App works at your-app.vercel.app

### 16. Set Up Custom Domain (Optional)
- [ ] Buy domain (Namecheap, Google Domains, etc.)
- [ ] In Vercel dashboard, go to Settings → Domains
- [ ] Add your domain
- [ ] Update DNS records as instructed
- [ ] Wait for DNS propagation (~1 hour)

## Success Criteria

You're done when:
- ✅ App runs at http://localhost:3000
- ✅ You can log a workout successfully
- ✅ You can query your workout history
- ✅ Data appears in Supabase tables
- ✅ No console errors in browser (F12)

## Next Steps

After completing this checklist:
1. Read `MIGRATION-SUMMARY.md` for what changed
2. Review `README.md` for full documentation
3. Start migrating your old data from Google Sheets
4. Add features from the roadmap

---

**Need help?** Check `SETUP-GUIDE.md` for detailed troubleshooting.
