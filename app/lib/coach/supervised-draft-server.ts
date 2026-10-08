/** Owner-only untrusted draft starting point. Does not submit or approve work. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSupervisedProgramWorkspace } from './supervised-workspace-reader'
import { seedSupervisedWeek } from './supervised-draft-editor'

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
export function createSupervisedDraftReader(options: { enabled: () => boolean }) {
  return async (db: SupabaseClient, input: unknown) => {
    if (!record(input) || Object.keys(input).sort().join(',') !== 'expectedUserId,programId,transition'
      || !uuid(input.expectedUserId) || !uuid(input.programId) || (input.transition !== 'same_week' && input.transition !== 'next_week')) {
      return { kind: 'invalid_request' as const }
    }
    const { expectedUserId, programId, transition } = input
    try {
      const auth = await db.auth.getUser()
      if (auth.error || auth.data.user?.id !== expectedUserId) return { kind: 'account_changed' as const }
      if (!options.enabled()) return { kind: 'disabled' as const }
      const found = await readSupervisedProgramWorkspace(db, { expectedUserId, programId, limit: 1 })
      if (found.kind !== 'workspace') return found
      const scope = found.page.program, enrollment = scope.latestEnrollment
      if (scope.role !== 'athlete' || scope.athleteId !== expectedUserId) return { kind: 'unavailable' as const }
      if (!scope.acceptedBaseId || !enrollment.enabled || Date.parse(enrollment.expiresAt) <= Date.now()
        || !enrollment.operations.includes(transition)) return { kind: 'review_required' as const,
        reasons: ['A current supervised enrollment and compatible accepted base are required.'] }
      const base = await db.from('training_plan_versions').select('id,user_id,program_id,status,intent')
        .eq('id', scope.acceptedBaseId).eq('user_id', expectedUserId).eq('program_id', programId).maybeSingle()
      const after = await db.auth.getUser()
      if (after.error || after.data.user?.id !== expectedUserId) return { kind: 'account_changed' as const }
      if (base.error || !base.data || base.data.id !== scope.acceptedBaseId || base.data.user_id !== expectedUserId
        || base.data.program_id !== programId || base.data.status !== 'accepted'
        || base.data.intent?.format !== 'reviewed_weekly_intent_v0_1') return { kind: 'unavailable' as const }
      const seed = seedSupervisedWeek(base.data.intent.reviewed_week, transition)
      if (!seed) return { kind: 'review_required' as const, reasons: ['The complete accepted week could not be read.'] }
      // Read again after the owned plan. This is not a write permission check;
      // it prevents an already-stale base or enrollment being offered as current.
      const current = await readSupervisedProgramWorkspace(db, { expectedUserId, programId, limit: 1 })
      if (current.kind !== 'workspace') return current
      const p = current.page.program
      if (p.role !== 'athlete' || p.athleteId !== expectedUserId || p.acceptedBaseId !== scope.acceptedBaseId
        || p.latestEnrollment.enrollmentId !== enrollment.enrollmentId || !p.latestEnrollment.enabled
        || Date.parse(p.latestEnrollment.expiresAt) <= Date.now()) return { kind: 'review_required' as const,
        reasons: ['The accepted base or enrollment changed. Refresh before editing.'] }
      if (!options.enabled()) return { kind: 'disabled' as const }
      return { kind: 'draft' as const, userId: expectedUserId, programId, basePlanVersionId: scope.acceptedBaseId,
        enrollmentId: enrollment.enrollmentId, seed }
    } catch { return { kind: 'unavailable' as const } }
  }
}
