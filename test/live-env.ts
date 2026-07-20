/**
 * Loads `.env.local` (e.g. produced by `vercel env pull .env.local`) so the
 * env-gated LIVE tests — RUN_EVAL / RUN_LLM_SMOKE / RUN_SUPABASE_PULL — can read
 * real API keys locally, mirroring the production environment.
 *
 * dotenv does NOT override variables already present in the environment, so a
 * machine-level key (e.g. OPENAI_API_KEY) still wins. No-op when `.env.local`
 * is absent, so mocked tests and CI are unaffected. Imported for side effect
 * at the top of the gated live test files.
 */
import { existsSync } from 'node:fs'
import { config } from 'dotenv'

if (existsSync('.env.local')) {
  config({ path: '.env.local', quiet: true })
}
