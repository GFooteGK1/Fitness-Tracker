import type { SupabaseClient } from '@supabase/supabase-js'

export const STALE_COACH_CONTEXT_MESSAGE = 'Your training information changed; refresh and create a new proposal'

export function coachContextConflictMessage(error: { message?: string }): string {
  return error.message?.startsWith('Confirmed training intent changed or needs review;')
    ? 'Your confirmed goals or event need review. Confirm your training direction before creating a replacement week; refreshing the old review is not enough.'
    : STALE_COACH_CONTEXT_MESSAGE
}

/** A revision is a concurrency token, never a measure of evidence quality. */
export function parseCoachContextRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

/** Capture before any planning inputs are read. SQL checks it again inside the write. */
export async function fetchCoachContextRevision(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('get_coach_context_revision')
  const revision = parseCoachContextRevision(data)
  if (error || revision === null) throw new CoachContextRevisionUnavailableError()
  return revision
}

export class CoachContextRevisionUnavailableError extends Error {
  constructor() {
    super('Unable to verify current training information; try again')
    this.name = 'CoachContextRevisionUnavailableError'
  }
}
