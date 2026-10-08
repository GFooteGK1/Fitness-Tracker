import { describe,expect,it } from 'vitest'
import { firstReviewedSetupProfile } from '@/app/lib/coach/first-reviewed-setup-profile'
import { parseFirstReviewedSetupRead,parseFirstReviewedSetupSeed } from '@/app/lib/coach/first-reviewed-setup-contract'
import { reviewedRollingWeek } from '../fixtures/reviewed-rolling-week'
import { currentSetupBindings,declarationSeed } from '../fixtures/first-reviewed-setup'

function fixture(){return {legacy:structuredClone(reviewedRollingWeek().input.context.profile),setup:currentSetupBindings()}}
function seed(){const f=fixture(),r=firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05');if(r.kind!=='setup_ready')throw Error(JSON.stringify(r));return declarationSeed(r.profile)}
describe('current first-review setup declarations (facts not loaded)',()=>{
  it('uses current goals, unequal daily times and unresolved prose without changing the legacy snapshot',()=>{
    const f=fixture(),old=structuredClone(f.legacy),r=firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05')
    expect(r.kind).toBe('setup_ready');if(r.kind!=='setup_ready')throw Error('setup unavailable')
    expect(r.profile).toMatchObject({primaryGoal:{domain:'aerobic'},secondaryGoals:[{domain:'strength',allocation:'maintenance'}],
      trainingExperience:'experienced',sessionAvailability:[{day:'tuesday',minutes:45},{day:'saturday',minutes:75}],
      equipment:{athleteDescription:' A bench, barbell and an unmeasured outdoor area. ',resolvedIds:['barbell','bench','bodyweight'],
        unresolvedAthleteDescription:'Outdoor distance and runout need confirmation.'},unresolvedConstraintNote:'Ask about the outdoor surface.',
      assessments:[],recentTraining:{asOfDate:null,lookbackDays:0,completedSessionCount:0,performedMovementIds:[],doseByCoverageTarget:[]}})
    for(const field of ['trainingIntent','planningContext','prescriptionBasis','executionPriority'])expect(r.profile).not.toHaveProperty(field)
    expect(r.profile.inputSource).toEqual(old.inputSource);expect(f.legacy).toEqual(old)
    expect(parseFirstReviewedSetupSeed(declarationSeed(r.profile),'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010')).not.toBeNull()
  })
  it('preserves legacy declaration wording as unresolved rather than assuming the prose is resolved',()=>{
    const f=fixture();f.setup.memories.training_schedule!.content={experience:'consistent',trainingDays:['monday','friday'],sessionMinutes:55}
    f.setup.memories.available_equipment!.content={equipment:' Barbell and unknown machine. ',resolvedEquipmentIds:['barbell']}
    const r=firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05');expect(r.kind).toBe('setup_ready')
    if(r.kind==='setup_ready'){expect(r.profile.sessionAvailability).toEqual([{day:'monday',minutes:55},{day:'friday',minutes:55}]);
      expect(r.profile.equipment).toEqual({resolvedIds:['barbell'],unresolvedAthleteDescription:'Barbell and unknown machine.'})}
  })
  it('retains explicit reviewed equipment aliases without guessing additional implements',()=>{
    const f=fixture();f.setup.memories.available_equipment!.content.resolvedEquipmentIds=['high_handle_trap_bar','safe_runout']
    const r=firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05');expect(r.kind).toBe('setup_ready')
    if(r.kind==='setup_ready')expect(r.profile.equipment.resolvedIds).toEqual(['high_handle_trap_bar','safe_runout'])
  })
  it.each(['primary_goal','training_schedule','available_equipment','training_constraints'])('requires missing or overdue %s rather than falling back',key=>{
    const f=fixture();f.setup.memories[key]=null;expect(firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05')).toEqual({kind:'setup_required',keys:[key]})
    f.setup=currentSetupBindings();f.setup.memories[key]!.currentAtRead=false
    expect(firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05')).toEqual({kind:'setup_required',keys:[key]})
  })
  it.each([
    ['primary_goal',{goal:'Run well',primaryDomain:'aerobic',secondaryGoals:[{domain:'aerobic',allocation:'maintenance',athleteIntent:'Duplicate primary'}]}],
    ['primary_goal',{goal:'Run well',primaryDomain:'invented',secondaryGoals:[]}],
    ['training_schedule',{schemaVersion:2,experience:'experienced',sessionAvailability:[{day:'tuesday',minutes:45},{day:'tuesday',minutes:75}]}],
    ['training_schedule',{experience:'consistent',trainingDays:['monday','friday'],sessionMinutes:95}],
    ['available_equipment',{schemaVersion:2,equipment:'Gym',resolvedEquipmentIds:['unverified_machine'],unresolvedAthleteDescription:null}],
    ['training_constraints',{constraints:'None',constraintKinds:['invented']}],
  ])('requires correction of invalid %s', (key,content)=>{const f=fixture();f.setup.memories[key as string]!.content=content as Record<string,unknown>
    expect(firstReviewedSetupProfile(f.legacy,f.setup,'2026-10-05')).toEqual({kind:'setup_required',keys:[key]})})
  it('does not derive a target outcome or calendar horizon from the first target week',()=>{
    const r=seed();expect(r.targetSetup.primaryGoal).not.toHaveProperty('outcome');expect(r.targetSetup.primaryGoal).not.toHaveProperty('horizon')
  })
  it.each(['foreign_actor','foreign_program','extra','facts','count','intent','date','non_monday','sequence','offset','lookback','hash'])('rejects unbound or factual seed: %s',kind=>{
    const r=seed();let actor=r.userId,program=r.programId
    switch(kind){case 'foreign_actor':actor=r.basePlanVersionId;break;case 'foreign_program':program=r.basePlanVersionId;break;
      case 'extra':Object.assign(r,{grant:true});break;case 'facts':r.factsLoaded=true;break;case 'count':r.targetSetup.recentTraining.completedSessionCount=1;break;
      case 'intent':Object.assign(r.targetSetup,{trainingIntent:{}});break;case 'date':r.windowStart='2026-02-30';r.targetSetup.startDate=r.windowStart;break;
      case 'non_monday':r.windowStart='2026-10-06';r.targetSetup.startDate=r.windowStart;break;case 'sequence':r.sequenceNumber=1;break;
      case 'offset':r.tzOffset=9999;break;case 'lookback':r.historyDays=181;break;case 'hash':r.sourceHash='unknown';break}
    expect(parseFirstReviewedSetupSeed(r,actor,program)).toBeNull()
  })
  it('strictly bounds read scope and requires explicit timezone',()=>{
    const r=seed(),q={expectedUserId:r.userId,programId:r.programId,historyDays:90,tzOffset:300}
    expect(parseFirstReviewedSetupRead(q)).toEqual(q)
    expect(parseFirstReviewedSetupRead({...q,historyDays:0})).toBeNull();expect(parseFirstReviewedSetupRead({...q,tzOffset:undefined})).toBeNull()
    expect(parseFirstReviewedSetupRead({...q,extra:true})).toBeNull()
  })
})
