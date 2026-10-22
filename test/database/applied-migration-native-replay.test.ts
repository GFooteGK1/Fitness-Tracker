import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const pieces = vi.hoisted(() => [] as string[])
vi.mock('@electric-sql/pglite', () => ({ PGlite: class { async exec(source: string) { pieces.push(source) } } }))
import { recommendationFixture } from './recommendation-fixture'

// Explicit opt-in to the separately started, task-owned disposable cluster only.
// No dotenv, hosted connection string, CLI link, migrations repair or live SQL.
const psql = process.env.MCP_ACTIVITY_TEST_PSQL, port = Number(process.env.MCP_ACTIVITY_TEST_PORT)
const enabled = Boolean(psql && existsSync(psql) && Number.isInteger(port) && port >= 1024 && port <= 65535)
const database = `reconciliation_test_${randomUUID().replaceAll('-', '')}`
function execute(source: string, db: string) {
  const result = spawnSync(psql!, ['-X', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres',
    '-d', db, '-v', 'ON_ERROR_STOP=1'], {
    input: source, encoding: 'utf8', windowsHide: true, timeout: 60_000,
    env: { ...process.env, PGPASSWORD: '', PGCONNECT_TIMEOUT: '3' },
  })
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr)
  return result.stdout.trim()
}

it.skipIf(!enabled)('replays the legacy bootstrap and complete chronological migration tail on native PostgreSQL', async () => {
  expect(database).toMatch(/^reconciliation_test_[0-9a-f]{32}$/)
  await recommendationFixture()
  pieces.push(`CREATE ROLE supabase_auth_admin;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;`)
  for (const file of readdirSync('supabase/migrations').filter(file => file.endsWith('.sql') && file.slice(0, 14) > '20260918050000').sort()) {
    pieces.push(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  // Roles are cluster-wide; prior disposable test DBs may already have them.
  const source = pieces.join('\n').replace(/CREATE ROLE (anon|authenticated|service_role|supabase_auth_admin)( BYPASSRLS)?;/g,
    statement => `DO $$ BEGIN ${statement} EXCEPTION WHEN duplicate_object THEN NULL; END $$;`)
  execute(`CREATE DATABASE ${database};`, 'postgres')
  execute(source, database)
  const result = JSON.parse(execute(`SELECT json_build_object(
    'native',current_setting('server_version_num')::int >= 170000,
    'timingColumns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN('whoop_recovery','whoop_sleep','whoop_cycles') AND (column_name LIKE 'provider_%' OR column_name LIKE 'timing_%')),
    'appExecute',has_function_privilege('authenticated','public.socius_mcp_audience_hook(jsonb)','EXECUTE'),
    'serviceExecute',has_function_privilege('service_role','public.socius_mcp_audience_hook(jsonb)','EXECUTE'),
    'authExecute',has_function_privilege('supabase_auth_admin','public.socius_mcp_audience_hook(jsonb)','EXECUTE'),
    'mutatorExecute',has_function_privilege('authenticated','public.mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)','EXECUTE')
  );`, database))
  expect(result).toEqual({ native: true, timingColumns: 29, appExecute: false, serviceExecute: true, authExecute: true, mutatorExecute: false })
  // UUID database remains solely in the stopped disposable cluster for inspection.
}, 60_000)
