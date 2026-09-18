import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import type { EngineeringScenarioSet } from '../fixtures/personalized-coaching/contracts'
import { closeEngineeringLifecycle, executeEngineeringLifecycleFacts, ENGINEERING_LIFECYCLE_VERSION, type EngineeringLifecycleActual } from './engineering-lifecycle'

// Development only. Never open heldout bodies in this materialization suite.
const path = 'test/fixtures/personalized-coaching/development.json', source = readFileSync(path, 'utf8')
const fixtureHash = createHash('sha256').update(source).digest('hex')
const scenarios = (JSON.parse(source) as EngineeringScenarioSet).scenarios.filter(row => ['dev-nutrition-08','dev-nutrition-09'].includes(row.id))
const results: Array<{ id: string; variant: string; expected: string; actual: EngineeringLifecycleActual }> = []
beforeAll(()=>{vi.stubEnv('RECOMMENDATIONS_ENABLED','true');vi.stubEnv('CAPTURE_RECEIPTS_V2_ENABLED','true')})
afterAll(async()=>{
 await closeEngineeringLifecycle();vi.unstubAllEnvs()
 expect(readFileSync(path,'utf8')).toBe(source)
 const directory='output/app-quality-release/personalized-coaching';mkdirSync(directory,{recursive:true})
 writeFileSync(`${directory}/development-engineering-lifecycle-report.json`,JSON.stringify({adapterVersion:ENGINEERING_LIFECYCLE_VERSION,fixtureHash,split:'development',results},null,2)+'\n','utf8')
})
describe('frozen development nutrition lifecycle against actual SQL and client gate',()=>{
 for(const scenario of scenarios)for(const variant of ['base','counterfactual'] as const){
  const facts=variant==='base'?scenario.facts:{...scenario.facts,[scenario.counterfactual.field]:scenario.counterfactual.value}
  const expected=variant==='base'?scenario.expected:scenario.counterfactual.expected
  it(`${scenario.id}/${variant}: ${scenario.title}`,async()=>{
   const actual=await executeEngineeringLifecycleFacts(scenario.rule,scenario.athlete,facts)
   results.push({id:scenario.id,variant,expected:expected.decision,actual})
   expect(actual.fixtureFactsUnchanged).toBe(true);expect(actual.decision).toBe(expected.decision)
   if(typeof facts.currentCalculationRevision==='number'){
    expect(actual.predicates.currentCanonicalRevision).toBe(facts.mealRevision)
    expect(actual.predicates.originalCalculationRevision).toBe(facts.currentCalculationRevision)
    if(facts.mealRevision!==facts.currentCalculationRevision){expect(actual.state).toBe('pending');expect(actual.predicates.currentVisibleIds).toEqual([]);expect(actual.predicates.coverageValid).toBe(false);expect(actual.predicates.sourceChanged).toBe(true)}
    else{expect(actual.state).toBe('ready');expect(actual.recommendation?.reason).toContain(`${Number(facts.targetCalories)-Number(facts.loggedCalories)} remaining in the log`);expect(actual.recommendation?.reason).toContain('later intake is unknown');expect(actual.predicates.coverageValid).toBe(true)}
   }else if(facts.photoPersistence==='queued'){
    expect(actual.predicates.totals).toMatchObject({count:1,calories:Number(facts.canonicalCalories).toFixed(2)})
    expect(actual.predicates.submittedPhotoRequests).toBe(0);expect(actual.needsReconciliation).toBe(false)
    expect(actual.recommendation?.reason).toContain(`${Number(facts.targetCalories)-Number(facts.canonicalCalories)} remaining in the log`)
   }else{
    const branches=actual.predicates.branches as Array<Record<string,any>>;expect(branches).toHaveLength(2)
    for(const branch of branches){
     expect(branch.decision).toBe('abstain');expect(branch.needsReconciliation).toBe(true);expect(branch.transportRemainsUncertain).toBe(true);expect(branch.noWriteConfirmed).not.toBe(true)
     expect(branch.otherRequestConfirmationStillPending).toBe(true)
     expect(branch.beforeRead).toEqual(branch.afterRead);expect(branch.photoRequestCount).toBe(1);expect(branch.retryAllowedBeforeRecovery).toBe(false)
     expect(branch.recoveredRequestId).toBe(branch.requestId);expect(branch.recoveredOperationId).toBe(branch.originalChildId);expect(branch.exactReceiptReplay).toBe(true)
     expect(branch.afterRecovery).toMatchObject({count:2,calories:(Number(facts.canonicalCalories)+Number(facts.queuedEstimatedCalories)).toFixed(2)})
     expect(branch.afterRecoveryDecision).toMatchObject({decision:'action',state:'ready',needsReconciliation:false})
    }
    expect(branches.map(branch=>branch.serverState)).toEqual(['ready','pending'])
   }
  },30000)
 }
})
