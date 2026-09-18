import type { SupabaseClient } from '@supabase/supabase-js';
import { formatUTCAsLocalDateWithOffset, isValidTimezoneOffset, localDateToUTCStart, localDateToUTCEnd } from '../timezone-utils';
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities';
import { COMPLETE_PROGRAMMING_POLICY_VERSION } from '../coach/programming-policy';
import { validatePlanningIntent, type PlanningIntentSnapshot } from '../coach/planning-intent';
import { validateIntentBaselineOwnership } from '../coach/planning-intent-server';
import { validateStoredCoachSessionCheckin } from '../coach/execution-feedback';
import { fingerprint } from './rules';
import { RECOMMENDATION_POLICY_VERSION, type RecommendationContext, type RefreshClaim } from './contracts';
export function runtimeFingerprint(): string { return fingerprint({ schema: 1, rules: '1', policy: RECOMMENDATION_POLICY_VERSION, programming: COMPLETE_PROGRAMMING_POLICY_VERSION, capabilities: personalizedCoachingCapabilities() }); }
export function recommendationScope(tzOffset: number, now = new Date().toISOString()) {
    if (!Number.isInteger(tzOffset) || !isValidTimezoneOffset(tzOffset) || !Number.isFinite(Date.parse(now)))
        throw new Error('Invalid timezone');
    const localDate = formatUTCAsLocalDateWithOffset(now, tzOffset);
    return { now, localDate, tzOffset, validUntil: localDateToUTCEnd(localDate, tzOffset), runtimeFingerprint: runtimeFingerprint() };
}
async function rows<T = Record<string, any>>(query: PromiseLike<{
    data: T[] | null;
    error: unknown;
}>, bound: number): Promise<T[]> {
    const result = await query;
    if (result.error || !result.data || result.data.length > bound)
        throw new Error('Recommendation source data is unavailable or incomplete');
    return result.data;
}
const finite = (value: unknown) => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
/** Every query is owner scoped; a failed/truncated read is not a cold start. */
export async function fetchRecommendationContext(db: SupabaseClient, userId: string, claim: RefreshClaim, scope: ReturnType<typeof recommendationScope>): Promise<RecommendationContext> {
    const [programs, memories, targets, mealRows, proposals] = await Promise.all([
        rows(db.from('training_programs').select('id,active_plan_version_id,status,start_date,end_date').eq('user_id', userId).eq('status', 'active').limit(2), 1),
        rows(db.from('coach_memories').select('id,version,content,status,effective_from,effective_until,review_after').eq('user_id', userId).eq('memory_key', 'training_intent').order('version', { ascending: false }).limit(1), 1),
        rows(db.from('daily_targets').select('target_protein,target_carbs,target_fat,target_calories,updated_at').eq('user_id', userId).limit(2), 1),
        rows(db.from('meals').select('id,meal_timestamp,capture_revision,capture_provenance,total_protein,total_carbs,total_fat,total_calories').eq('user_id', userId).gte('meal_timestamp', localDateToUTCStart(scope.localDate, scope.tzOffset)).lte('meal_timestamp', scope.now).order('meal_timestamp', { ascending: true }).limit(201), 200),
        rows(db.from('adaptation_proposals').select('id,base_plan_version_id,status,created_at,weekly_review_id').eq('user_id', userId).eq('status', 'proposed').order('created_at', { ascending: false }).limit(33), 32),
    ]);
    const program = programs[0];
    let plan: RecommendationContext['plan'] = null;
    let safetySignal: RecommendationContext['safetySignal'] = null;
    let sessions: RecommendationContext['sessions'] = [];
    let review: RecommendationContext['review'] = null;
    if ((program?.active_plan_version_id ?? null) !== claim.activePlanId)
        throw new Error('Plan changed during refresh');
    if (program?.active_plan_version_id) {
        const [versions, sessionRows, reviewRows, checkins] = await Promise.all([
            rows(db.from('training_plan_versions').select('id,policy_version,status').eq('user_id', userId).eq('id', program.active_plan_version_id).limit(1), 1),
            rows(db.from('prescribed_sessions').select('id,scheduled_date,status,completed_workout_id,updated_at').eq('user_id', userId).eq('plan_version_id', program.active_plan_version_id).eq('scheduled_date', scope.localDate).order('session_index').limit(49), 48),
            rows(db.from('coach_weekly_reviews').select('id,action,created_at,supersedes_review_id').eq('user_id', userId).eq('base_plan_version_id', program.active_plan_version_id).limit(65), 64),
            rows(db.from('coach_checkins').select('id,responses,occurred_at').eq('user_id', userId).eq('plan_version_id', program.active_plan_version_id).lte('occurred_at', scope.now).order('occurred_at', { ascending: false }).limit(97), 96),
        ]);
        for (const row of checkins) {
            const parsed = validateStoredCoachSessionCheckin(row.responses, row.occurred_at, row.id);
            if (parsed.ok && parsed.value.pain === 'concerning') {
                safetySignal = { id: row.id, occurredAt: row.occurred_at };
                break;
            }
        }
        const version = versions[0];
        if (!version || version.status !== 'accepted')
            throw new Error('Accepted plan is unavailable');
        plan = { id: version.id, programId: program.id, policyVersion: version.policy_version, status: program.status };
        sessions = sessionRows as RecommendationContext['sessions'];
        const superseded = new Set(reviewRows.map(r => r.supersedes_review_id));
        const leaves = reviewRows.filter(r => !superseded.has(r.id));
        if (leaves.length > 1)
            throw new Error('Review authority is ambiguous');
        if (leaves[0]) {
            const r = leaves[0];
            const invalidations = await rows(db.from('coach_review_source_invalidations').select('id').eq('user_id', userId).eq('review_id', r.id).limit(1), 1);
            review = { id: r.id, action: r.action, created_at: r.created_at, invalidated: invalidations.length > 0 };
        }
    }
    let intent: PlanningIntentSnapshot | null = null;
    const memory = memories[0];
    const current = memory?.status === 'confirmed' && (!memory.effective_from || Date.parse(memory.effective_from) <= Date.parse(scope.now)) && (!memory.effective_until || Date.parse(memory.effective_until) > Date.parse(scope.now)) && (!memory.review_after || Date.parse(memory.review_after) > Date.parse(scope.now));
    if (current) {
        const parsed = validatePlanningIntent(memory.content);
        if (!parsed.ok)
            throw new Error('Saved intent needs review');
        intent = { schemaVersion: 1, memoryId: memory.id, memoryVersion: memory.version, content: parsed.value };
    }
    if ((intent?.memoryId ?? null) !== claim.intentMemoryId || (intent?.memoryVersion ?? null) !== claim.intentVersion)
        throw new Error('Confirmed intent changed during refresh');
    const missingBaselines: RecommendationContext['missingBaselines'] = [];
    if (intent)
        for (const outcome of intent.content.outcomes) {
            if (outcome.baseline.status === 'unknown' || (await validateIntentBaselineOwnership(db, userId, { ...intent, content: { ...intent.content, outcomes: [outcome] } })).length)
                missingBaselines.push(outcome);
        }
    const target = targets[0];
    if (target && ![target.target_protein, target.target_carbs, target.target_fat, target.target_calories].every(finite))
        throw new Error('Saved nutrition targets need review');
    const meals = mealRows.map(m => {
        if (![m.total_protein, m.total_carbs, m.total_fat, m.total_calories].every(finite))
            throw new Error('Logged nutrition is incomplete');
        const origin = m.capture_provenance?.fields?.macros?.origin;
        return { id: m.id, at: m.meal_timestamp, revision: m.capture_revision, protein: Number(m.total_protein), carbs: Number(m.total_carbs), fat: Number(m.total_fat), calories: Number(m.total_calories), estimated: origin !== 'athlete_reported' };
    });
    // Coverage is optional and never inferred from Done or meal count. Its validity is read by the storage RPC.
    return { userId, ...scope, claim, intent, missingBaselines, plan, sessions, safetySignal, proposals: proposals as RecommendationContext['proposals'], review,
        nutrition: { target: target ? { protein: Number(target.target_protein), carbs: Number(target.target_carbs), fat: Number(target.target_fat), calories: Number(target.target_calories), updatedAt: target.updated_at } : null, meals, coverage: null } };
}
