import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Integrity only: never imports application code, invokes an adapter, or prints cases/labels.
const rules = ['accepted_plan', 'missing_signal', 'logged_nutrition']
const originals = [
  ['development.json', '32f437b53ab35f2b7c2f8ed50f5b2a6ed969b84fac9e7cc880d6a6c7441cc278'],
  ['heldout-engineering.json', 'ea26eb6d3c6fc288330826ec906c288c61566f82f3a7eb2aa7e3a18afc10bc24'],
]
const sha = raw => createHash('sha256').update(raw).digest('hex')
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const check = (condition, category) => { if (!condition) throw new Error(category) }
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const type = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

try {
  const ids = new Set(), athletes = new Set(), signatures = new Set(), knownKeys = new Set()
  for (const [file, hash] of originals) {
    const raw = read(file)
    check(sha(raw) === hash, 'original_hash_changed')
    for (const scenario of JSON.parse(raw).scenarios) {
      ids.add(scenario.id)
      athletes.add(scenario.athlete)
      signatures.add(canonical([scenario.rule, scenario.facts]))
      Object.keys(scenario.facts).forEach(key => knownKeys.add(key))
    }
  }
  // Coordinator-approved explicit bindings in engineering-adapter-contract.md.
  for (const key of ['goalDistancesMeters', 'movementId', 'repetitions']) knownKeys.add(key)
  const raw = read('replacement-heldout-engineering.json')
  const set = JSON.parse(raw)
  const metadata = JSON.parse(read('replacement-heldout-engineering.metadata.json'))
  check(set.schemaVersion === 'engineering-scenarios-v2' && set.split === 'heldout_engineering', 'schema_invalid')
  check(set.source === 'new_synthetic' && set.exposure === 'author_only_until_integrated_verification', 'exposure_invalid')
  check(set.scenarios.length === 12, 'scenario_count_invalid')
  check(metadata.sha256 === sha(raw), 'replacement_hash_mismatch')
  check(metadata.sourceVersion === 'replacement-synthetic-v1' && metadata.exposureVersion === 'replacement-blind-v1', 'exposure_invalid')
  check(['draft_awaiting_final_adapter_contract', 'frozen_before_candidate_execution'].includes(metadata.freezeState), 'freeze_metadata_invalid')
  check(metadata.exposure?.replacementRuntimeExecutionsBeforeFreeze === 0 && metadata.exposure?.implementersHaveSeenReplacementBodies === false, 'exposure_invalid')
  if (metadata.freezeState === 'frozen_before_candidate_execution') {
    const contract = read('../../../docs/verification/data-to-personalized-coaching/engineering-adapter-contract.md')
    check(metadata.sourceContractSha256 === sha(contract), 'frozen_contract_changed')
  }
  const counts = Object.fromEntries(rules.map(rule => [rule, 0]))
  const factKeySchema = {}
  for (const scenario of set.scenarios) {
    check(typeof scenario.id === 'string' && !ids.has(scenario.id), 'scenario_identity_invalid')
    check(typeof scenario.athlete === 'string' && scenario.athlete.startsWith('synthetic-') && !athletes.has(scenario.athlete), 'athlete_identity_invalid')
    ids.add(scenario.id); athletes.add(scenario.athlete)
    check(rules.includes(scenario.rule), 'rule_invalid')
    counts[scenario.rule] += 1
    check(typeof scenario.title === 'string' && scenario.title.length > 15 && scenario.qualifiedCoachLabel === 'not_reviewed', 'label_metadata_invalid')
    check(scenario.facts && typeof scenario.facts === 'object' && !Array.isArray(scenario.facts), 'facts_invalid')
    const cf = scenario.counterfactual
    check(cf && Object.hasOwn(scenario.facts, cf.field), 'counterfactual_field_invalid')
    check(canonical(scenario.facts[cf.field]) !== canonical(cf.value), 'counterfactual_unchanged')
    const variant = structuredClone(scenario.facts)
    variant[cf.field] = cf.value
    check(Object.keys(variant).filter(key => canonical(variant[key]) !== canonical(scenario.facts[key])).length === 1, 'counterfactual_not_single_field')
    for (const facts of [scenario.facts, variant]) {
      for (const [key, value] of Object.entries(facts)) {
        check(knownKeys.has(key), 'undocumented_fact_key')
        ;(factKeySchema[key] ??= new Set()).add(type(value))
      }
      const signature = canonical([scenario.rule, facts])
      check(!signatures.has(signature), 'duplicate_facts')
      signatures.add(signature)
    }
    check(!Object.hasOwn(scenario.facts, 'exactQuantityRequired') && scenario.facts.metric !== 'session.rpe' && !Object.hasOwn(scenario.facts, 'effortScope'), 'undeclared_policy_gate')
    for (const expectation of [scenario.expected, cf.expected]) {
      check(expectation && ['action', 'collect_signal', 'abstain'].includes(expectation.decision), 'decision_invalid')
      for (const key of ['assertions', 'forbidden']) check(Array.isArray(expectation[key]) && expectation[key].length > 0 && expectation[key].every(value => typeof value === 'string' && value.length > 0), 'expectation_invalid')
    }
  }
  check(rules.every(rule => counts[rule] === 4), 'family_count_invalid')
  const schema = Object.fromEntries(Object.entries(factKeySchema).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, [...values].sort()]))
  check(canonical(metadata.factKeySchema) === canonical(schema), 'metadata_schema_mismatch')
  check(metadata.scenarios === 12 && metadata.counterfactuals === 12 && canonical(metadata.counts) === canonical(counts), 'metadata_counts_invalid')
  console.log(JSON.stringify({ status: 'fixture_integrity_passed_not_application_verification', freezeState: metadata.freezeState, scenarios: 12, counterfactuals: 12, distinctSyntheticAthletes: 12, counts, sha256: sha(raw), factKeySchema: schema }, null, 2))
} catch (error) {
  // No assertion library values, JSON parse excerpts, scenario IDs, or expected labels escape.
  const safe = new Set(['original_hash_changed','schema_invalid','exposure_invalid','scenario_count_invalid','replacement_hash_mismatch','freeze_metadata_invalid','frozen_contract_changed','scenario_identity_invalid','athlete_identity_invalid','rule_invalid','label_metadata_invalid','facts_invalid','counterfactual_field_invalid','counterfactual_unchanged','counterfactual_not_single_field','undocumented_fact_key','duplicate_facts','undeclared_policy_gate','decision_invalid','expectation_invalid','family_count_invalid','metadata_schema_mismatch','metadata_counts_invalid'])
  console.error(JSON.stringify({ status: 'fixture_integrity_failed', category: safe.has(error?.message) ? error.message : 'file_or_parse_error' }))
  process.exitCode = 1
}
