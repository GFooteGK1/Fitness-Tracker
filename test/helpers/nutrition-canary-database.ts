import { createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { photoDraftDatabase } from './photo-draft-database'
import { pilotTestOwner } from './nutrition-pilot-database'
import { sqlFile } from '../database/fixture'

// Frozen owner-approved bytes; tests cannot silently regenerate the live bundle.
export const canarySql = [
  ['00-additive-foundation-disabled.sql','8f2ea56eb75d2bcc01af4119dee2e1115647bf05bbfeccb609250a92ed303da1'],
  ['01-canary-only-functions.sql','928ed0277d75215a7a140adb51ab64b6fa0bfc0ae3dbe56dc50a8e2dea572209'],
  ['02-conditional-owner-live-functions.sql','4c9e012c94e2ff8202c48e16619d053f7fe569f01dcc53e0b43db8ae425bd71e'],
  ['03-pause-without-delete-or-reset.sql','b6de0603e1e6da93f236e5318f750b0c4ed9ebd17df3869cc7cf6b611407618b'],
] as const
export function frozenCanarySql(phase: number) {
  const [file,hash] = canarySql[phase], sql = sqlFile('docs/proposals/nutrition-photo-canary/'+file)
  if(createHash('sha256').update(sql).digest('hex')!==hash)throw new Error('Frozen SQL changed')
  return sql
}
export async function applyCanaryPhase(db: PGlite, phase: 1|2|3) {
  await db.exec('RESET ROLE')
  const sql = frozenCanarySql(phase)
  // First execute every exact approved script without substitutions. This
  // validates its syntax/dependencies in isolated PostgreSQL, never hosted DB.
  await db.exec(sql)
  // Disposable function copy only: change the digest to a synthetic auth user
  // so owner/foreign/RLS tests can exercise real functions without Greg's UUID.
  await db.exec(sql.replaceAll('2bf29505900fa586ff4ff34b6f049944c0f44fcc7786ffb5ac6acb1d66b76543',createHash('sha256').update(pilotTestOwner).digest('hex')))
}
export async function nutritionCanaryDatabase() {
  const db = await photoDraftDatabase()
  await db.exec(frozenCanarySql(0))
  await db.query('INSERT INTO auth.users VALUES($1)',[pilotTestOwner])
  return db
}
