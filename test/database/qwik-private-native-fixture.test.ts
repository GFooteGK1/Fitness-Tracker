import { expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { collectPrivateNativePlan, nativeSql } from './qwik-private-native-fixture'
import { sqlFile } from './fixture'

it('serializes synthetic native parameters once without confusing $1 and $10 or quoting data as SQL', () => {
  const values = ["owner's $10\\path\nline", null, true, false, new Uint8Array([0, 255]),
    { numeric: '001.20', missing: null }, 0, -0.7, 100, 'tenth']
  expect(nativeSql('SELECT $1,$10,$2,$3,$4,$5,$6,$7,$8,$9', values)).toBe(
    "SELECT 'owner''s $10\\path\nline','tenth',NULL,true,false,decode('00ff','hex'),'{\"numeric\":\"001.20\",\"missing\":null}'::jsonb,0,-0.7,100")
  for (const value of [undefined, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 'nul\0value']) {
    expect(() => nativeSql('SELECT $1', [value])).toThrow()
  }
  expect(() => nativeSql('SELECT $10', [1])).toThrow('Missing synthetic SQL parameter')
})

it('records the actual complete fixture SQL unchanged, keeps duplicate migrations and closes/restores the preparer', async () => {
  const originalExec = PGlite.prototype.exec, close = PGlite.prototype.close, closed: PGlite[] = []
  const owned = new Set<PGlite>()
  const execSpy = vi.spyOn(PGlite.prototype, 'exec').mockImplementation(function (this: PGlite, ...args) {
    owned.add(this); return originalExec.apply(this, args)
  })
  const spy = vi.spyOn(PGlite.prototype, 'close').mockImplementation(async function (this: PGlite, ...args) {
    await close.apply(this, args); closed.push(this)
  })
  try {
    const plan = await collectPrivateNativePlan()
    expect(PGlite.prototype.exec).toBe(execSpy)
    expect(plan.closedPreparers).toBe(1); expect(owned.size).toBe(1)
    expect(plan.statements).toContain(sqlFile('supabase/migrations/20260918020000_capture_receipts.sql'))
    expect(plan.statements).toContain(sqlFile('supabase/migrations/20261022164908_activity_measurement_corrections.sql'))
    expect(plan.statements).toContain(sqlFile('docs/migrations/qwik-private-original-preparation.sql'))
    const recommendations = sqlFile('supabase/migrations/20260918050000_recommendations.sql')
    expect(plan.statements.filter(sql => sql === recommendations)).toHaveLength(2)
    expect(plan.statements.findIndex(sql => sql === sqlFile('supabase/migrations/20260918020000_capture_receipts.sql')))
      .toBeLessThan(plan.statements.findIndex(sql => sql === sqlFile('docs/migrations/qwik-private-original-preparation.sql')))
    expect(plan.sha256).toMatch(/^[a-f0-9]{64}$/)
    for (const engine of owned) {
      expect(closed.filter(value => value === engine)).toHaveLength(1)
      await expect(engine.query('SELECT 1')).rejects.toThrow(/closed/i)
    }
  } finally { execSpy.mockRestore(); spy.mockRestore() }
  expect(PGlite.prototype.exec).toBe(originalExec)
}, 30000)

it('restores the collector and closes its actual partial preparer when a forwarded exec fails', async () => {
  const exec = PGlite.prototype.exec, close = PGlite.prototype.close, closed: PGlite[] = []
  const owned = new Set<PGlite>()
  const execSpy = vi.spyOn(PGlite.prototype, 'exec').mockImplementation(async function (this: PGlite, ...args) {
    owned.add(this)
    await exec.apply(this, args)
    throw new Error('Synthetic failure after actual preparer exec')
  })
  const closeSpy = vi.spyOn(PGlite.prototype, 'close').mockImplementation(async function (this: PGlite, ...args) {
    await close.apply(this, args); closed.push(this)
  })
  try {
    await expect(collectPrivateNativePlan()).rejects.toThrow('Synthetic failure after actual preparer exec')
    expect(PGlite.prototype.exec).toBe(execSpy)
    expect(owned.size).toBe(1)
    for (const engine of owned) {
      expect(closed.filter(value => value === engine)).toHaveLength(1)
      await expect(engine.query('SELECT 1')).rejects.toThrow(/closed/i)
    }
  } finally { execSpy.mockRestore(); closeSpy.mockRestore() }
  expect(PGlite.prototype.exec).toBe(exec)
}, 30000)
