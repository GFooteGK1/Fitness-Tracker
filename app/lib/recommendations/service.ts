import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '../auth/supabase-server';
import { personalizedCoachingCapabilities } from '../personalized-coaching-capabilities';
import { recommendationScope, fetchRecommendationContext, runtimeFingerprint } from './context';
import { abstain, evaluateRules } from './rules';
import type { Suppression } from './contracts';
import { rankCandidates } from './rank';
import { claimRefresh, failRefresh, publishRecommendation, readRecommendations, recommendationRPC } from './store';
import { evaluateRecommendationOutcome } from './outcomes';
/** Caller has authenticated userId. Source reads retain user RLS; trusted publication never accepts client decisions. */
export async function getRecommendationView(userDb: SupabaseClient, userId: string, tzOffset: number, refresh: boolean, serviceDb?: SupabaseClient) {
    if (!personalizedCoachingCapabilities().recommendations)
        return { status: 'disabled' as const, recommendations: [], refreshState: null };
    const scope = recommendationScope(tzOffset);
    const db = serviceDb ?? createServiceRoleClient();
    let snapshot = await readRecommendations(db, userId, scope);
    if (refresh) {
        const claim = await claimRefresh(db, userId, scope);
        if (claim) {
            try {
                snapshot = await readRecommendations(db, userId, scope);
                if (snapshot.refreshState.sourceRevision !== claim.sourceRevision || snapshot.refreshState.responseRevision !== claim.responseRevision)
                    throw new Error('Sources changed during refresh');
                const context = await fetchRecommendationContext(userDb, userId, claim, scope);
                if (snapshot.coverage?.coverageValid)
                    context.nutrition.coverage = { id: snapshot.coverage.id, through: snapshot.coverage.coverage_through, status: snapshot.coverage.status, sourceRevision: snapshot.coverage.nutrition_revision, valid: true };
                const candidates = evaluateRules(context);
                const suppressions = candidates.length ? await recommendationRPC<Suppression[]>(db, 'get_recommendation_suppressions', { p_user_id: userId, p_candidates: candidates.map(c => ({ scopeKey: c.decision.scopeKey, evidenceFingerprint: c.decision.evidenceFingerprint })) }) : [];
                const selected = rankCandidates(candidates, suppressions, scope.now)[0]?.decision ?? abstain(context);
                if (runtimeFingerprint() !== scope.runtimeFingerprint || recommendationScope(tzOffset).localDate !== scope.localDate)
                    throw new Error('Runtime scope changed');
                await publishRecommendation(db, userId, scope, claim, selected);
            }
            catch {
                await failRefresh(db, userId, claim).catch(() => undefined);
            }
            snapshot = await readRecommendations(db, userId, recommendationScope(tzOffset));
        }
    }
    // Bounded derived follow-up does not schedule another analysis or recreate old advice.
    let outcomesWritten = false;
    for (const row of (snapshot.dueOutcomes ?? []).slice(0, 8)) {
        try {
            const outcome = await evaluateRecommendationOutcome(userDb, userId, row);
            await recommendationRPC(db, 'record_recommendation_outcome', { p_user_id: userId, p_recommendation_id: row.id, p_request_id: `followup:${row.id}:1`, p_outcome: outcome });
            outcomesWritten = true;
        }
        catch { /* Next interaction may retry unavailable evidence. */ }
    }
    if (outcomesWritten)
        snapshot = await readRecommendations(db, userId, recommendationScope(tzOffset));
    return { coverage: snapshot.coverage ?? null, outcomes: snapshot.outcomes ?? [], status: snapshot.refreshState.lastError ? 'unavailable' as const : snapshot.refreshState.pending ? 'pending' as const : 'ready' as const, recommendations: snapshot.recommendations, refreshState: snapshot.refreshState };
}
