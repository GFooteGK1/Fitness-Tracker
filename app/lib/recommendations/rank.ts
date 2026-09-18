import type { Candidate, Suppression } from './contracts';
export function rankCandidates(candidates: Candidate[], suppressions: Suppression[], now: string): Candidate[] {
    return candidates.filter(({ decision: d }) => !suppressions.some(s => s.scope_key === d.scopeKey && (s.response === 'deferred' ? Boolean(s.defer_until && Date.parse(s.defer_until) > Date.parse(now)) : s.evidence_fingerprint === d.evidenceFingerprint))).sort((a, b) => a.rank - b.rank || a.priority - b.priority || a.decision.ruleId.localeCompare(b.decision.ruleId) || a.decision.scopeKey.localeCompare(b.decision.scopeKey));
}
