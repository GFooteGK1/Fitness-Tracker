/** Authenticated navigation only. These summaries grant no write authority. */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface SupervisedProgramSummary {
  programId: string; title: string; role: 'athlete' | 'reviewer'; athleteId: string; acceptedBaseId: string | null
  latestEnrollment: { enrollmentId: string; version: number; reviewerId: string; enabled: boolean; expiresAt: string; operations: Array<'same_week' | 'next_week'> }
}
export interface SupervisedCandidateSummary {
  candidateId: string; enrollmentId: string; enrollmentVersion: number; reviewerId: string
  transition: 'same_week' | 'next_week'; createdAt: string; decision: 'pending' | 'approve' | 'reject'
  proposalId: string | null; proposalStatus: 'proposed' | 'accepted' | 'rejected' | 'expired' | null; planVersionId: string | null
}
export interface SupervisedProgramsPage {
  schemaVersion: 1; actorId: string; programs: SupervisedProgramSummary[]; nextAfterProgramId: string | null
}
export interface SupervisedProgramWorkspace {
  schemaVersion: 1; actorId: string; program: SupervisedProgramSummary; candidates: SupervisedCandidateSummary[]; nextAfterCandidateId: string | null
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',')
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
const limitValid = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= 50
const bounded = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length <= 200000
const ordered = (ids: string[], after: string | null) => ids.every((id, index) => id > (index ? ids[index - 1] : after ?? ''))
const cursorValid = (next: unknown, ids: string[], limit: number) => next === null || (uuid(next) && ids.length === limit && next === ids.at(-1))

function programValid(v: unknown, actor: string): v is SupervisedProgramSummary {
  if (!record(v) || !exact(v, ['programId', 'title', 'role', 'athleteId', 'acceptedBaseId', 'latestEnrollment'])
    || !uuid(v.programId) || !uuid(v.athleteId) || typeof v.title !== 'string' || v.title.length > 1000
    || (v.acceptedBaseId !== null && !uuid(v.acceptedBaseId)) || !record(v.latestEnrollment)) return false
  const e = v.latestEnrollment
  if (!exact(e, ['enrollmentId', 'version', 'reviewerId', 'enabled', 'expiresAt', 'operations'])
    || !uuid(e.enrollmentId) || !uuid(e.reviewerId) || !Number.isSafeInteger(e.version) || Number(e.version) < 1
    || typeof e.enabled !== 'boolean' || !timestamp(e.expiresAt) || !Array.isArray(e.operations)
    || e.operations.length < 1 || e.operations.length > 2 || new Set(e.operations).size !== e.operations.length
    || !e.operations.every(op => op === 'same_week' || op === 'next_week')) return false
  return v.role === 'athlete' ? v.athleteId === actor
    : v.role === 'reviewer' && v.athleteId !== actor && e.reviewerId === actor && e.enabled && v.acceptedBaseId === null
}
function candidateValid(v: unknown, program: SupervisedProgramSummary): v is SupervisedCandidateSummary {
  if (!record(v) || !exact(v, ['candidateId', 'enrollmentId', 'enrollmentVersion', 'reviewerId', 'transition', 'createdAt', 'decision', 'proposalId', 'proposalStatus', 'planVersionId'])
    || ![v.candidateId, v.enrollmentId, v.reviewerId].every(uuid) || !Number.isSafeInteger(v.enrollmentVersion)
    || Number(v.enrollmentVersion) < 1 || Number(v.enrollmentVersion) > program.latestEnrollment.version
    || !['same_week', 'next_week'].includes(String(v.transition)) || !timestamp(v.createdAt)
    || !['pending', 'approve', 'reject'].includes(String(v.decision))) return false
  if (v.proposalId === null ? v.proposalStatus !== null || v.planVersionId !== null
    : !uuid(v.proposalId) || !uuid(v.planVersionId) || !['proposed', 'accepted', 'rejected', 'expired'].includes(String(v.proposalStatus)) || v.decision !== 'approve') return false
  return program.role === 'athlete' || (v.enrollmentId === program.latestEnrollment.enrollmentId
    && v.enrollmentVersion === program.latestEnrollment.version && v.reviewerId === program.latestEnrollment.reviewerId
    && program.latestEnrollment.operations.includes(v.transition as 'same_week' | 'next_week'))
}

export function parseSupervisedProgramsPage(value: unknown, actor: string, after: string | null = null, limit = 20): SupervisedProgramsPage | null {
  try {
    if (!uuid(actor) || (after !== null && !uuid(after)) || !limitValid(limit) || !bounded(value) || !record(value)
      || !exact(value, ['schemaVersion', 'actorId', 'programs', 'nextAfterProgramId']) || value.schemaVersion !== 1 || value.actorId !== actor
      || !Array.isArray(value.programs) || value.programs.length > limit || !value.programs.every(p => programValid(p, actor))) return null
    const ids = value.programs.map(p => p.programId)
    return ordered(ids, after) && cursorValid(value.nextAfterProgramId, ids, limit) ? structuredClone(value) as unknown as SupervisedProgramsPage : null
  } catch { return null }
}
export function parseSupervisedProgramWorkspace(value: unknown, actor: string, programId: string, after: string | null = null, limit = 20): SupervisedProgramWorkspace | null {
  try {
    if (!uuid(actor) || !uuid(programId) || (after !== null && !uuid(after)) || !limitValid(limit) || !bounded(value) || !record(value)
      || !exact(value, ['schemaVersion', 'actorId', 'program', 'candidates', 'nextAfterCandidateId']) || value.schemaVersion !== 1 || value.actorId !== actor
      || !programValid(value.program, actor) || value.program.programId !== programId || !Array.isArray(value.candidates)
      || value.candidates.length > limit || !value.candidates.every(c => candidateValid(c, value.program as SupervisedProgramSummary))) return null
    const ids = value.candidates.map(c => c.candidateId)
    return ordered(ids, after) && cursorValid(value.nextAfterCandidateId, ids, limit) ? structuredClone(value) as unknown as SupervisedProgramWorkspace : null
  } catch { return null }
}

function request(value: unknown, scoped: boolean) {
  if (!record(value) || !uuid(value.expectedUserId) || (scoped && !uuid(value.programId))) return null
  const cursorKey = scoped ? 'afterCandidateId' : 'afterProgramId'
  const allowed = ['expectedUserId', 'limit', cursorKey, ...(scoped ? ['programId'] : [])]
  if (Object.keys(value).some(key => !allowed.includes(key))) return null
  const after = value[cursorKey] ?? null, limit = value.limit === undefined ? 20 : value.limit
  if ((after !== null && !uuid(after)) || !limitValid(limit)) return null
  return { actor: value.expectedUserId, after, limit, programId: scoped ? value.programId as string : null }
}
async function read(db: SupabaseClient, input: unknown, scoped: boolean) {
  const q = request(input, scoped)
  if (!q) return { kind: 'invalid_request' as const }
  try {
    const before = await db.auth.getUser()
    if (before.error || before.data.user?.id !== q.actor) return { kind: 'account_changed' as const }
    const result = scoped
      ? await db.rpc('get_supervised_program_workspace', { p_program_id: q.programId, p_after_candidate_id: q.after, p_limit: q.limit })
      : await db.rpc('list_supervised_programs', { p_after_program_id: q.after, p_limit: q.limit })
    const after = await db.auth.getUser()
    if (after.error || after.data.user?.id !== q.actor) return { kind: 'account_changed' as const }
    if (result.error) return { kind: 'unavailable' as const }
    if (scoped) {
      if (result.data === null) return { kind: 'not_found' as const }
      const page = parseSupervisedProgramWorkspace(result.data, q.actor, q.programId!, q.after, q.limit)
      return page ? { kind: 'workspace' as const, page } : { kind: 'unavailable' as const }
    }
    const page = parseSupervisedProgramsPage(result.data, q.actor, q.after, q.limit)
    return page ? { kind: 'programs' as const, page } : { kind: 'unavailable' as const }
  } catch { return { kind: 'unavailable' as const } }
}
export const listSupervisedPrograms = (db: SupabaseClient, input: unknown) => read(db, input, false)
export const readSupervisedProgramWorkspace = (db: SupabaseClient, input: unknown) => read(db, input, true)
