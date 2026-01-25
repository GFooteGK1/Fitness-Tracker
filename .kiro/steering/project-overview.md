# SociusFit - Project Overview

**Version:** 0.1.0 (Production Ready)
**Last Updated:** January 23, 2026

## What is SociusFit?

SociusFit is a holistic AI-powered fitness companion that integrates:
- **Workout Tracking** - Multi-modal input (text, photo OCR, voice)
- **Nutrition Monitoring** - Photo-based meal logging with AI analysis
- **Program Management** - Google Sheets integration for coach programming
- **Cross-Domain Insights** - AI correlations between workouts and nutrition
- **Analytics Dashboard** - Track progress, PRs, and workout types

## Key Capabilities

- 📝 **Natural Language Logging** - Write workouts like you would on a whiteboard
- 📷 **Photo OCR** - Snap a photo of the whiteboard, AI extracts the workout
- 🎤 **Voice Input** - Speak your workout using Web Speech API
- 🍽️ **Nutrition Tracking** - Photo-based meal logging with AI macro estimation
- 🤖 **AI Parsing** - Claude automatically structures your data
- 📊 **Analytics Dashboard** - Track progress, PRs, and workout types
- 🔍 **Conversational Queries** - Ask questions about your workout history
- 📅 **Program View** - View coach programming from Google Sheets
- 📱 **Mobile-First** - Optimized for gym-floor and kitchen use
- 🔒 **Secure** - Row-level security with Supabase

## Tech Stack

### Frontend
- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks (useState, useEffect)
- **Auth Context**: Custom AuthContext with Supabase

### Backend
- **API**: Next.js API Routes (serverless functions)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (email/password)
- **Storage**: Supabase Storage (meal photos)

### AI/ML
- **Provider**: Anthropic
- **Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **Use Cases**: Workout parsing, meal analysis, natural language queries, photo OCR, cross-domain insights

### Deployment
- **Frontend/API**: Vercel (serverless)
- **Database**: Supabase (managed PostgreSQL)

## Performance Improvements

| Metric | Previous | Current | Improvement |
|--------|----------|---------|-------------|
| Parse Time | 10-15s | 3-5s | 3x faster |
| Database Queries | 1-3s | <100ms | 10-30x faster |
| Page Load | 2-4s | <1s | 2-4x faster |

## Cost Estimates

**Monthly Cost (Personal Use):**
- Vercel: $0 (free tier)
- Supabase: $0 (free tier)
- Anthropic: ~$3-5/month (300-500 workouts + meals)
- **Total: ~$3-5/month**
