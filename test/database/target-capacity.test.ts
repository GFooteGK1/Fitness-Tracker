import { expect, it } from 'vitest'
import { sqlFile } from './fixture'
import { asTargetOwner, targetCapacityMigration, targetFixture } from './target-fixture'

const owners = ['99999999-9999-4999-8999-999999999999', '88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666']
const migration = () => sqlFile(targetCapacityMigration)
const rows = async (db: Awaited<ReturnType<typeof targetFixture>>) => (await db.query('SELECT * FROM daily_targets ORDER BY user_id')).rows
async function metadata(db: Awaited<ReturnType<typeof targetFixture>>) {
  return {
    columns: (await db.query("SELECT column_name,data_type,numeric_precision,numeric_scale,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='daily_targets' ORDER BY ordinal_position")).rows,
    relation: (await db.query("SELECT relowner::regrole::text,relacl::text,relrowsecurity,relforcerowsecurity,obj_description(oid) FROM pg_class WHERE oid='daily_targets'::regclass")).rows,
    constraints: (await db.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='daily_targets'::regclass ORDER BY conname")).rows,
    policies: (await db.query("SELECT policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='daily_targets' ORDER BY policyname")).rows,
    indexes: (await db.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='daily_targets' ORDER BY indexname")).rows,
    triggers: (await db.query("SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='daily_targets'::regclass AND NOT tgisinternal ORDER BY tgname")).rows,
  }
}
async function seed(db: Awaited<ReturnType<typeof targetFixture>>) {
  for (const [i,id] of owners.entries()) {
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [id])
    await db.query("INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories,tolerance_pct,updated_at) VALUES($1,150.25,200.5,60.75,1949.8,$2,'2026-01-01Z')", [id,[0,99.99,null,12.34][i]])
  }
}

it.each(['food-tracking-migration.sql', 'complete-holistic-migration.sql'])('upgrades %s without changing data or surrounding metadata and is repeat-safe', async source => {
  const db = await targetFixture(source, false)
  try {
    await seed(db)
    const beforeRows = await rows(db), before = await metadata(db)
    expect(before.columns.find((c: any) => c.column_name === 'tolerance_pct')).toMatchObject({ numeric_precision: 4, numeric_scale: 2 })
    await expect(db.query('UPDATE daily_targets SET tolerance_pct=100')).rejects.toMatchObject({ code: '22003' })
    await db.exec(migration())
    const after = await metadata(db)
    const tolerance = after.columns.find((c: any) => c.column_name === 'tolerance_pct') as any
    expect(tolerance).toMatchObject({ numeric_precision: 5, numeric_scale: 2, is_nullable: 'YES', column_default: '5.0' })
    const expected = structuredClone(before)
    ;(expected.columns.find((c: any) => c.column_name === 'tolerance_pct') as any).numeric_precision = 5
    expect(after).toEqual(expected)
    expect(await rows(db)).toEqual(beforeRows)
    await db.exec(migration())
    expect(await metadata(db)).toEqual(after); expect(await rows(db)).toEqual(beforeRows)
  } finally { await db.close() }
}, 30000)

it.each(['food-tracking-migration.sql', 'complete-holistic-migration.sql'])('fresh %s plus the forward migration preserves defaults, triggers, RLS and failed-write atomicity', async source => {
  const db = await targetFixture(source)
  try {
    for (const id of owners) await db.query('INSERT INTO auth.users(id) VALUES($1)', [id])
    await asTargetOwner(db, owners[0], async tx => {
      const result = await tx.query("INSERT INTO daily_targets(target_protein,target_carbs,target_fat,target_calories,updated_at) VALUES(150,200,60,1940,'2026-01-01Z') RETURNING user_id,tolerance_pct")
      expect(result.rows[0]).toMatchObject({ user_id: owners[0], tolerance_pct: '5.00' })
    })
    await asTargetOwner(db, owners[0], async tx => {
      const result = await tx.query('UPDATE daily_targets SET tolerance_pct=100 RETURNING tolerance_pct,updated_at')
      expect(result.rows[0].tolerance_pct).toBe('100.00')
      expect(new Date(result.rows[0].updated_at).getTime()).toBeGreaterThan(Date.parse('2026-01-01'))
    })
    const before = await rows(db)
    for (const invalid of ['-0.01','100.01','NaN']) {
      await expect(asTargetOwner(db, owners[0], tx => tx.query('UPDATE daily_targets SET target_protein=175,tolerance_pct=$1', [invalid]))).rejects.toMatchObject({ code: '23514' })
      expect(await rows(db)).toEqual(before)
    }
    await expect(asTargetOwner(db, owners[0], async tx => {
      await tx.exec('UPDATE daily_targets SET target_protein=175')
      await tx.exec('UPDATE daily_targets SET tolerance_pct=100.01')
    })).rejects.toMatchObject({ code: '23514' })
    expect(await rows(db)).toEqual(before)
    await asTargetOwner(db, owners[1], async tx => {
      expect((await tx.query('SELECT * FROM daily_targets')).rows).toHaveLength(0)
      expect((await tx.query('UPDATE daily_targets SET tolerance_pct=5 RETURNING user_id')).rows).toHaveLength(0)
    })
    await expect(asTargetOwner(db, owners[1], tx => tx.query('INSERT INTO daily_targets(user_id,target_protein,target_carbs,target_fat,target_calories) VALUES($1,150,200,60,1940)', [owners[2]]))).rejects.toMatchObject({ code: '42501' })
    expect(await rows(db)).toEqual(before)
  } finally { await db.close() }
}, 30000)

it.each(['unexpected-type', 'dependent-view'])('fails atomically on %s instead of coercing schema or dropping dependencies', async kind => {
  const db = await targetFixture('food-tracking-migration.sql', false)
  try {
    await seed(db)
    if (kind === 'unexpected-type') await db.exec('ALTER TABLE daily_targets ALTER COLUMN tolerance_pct TYPE numeric(6,2)')
    else await db.exec('CREATE VIEW target_dependency AS SELECT tolerance_pct FROM daily_targets')
    const before = await metadata(db), beforeRows = await rows(db)
    await expect(db.exec(migration())).rejects.toMatchObject({ code: kind === 'unexpected-type' ? 'P0001' : '0A000' })
    await db.exec('ROLLBACK')
    expect(await metadata(db)).toEqual(before); expect(await rows(db)).toEqual(beforeRows)
    if (kind === 'dependent-view') expect((await db.query('SELECT * FROM target_dependency')).rows).toHaveLength(4)
  } finally { await db.close() }
}, 30000)
