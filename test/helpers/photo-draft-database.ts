import { databaseFixture, sqlFile } from '../database/fixture'
import type { PGlite } from '@electric-sql/pglite'

/** Existing capture schema, executing PostgreSQL functions and RLS without a hosted write. */
export async function photoDraftDatabase() {
  const db = await databaseFixture()
  for (const file of ['coach-system-migration.sql','coach-plan-replacement-migration.sql','coach-complete-programming-v0-3-migration.sql','coach-execution-feedback-migration.sql','layered-adaptive-evidence-migration.sql','atomic-coach-session-completion-migration.sql','qwik-vbt-import-migration.sql','coach-trust-review-migration.sql','rolling-weekly-coach-migration.sql']) await db.exec(sqlFile(`docs/migrations/${file}`))
  for (const file of ['20260728143952_nutrition_fast_logging.sql','20260730130953_coach_workout_runner_v0_5.sql','20260904023000_fix_atomic_session_workout_link.sql','20260904120000_logging_receipts.sql','20260918010000_optional_session_feedback.sql','20260918011000_session_capture_signals.sql']) await db.exec(sqlFile(`supabase/migrations/${file}`))
  await db.exec(sqlFile('docs/migrations/personal-records-migration.sql'))
  await db.exec(sqlFile('supabase/migrations/20260728134202_personal_record_idempotency.sql'))
  await db.exec(sqlFile('supabase/migrations/20260918020000_capture_receipts.sql'))
  return db
}

export async function photoDraftActor(db: PGlite, owner: string) {
  await db.exec('SET ROLE authenticated')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
}

// This adapter replaces only HTTP transport. Functions, ownership, transaction rollback,
// request fingerprints, row reads and receipts execute in the real PostgreSQL engine.
export function photoDraftClient(db: PGlite, owner: () => string | null) {
  const argumentsByFunction: Record<string, string[]> = {
    begin_logging_request: ['p_key','p_fingerprint'], finish_logging_request: ['p_id','p_response','p_status'],
    save_activity_draft: ['p_request_id','p_draft_id','p_expected_revision','p_operation','p_discard'],
    commit_activity_draft: ['p_draft_id','p_expected_revision','p_request_id'],
  }
  return {
    auth: { getUser: async () => ({ data: { user: owner() ? { id: owner() } : null }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      try {
        const names = argumentsByFunction[name]
        if (!names) throw new Error(`Unsupported test function ${name}`)
        const rows = await db.query<{ result: unknown }>(`SELECT ${name}(${names.map((_, i) => `$${i + 1}`).join(',')}) result`, names.map(key => args[key] ?? null))
        return { data: rows.rows[0].result, error: null }
      } catch (error) { return { data: null, error: { code: (error as { code?: string }).code, message: (error as Error).message } } }
    },
    from: (table: string) => {
      if (!['activity_drafts','activity_mutations','logging_requests','logging_request_items'].includes(table)) throw new Error('Unsupported test table')
      const filters: string[] = [], values: unknown[] = []
      let order = '', limit = '', one = false, selection = '*'
      const run = async () => {
        try { const rows = await db.query(`SELECT ${selection} FROM ${table}${filters.length ? ' WHERE ' + filters.join(' AND ') : ''}${order}${limit}`, values)
          return { data: one ? rows.rows[0] ?? null : rows.rows, error: null }
        } catch (error) { return { data: null, error: { code: (error as { code?: string }).code } } }
      }
      const column = (name: string) => { if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid test column'); return name }
      const query = {
        select: (fields = '*') => { if (!/^(\*|[a-z_,]+)$/.test(fields)) throw new Error('Invalid test selection'); selection = fields; return query },
        eq: (name: string, value: unknown) => { values.push(value); filters.push(`${column(name)}=$${values.length}`); return query },
        gt: (name: string, value: unknown) => { values.push(value); filters.push(`${column(name)}>$${values.length}`); return query },
        in: (name: string, entries: unknown[]) => { const placeholders = entries.map(value => { values.push(value); return `$${values.length}` }); filters.push(`${column(name)} IN (${placeholders.join(',')})`); return query },
        order: (name: string, options?: { ascending?: boolean }) => { order = ` ORDER BY ${column(name)} ${options?.ascending === false ? 'DESC' : 'ASC'}`; return query },
        limit: (count: number) => { limit = ` LIMIT ${Math.floor(count)}`; return query },
        maybeSingle: () => { one = true; return run() },
        then: <T,>(resolve: (result: Awaited<ReturnType<typeof run>>) => T) => run().then(resolve),
      }
      return query
    },
  }
}
