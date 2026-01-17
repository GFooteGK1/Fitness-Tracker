# Vercel Deployment Guide

## 🚀 Prerequisites

1. **GitHub Account** - Your code needs to be in a GitHub repository
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com) (free tier is perfect)
3. **Environment Variables** - Your Supabase and Anthropic API keys

## 📋 Step-by-Step Deployment

### 1. Push Code to GitHub

First, create a GitHub repository and push your fitness-tracker code:

```bash
# Navigate to your fitness-tracker folder
cd fitness-tracker

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial fitness tracker app"

# Add your GitHub repository as origin
git remote add origin https://github.com/GFootegK1/fitness-tracker.git

# Push to GitHub
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "New Project"
3. Import your `fitness-tracker` repository
4. Vercel will auto-detect it's a Next.js project

### 3. Configure Environment Variables

In Vercel project settings, add these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 4. Deploy

1. Click "Deploy" in Vercel
2. Wait for build to complete (usually 2-3 minutes)
3. Get your live URL (e.g., `https://fitness-tracker-xyz.vercel.app`)

## 🔧 Build Configuration

Vercel should auto-detect these settings, but verify:

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

## 📱 Mobile Access

Once deployed, you can access your app from anywhere:
- **Desktop**: `https://your-app.vercel.app`
- **Mobile**: Same URL, works perfectly on iPhone
- **PWA**: Can be added to home screen for app-like experience

## 🔄 Automatic Deployments

Every time you push to GitHub:
1. Vercel automatically rebuilds
2. New version goes live in ~2 minutes
3. Zero downtime deployments

## 🛠️ Troubleshooting

### Build Errors
- Check Vercel build logs for specific errors
- Ensure all dependencies are in `package.json`
- Verify environment variables are set correctly

### API Issues
- Confirm Supabase URLs are correct
- Test API endpoints work locally first
- Check Vercel function logs for errors

### Mobile Issues
- Test on actual device after deployment
- PWA features work better on HTTPS (Vercel provides this)

## 🎯 Post-Deployment Checklist

- [ ] Dashboard loads and shows workout stats
- [ ] Program page displays Google Sheets workouts
- [ ] Log page photo/voice capture works on mobile
- [ ] Query page searches workout history
- [ ] All navigation works smoothly
- [ ] Dark mode functions properly

## 🔐 Security Notes

- Environment variables are secure in Vercel
- Supabase RLS policies protect your data
- HTTPS is automatic on Vercel domains

Your fitness tracker will be live and accessible from anywhere! 🌍