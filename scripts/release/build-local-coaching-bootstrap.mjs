import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const output = 'output/app-quality-release'
const sqlPath = `${output}/local-coaching-bootstrap.sql`
const manifestPath = `${output}/local-coaching-bootstrap-manifest.json`
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const sections = []
const sources = new Map()
function source(file) {
  const raw = fs.readFileSync(path.join(repoRoot, file))
  const text = raw.toString('utf8').replace(/\r\n/g, '\n')
  sources.set(file, { path: file, sha256: sha(raw), bytes: raw.length })
  return text
}
function add(label, sql, provenance = {}) {
  sections.push({ label, sql: sql.trim() + '\n', ...provenance })
}
function extract(file, label, startMarker, endMarker) {
  const text = source(file)
  const start = text.indexOf(startMarker)
  const end = text.indexOf(endMarker, start) + endMarker.length
  if (start < 0 || end < start + endMarker.length) throw Error(`Missing slice: ${file} ${label}`)
  add(label, text.slice(start, end), { source: file, sourceStartLine: text.slice(0, start).split('\n').length,
    sourceEndLine: text.slice(0, end).split('\n').length, transformation: 'CRLF normalized to LF; contiguous source slice' })
}
function table(file, name) { extract(file, `base table ${name}`, `CREATE TABLE ${name} (`, '\n);') }
function policy(file, name) { extract(file, `source policy ${name}`, `CREATE POLICY "${name}"`, ';') }
function whole(file) { add(`migration ${file}`, source(file), { source: file, transformation: 'CRLF normalized to LF; entire source file exactly once' }) }

add('local execution guard', `
-- LOCAL SYNTHETIC ONLY. NOT A PRODUCTION MIGRATION OR FULL PRODUCTION CLONE.
-- Operator must verify the dedicated sociusfit-programming-local Supabase container,
-- API 127.0.0.1:55321, DB 127.0.0.1:55322, PostgreSQL 17 before execution.
-- Container-internal PostgreSQL port may differ from the host port.
-- Run only on its empty public application schema, with no Auth accounts yet.
-- This guard is an accident barrier, not cryptographic endpoint attestation.
-- In the SAME psql session first SET socius.local_fixture = 'sociusfit-programming-local';
-- Use psql -X -v ON_ERROR_STOP=1. Never run with --single-transaction: source
-- migrations contain BEGIN/COMMIT. Failure can leave a partial LOCAL schema.
-- Do not retry blindly, drop schemas, or point cleanup/reset at another target.
-- No accounts, athlete rows, OAuth tokens, external credentials or migration
-- ledger entries are seeded here. Create synthetic users via LOCAL Auth later.
-- Final revision migration makes old unstamped writers incompatible; this is
-- not production authorization or proof of cutover/rollback compatibility.
\\set ON_ERROR_STOP on
DO $local_guard$
BEGIN
 IF current_setting('socius.local_fixture',true) IS DISTINCT FROM 'sociusfit-programming-local'
 THEN RAISE EXCEPTION 'LOCAL SYNTHETIC ONLY: explicit local fixture marker is required'; END IF;
 IF current_database() <> 'postgres' OR current_setting('server_version_num')::int / 10000 <> 17
 THEN RAISE EXCEPTION 'Expected dedicated local Supabase PostgreSQL 17 database postgres'; END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL
 THEN RAISE EXCEPTION 'Real local Supabase Auth must already exist'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users) THEN RAISE EXCEPTION 'Refusing nonempty Auth database'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p'))
 THEN RAISE EXCEPTION 'Refusing existing public application tables'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') OR
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') OR
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN RAISE EXCEPTION 'Real local Supabase roles must already exist'; END IF;
 IF to_regprocedure('extensions.uuid_generate_v4()') IS NULL AND to_regprocedure('public.uuid_generate_v4()') IS NULL
 THEN RAISE EXCEPTION 'Local Supabase uuid-ossp extension must already be installed'; END IF;
END $local_guard$;
SET search_path = public, extensions;
SET statement_timeout = '30s';
SET lock_timeout = '5s';
`, { transformation: 'Local-only guard and settings; no Auth/role/function replacements' })

const original = 'docs/migrations/supabase-migration.sql'
const food = 'docs/migrations/food-tracking-migration.sql'
const holistic = 'docs/migrations/complete-holistic-migration.sql'
for (const name of ['workouts', 'block_scores', 'benchmark_prs', 'movements']) table(original, name)
for (const name of ['meals', 'daily_targets']) table(food, name)
table(holistic, 'user_profiles')
source('test/database/fixture.ts')
add('explicit fixture prerequisites', `
-- Present in the existing tested fixture; historical installation source is
-- not asserted. Do not mistake these adaptations for production ledger rows.
ALTER TABLE public.block_scores ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.meals ADD COLUMN meal_timing TEXT;
ALTER TABLE public.meals ADD COLUMN input_text TEXT;
`, { source: 'test/database/fixture.ts', transformation: 'Reuse only three additive column prerequisites; omit synthetic auth objects, owner policy and test_workout_owner constraint' })
extract(holistic, 'historical workout nutrition columns', 'ALTER TABLE workouts ADD COLUMN nutrition_quality_score', 'ALTER TABLE workouts ADD COLUMN post_workout_meal_id UUID REFERENCES meals(id);')
extract(original, 'historical base indexes', 'CREATE INDEX idx_workouts_user_date', 'CREATE INDEX idx_benchmark_prs_date ON benchmark_prs(date DESC);')
extract(holistic, 'historical nutrition indexes', 'CREATE INDEX idx_workouts_nutrition_context', 'CREATE INDEX idx_workouts_energy_levels ON workouts(energy_level, hydration_level) WHERE energy_level IS NOT NULL;')

for (const noun of ['workouts', 'meals', 'targets']) {
  for (const verb of ['view', 'insert', 'update', 'delete']) policy(noun === 'workouts' ? original : food, `Users can ${verb} their own ${noun}`)
}
for (const verb of ['view', 'insert']) policy(original, `Users can ${verb} their own block scores`)
for (const verb of ['view', 'insert', 'update']) policy(original, `Users can ${verb} their own PRs`)
policy(original, 'Anyone can view movements')
for (const verb of ['view', 'insert', 'update']) policy(holistic, `Users can ${verb} their own profile`)

add('local base table grants and authenticated policy roles', `
-- Keep source owner predicates; explicitly restrict their roles and grants for
-- the local application instead of relying on Supabase default privileges.
DO $base_acl$ DECLARE t TEXT; p RECORD; BEGIN
 FOREACH t IN ARRAY ARRAY['workouts','block_scores','benchmark_prs','movements','meals','daily_targets','user_profiles'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated',p.policyname,t);
  END LOOP;
 END LOOP;
END $base_acl$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workouts,public.meals,public.daily_targets TO authenticated;
GRANT SELECT,INSERT ON public.block_scores TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.benchmark_prs,public.user_profiles TO authenticated;
GRANT SELECT ON public.movements TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_profiles TO service_role;
`, { transformation: 'Local-only explicit base ACLs; source owner predicates retained; no blanket application grants' })

source('test/database/recommendation-fixture.ts')
for (const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) whole(`docs/migrations/${file}`)
for (const file of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260915220000_exercise_preferences.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql']) whole(`supabase/migrations/${file}`)
whole('docs/migrations/personal-records-migration.sql')
whole('supabase/migrations/20260728134202_personal_record_idempotency.sql')
for (const file of ['20260918020000_capture_receipts.sql','20260918030000_training_intent.sql','20260918040000_targeted_review_sources.sql']) whole(`supabase/migrations/${file}`)
whole('docs/migrations/whoop-integration-migration.sql')
add('local WHOOP grants without OAuth data', `
DO $whoop_acl$ DECLARE t TEXT; p RECORD; BEGIN
 FOREACH t IN ARRAY ARRAY['whoop_tokens','whoop_recovery','whoop_sleep','whoop_cycles','whoop_workouts','whoop_sync_status'] LOOP
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated',p.policyname,t);
  END LOOP;
 END LOOP;
END $whoop_acl$;
`, { transformation: 'Local-only read grants; no WHOOP OAuth/token/sync writes or fixtures' })
whole('supabase/migrations/20260918050000_recommendations.sql')
whole('supabase/migrations/20260921010000_coach_proposal_context_revision.sql')
add('local PostgREST schema reload', `NOTIFY pgrst, 'reload schema';`, { transformation: 'Refresh only the local PostgREST schema cache after bootstrap' })

let sql = ''
const sectionManifest = []
for (const section of sections) {
  const heading = `\n-- ===== ${section.label} =====\n`
  sql += heading
  const startLine = sql.split('\n').length
  sql += section.sql
  const { sql: body, ...metadata } = section
  sectionManifest.push({ ...metadata, outputStartLine: startLine, outputEndLine: sql.split('\n').length - 1, sha256: sha(body) })
}
fs.mkdirSync(path.join(repoRoot, output), { recursive: true })
fs.writeFileSync(path.join(repoRoot, sqlPath), sql)
const manifest = {
  purpose: 'LOCAL SYNTHETIC ONLY: scoped coaching release rehearsal, never production',
  expectedTarget: { projectId: 'sociusfit-programming-local', api: 'http://127.0.0.1:55321', databaseHostPort: 55322, postgresMajor: 17 },
  output: { path: sqlPath, sha256: sha(sql), bytes: Buffer.byteLength(sql), lines: sql.split('\n').length },
  sourceManifest: [...sources.values()], sections: sectionManifest,
  prerequisites: ['Real local Supabase Auth/roles and uuid-ossp extension installed', 'Empty Auth users and empty public application tables', 'Explicit session local fixture marker after operator verifies endpoint', 'psql ON_ERROR_STOP; source files manage transactions; no outer transaction'],
  limitations: ['Not an exact production schema clone or migration-ledger reconstruction', 'Base grants explicitly scoped for local tests; do not claim full production ACL parity', 'No Auth identities seeded; use local Auth admin API to create synthetic confirmed users', 'Legacy holistic views/functions, external services, WHOOP synchronization and historical backup tables excluded', 'No production data, configuration, secrets, credentials, ledger writes or Auth replacements', 'New revision migration rejects old unstamped writers; compatibility/pause/rollback remain to test', 'No database execution performed by generator'],
}
fs.writeFileSync(path.join(repoRoot, manifestPath), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify({ output: manifest.output, manifest: manifestPath, sources: sources.size, sections: sections.length }, null, 2))
