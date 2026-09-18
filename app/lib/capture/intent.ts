import type { ActivityKind } from './contracts'

export interface AuthorizedOccurrence { sourceItemId: string; kind: ActivityKind; text: string }

/** Conservative server-owned grammar. Classifier output and tool calls cannot grant write authority. */
export function authorizedCoachOccurrences(content: string): AuthorizedOccurrence[] {
  if (typeof content !== 'string' || content.length > 20000) return []
  const clauses = content.split(/(?:\r?\n|;|\band\s+(?=(?:log|save|record|add)\b))/i).map(text => text.trim()).filter(Boolean)
  const result: AuthorizedOccurrence[] = []
  for (const text of clauses) {
    // A question about logging, negation, hypothetical, or preview is not an instruction to persist.
    if (!/^(?:please\s+)?(?:log|save|record|add)\b/i.test(text) || /\?|\b(?:do not|don't|preview|hypothetical|example)\b/i.test(text)) continue
    const workout = /\b(?:workout|session|run|lift|squats?|deadlifts?|bench|rowing|cycling)\b/i.test(text)
    const meal = /\b(?:meal|breakfast|lunch|dinner|snack|food)\b/i.test(text)
    if (workout === meal) continue
    result.push({ sourceItemId: `source:${result.length}`, kind: workout ? 'workout' : 'meal', text })
  }
  return result.slice(0, 20)
}

export function resolveAuthorizedSource(sources: Map<string, ActivityKind>, kind: ActivityKind, requested: unknown): string | null {
  if (typeof requested === 'string') return sources.get(requested) === kind ? requested : null
  const candidates = [...sources].filter(([, value]) => value === kind)
  return candidates.length === 1 ? candidates[0][0] : null
}
