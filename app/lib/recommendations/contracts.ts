import type { PlanningIntentSnapshot, PlanningOutcome } from '../coach/planning-intent';
export const RECOMMENDATION_SCHEMA_VERSION = 1 as const;
export const RECOMMENDATION_POLICY_VERSION = 'bounded-actions-1';
export interface RecommendationSource {
    table: string;
    id: string;
    at: string;
    revision: number | null;
    facts: Record<string, unknown>;
}
export type RecommendationResponse = 'done_reported' | 'not_applicable' | 'deferred' | 'adjust_requested';
export interface RecommendationDecision {
    schemaVersion: 1;
    kind: 'action' | 'collect_signal' | 'abstain';
    ruleId: string;
    ruleVersion: '1';
    policyVersion: string;
    runtimeFingerprint: string;
    scopeKey: string;
    evidenceFingerprint: string;
    sourceRevision: number;
    responseRevision: number;
    localDate: string;
    tzOffset: number;
    validUntil: string;
    planVersionId: string | null;
    intentMemoryId: string | null;
    intentVersion: number | null;
    goalId: string | null;
    title: string;
    reason: string;
    reasonCodes: string[];
    missing: string[];
    conflicts: string[];
    destination: null | {
        type: 'session' | 'proposal' | 'review' | 'baseline' | 'nutrition';
        href: string;
    };
    sources: RecommendationSource[];
    outcome: null | {
        kind: 'session_completion' | 'measurement';
        sourceId: string;
        metricId?: string;
        unit?: string;
        binding?: PlanningOutcome;
        dueAt: string;
    };
}
export interface StoredRecommendation {
    id: string;
    decision: RecommendationDecision;
    lifecycle: 'active' | 'superseded' | 'expired' | 'withdrawn';
    created_at: string;
    withdrawal_reason?: string | null;
}
export interface RefreshClaim {
    claimed?: boolean;
    leaseToken: string;
    leaseExpiresAt: string;
    sourceRevision: number;
    responseRevision: number;
    activePlanId: string | null;
    intentMemoryId: string | null;
    intentVersion: number | null;
}
export interface Suppression {
    scope_key: string;
    evidence_fingerprint: string;
    response: RecommendationResponse;
    defer_until: string | null;
}
export interface OutcomeSummary {
    id: string;
    recommendationId: string;
    title: string;
    lifecycle: string;
    payload: {
        adherence: 'reported' | 'observed' | 'unknown';
        summary: string;
        attributionLimits: string[];
    };
    createdAt: string;
    invalidated: boolean;
}
export interface RecommendationSnapshot {
    recommendations: StoredRecommendation[];
    refreshState: {
        sourceRevision: number;
        responseRevision: number;
        pending: boolean; lastError?: string | null;
    };
    suppressions: Suppression[];
    dueOutcomes: StoredRecommendation[];
    outcomes?: OutcomeSummary[];
    coverage?: {
        id: string;
        coverage_through: string;
        status: string;
        nutrition_revision: number;
        coverageValid: boolean;
    } | null;
}
export interface RecommendationContext {
    userId: string;
    now: string;
    localDate: string;
    tzOffset: number;
    validUntil: string;
    runtimeFingerprint: string;
    claim: RefreshClaim;
    intent: PlanningIntentSnapshot | null;
    missingBaselines: PlanningOutcome[];
    plan: {
        id: string;
        programId: string;
        policyVersion: string;
        status: string;
    } | null;
    sessions: Array<{
        id: string;
        scheduled_date: string | null;
        status: string;
        completed_workout_id: string | null;
        updated_at: string;
    }>;
    proposals: Array<{
        id: string;
        base_plan_version_id: string | null;
        status: string;
        created_at: string;
    }>;
    safetySignal?: {
        id: string;
        occurredAt: string;
    } | null;
    review: {
        id: string;
        action: string;
        created_at: string;
        invalidated: boolean;
    } | null;
    nutrition: {
        target: {
            protein: number;
            carbs: number;
            fat: number;
            calories: number;
            updatedAt: string;
        } | null;
        meals: Array<{
            id: string;
            at: string;
            revision: number;
            protein: number;
            carbs: number;
            fat: number;
            calories: number;
            estimated: boolean;
        }>;
        coverage: {
            id?: string;
            through: string;
            status: string;
            sourceRevision: number;
            valid?: boolean;
        } | null;
    };
}
export interface Candidate {
    decision: RecommendationDecision;
    rank: number;
    priority: number;
}
