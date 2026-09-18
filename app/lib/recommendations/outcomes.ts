import type { SupabaseClient } from '@supabase/supabase-js';
import { isComparableIntentBaseline } from '../coach/planning-intent-server';
import type { StoredRecommendation } from './contracts';
export interface RecommendationOutcome {
    schemaVersion: 1;
    adherence: 'reported' | 'observed' | 'unknown';
    evidence: Array<{
        table: string;
        id: string;
        revision: number | null;
    }>;
    summary: string;
    attributionLimits: string[];
    metricId?: string;
    unit?: string;
    binding?: unknown;
}
const unknownOutcome = (reason: string): RecommendationOutcome => ({ schemaVersion: 1, adherence: 'unknown', evidence: [], summary: reason, attributionLimits: ['A missing or incomparable follow-up is unknown.', 'Other actions may overlap; these records do not establish causation.'] });
/** Reads current owned canonical evidence; deleted/corrected sources never inherit old observed outcomes. */
export async function evaluateRecommendationOutcome(db: SupabaseClient, userId: string, row: StoredRecommendation): Promise<RecommendationOutcome> {
    const spec = row.decision.outcome;
    if (!spec || row.lifecycle === 'withdrawn' || row.withdrawal_reason)
        return unknownOutcome('The decision was withdrawn or its basis changed; follow-up is unknown.');
    const reported = async (reason: string): Promise<RecommendationOutcome> => {
        const result = await db.from('recommendation_events').select('id,payload').eq('user_id', userId).eq('recommendation_id', row.id).eq('event_type', 'response').order('created_at', { ascending: false }).limit(1);
        if (result.error)
            throw new Error('Athlete response unavailable');
        if (result.data?.[0]?.payload?.response === 'done_reported')
            return { schemaVersion: 1, adherence: 'reported', evidence: [{ table: 'recommendation_events', id: result.data[0].id, revision: null }], summary: `You reported this action done. ${reason}`, attributionLimits: ['Self-report does not establish observed execution or a benefit.', 'Other actions may overlap; causation is unknown.'] };
        return unknownOutcome(reason);
    };
    if (spec.kind === 'session_completion') {
        const result = await db.from('prescribed_sessions').select('id,status,completed_workout_id,completed_at').eq('user_id', userId).eq('id', spec.sourceId).maybeSingle();
        if (result.error)
            throw new Error('Outcome source unavailable');
        const session = result.data;
        if (session?.status === 'completed' && session.completed_workout_id && Date.parse(session.completed_at) >= Date.parse(row.created_at) && Date.parse(session.completed_at) <= Date.parse(spec.dueAt)) {
            const workout = await db.from('workouts').select('id,capture_revision,execution_revision').eq('user_id', userId).eq('id', session.completed_workout_id).maybeSingle();
            if (workout.error)
                throw new Error('Outcome workout unavailable');
            if (workout.data && workout.data.capture_revision === 1 && workout.data.execution_revision === 0)
                return { schemaVersion: 1, adherence: 'observed', evidence: [{ table: 'workouts', id: workout.data.id, revision: 1 }, { table: 'prescribed_sessions', id: session.id, revision: null }], summary: 'A linked completion is recorded. This does not establish a training benefit.', attributionLimits: ['The recorded completion may overlap other actions; causation is unknown.'] };
        }
        return reported('No unchanged linked completion is available for this follow-up.');
    }
    if (!spec.binding || !spec.metricId || !spec.unit)
        return unknownOutcome('A comparable measurement was not defined.');
    const groups = await db.from('performance_observation_groups').select('*').eq('user_id', userId).eq('status', 'complete').gte('observed_at', row.created_at).lte('observed_at', spec.dueAt).limit(33);
    if (groups.error || !groups.data || groups.data.length > 32)
        throw new Error('Outcome measurements unavailable or incomplete');
    for (const group of groups.data) {
        if (!isComparableIntentBaseline(group, userId, spec.binding))
            continue;
        if (group.workout_id) {
            const current = await db.from('workouts').select('id,capture_revision,execution_revision').eq('id', group.workout_id).eq('user_id', userId).maybeSingle();
            if (current.error)
                throw new Error('Measurement execution unavailable');
            if (!current.data || current.data.capture_revision !== 1 || current.data.execution_revision !== 0)
                continue;
        }
        const values = await db.from('performance_observation_values').select('id,value_numeric').eq('user_id', userId).eq('group_id', group.id).eq('status', 'complete').eq('semantic_role', 'direct_outcome').eq('metric_id', spec.metricId).eq('unit', spec.unit).limit(2);
        if (values.error)
            throw new Error('Measurement values unavailable');
        if (values.data?.length !== 1 || values.data[0].value_numeric === null || values.data[0].value_numeric === '' || !Number.isFinite(Number(values.data[0].value_numeric)))
            continue;
        return { schemaVersion: 1, adherence: 'observed', evidence: [{ table: 'performance_observation_groups', id: group.id, revision: null }, { table: 'performance_observation_values', id: values.data[0].id, revision: null }], metricId: spec.metricId, unit: spec.unit, binding: spec.binding, summary: 'A later measurement with the defined protocol and binding is recorded. No improvement or causal benefit is inferred.', attributionLimits: ['Other actions may overlap; this is measurement follow-up, not proof that the recommendation caused a result.'] };
    }
    return reported('No later comparable measurement is available.');
}
