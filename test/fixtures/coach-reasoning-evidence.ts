import { assembleCoachEvidenceContext, type CoachEvidenceContextPacket, type CoachEvidenceSeries } from '@/app/lib/coach/evidence-context'

/** Synthetic observations; no real athlete data or coaching-policy labels. */
export function reasoningEvidencePacket(userId = 'test-user-123'): CoachEvidenceContextPacket {
  const packet = assembleCoachEvidenceContext(userId, {
    purpose: 'general_coaching', asOf: '2026-09-21T12:00:00.000Z',
  }, {
    programs: [], planVersions: [], sessions: [], memories: [], strengthAssessments: [],
    imports: [], observationGroups: [], observationValues: [],
  })
  packet.memories = [{
    id: 'memory-goal', memoryKey: 'event_goal', kind: 'goal', version: 2,
    content: { description: 'Synthetic multi-event goal. '.repeat(15), target: '2027-04', days: 5 },
    provenance: { source: 'athlete' }, confidence: 1, confirmedAt: '2026-09-20T12:00:00Z',
    effectiveFrom: '2026-09-20T12:00:00Z', effectiveUntil: null, reviewAfter: null, lastReviewedAt: null,
  }]
  const protocol = { id: 'synthetic-fixed-load-velocity', version: '1.0.0' }
  const comparison = { exercise: 'bench_press', load: 70, unit: 'kg', repetitions: 2 }
  const comparabilityKey = 'comparison-v1|synthetic-bench-70kg-double'
  const series: CoachEvidenceSeries = {
    id: 'velocity-series-v1', metricId: 'bar.mean_velocity', semanticRole: 'training_signal',
    assessmentDefinitionId: 'strength.fixed_load_velocity', protocol, comparabilityKey,
    observationIds: ['measurement-1'], sampleCount: 2, confidence: 1, algorithmVersion: packet.algorithmVersion,
    samples: [0.57, 0.52].map((value, index) => ({
      observationId: 'measurement-1', observationValueId: `value-${index + 1}`,
      metricId: 'bar.mean_velocity', semanticRole: 'training_signal',
      value, unit: 'm_per_s', originalMeasurement: { value, unit: 'm_per_s' }, ordinal: index + 1,
      observedAt: '2026-09-18T12:00:00.000Z', capturedAt: '2026-09-18T13:00:00.000Z',
      workoutId: 'workout-1', prescribedSessionId: null,
      assessmentDefinition: { id: 'strength.fixed_load_velocity', catalogVersion: 'test' },
      protocol, comparabilityKey, source: { kind: 'manual', system: 'synthetic', device: 'test-sensor',
        recordId: 'sensor-record-1', verificationStatus: 'athlete_confirmed' }, confidence: 1, comparison,
    })),
  }
  packet.evidenceSeries = [series]
  packet.sampleCount = 2
  packet.evidenceIds = ['measurement-1']
  return packet
}
