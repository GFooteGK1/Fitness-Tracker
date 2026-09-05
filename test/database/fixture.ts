import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

export const sqlFile = (path: string) => readFileSync(path, 'utf8')
export async function databaseFixture() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::UUID $$;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS UUID LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
  `)
  // Extract original table definitions, then apply the current additive columns.
  for (const [file, tables] of [
    ['docs/migrations/supabase-migration.sql', ['workouts', 'block_scores', 'benchmark_prs']],
    ['docs/migrations/food-tracking-migration.sql', ['meals']]
  ] as const) {
    const source = sqlFile(file)
    for (const table of tables) {
      const start = source.indexOf(`CREATE TABLE ${table} (`)
      const end = source.indexOf('\n);', start) + 3
      await db.exec(source.slice(start, end))
    }
  }
  await db.exec(`
    ALTER TABLE public.block_scores ADD COLUMN user_id UUID REFERENCES auth.users(id);
    ALTER TABLE public.meals ADD COLUMN meal_timing TEXT;
    ALTER TABLE public.meals ADD COLUMN input_text TEXT;
    ALTER TABLE public.workouts ADD CONSTRAINT test_workout_owner UNIQUE(id,user_id);
  `)
  for (const table of ['workouts','block_scores','meals']) {
    await db.exec(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY owner ON public.${table} TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO authenticated;`)
  }
  return db
}
