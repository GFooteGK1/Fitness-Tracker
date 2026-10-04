/** Exact historical owner scope. SQL retains all current write authorization. */
import type { SupabaseClient } from '@supabase/supabase-js'

export type SupervisedResourceKind = 'program' | 'proposal' | 'session'
export interface SupervisedResourceScope {
  schemaVersion: 1; userId: string; programId: string; resourceKind: SupervisedResourceKind; resourceId: string; planVersionId: string | null
  currentEnrollmentActive: boolean
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export async function resolveSupervisedResource(db: SupabaseClient, owner: string, kind: SupervisedResourceKind, id: string) {
  if (!uuid(owner) || !uuid(id) || !['program', 'proposal', 'session'].includes(kind)) return { kind: 'unavailable' as const }
  try {
    const before = await db.auth.getUser()
    if (before.error || before.data.user?.id !== owner) return { kind: 'account_changed' as const }
    const result = await db.rpc('get_supervised_resource_scope', { p_kind: kind, p_id: id })
    const after = await db.auth.getUser()
    if (after.error || after.data.user?.id !== owner) return { kind: 'account_changed' as const }
    if (result.error) return { kind: 'unavailable' as const }
    if (result.data === null) return { kind: 'not_supervised' as const }
    const s = result.data
    if (!s || typeof s !== 'object' || Array.isArray(s)
      || Object.keys(s).sort().join(',') !== 'currentEnrollmentActive,planVersionId,programId,resourceId,resourceKind,schemaVersion,userId'
      || s.schemaVersion !== 1 || s.userId !== owner || s.resourceKind !== kind || s.resourceId !== id || !uuid(s.programId)
      || typeof s.currentEnrollmentActive !== 'boolean'
      || (kind === 'program' ? s.programId !== id || (s.planVersionId !== null && !uuid(s.planVersionId)) : !uuid(s.planVersionId))) return { kind: 'unavailable' as const }
    return { kind: 'supervised' as const, scope: structuredClone(s) as SupervisedResourceScope }
  } catch { return { kind: 'unavailable' as const } }
}
export interface SupervisedScopedAccess {
  enabled: () => boolean
  resolve: typeof resolveSupervisedResource
}
