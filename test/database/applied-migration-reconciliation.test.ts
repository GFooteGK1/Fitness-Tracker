import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { recommendationFixture } from './recommendation-fixture'
import manifest from '../../docs/verification/llm-coaching-context/applied-migration-reconciliation-manifest.json'

const directory = 'supabase/migrations'
const files = readdirSync(directory).filter(file => file.endsWith('.sql')).sort()
// Offline comparison only. This never connects to a database or repairs history.
function pending(local: string[], applied: { version: string; name: string }[]) {
  const entries = local.map(file => {
    const match = /^(\d{14})_(.+)\.sql$/.exec(file)
    if (!match) throw new Error(`Invalid migration filename: ${file}`)
    return { version: match[1], name: match[2], file }
  })
  for (const group of [entries, applied]) {
    if (new Set(group.map(row => row.version)).size !== group.length) throw new Error('Duplicate version')
  }
  for (const row of applied) {
    if (!entries.some(entry => entry.version === row.version && entry.name === row.name)) {
      throw new Error(`Unreconciled applied migration: ${row.version}`)
    }
  }
  return entries.filter(entry => !applied.some(row => row.version === entry.version)).map(entry => entry.file)
}

describe('read-only historical migration source reconciliation', () => {
  it('preserves the exact recorded UTF-8 bytes under their original versions and names', () => {
    expect(manifest.recovered.map(row => row.version)).toEqual(['20261018220557', '20261019154246'])
    for (const row of manifest.recovered) {
      const bytes = readFileSync(row.path)
      expect(bytes.byteLength).toBe(row.bytes)
      expect(createHash('md5').update(bytes).digest('hex')).toBe(row.md5)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      expect(row.recordedStatementCount).toBe(1)
      expect(row.path).toBe(`${directory}/${row.version}_${row.name}.sql`)
    }
    const hook = readFileSync(manifest.recovered[0].path, 'utf8')
    const binding = /#>>\s*'\{claims,client_id\}'\s*=\s*'([^']+)'/.exec(hook)![1]
    expect(binding).toMatch(/^[0-9a-f-]{36}$/)
    expect(hook.replace(binding, '__SOCIUS_REGISTERED_CLIENT_UUID__')).toBe(
      readFileSync('docs/plans/socius-mcp-audience-hook.sql.template', 'utf8').replaceAll('\r\n', '\n'))
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    expect(normalize(readFileSync(manifest.recovered[1].path, 'utf8'))).toBe(
      normalize(readFileSync('docs/proposals/recovery-timing-owner/add-provider-timing.sql', 'utf8')))
  })

  it('leaves exactly the unapplied activity correction SQL pending against the observed hosted inventory', () => {
    expect(manifest.applied).toHaveLength(48)
    expect(pending(files, manifest.applied)).toEqual(manifest.pending)
    expect(manifest.pending).toEqual(['20261022131056_activity_measurement_corrections.sql'])
    // Bind canonical Git/LF bytes so the same assertion works on Windows and CI.
    expect(createHash('sha256').update(readFileSync(`${directory}/${manifest.pending[0]}`, 'utf8').replaceAll('\r\n', '\n')).digest('hex'))
      .toBe('aa79d59d6b83f7d8a00e66cbb51a24b1d4f330b4cf393c65871a9d8d13dbd4a5')
    expect(() => pending([...files, files[0]], manifest.applied)).toThrow('Duplicate')
    expect(() => pending(files, [...manifest.applied, manifest.applied[0]])).toThrow('Duplicate')
    expect(() => pending(files.slice(1), manifest.applied)).toThrow('Unreconciled')
    expect(() => pending(files, [{ ...manifest.applied[0], name: 'wrong_name' }])).toThrow('Unreconciled')
  })

  it('replays the maintained legacy bootstrap and every later tracked migration in order on disposable PostgreSQL', async () => {
    // The repository predates versioned migrations: this is an explicit maintained
    // legacy bootstrap, not a claim that supabase db reset can rebuild platform Auth.
    const db = await recommendationFixture()
    try {
      await db.exec(`CREATE ROLE supabase_auth_admin;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;`)
      const tail = files.filter(file => file.slice(0, 14) > '20260918050000')
      const applied = new Set<string>()
      for (const file of tail) {
        await db.exec(readFileSync(`${directory}/${file}`, 'utf8'))
        applied.add(file)
      }
      expect(tail).toContain(manifest.recovered[0].path.split('/').at(-1))
      expect(tail).toContain(manifest.recovered[1].path.split('/').at(-1))
      expect(tail.at(-1)).toBe(manifest.pending[0])
      // Only SQL actually executed above is considered applied in this local runner.
      const replay = tail.filter(file => !applied.has(file))
      expect(replay).toEqual([])
      const columns = await db.query<{ n: number }>(`SELECT count(*)::int n FROM information_schema.columns
        WHERE table_schema='public' AND table_name IN('whoop_recovery','whoop_sleep','whoop_cycles')
        AND (column_name LIKE 'provider_%' OR column_name LIKE 'timing_%')`)
      expect(columns.rows).toEqual([{ n: 29 }])
      const acl = await db.query(`SELECT role,has_function_privilege(role,
        'public.socius_mcp_audience_hook(jsonb)','EXECUTE') allowed
        FROM (VALUES ('anon'),('authenticated'),('service_role'),('supabase_auth_admin')) roles(role)`)
      expect(acl.rows).toEqual([
        { role: 'anon', allowed: false }, { role: 'authenticated', allowed: false },
        { role: 'service_role', allowed: true }, { role: 'supabase_auth_admin', allowed: true },
      ])
      const mutationACL = await db.query(`SELECT has_function_privilege('authenticated',
        'public.mutate_capture_activity(text,uuid,integer,text,jsonb,jsonb,jsonb,boolean,boolean)','EXECUTE') allowed`)
      expect(mutationACL.rows).toEqual([{ allowed: false }])
      // Historical ADD COLUMN is intentionally non-idempotent: version-aware
      // deployment must skip it, rather than modifying the source with IF NOT EXISTS.
      await expect(db.exec(readFileSync(manifest.recovered[1].path, 'utf8'))).rejects.toThrow()
      await db.exec('ROLLBACK')
    } finally { await db.close() }
  }, 60_000)
})
