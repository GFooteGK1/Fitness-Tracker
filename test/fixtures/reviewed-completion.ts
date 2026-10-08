export function reviewedCompletion(setReportIds: string[] = [], status: 'completed' | 'skipped' = 'completed') {
  return { contractVersion: 3, status, occurredAt: '2026-08-04T18:00:00Z', workoutDate: '2026-08-04', tzOffset: 300,
    totalDurationMinutes: null, setReportIds,
    feedback: { schemaVersion: 2, feedbackVersion: 2, outcome: status === 'skipped' ? 'skipped' : 'modified',
      sessionRpe: null, energy: null, pain: null, note: null,
      provenance: Object.fromEntries(['sessionRpe', 'energy', 'pain'].map(key => [key, { origin: 'unknown', reviewState: 'unreviewed' }])) } }
}
