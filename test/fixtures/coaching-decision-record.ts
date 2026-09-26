/** Synthetic persisted rows for readback tests, not a prescription quality label. */
export function coachingDecisionRows(userId = 'user-1') {
  const evidence = { id: 'snapshot-1', contentHash: 'a'.repeat(64), activePlanVersionId: 'plan-1',
    evaluationWindow: { startsAt: '2026-08-01T12:00:00.000Z', endsAt: '2026-09-21T12:00:00.000Z' },
    excludedObservations: [{ observationId: 'incompatible-1', reason: 'incompatible_comparability_series' }],
    series: [{ metricId: 'strength.load', semanticRole: 'direct_outcome',
    protocol: { id: 'test-repetition-max', version: '1.0.0' }, comparabilityKey: 'comparison-v1|synthetic-squat',
    observationIds: ['observation-1', 'observation-2'], sampleCount: 2, exposureCount: 2, unit: 'kg',
    baselineAverage: 100, recentAverage: 101, directedChangePercent: 1, meaningfulChangeThresholdPercent: 2,
    trend: 'stable', status: 'emerging' }] }
  const review = { id: 'review-1', user_id: userId, program_id: 'program-1', base_plan_version_id: 'plan-1',
    review_revision: 1, action: 'continue', presentation_class: 'same_track', evidence_status: 'sufficient',
    rationale: { contextRevision: 7, messages: ['Keep the accepted dose while collecting comparable observations.'],
      reviewedAt: '2026-09-21T12:00:00.000Z', planningDecision: { action: 'continue', presentationClass: 'same_track',
        evidenceStatus: 'sufficient', doseChange: null, signalRequest: null, safetyBoundary: null } },
    missing_requirements: ['individual_variability_provisional'], evidence_snapshot: evidence,
    policy_version: 'rolling-weekly-0.1.0', algorithm_version: 'weekly-review-0.3.0', created_at: '2026-09-21T12:01:00.000Z' }
  const proposal = { id: 'proposal-1', user_id: userId, program_id: 'program-1', base_plan_version_id: 'plan-1',
    proposed_plan_version_id: 'plan-2', weekly_review_id: 'review-1', status: 'proposed' }
  return { userId, programId: 'program-1', basePlanVersionId: 'plan-1', review, proposal, sourceInvalidated: false, currentContextRevision: 7 }
}
