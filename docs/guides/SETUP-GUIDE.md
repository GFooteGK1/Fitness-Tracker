# 🚀 Quick Setup Guide

Follow these steps to get your fitness tracker running.

## Step 1: Supabase Setup (5 minutes)

### Create Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Choose a name (e.g., "fitness-tracker")
4. Set a strong database password (save it!)
5. Choose a region close to you
6. Click "Create new project"
7. Wait ~2 minutes for provisioning

### Run Database Migration
1. In Supabase dashboard, click "SQL Editor" in the left sidebar
2. Click "New Query"
3. Open `supabase-migration.sql` from this project
4. Copy ALL the SQL code
5. Paste into the Supabase SQL editor
6. Click "Run" (bottom right)
7. You should see "Success. No rows returned"

### Get API Credentials
1. Click "Settings" (gear icon) in the left sidebar
2. Click "API" under Project Settings
3. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## Step 2: Environment Variables

1. In your `fitness-tracker` folder, create a file named `.env.local`
2. Add your credentials:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Anthropic (your existing API key)
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

3. Save the file

## Step 3: Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Step 4: Test It Out

### Log Your First Workout

1. Click "Log Workout" in the nav
2. Enter a simple workout:
   ```
   Grace: 9:47 Rx
   ```
3. Click "Submit Workout"
4. Wait 5-10 seconds for AI parsing
5. You should see: "✓ Workout logged! Score: Grace: 9:47 RX"

### Query Your Data

1. Click "Query" in the nav
2. Click "What's my best Grace time?"
3. Wait 5-10 seconds
4. You should see your Grace time from the workout you just logged

## Troubleshooting

### "Failed to save workout: relation 'workouts' does not exist"
- You didn't run the database migration
- Go back to Step 1 and run the SQL in Supabase

### "API key not configured"
- Check your `.env.local` file exists
- Make sure there are no spaces around the `=` signs
- Restart the dev server (`Ctrl+C` then `npm run dev`)

### "Failed to parse workout"
- Check your Anthropic API key is correct
- Make sure you have credits in your Anthropic account
- Check the browser console for detailed errors

### Database Connection Issues
- Verify your Supabase URL and anon key are correct
- Check that your Supabase project is running (not paused)
- Free tier projects pause after 1 week of inactivity

## Next Steps

Once everything is working:

1. **Migrate your old data** - Export from Google Sheets and import to Supabase
2. **Add more movements** - Insert into the `movements` table
3. **Customize the UI** - Edit the Tailwind classes in the page files
4. **Deploy to Vercel** - Run `vercel` in the terminal (install with `npm i -g vercel`)

## Need Help?

- Check the main README.md for detailed documentation
- Review the code comments in the API routes
- Test the database directly in Supabase SQL Editor

## What You've Built

You now have:
- ✅ Modern Next.js frontend
- ✅ PostgreSQL database with proper schema
- ✅ AI-powered workout parsing
- ✅ Natural language queries
- ✅ Secure authentication ready (when you add it)
- ✅ Free hosting ready (Vercel + Supabase)

**Time to start logging workouts!** 💪
