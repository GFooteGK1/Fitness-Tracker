import { describe, expect, it } from 'vitest'
import { COMPLETE_PROGRAMMING_REFERENCE } from '@/app/lib/coach/programming-reference'

describe('complete programming evidence reference', () => {
  it('publishes a versioned reference for the intended healthy-adult population', () => {
    expect(COMPLETE_PROGRAMMING_REFERENCE).toMatchObject({
      schemaVersion: 1,
      referenceVersion: 'complete-programming-0.1.0',
      evidenceReviewDate: '2026-07-28'
    })
    expect(COMPLETE_PROGRAMMING_REFERENCE.intendedPopulation)
      .toContain('Generally healthy adults')
  })

  it('keeps source and evidence identifiers unique and fully resolved', () => {
    const sourceIds = COMPLETE_PROGRAMMING_REFERENCE.sources.map(source => source.id)
    const ruleIds = COMPLETE_PROGRAMMING_REFERENCE.evidenceRules.map(rule => rule.id)
    const sourceIdSet = new Set(sourceIds)

    expect(sourceIdSet.size).toBe(sourceIds.length)
    expect(new Set(ruleIds).size).toBe(ruleIds.length)
    expect(COMPLETE_PROGRAMMING_REFERENCE.sources.length).toBeGreaterThanOrEqual(12)

    for (const source of COMPLETE_PROGRAMMING_REFERENCE.sources) {
      expect(source.url).toMatch(/^https:\/\//)
    }

    for (const rule of COMPLETE_PROGRAMMING_REFERENCE.evidenceRules) {
      expect(rule.sourceIds.length).toBeGreaterThan(0)
      for (const sourceId of rule.sourceIds) {
        expect(sourceIdSet.has(sourceId), `${rule.id} references ${sourceId}`).toBe(true)
      }
    }
  })

  it('defines completeness by adaptation roles rather than a fixed exercise count', () => {
    const { productContract } = COMPLETE_PROGRAMMING_REFERENCE

    expect(productContract.universalExerciseCount).toBeNull()
    expect(productContract.completenessDefinition).toContain('priority adaptation')
    expect(productContract.completenessDefinition).toContain('weekly coverage')
    expect(productContract.completenessDefinition).toContain('time and recovery budget')
  })

  it('defines required, conditional, and optional session roles with evidence links', () => {
    const roles = COMPLETE_PROGRAMMING_REFERENCE.productContract.sessionBlockRoles
    const ruleIds = new Set(
      COMPLETE_PROGRAMMING_REFERENCE.evidenceRules.map(rule => rule.id)
    )

    expect(roles.map(role => [role.id, role.requirement])).toEqual([
      ['specific_preparation', 'required'],
      ['priority_adaptation', 'required'],
      ['secondary_adaptation', 'conditional'],
      ['assistance_and_capacity', 'conditional'],
      ['conditioning', 'conditional'],
      ['downshift', 'optional']
    ])

    for (const role of roles) {
      expect(role.sourceRuleIds.length).toBeGreaterThan(0)
      for (const ruleId of role.sourceRuleIds) {
        expect(ruleIds.has(ruleId), `${role.id} references ${ruleId}`).toBe(true)
      }
    }
  })

  it('preserves priority quality when time is constrained', () => {
    const rules = COMPLETE_PROGRAMMING_REFERENCE.productContract.timeBudgetRules
      .join(' ')
      .toLowerCase()

    expect(rules).toContain('specific preparation')
    expect(rules).toContain('priority adaptation')
    expect(rules).toContain('optional assistance')
    expect(rules).toContain('remove filler')
  })

  it('labels the week four and eight reviews as product policy rather than universal evidence', () => {
    expect(COMPLETE_PROGRAMMING_REFERENCE.productContract.reviewRules[0])
      .toContain('product-defined review checkpoints')
    expect(COMPLETE_PROGRAMMING_REFERENCE.productContract.reviewRules[0])
      .toContain('not claims that every athlete needs the same deload')
  })
})
