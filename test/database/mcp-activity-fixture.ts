import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'
import { recommendationFixture } from './recommendation-fixture'
import { sqlFile } from './fixture'

/** Real PostgreSQL SQL/RLS behind the unmodified adapter; no success-shaped RPC mocks. */
export async function mcpActivityFixture() {
  const db = await recommendationFixture()
  await db.exec(sqlFile('supabase/migrations/20260926120000_workout_save_recovery.sql'))
  return db
}
export function mcpOwnerClient(sql: PGlite, owner: string) {
  const calls: string[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name)
      try {
        const result = await sql.query<any>(`SELECT public.${name}(${Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(',')}) result`, Object.values(args))
        return { data: result.rows[0].result, error: null }
      } catch (error: any) { return { data: null, error: { code: error.code, message: error.message } } }
    },
    from: (table: string) => {
      let columns = '*'; const filters: Array<[string, unknown]> = []
      const query = {
        select: (value: string) => { columns = value; return query },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
        maybeSingle: () => execute(true),
        then: (resolve: any, reject: any) => execute(false).then(resolve, reject),
      }
      async function execute(single: boolean) {
        try {
          // PostgREST returns JSON numeric values, unlike the native NUMERIC text codec.
          const result = await sql.query<{ value: Record<string, unknown> }>(`SELECT to_jsonb(q) value FROM (SELECT ${columns} FROM public.${table} WHERE ${filters.map(([key], i) => `${key}=$${i + 1}`).join(' AND ')}) q`, filters.map(([, value]) => value))
          if (single && result.rows.length > 1) return { data: null, error: { code: 'PGRST116' } }
          return { data: single ? result.rows[0]?.value ?? null : result.rows.map(row => row.value), error: null }
        } catch (error: any) { return { data: null, error: { code: error.code, message: error.message } } }
      }
      return query
    },
  }
  return { db: client as unknown as SupabaseClient, calls }
}
