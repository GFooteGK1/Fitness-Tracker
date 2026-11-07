import { databaseFixture, sqlFile } from './fixture'

export const targetCapacityMigration = 'supabase/migrations/20261107170516_target_tolerance_capacity.sql'

/** Original target schema/policies/triggers, then the current forward migration. */
export async function targetFixture(source = 'food-tracking-migration.sql', upgrade = true) {
  const db = await databaseFixture()
  const schema = sqlFile(`docs/migrations/${source}`)
  const start = schema.indexOf('CREATE TABLE daily_targets (')
  await db.exec(schema.slice(start, schema.indexOf('\n);', start) + 3))
  await db.exec(schema.match(/CREATE INDEX idx_daily_targets_user[^;]+;/)![0])
  await db.exec(schema.match(/CREATE OR REPLACE FUNCTION update_updated_at_column\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/)![0])
  await db.exec(sqlFile('docs/migrations/supabase-migration.sql').match(/CREATE OR REPLACE FUNCTION set_user_id\(\)[\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER;/)![0])
  await db.exec('ALTER TABLE daily_targets ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON daily_targets TO authenticated;')
  for (const match of schema.matchAll(/CREATE POLICY "Users can (?:view|insert|update|delete) their own targets"[\s\S]*?;/g)) await db.exec(match[0])
  for (const match of schema.matchAll(/CREATE TRIGGER (?:set_daily_targets_user_id|update_daily_targets_updated_at)[\s\S]*?;/g)) await db.exec(match[0])
  for (const match of schema.matchAll(/ALTER TABLE daily_targets ADD CONSTRAINT[\s\S]*?;/g)) await db.exec(match[0])
  if (upgrade) await db.exec(sqlFile(targetCapacityMigration))
  return db
}

export async function asTargetOwner<T>(db: Awaited<ReturnType<typeof targetFixture>>, owner: string, run: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE authenticated')
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner])
    return run(tx)
  })
}
