import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecommendationDecision, RecommendationSnapshot, RefreshClaim } from './contracts';
import type { recommendationScope } from './context';
export async function recommendationRPC<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error)
        throw new Error(`Recommendation storage unavailable: ${error.code ?? 'unknown'}`);
    return data as T;
}
export const scopeArgs = (userId: string, scope: ReturnType<typeof recommendationScope>) => ({ p_user_id: userId, p_runtime_fingerprint: scope.runtimeFingerprint, p_local_date: scope.localDate, p_timezone_offset: scope.tzOffset });
export const readRecommendations = (db: SupabaseClient, userId: string, scope: ReturnType<typeof recommendationScope>) => recommendationRPC<RecommendationSnapshot>(db, 'read_recommendations', scopeArgs(userId, scope));
export const claimRefresh = (db: SupabaseClient, userId: string, scope: ReturnType<typeof recommendationScope>) => recommendationRPC<RefreshClaim | null>(db, 'claim_recommendation_refresh', scopeArgs(userId, scope));
export const publishRecommendation = (db: SupabaseClient, userId: string, scope: ReturnType<typeof recommendationScope>, claim: RefreshClaim, decision: RecommendationDecision) => recommendationRPC(db, 'publish_recommendations', {
    ...scopeArgs(userId, scope), p_lease_token: claim.leaseToken, p_source_revision: claim.sourceRevision, p_response_revision: claim.responseRevision, p_decisions: [decision], p_next_due_at: decision.outcome?.dueAt ?? decision.validUntil,
});
export const failRefresh = (db: SupabaseClient, userId: string, claim: RefreshClaim) => recommendationRPC(db, 'fail_recommendation_refresh', {
    p_user_id: userId, p_lease_token: claim.leaseToken, p_source_revision: claim.sourceRevision, p_response_revision: claim.responseRevision, p_error_code: 'evaluation_unavailable',
});
