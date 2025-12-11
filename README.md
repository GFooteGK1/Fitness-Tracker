# 🏋️ Fitness Tracker

AI-powered workout logging and analytics platform. Log workouts using natural language, voice, or photos. Query your history with conversational AI.

## Features

- 📝 **Natural Language Logging** - Write workouts like you would on a whiteboard
- 🤖 **AI Parsing** - Claude automatically structures your data
- 📊 **Analytics Dashboard** - Track progress and PRs
- 🔍 **Conversational Queries** - Ask questions about your workout history
- 📱 **Mobile-First** - Optimized for gym-floor logging
- 🔒 **Secure** - Row-level security with Supabase

## Tech Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Real-time)
- **AI**: Claude Sonnet 4 (Anthropic)
- **Hosting**: Vercel (frontend) + Supabase (backend)

## Getting Started

### 1. Prerequisites

- Node.js 20+ installed
- Supabase account (free tier)
- Anthropic API key

### 2. Clone and Install

```bash
cd fitness-tracker
npm install
```

### 3. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be provisioned (~2 minutes)
3. Go to **SQL Editor** in the Supabase dashboard
4. Copy the contents of `supabase-migration.sql` and run it
5. Go to **Settings > API** and copy:
   - Project URL
   - Anon/Public key

### 4. Configure Environment Variables

Create `.env.local` in the root directory:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Logging a Workout

Navigate to `/log` and enter your workout naturally:

```
12min AMRAP:
5 Pull-ups
10 Push-ups
15 Air Squats

Got 7 rounds + 5 pull-ups
RPE: 8/10
```

The AI will:
- Parse the workout structure
- Calculate scores (rounds, reps, tonnage, time)
- Detect workout type (AMRAP, For Time, Strength, etc.)
- Store structured data in the database

### Querying Your History

Navigate to `/query` and ask questions:

- "What's my best Fran time?"
- "When did I last do back squat?"
- "How often do I deadlift?"
- "Have I ever done Murph?"

The AI analyzes your workout history and responds conversationally.

## Database Schema

### Tables

- **workouts** - Main workout log with JSONB blocks
- **movements** - Movement dictionary with aliases
- **block_scores** - Performance metrics per workout block
- **benchmark_prs** - Personal records for named workouts

### Key Features

- Row Level Security (RLS) - Users only see their own data
- JSONB for flexible workout structures
- Full-text search on workout descriptions
- Automatic user_id assignment via triggers

## Deployment

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Follow the prompts and add your environment variables in the Vercel dashboard.

### Database is Already Deployed

Your Supabase database is already hosted and managed. No additional deployment needed.

## Migration from Google Apps Script

If you're migrating from the original Google Apps Script version:

1. Export your `Parsed_Workouts` sheet to CSV
2. Transform the data to match the new schema
3. Import via Supabase SQL Editor or use the Supabase API

See `migration-guide.md` for detailed instructions (coming soon).

## Project Structure

```
fitness-tracker/
├── app/
│   ├── api/
│   │   ├── parse-workout/route.ts  # Workout parsing endpoint
│   │   └── query/route.ts          # Query endpoint
│   ├── log/page.tsx                # Workout logging UI
│   ├── query/page.tsx              # Query UI
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home page
│   └── globals.css                 # Global styles
├── supabase-migration.sql          # Database schema
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

## Roadmap

- [ ] Dashboard with charts and analytics
- [ ] Voice input (Web Speech API)
- [ ] Photo OCR (Claude Vision)
- [ ] PWA support for offline mode
- [ ] Workout templates library
- [ ] PR detection and notifications
- [ ] Export to CSV/PDF
- [ ] Multi-user leaderboards

## Contributing

This is a personal project, but suggestions and feedback are welcome!

## License

MIT

## Acknowledgments

Built by Greg - CrossFit competitor and data architect. Migrated from Google Apps Script to modern web stack.
