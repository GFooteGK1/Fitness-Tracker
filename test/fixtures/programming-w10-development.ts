/** Exposed references only. Never import this preparation adapter into production. */
import { reviewedC2rWeek } from './reviewed-c2r-week'
import { reviewedRollingWeek } from './reviewed-rolling-week'
import type { W10Case, W10Suite } from '../../scripts/programming-w10-evaluation'

export function buildW10DevelopmentSuite(): W10Suite {
  const c2r = reviewedC2rWeek(), developmental = reviewedRollingWeek()
  const base: W10Case = { id: 'c2r-approved-week', family: 'c2r', origin: 'exposed_development', changedVariable: null,
    expected: 'reviewed_candidate', input: c2r.input, registry: c2r.registry }
  const cases: W10Case[] = [base, { ...base, id: 'developmental-approved-swap', family: 'developmental',
    input: developmental.input, registry: developmental.registry }]
  const counterfactual = (id: string, changedVariable: string, mutate: (row: W10Case) => void) => {
    const row = structuredClone(base)
    row.id = id; row.changedVariable = changedVariable; row.expected = 'review_required'
    mutate(row); cases.push(row)
  }
  counterfactual('c2r-missing-registration', 'Trusted registration absent', row => { row.registry = [] })
  counterfactual('c2r-missing-review', 'Current review absent', row => { row.input.context.currentReviews = [] })
  counterfactual('c2r-missing-source', 'Current source absent', row => { row.input.context.currentSources = [] })
  counterfactual('c2r-source-revision', 'Current source revision changed', row => { row.input.context.currentSources[0].revision++ })
  counterfactual('c2r-new-symptoms', 'Previously reviewed symptom context changed', row => { row.input.context.facts.symptoms = true })
  counterfactual('c2r-new-outside-work', 'Outside work changed', row => { row.input.context.facts.outsideWork = ['Additional hard upper-body session'] })
  counterfactual('c2r-shorter-slot', 'Monday availability now 30 minutes', row => { row.input.context.profile.sessionAvailability[0].minutes = 30 })
  counterfactual('c2r-missing-bench', 'Flat bench no longer available', row => {
    row.input.context.profile.equipment.resolvedIds = row.input.context.profile.equipment.resolvedIds.filter(id => id !== 'flat_bench')
  })
  counterfactual('c2r-unresolved-fact', 'Unresolved equipment clarification', row => { row.input.context.unresolvedReasons = ['Confirm available bar and plates'] })
  counterfactual('c2r-registry-tamper', 'Stored recipe changed without authority digest update', row => {
    row.registry[0].recipe.instructions.push('Unreviewed instruction')
  })
  return { schemaVersion: 1, purpose: 'development_harness_verification', cases }
}
