/** Engineering fixture contract. This is not a production evidence or policy API. */
export const PERSONALIZED_COACHING_FIXTURE_VERSION = 'engineering-scenarios-v1' as const

export type EngineeringRule =
  | 'accepted_plan'
  | 'missing_signal'
  | 'logged_nutrition'

export type FixtureValue = null | boolean | number | string | FixtureValue[] | { [key: string]: FixtureValue }

export interface EngineeringExpectation {
  decision: 'action' | 'collect_signal' | 'abstain'
  /** Semantic assertions, not required user-facing strings or production reason-code names. */
  assertions: string[]
  forbidden: string[]
}

export interface EngineeringScenario {
  id: string
  athlete: string
  rule: EngineeringRule
  title: string
  /** Flat facts: change one named fact for the counterfactual, preserving every other fact. */
  facts: Record<string, FixtureValue>
  expected: EngineeringExpectation
  counterfactual: {
    field: string
    value: FixtureValue
    expected: EngineeringExpectation
  }
  qualifiedCoachLabel: 'not_reviewed'
}

export interface EngineeringScenarioSet {
  schemaVersion: typeof PERSONALIZED_COACHING_FIXTURE_VERSION
  split: 'development' | 'heldout_engineering'
  source: 'new_synthetic'
  /** Author inspection is unavoidable; this never means statistically unseen or coach validated. */
  exposure: 'author_only_until_integrated_verification' | 'implementation_visible'
  scenarios: EngineeringScenario[]
}
