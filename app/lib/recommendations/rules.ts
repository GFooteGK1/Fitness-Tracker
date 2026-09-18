import { createHash } from 'node:crypto';
import type { Candidate, RecommendationContext, RecommendationDecision, RecommendationSource } from './contracts';
import { RECOMMENDATION_POLICY_VERSION } from './contracts';
export function fingerprint(value: unknown): string {
    const stable = JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    return createHash('sha256').update(stable).digest('hex');
}
export function decision(context: RecommendationContext, input: Partial<RecommendationDecision> & Pick<RecommendationDecision, 'ruleId' | 'scopeKey' | 'title' | 'reason'>): RecommendationDecision {
    const sources = input.sources ?? [];
    const meaningfulSources = sources.map(source => ({ table: source.table, id: source.id, at: source.table === 'daily_targets' ? null : source.at, facts: Object.fromEntries(Object.entries(source.facts).filter(([key]) => key !== 'updatedAt')) })).sort((a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id));
    return { schemaVersion: 1, kind: 'action', ruleVersion: '1', policyVersion: RECOMMENDATION_POLICY_VERSION,
        runtimeFingerprint: context.runtimeFingerprint, sourceRevision: context.claim.sourceRevision, responseRevision: context.claim.responseRevision,
        localDate: context.localDate, tzOffset: context.tzOffset, validUntil: context.validUntil,
        planVersionId: context.plan?.id ?? null, intentMemoryId: context.intent?.memoryId ?? null, intentVersion: context.intent?.memoryVersion ?? null,
        goalId: null, reasonCodes: [], missing: [], conflicts: [], destination: null, sources, outcome: null,
        evidenceFingerprint: fingerprint({ ruleId: input.ruleId, scope: input.scopeKey, authority: { plan: context.plan?.id ?? null, intent: context.intent?.memoryId ?? null, intentVersion: context.intent?.memoryVersion ?? null }, sources: meaningfulSources, goalId: input.goalId ?? null }), ...input };
}
/** Rules have no wearable/trend or numerical-dose eligibility. All claims are dated source facts. */
export function evaluateRules(c: RecommendationContext): Candidate[] {
    const candidates: Candidate[] = [];
    const add = (rank: number, input: Parameters<typeof decision>[1], priority = Number.MAX_SAFE_INTEGER) => candidates.push({ rank, priority, decision: decision(c, input) });
    if (c.safetySignal) {
        add(0, { ruleId: 'accepted_plan.review', scopeKey: `pain_review:${c.safetySignal.id}`, title: 'Pause and review the concerning pain signal', reason: 'Your recorded check-in reports concerning pain. Review the signal before resuming provoking work under the existing coach policy.', reasonCodes: ['existing_pain_review_boundary'], destination: { type: 'review', href: '/program' }, sources: [{ table: 'coach_checkins', id: c.safetySignal.id, at: c.safetySignal.occurredAt, revision: null, facts: { pain: 'concerning' } }] });
        return candidates;
    }
    if (c.review && (c.review.invalidated || ['pause_review', 'recover'].includes(c.review.action))) {
        add(0, { ruleId: 'accepted_plan.review', scopeKey: `review:${c.review.id}`, title: 'Review your plan before training',
            reason: c.review.invalidated ? 'The evidence behind this review changed. Open the current plan review.' : 'Your authoritative weekly review calls for recovery or review.',
            reasonCodes: [c.review.invalidated ? 'review_source_changed' : 'existing_review_boundary'], destination: { type: 'review', href: '/program' },
            sources: [{ table: 'coach_weekly_reviews', id: c.review.id, at: c.review.created_at, revision: null, facts: { action: c.review.action, invalidated: c.review.invalidated } }] });
        return candidates;
    }
    if (c.plan && c.plan.status === 'active')
        for (const session of c.sessions.filter(s => s.scheduled_date === c.localDate && s.status === 'planned')) {
            add(1, { ruleId: 'accepted_plan.session', scopeKey: `session:${session.id}`, title: 'Open today’s accepted session', reason: 'This session is scheduled in your accepted plan. Use its instructions and stop conditions.',
                reasonCodes: ['accepted_session_today'], destination: { type: 'session', href: `/program?sessionId=${encodeURIComponent(session.id)}` },
                sources: [{ table: 'prescribed_sessions', id: session.id, at: session.scheduled_date!, revision: null, facts: { planVersionId: c.plan.id, status: session.status } }],
                outcome: { kind: 'session_completion', sourceId: session.id, dueAt: c.validUntil } });
        }
    for (const proposal of c.proposals)
        if ((c.intent || c.plan) && proposal.status === 'proposed' && proposal.base_plan_version_id === (c.plan?.id ?? null)) {
            add(1, { ruleId: 'accepted_plan.proposal', scopeKey: `proposal:${proposal.id}`, title: 'Review your coach proposal', reason: 'A proposal is ready for your review. Your accepted plan changes only when you accept it.',
                reasonCodes: ['authoritative_proposal'], destination: { type: 'proposal', href: `/program?proposalId=${encodeURIComponent(proposal.id)}` },
                sources: [{ table: 'adaptation_proposals', id: proposal.id, at: proposal.created_at, revision: null, facts: { status: proposal.status, basePlanVersionId: proposal.base_plan_version_id } }] });
        }
    if (c.review?.action === 'collect_signal') {
        add(2, { kind: 'collect_signal', ruleId: 'accepted_plan.review', scopeKey: `review:${c.review.id}`,
            title: 'Review the evidence your plan needs',
            reason: 'Your current plan review needs more information before selecting a change. Open its outcome details and confirm only the requested measurement or goal priority. Your accepted plan stays unchanged.',
            reasonCodes: ['authoritative_evidence_request'], destination: { type: 'review', href: '/program' },
            sources: [{ table: 'coach_weekly_reviews', id: c.review.id, at: c.review.created_at, revision: null, facts: { action: c.review.action, invalidated: false } }] });
    }
    if (c.intent)
        for (const outcome of c.missingBaselines) {
            if (outcome.capability.status !== 'supported' || !outcome.measurement || outcome.goal.status !== 'active')
                continue;
            const priority = c.intent.content.priorityOrder?.indexOf(outcome.goal.id) ?? Number.MAX_SAFE_INTEGER;
            const sources: RecommendationSource[] = [{ table: 'coach_memories', id: c.intent.memoryId, at: c.intent.content.confirmedAt, revision: c.intent.memoryVersion,
                    facts: { goalId: outcome.goal.id, measurement: outcome.measurement, binding: outcome.binding, baselineStatus: 'missing_or_ineligible' } }];
            add(2, { kind: 'collect_signal', ruleId: 'missing_signal.baseline', scopeKey: `baseline:${outcome.goal.id}`, goalId: outcome.goal.id,
                title: 'Confirm a baseline for your outcome', reason: `Your confirmed outcome needs a comparable ${outcome.measurement.metricId} measurement before it can establish progress.`,
                reasonCodes: ['defined_baseline_missing'], missing: [outcome.measurement.metricId], destination: { type: 'baseline', href: `/program?goalId=${encodeURIComponent(outcome.goal.id)}` }, sources,
                outcome: { kind: 'measurement', sourceId: outcome.goal.id, metricId: outcome.measurement.metricId, unit: outcome.measurement.unit, binding: outcome, dueAt: c.validUntil } }, priority);
        }
    // An explicitly saved nutrition target supplies its own goal authority.
    // Missing targets never become defaults, and unrelated training intent is unnecessary.
    if (c.nutrition.target && c.nutrition.meals.length) {
        const logged = c.nutrition.meals.reduce((a, m) => ({ protein: a.protein + m.protein, calories: a.calories + m.calories }), { protein: 0, calories: 0 });
        const remaining = Math.max(0, c.nutrition.target.protein - logged.protein);
        const caloriesRemaining = Math.max(0, c.nutrition.target.calories - logged.calories);
        const estimated = c.nutrition.meals.some(m => m.estimated);
        const coverage = c.nutrition.coverage && c.nutrition.coverage.valid === true ? c.nutrition.coverage : null;
        add(3, { ruleId: 'logged_nutrition.remaining', scopeKey: `nutrition:${c.localDate}`, title: 'Review today’s logged nutrition',
            reason: `${Math.round(logged.protein)} g protein is logged against your ${c.nutrition.target.protein} g target (${Math.round(remaining)} g remaining in the log). ${Math.round(logged.calories)} calories are logged against your ${c.nutrition.target.calories} calorie target (${Math.round(caloriesRemaining)} remaining in the log). ${estimated ? 'Some amounts are estimates. ' : ''}${coverage ? `Your report is ${coverage.status === 'complete_through' ? 'complete' : coverage.status} through ${coverage.through}; later intake is unknown. ` : 'Logging coverage is unknown. '}This does not establish your total intake or a fueling deficit.`,
            reasonCodes: ['explicit_target', 'logged_amount_only', ...(estimated ? ['estimated_amounts'] : [])], missing: coverage?.status === 'complete_through' ? [] : ['logging_coverage'],
            destination: { type: 'nutrition', href: '/food-progress' }, sources: [
                { table: 'daily_targets', id: c.userId, at: c.nutrition.target.updatedAt, revision: null, facts: { ...c.nutrition.target } },
                ...c.nutrition.meals.map(m => ({ table: 'meals', id: m.id, at: m.at, revision: m.revision, facts: { protein: m.protein, calories: m.calories, estimated: m.estimated } })),
                ...(coverage ? [{ table: 'logging_coverage_confirmations', id: coverage.id ?? `${c.userId}:${c.localDate}`, at: coverage.through, revision: coverage.sourceRevision, facts: { status: coverage.status, through: coverage.through } }] : [])
            ] });
    }
    return candidates;
}
export function abstain(c: RecommendationContext, reason = 'No eligible next action is available from your current records. Your plan and logging remain available.'): RecommendationDecision {
    return decision(c, { kind: 'abstain', ruleId: 'no_eligible_action', scopeKey: `abstain:${c.localDate}`, title: 'You’re up to date', reason, reasonCodes: ['no_eligible_action'], missing: c.intent ? [] : ['confirmed_goal'] });
}
