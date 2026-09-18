import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Validates fixture integrity, not application behavior. No providers or network access.
const expectedRules = ['accepted_plan', 'missing_signal', 'logged_nutrition']
const ids = new Set()
const athletes = new Set()
const signatures = new Set()
const result = []

for (const [file, split, minimum, minimumPerRule] of [
  ['development.json', 'development', 30, 10],
  ['heldout-engineering.json', 'heldout_engineering', 12, 4],
]) {
  const raw = readFileSync(new URL(file, import.meta.url), 'utf8')
  const set = JSON.parse(raw)
  assert.equal(set.schemaVersion, 'engineering-scenarios-v1')
  assert.equal(set.split, split)
  assert.equal(set.source, 'new_synthetic')
  assert.ok(set.scenarios.length >= minimum)
  const counts = Object.fromEntries(expectedRules.map(rule => [rule, 0]))

  for (const scenario of set.scenarios) {
    assert.ok(!ids.has(scenario.id), `Duplicate scenario: ${scenario.id}`)
    assert.ok(!athletes.has(scenario.athlete), `Repeated athlete: ${scenario.athlete}`)
    ids.add(scenario.id)
    athletes.add(scenario.athlete)
    assert.ok(scenario.athlete.startsWith('synthetic-'))
    assert.ok(expectedRules.includes(scenario.rule))
    counts[scenario.rule] += 1
    assert.ok(scenario.title.length > 15)
    assert.equal(scenario.qualifiedCoachLabel, 'not_reviewed')
    assert.ok(Object.hasOwn(scenario.facts, scenario.counterfactual.field))
    assert.notDeepEqual(scenario.facts[scenario.counterfactual.field], scenario.counterfactual.value)
    const variant = structuredClone(scenario.facts)
    variant[scenario.counterfactual.field] = scenario.counterfactual.value
    const changedFields = Object.keys(variant).filter(key =>
      JSON.stringify(variant[key]) !== JSON.stringify(scenario.facts[key]))
    assert.deepEqual(changedFields, [scenario.counterfactual.field])
    const signature = JSON.stringify([scenario.rule, scenario.facts])
    assert.ok(!signatures.has(signature), `Duplicate facts: ${scenario.id}`)
    signatures.add(signature)
    for (const expectation of [scenario.expected, scenario.counterfactual.expected]) {
      assert.ok(['action', 'collect_signal', 'abstain'].includes(expectation.decision))
      assert.ok(expectation.assertions.length > 0)
      assert.ok(expectation.forbidden.length > 0)
      assert.ok([...expectation.assertions, ...expectation.forbidden].every(value => typeof value === 'string' && value.length > 0))
    }
  }
  for (const rule of expectedRules) assert.ok(counts[rule] >= minimumPerRule)
  result.push({ file, count: set.scenarios.length, counterfactuals: set.scenarios.length, counts, sha256: createHash('sha256').update(raw).digest('hex') })
}

console.log(JSON.stringify({ status: 'fixture_integrity_passed', distinctSyntheticAthletes: athletes.size, sets: result }, null, 2))
