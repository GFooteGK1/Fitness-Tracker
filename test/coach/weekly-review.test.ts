import { type PlanningOutcome } from '@/app/lib/coach/planning-intent'
import { sampleMatchesOutcome, matchingAssignments } from '@/app/lib/coach/targeted-review'
import { intent, runningOutcome } from '../fixtures/personalized-coaching/intent'
import { describe, expect, it } from 'vitest'
import {
  ADAPTIVE_ASSESSMENT_CATALOG_VERSION,
  ADAPTIVE_EVIDENCE_POLICY_VERSION,
  findAssessmentDefinition,
  type EvidenceSemanticRole,
  type MetricUnit,
  type PerformanceMetricId
} from '@/app/lib/coach/adaptive-programming-contracts'
import type { AdaptivePlanContract } from '@/app/lib/coach/adaptive-plan'
import { buildCompleteEightWeekPlan } from '@/app/lib/coach/complete-program'
import {
  COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
  type CoachEvidenceContextPacket,
  type CoachEvidenceSample,
  type CoachEvidenceSeries
} from '@/app/lib/coach/evidence-context'
import type {
  CoachExecutionSession,
  CoachSessionCheckinSummary
} from '@/app/lib/coach/execution-feedback'
import { reportedFeedbackProvenance } from '@/app/lib/coach/execution-feedback'
import { buildRollingTrainingDirection } from '@/app/lib/coach/rolling-weekly-contracts'
import {
  buildRollingWeeklyPlan,
  type RollingWeeklyPlanDraft
} from '@/app/lib/coach/rolling-weekly-plan'
import type { ProgrammingProfile } from '@/app/lib/coach/programming-schema'
import {
  buildRollingWeeklyPlanningDecision,
  buildRollingWeeklyReview,
  type RollingWeeklyReadyReview
} from '@/app/lib/coach/weekly-review'
import { GOLDEN_PROGRAMMING_PROFILES } from './golden-programming-profiles'

const PROGRAM_ID = 'program-rolling'
const PLAN_ID = 'plan-rolling-1'
const baseProfile = withStart(GOLDEN_PROGRAMMING_PROFILES[0].profile, '2026-09-07')
const adaptivePlan = buildCompleteEightWeekPlan(baseProfile).adaptiveProgramming
const baseDirection = buildRollingTrainingDirection(baseProfile, {
  hypothesis: 'Repeatable standardized strength exposures will improve the direct outcome.',
  goalTargetDate: '2026-12-31'
})

describe('rolling weekly review', () => {
  it('keeps the review closed while the local week still has unfinished sessions', () => {
    const week = initialWeek()
    const result = buildRollingWeeklyReview(reviewInput({
      week,
      sessions: executionSessions(week),
      localDate: '2026-09-08',
      series: [strengthSeries([100, 100, 100, 100])]
    }))

    expect(result.status).toBe('not_ready')
    expect(result.executionSummary.pastDuePlannedSessions).toBeGreaterThanOrEqual(1)
  })

  it('reviews a completed local week without carrying missed work forward', () => {
    const week = initialWeek()
    const sessions = executionSessions(week, ['completed', 'planned'])
    const result = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      sessions,
      checkins: [checkin(sessions[0].id)],
      localDate: '2026-09-14',
      series: [strengthSeries([100, 100, 100, 100])]
    })))

    expect(result.reviewReason).toBe('week_ended')
    expect(result.action).toBe('continue')
    expect(result.executionSummary).toMatchObject({
      completedSessions: 1,
      skippedSessions: 0,
      pastDuePlannedSessions: 1
    })
    expect(result.rationale.join(' ')).toContain('not carried')

    const next = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: week,
      decision: buildRollingWeeklyPlanningDecision('review-1', result)
    }))
    expect(next.scheduledSessions.every(session => session.scheduledDate >= '2026-09-14')).toBe(true)
    expect(next.sessions).toHaveLength(week.sessions.length)
  })

  it('adds one compatible measurement when required evidence is missing', () => {
    const week = initialWeek()
    const sessions = executionSessions(week, ['completed', 'completed'])
    const result = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      sessions,
      checkins: sessions.map(session => checkin(session.id)),
      localDate: '2026-09-13',
      series: []
    })))

    expect(result.action).toBe('collect_signal')
    expect(result.presentationClass).toBe('needs_signal')
    expect(result.evidenceStatus).toBe('insufficient')
    expect(result.signalRequest).not.toBeNull()
    expect(result.proposal).toMatchObject({
      eligible: true,
      requiresAcceptance: true,
      generationReady: true
    })

    const next = requirePlan(buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: week,
      decision: buildRollingWeeklyPlanningDecision('review-2', result)
    }))
    expect(next.changeSummary.assessmentSignal).toEqual(result.signalRequest)
  })

  it('holds broad direct improvement without an exact assignment target', () => {
    const week = initialWeek()
    const sessions = executionSessions(week, ['completed', 'completed'])
    const result = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      sessions,
      checkins: sessions.map(session => checkin(session.id)),
      localDate: '2026-09-13',
      series: [strengthSeries([100, 101, 105, 106])]
    })))

    expect(result.action).toBe('collect_signal')
    expect(result.presentationClass).toBe('needs_signal')
    expect(result.doseChange).toBeNull()
    expect(result.missing).toContain('exact_assignment_target_unavailable')
    expect(result.proposal.requiresAcceptance).toBe(true)
  })

  it('uses repeated session signals for recovery but not one isolated poor session', () => {
    const week = progressedWeek()
    const sessions = executionSessions(week, ['completed', 'completed'])
    const oneSignal = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      planId: 'plan-rolling-2',
      sessions,
      checkins: [
        checkin(sessions[0].id, { energy: 'low' }),
        checkin(sessions[1].id)
      ],
      localDate: '2026-09-20',
      series: [strengthSeries([100, 100, 100, 100])]
    })))
    const repeated = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      planId: 'plan-rolling-2',
      sessions,
      checkins: sessions.map(session => checkin(session.id, { energy: 'low' })),
      localDate: '2026-09-20',
      series: [strengthSeries([100, 100, 100, 100])]
    })))

    expect(oneSignal.action).toBe('continue')
    expect(repeated.action).toBe('recover')
    expect(repeated.doseChange).toBeNull()
    expect(repeated.proposal.generationReady).toBe(false)
  })

  it('requires a confirmed direction before a repeated contradiction shifts emphasis', () => {
    const week = initialWeek()
    const sessions = executionSessions(week, ['completed', 'completed'])
    const result = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      sessions,
      checkins: sessions.map(session => checkin(session.id)),
      localDate: '2026-09-13',
      series: [strengthSeries([110, 109, 100, 99])]
    })))

    expect(result.action).toBe('shift_emphasis')
    expect(result.presentationClass).toBe('material_change')
    expect(result.proposal).toMatchObject({
      eligible: true,
      generationReady: false,
      directionConfirmationRequired: true
    })
  })

  it('opens an immediate no-plan safety boundary for concerning pain', () => {
    const week = initialWeek()
    const sessions = executionSessions(week)
    const result = requireReady(buildRollingWeeklyReview(reviewInput({
      week,
      sessions,
      checkins: [checkin(sessions[0].id, {
        pain: 'concerning',
        occurredAt: '2026-09-08T10:00:00.000Z'
      })],
      localDate: '2026-09-08',
      series: [strengthSeries([100, 101, 105, 106])]
    })))

    expect(result.reviewReason).toBe('safety_override')
    expect(result.action).toBe('pause_review')
    expect(result.evidenceStatus).toBe('safety_override')
    expect(result.safetyBoundary?.prohibitedMovementIds.length).toBeGreaterThan(0)
    expect(result.proposal).toMatchObject({ eligible: false, requiresAcceptance: false })

    const pause = buildRollingWeeklyPlan({
      source: 'weekly_review',
      windowStart: '2026-09-14',
      profile: withStart(baseProfile, '2026-09-14'),
      direction: baseDirection,
      priorWeek: week,
      decision: buildRollingWeeklyPlanningDecision('review-safety', result)
    })
    expect(pause.kind).toBe('safety_pause')
  })

  it('preserves deterministic included and excluded observation links', () => {
    const week = initialWeek()
    const sessions = executionSessions(week, ['completed', 'completed'])
    const input = reviewInput({
      week,
      sessions,
      checkins: sessions.map(session => checkin(session.id)),
      localDate: '2026-09-13',
      series: [
        strengthSeries([100, 102, 104], 'barbell'),
        strengthSeries([90, 92, 94], 'machine')
      ]
    })
    const first = requireReady(buildRollingWeeklyReview(input))
    const second = requireReady(buildRollingWeeklyReview(input))

    expect(first.observationLinks).toEqual(second.observationLinks)
    expect(first.observationLinks.some(link => link.disposition === 'included')).toBe(true)
    expect(first.observationLinks.some(link => link.disposition === 'excluded')).toBe(true)
  })
})

function initialWeek(): RollingWeeklyPlanDraft {
  return requirePlan(buildRollingWeeklyPlan({
    source: 'initial',
    windowStart: '2026-09-07',
    profile: baseProfile,
    direction: baseDirection
  }))
}

function progressedWeek(): RollingWeeklyPlanDraft {
  const prior = initialWeek()
  const candidate = prior.schedule.assignments.find(assignment => {
    const step = doseStep(assignment.unit)
    const ledger = prior.schedule.ledger.find(item => item.requirement.id === assignment.requirementId)
    if (step === null || !ledger) return false
    const maximum = ledger.requirement.dose.maximum ?? ledger.requirement.dose.target.max
    return ledger.plannedDose + step <= maximum
  })
  if (!candidate) throw new Error('Fixture needs a bounded progression candidate')
  const step = doseStep(candidate.unit)
  if (step === null) throw new Error('Fixture candidate needs a supported dose unit')
  return requirePlan(buildRollingWeeklyPlan({
    source: 'weekly_review',
    windowStart: '2026-09-14',
    profile: withStart(baseProfile, '2026-09-14'),
    direction: baseDirection,
    priorWeek: prior,
    decision: {
      reviewId: 'fixture-review',
      action: 'adjust_dose',
      presentationClass: 'small_adjustment',
      evidenceStatus: 'sufficient',
      rationale: 'Fixture progresses one bounded variable.',
      doseChange: {
        assignmentId: candidate.id,
        unit: candidate.unit,
        from: candidate.dose,
        to: candidate.dose + step
      }
    }
  }))
}

function reviewInput(options: {
  week: RollingWeeklyPlanDraft
  planId?: string
  sessions: CoachExecutionSession[]
  checkins?: CoachSessionCheckinSummary[]
  localDate: string
  series: CoachEvidenceSeries[]
}) {
  const planId = options.planId ?? PLAN_ID
  const asOf = `${options.localDate}T12:00:00.000Z`
  return {
    programId: PROGRAM_ID,
    basePlanVersionId: planId,
    goalId: adaptivePlan.goals[0].goalId,
    adaptivePlan,
    currentWeek: options.week,
    context: packet(options.series, options.week, planId, asOf),
    recoveryContext: null,
    sessions: options.sessions,
    checkins: options.checkins ?? [],
    athleteLocalDate: options.localDate
  }
}

function executionSessions(
  week: RollingWeeklyPlanDraft,
  statuses: Array<CoachExecutionSession['status']> = []
): CoachExecutionSession[] {
  return week.scheduledSessions.map((session, index) => ({
    id: `session-${week.sequenceNumber}-${index + 1}`,
    weekNumber: 1,
    sessionIndex: index + 1,
    scheduledDate: session.scheduledDate,
    status: statuses[index] ?? 'planned'
  }))
}

function checkin(
  sessionId: string,
  overrides: Partial<CoachSessionCheckinSummary> = {}
): CoachSessionCheckinSummary {
  return {
    feedbackVersion: 2,
    provenance: reportedFeedbackProvenance({ sessionRpe: 7, energy: 'okay', pain: 'none' }),
    id: `checkin-${sessionId}`,
    prescribedSessionId: sessionId,
    outcome: 'as_planned',
    sessionRpe: 7,
    energy: 'okay',
    pain: 'none',
    note: null,
    occurredAt: '2026-09-12T12:00:00.000Z',
    ...overrides
  }
}

function strengthSeries(values: number[], equipment = 'barbell'): CoachEvidenceSeries {
  const requirement = directRequirement(adaptivePlan)
  const definition = findAssessmentDefinition(requirement.assessmentDefinitionId ?? '')
  if (!definition) throw new Error('Fixture needs a known direct assessment')
  return series(`strength-${equipment}`, requirement.metricId, requirement.semanticRole, values, {
    definition: definition.id,
    protocol: definition.protocol.id,
    unit: definition.allowedUnits[0],
    comparability: `comparison-v1|metric=${requirement.metricId}|equipment=${equipment}`
  })
}

function directRequirement(plan: AdaptivePlanContract) {
  const requirement = plan.hypotheses[0].evidenceRequirements.find(item => (
    item.semanticRole === 'direct_outcome'
  ))
  if (!requirement) throw new Error('Fixture needs direct outcome evidence')
  return requirement
}

function series(
  id: string,
  metricId: PerformanceMetricId,
  semanticRole: EvidenceSemanticRole,
  values: number[],
  options: {
    definition: string
    protocol: string
    unit: MetricUnit
    comparability: string
  }
): CoachEvidenceSeries {
  const samples = values.map((value, index): CoachEvidenceSample => {
    const observationId = `${id}-${index + 1}`
    const date = String(10 + index * 6).padStart(2, '0')
    return {
      observationId,
      observationValueId: `${observationId}-value`,
      metricId,
      semanticRole,
      value,
      unit: options.unit,
      originalMeasurement: { value, unit: options.unit },
      ordinal: 0,
      observedAt: `2026-08-${date}T12:00:00.000Z`,
      capturedAt: `2026-08-${date}T12:00:00.000Z`,
      workoutId: `workout-${observationId}`,
      prescribedSessionId: `source-${observationId}`,
      assessmentDefinition: {
        id: options.definition,
        catalogVersion: ADAPTIVE_ASSESSMENT_CATALOG_VERSION
      },
      protocol: { id: options.protocol, version: '1.0.0' },
      comparabilityKey: options.comparability,
      source: {
        kind: 'coach_completion',
        system: 'sociusfit',
        device: null,
        recordId: `record-${observationId}`,
        verificationStatus: 'athlete_confirmed'
      },
      confidence: 1,
      comparison: {}
    }
  })
  return {
    id,
    metricId,
    semanticRole,
    assessmentDefinitionId: options.definition,
    protocol: { id: options.protocol, version: '1.0.0' },
    comparabilityKey: options.comparability,
    observationIds: samples.map(sample => sample.observationId),
    sampleCount: samples.length,
    confidence: 1,
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    samples
  }
}

function packet(
  evidenceSeries: CoachEvidenceSeries[],
  week: RollingWeeklyPlanDraft,
  planId: string,
  asOf: string
): CoachEvidenceContextPacket {
  const evidenceIds = [...new Set(evidenceSeries.flatMap(item => item.observationIds))].sort()
  return {
    schemaVersion: 1,
    purpose: 'adaptation_review',
    asOf,
    window: { startsAt: '2026-06-15T12:00:00.000Z', endsAt: asOf, days: 90 },
    algorithmVersion: COACH_EVIDENCE_CONTEXT_ALGORITHM_VERSION,
    evidencePolicyVersion: ADAPTIVE_EVIDENCE_POLICY_VERSION,
    storageAvailable: true,
    selectionComplete: true,
    scope: {
      userId: 'user-1',
      activeProgramId: PROGRAM_ID,
      activePlanVersionId: planId,
      goalId: adaptivePlan.goals[0].goalId,
      prescribedSessionId: null,
      metricId: null,
      protocol: null,
      comparabilityKey: null
    },
    activePlan: {
      programId: PROGRAM_ID,
      title: week.title,
      goalSummary: week.profileSnapshot.athleteGoalSummary,
      startDate: week.windowStart,
      endDate: week.windowEnd,
      planVersionId: planId,
      planVersion: week.sequenceNumber,
      referenceVersion: week.evidenceReferenceVersion,
      policyVersion: week.policyVersion,
      goalIds: [adaptivePlan.goals[0].goalId],
      sessionIds: []
    },
    session: null,
    memories: [],
    strengthBaselines: [],
    evidenceSeries,
    evidenceIds,
    sampleCount: evidenceSeries.reduce((total, item) => total + item.sampleCount, 0),
    limits: {
      maxMemories: 16,
      maxAssessments: 12,
      maxObservationSamples: 160,
      sourceTruncated: false,
      selectionTruncated: false
    },
    missing: [],
    reproduction: {
      request: {
        purpose: 'adaptation_review',
        goalId: adaptivePlan.goals[0].goalId,
        asOf,
        windowDays: 90
      },
      activePlanVersionId: planId,
      memoryIds: [],
      assessmentIds: [],
      observationIds: evidenceIds
    }
  }
}

function requireReady(review: ReturnType<typeof buildRollingWeeklyReview>): RollingWeeklyReadyReview {
  if (review.status !== 'ready') throw new Error('Expected a ready weekly review')
  return review
}

function requirePlan(result: ReturnType<typeof buildRollingWeeklyPlan>): RollingWeeklyPlanDraft {
  if (result.kind !== 'weekly_plan') throw new Error('Expected a weekly plan')
  return result
}

function doseStep(unit: RollingWeeklyPlanDraft['schedule']['assignments'][number]['unit']): number | null {
  if (unit === 'working_sets') return 1
  if (unit === 'quality_repetitions') return 2
  if (unit === 'minutes') return 5
  if (unit === 'intervals') return 1
  return null
}

function withStart(profile: ProgrammingProfile, startDate: string): ProgrammingProfile {
  return structuredClone({ ...profile, startDate })
}

function strengthOutcome(id = 'goal:bench', movement = 'barbell_bench_press'): PlanningOutcome {
  const outcome = runningOutcome(id), definition = findAssessmentDefinition(directRequirement(adaptivePlan).assessmentDefinitionId!)!
  outcome.domain = 'strength'; outcome.goal.requiredQualityIds = ['maximal_strength']
  outcome.goal.statement = `Improve ${movement}`
  outcome.measurement = {metricId:definition.primaryMetricId,unit:'kg',assessmentDefinition:{id:definition.id,version:definition.version},protocol:{id:definition.protocol.id,version:definition.protocol.version}}
  outcome.binding = {movementId:movement,variation:'standard',equipmentIds:['barbell'],distance:null,assessmentContext:{repetitions:1,externalLoad:null,duration:null,techniqueModifiers:[],environmentModifiers:[]}}
  return outcome
}
function boundSeries(outcome:PlanningOutcome, values=[100,100,100,100]) {
  const value = strengthSeries(values,outcome.goal.id)
  value.id = outcome.goal.id;value.comparabilityKey=outcome.goal.id
  value.protocol = {...outcome.measurement!.protocol}
  value.samples.forEach(s=>{s.assessmentDefinition.version=outcome.measurement!.assessmentDefinition.version;s.protocol={...outcome.measurement!.protocol};s.comparabilityKey=outcome.goal.id;s.comparison={movementId:outcome.binding.movementId,variationId:outcome.binding.variation,equipmentIds:outcome.binding.equipmentIds,repetitions:1}})
  return value
}
function targeted(outcomes:PlanningOutcome[],series:CoachEvidenceSeries[],priority:string[]|null=null) {
  const week=initialWeek(),content=intent(...outcomes);content.priorityOrder=priority
  week.profileSnapshot.trainingIntent={schemaVersion:1,memoryId:'11111111-1111-4111-8111-111111111111',memoryVersion:1,content}
  const sessions=executionSessions(week,['completed','completed'])
  return {week,input:{...reviewInput({week,sessions,checkins:sessions.map(s=>checkin(s.id)),localDate:'2026-09-14',series}),targetedReview:true}}
}
describe('separate confirmed outcome review',()=>{
  it('does not treat bench, squat, changed protocol, equipment or repetitions as equivalent strength outcomes',()=>{
    const bench=strengthOutcome(),sample=boundSeries(bench).samples[0]
    expect(sampleMatchesOutcome(sample,bench)).toBe(true)
    for(const changed of [ {...sample,comparison:{...sample.comparison,movementId:'barbell_back_squat'}},{...sample,protocol:{...sample.protocol,version:'future'}},{...sample,comparison:{...sample.comparison,equipmentIds:['dumbbell']}},{...sample,comparison:{...sample.comparison,repetitions:5}} ]) expect(sampleMatchesOutcome(changed,bench)).toBe(false)
  })
  it('evaluates the second same-domain goal and retains separate included and excluded source identities',()=>{
    const bench=strengthOutcome(),squat=strengthOutcome('goal:squat','barbell_back_squat'),{input}=targeted([bench,squat],[boundSeries(bench),boundSeries(squat,[100,101,105,106])],[bench.goal.id,squat.goal.id])
    const result=requireReady(buildRollingWeeklyReview(input))
    expect(result.goalReviews).toHaveLength(2)
    expect(result.goalReviews?.find(g=>g.goalId===squat.goal.id)?.actionCandidate).toBe('progress')
    expect(result.goalId).toBe(squat.goal.id)
    expect(result.goalReviews?.[0].includedSourceIds.every(id=>id.includes(bench.goal.id))).toBe(true)
    expect(result.goalReviews?.[0].excludedSources.length).toBeGreaterThan(0)
  })
  it('holds competing changes without confirmed priority and when shared demands have missing evidence',()=>{
    const a=strengthOutcome(),b=strengthOutcome('goal:squat','barbell_back_squat')
    const unprioritized=requireReady(buildRollingWeeklyReview(targeted([a,b],[boundSeries(a,[100,101,105,106]),boundSeries(b,[100,101,105,106])]).input))
    expect(unprioritized.missing).toContain('outcome_priority_unspecified');expect(unprioritized.doseChange).toBeNull()
    const conflict=requireReady(buildRollingWeeklyReview(targeted([a,b],[boundSeries(a,[100,101,105,106])],[a.goal.id,b.goal.id]).input))
    expect(conflict.missing).toContain('shared_demand_conflict');expect(conflict.proposal.generationReady).toBe(false)
  })
  it('allows an unchanged week when an unrelated outcome lacks evidence',()=>{
    const a=strengthOutcome(),b=runningOutcome(),result=requireReady(buildRollingWeeklyReview(targeted([a,b],[boundSeries(a)]).input))
    expect(result.action).toBe('continue');expect(result.goalReviews?.find(g=>g.goalId===b.goal.id)?.includedSourceIds).toEqual([])
    expect(result.goalReviews?.find(g=>g.goalId===b.goal.id)?.attained).toBe(false)
  })
  it('applies concerning pain across outcomes before missing-evidence decisions',()=>{
    const a=strengthOutcome(),b=runningOutcome(),{input}=targeted([a,b],[])
    input.checkins[0]=checkin(input.sessions[0].id,{pain:'concerning'})
    const result=requireReady(buildRollingWeeklyReview(input));expect(result.action).toBe('pause_review');expect(result.proposal.generationReady).toBe(false)
  })
  it('never maps bench evidence onto squat work or silently chooses one of multiple matching assignments',()=>{
    const a=strengthOutcome(),{week,input}=targeted([a],[boundSeries(a,[100,101,105,106])])
    const result=requireReady(buildRollingWeeklyReview(input)),goal=result.goalReviews![0]
    const assignments=matchingAssignments(week,input.context,goal.evaluator,week.profileSnapshot.primaryGoal.id,a)
    for(const id of assignments){const assignment=week.schedule.assignments.find(x=>x.id===id)!;expect(week.sessions.some(s=>s.day===assignment.day&&s.blocks.some(b=>b.role!=='specific_preparation'&&b.exercises.some(e=>e.movementId===a.binding.movementId&&e.coverageRequirementIds.includes(assignment.requirementId))))).toBe(true)}
    if(assignments.length!==1){expect(result.doseChange).toBeNull();expect(result.missing).toContain('exact_assignment_target_unavailable')}
  })
  it('keeps a previously declared supporting signal separate and flags improvement without direct transfer',()=>{
    const a=strengthOutcome(),direct=boundSeries(a),support=boundSeries(a,[8,8,6,6]),definition=findAssessmentDefinition('session.rpe')!
    support.id='support';support.metricId='session.rpe';support.semanticRole='training_signal';support.assessmentDefinitionId=definition.id;support.protocol={...definition.protocol};support.observationIds=support.observationIds.map(id=>'support-'+id)
    support.samples.forEach(sample=>{sample.observationId='support-'+sample.observationId;sample.observationValueId='support-'+sample.observationValueId;sample.metricId='session.rpe';sample.semanticRole='training_signal';sample.unit='score';sample.originalMeasurement.unit='score';sample.assessmentDefinition={id:definition.id,version:definition.version,catalogVersion:ADAPTIVE_ASSESSMENT_CATALOG_VERSION};sample.protocol={...definition.protocol}})
    const {input}=targeted([a],[direct,support]);input.adaptivePlan=structuredClone(input.adaptivePlan)
    input.adaptivePlan.hypotheses[0].evidenceRequirements.push({metricId:'session.rpe',semanticRole:'training_signal',assessmentDefinitionId:definition.id,minimumComparableObservations:2,evaluationWindowDays:56})
    input.adaptivePlan.expectedSignals.push({...input.adaptivePlan.expectedSignals[0],id:'signal:declared-support',metricId:'session.rpe',semanticRole:'training_signal',assessmentDefinitionId:definition.id,expectedDirection:'decrease'})
    const result=requireReady(buildRollingWeeklyReview(input));expect(result.action).toBe('shift_emphasis');expect(result.goalReviews?.[0].evaluator.rationale.join(' ')).toContain('without transfer');expect(result.doseChange).toBeNull();expect(result.proposal.directionConfirmationRequired).toBe(true)
  })
  it('does not call the whole direction attained when only one same-domain outcome reaches its target',()=>{
    const a=strengthOutcome(),b=strengthOutcome('goal:squat','barbell_back_squat');a.goal.target={role:'target',comparison:'at_least',metric:{metricId:'strength.load',unit:'kg',value:105},assessmentDefinition:a.measurement!.assessmentDefinition,protocol:a.measurement!.protocol}
    const result=requireReady(buildRollingWeeklyReview(targeted([a,b],[boundSeries(a,[100,101,105,106]),boundSeries(b)],[a.goal.id,b.goal.id]).input))
    expect(result.goalReviews?.find(g=>g.goalId===a.goal.id)?.attained).toBe(true);expect(result.goalReviews?.find(g=>g.goalId===b.goal.id)?.attained).toBe(false);expect(result.goalMetMaintenance).toBe(false)
  })
  it('does not inherit repetition-max numerical eligibility for a velocity measurement',()=>{
    const a=strengthOutcome(),d=findAssessmentDefinition('strength.fixed_load_velocity')!;a.measurement={metricId:d.primaryMetricId,unit:'m_per_s',assessmentDefinition:{id:d.id,version:d.version},protocol:{id:d.protocol.id,version:d.protocol.version}}
    const velocity=boundSeries(a,[0.4,0.41,0.5,0.51]);velocity.metricId=d.primaryMetricId;velocity.assessmentDefinitionId=d.id;velocity.samples.forEach(s=>{s.metricId=d.primaryMetricId;s.unit='m_per_s';s.originalMeasurement.unit='m_per_s';s.assessmentDefinition.id=d.id})
    const result=requireReady(buildRollingWeeklyReview(targeted([a],[velocity]).input));expect(result.action).toBe('collect_signal');expect(result.doseChange).toBeNull();expect(result.goalReviews?.[0].missing).toContain('outcome_policy_adapter_unavailable')
  })
  it('keeps attained targets true even when concerning pain takes precedence over the action',()=>{
    const a=strengthOutcome();a.goal.target={role:'target',comparison:'at_least',metric:{metricId:'strength.load',unit:'kg',value:105},assessmentDefinition:a.measurement!.assessmentDefinition,protocol:a.measurement!.protocol}
    const {input}=targeted([a],[boundSeries(a,[100,101,105,106])]);input.checkins[0]=checkin(input.sessions[0].id,{pain:'concerning'})
    const result=requireReady(buildRollingWeeklyReview(input));expect(result.action).toBe('pause_review');expect(result.goalReviews?.[0].attained).toBe(true);expect(result.proposal.generationReady).toBe(false)
  })
  it('holds when another domain shares the exact movement but its required evidence is missing',()=>{
    const strength=strengthOutcome(),hypertrophy=strengthOutcome('goal:bench-capacity'),d=findAssessmentDefinition('strength.repetition_capacity')!
    hypertrophy.domain='hypertrophy';hypertrophy.goal.requiredQualityIds=['strength_endurance'];hypertrophy.measurement={metricId:d.primaryMetricId,unit:'repetitions',assessmentDefinition:{id:d.id,version:d.version},protocol:{id:d.protocol.id,version:d.protocol.version}}
    const {input}=targeted([strength,hypertrophy],[boundSeries(strength,[100,101,105,106])],[strength.goal.id,hypertrophy.goal.id])
    input.currentWeek.profileSnapshot.secondaryGoals=[{id:'allocation:hypertrophy',domain:'hypertrophy',role:'secondary',allocation:'development',athleteIntent:'Bench capacity'}]
    const result=requireReady(buildRollingWeeklyReview(input));expect(result.missing).toContain('shared_demand_conflict');expect(result.doseChange).toBeNull();expect(result.goalReviews?.map(g=>g.allocationId)).toEqual([baseProfile.primaryGoal.id,'allocation:hypertrophy'])
  })
  it('keeps accepted prescription content immutable and excludes amendment sources from decisions',()=>{
    const a=strengthOutcome(),{week,input}=targeted([a],[]),before=structuredClone(week)
    input.context.executionExclusions=[{observationId:'amended',workoutId:'workout',reason:'execution_amended_or_deleted'}]
    const result=requireReady(buildRollingWeeklyReview(input));expect(week).toEqual(before);expect(result.goalReviews?.[0].excludedSources).toContainEqual({observationId:'amended',reason:'execution_amended_or_deleted'});expect(result.executionSources).toEqual([])
  })
})
