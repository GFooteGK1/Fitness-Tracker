// Preparation-only pure contract. No network, credentials, account creation or SQL execution.
import { RECOVERY_CANONICAL_SETTINGS } from './private-recovery-manifest.mjs';
export const CUTOVER_SMOKE_READ_SETTINGS = `SET LOCAL ROLE postgres; SET LOCAL row_security=off; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='1s'; ${RECOVERY_CANONICAL_SETTINGS}`;
export const CUTOVER_SMOKE_INTAKE = Object.freeze({
  tzOffset: 300,
  goalTargetDate: '2027-04-05',
  planningInput: {
    format: 'complete_programming_intake_v0_3', primaryDomain: 'strength',
    goal: 'Build useful full-body strength', experience: 'consistent',
    trainingDays: ['monday', 'wednesday', 'friday'], sessionMinutes: 60,
    equipment: 'Bodyweight', resolvedEquipmentIds: ['bodyweight'], constraints: '',
    constraintKinds: [], secondaryGoals: [], startDate: '2026-09-28', setupConfirmed: true,
  },
});
export const CUTOVER_SMOKE_TIMING = Object.freeze({ requestDeadlineMs: 15000, successfulCreateAcceptTargetMs: 30000,
  startRepauseNoLaterThanMs: 60000, closedReadbackTargetMs: 90000, wholeMaintenanceSoftLimitMs: 2700000,
  automaticRetries: 0, abortGuaranteesServerStopped: false });
export function cutoverSmokeContract(runId) {
  if (typeof runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId)) throw Error('Freeze one UUIDv4 run identity before approval');
  const idempotencyKey = `cutover-${runId}-initial`;
  return { schemaVersion: 1, runId, syntheticEmail: `release-smoke-${runId}@sociusfit-smoke.invalid`,
    profile: { fitness_goals: ['performance'], body_metrics: { age: 35, height_cm: 175, weight_kg: 75 },
      preferences: { units: 'imperial', notifications: false, privacy_level: 'private' } },
    create: { route: '/api/coach/weekly', method: 'POST', body: { ...structuredClone(CUTOVER_SMOKE_INTAKE), idempotencyKey } },
    acceptanceBody: { idempotencyKey }, timing: { ...CUTOVER_SMOKE_TIMING },
    expected: { pausedCreate: { status: 503, body: { error: 'Unable to save the first weekly proposal' } },
      created: { status: 201, acceptanceRequired: true, activePlanChanged: false }, acceptanceStatus: 200,
      afterPausedCreate: { training_programs: 0, training_plan_versions: 0, prescribed_sessions: 0, adaptation_proposals: 0, coach_weekly_reviews: 0, coach_weekly_review_observations: 0, coach_context_revisions: 1 },
      afterAccepted: { training_programs: 1, training_plan_versions: 1, prescribed_sessions: 3, adaptation_proposals: 1, coach_weekly_reviews: 0, coach_weekly_review_observations: 0, coach_context_revisions: 1 },
      contextRevision: 0, sessionDates: ['2026-09-28', '2026-09-30', '2026-10-02'] },
  };
}

// Bind $1 to the dedicated Auth user UUID. Run in a bounded read-only transaction
// through the approved private operator connection; do not interpolate a value.
// No row content is returned. Full-row digests compare AFTER accept with replay.
export const CUTOVER_SMOKE_DIGEST_SQL = `WITH rows AS (
${['training_programs', 'training_plan_versions', 'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations', 'coach_context_revisions'].map(table =>
  `SELECT '${table}'::text AS relation, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.to_jsonb(t)::text,'UTF8')),'hex') AS row_hash FROM public.${table} t WHERE t.user_id=$1::uuid`).join('\nUNION ALL\n')}
), names(relation) AS (VALUES ${['training_programs', 'training_plan_versions', 'prescribed_sessions', 'adaptation_proposals', 'coach_weekly_reviews', 'coach_weekly_review_observations', 'coach_context_revisions'].map(table => `('${table}')`).join(',')})
SELECT n.relation, count(r.row_hash)::integer AS count,
 pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(coalesce(string_agg(r.row_hash,E'\\n' ORDER BY r.row_hash),''),'UTF8')),'hex') AS sha256
FROM names n LEFT JOIN rows r ON r.relation=n.relation GROUP BY n.relation ORDER BY n.relation;`;

export const CUTOVER_SMOKE_STATE_SQL = `SELECT p.id AS program_id,p.status AS program_status,p.active_plan_version_id,
 v.id AS plan_id,v.status AS plan_status,v.window_start,v.window_end,v.input_snapshot->'contextRevision' AS proposal_context_revision,
 a.id AS proposal_id,a.status AS proposal_status,a.idempotency_key,a.rationale->>'input_fingerprint' AS input_fingerprint,
 c.revision AS current_context_revision,
 (SELECT count(*)::integer FROM public.prescribed_sessions s WHERE s.user_id=$1::uuid AND s.plan_version_id=v.id) AS sessions
FROM public.training_programs p JOIN public.training_plan_versions v ON v.program_id=p.id AND v.user_id=p.user_id
JOIN public.adaptation_proposals a ON a.proposed_plan_version_id=v.id AND a.user_id=p.user_id
LEFT JOIN public.coach_context_revisions c ON c.user_id=p.user_id WHERE p.user_id=$1::uuid;`;

// Freeze these IDs only once, after committed pause and before schema changes.
export const CUTOVER_ACCEPTED_PLAN_IDS_SQL = `SELECT id FROM public.training_plan_versions WHERE status IN ('accepted','superseded') ORDER BY id;`;
export const CUTOVER_ACCEPTED_PLAN_FIELDS = Object.freeze(['id', 'program_id', 'user_id', 'version', 'reference_version', 'policy_version',
  'intent', 'input_snapshot', 'created_by', 'created_at', 'plan_mode', 'window_start', 'window_end', 'sequence_number']);
// Bind the frozen UUID array to $1. Missing rows are explicit, not silently dropped.
export const CUTOVER_ACCEPTED_PLAN_DIGEST_SQL = `WITH requested(id) AS (SELECT unnest($1::uuid[]))
SELECT r.id,v.id IS NOT NULL AS present,
 CASE WHEN v.id IS NULL THEN NULL ELSE pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
 pg_catalog.jsonb_build_object(${CUTOVER_ACCEPTED_PLAN_FIELDS.map(field => `'${field}',v.${field}`).join(',')})::text,'UTF8')),'hex') END AS sha256
FROM requested r LEFT JOIN public.training_plan_versions v ON v.id=r.id ORDER BY r.id;`;
export function cutoverAcceptedPlanDigestsMatch(before, after) {
  const valid = rows => Array.isArray(rows) && rows.every(row => typeof row?.id === 'string' && row.present === true && /^[a-f0-9]{64}$/.test(row.sha256))
    && new Set(rows.map(row => row.id)).size === rows.length;
  if (!valid(before) || !valid(after) || before.length !== after.length) return false;
  const expected = new Map(before.map(row => [row.id, row.sha256]));
  return after.every(row => expected.get(row.id) === row.sha256);
}
