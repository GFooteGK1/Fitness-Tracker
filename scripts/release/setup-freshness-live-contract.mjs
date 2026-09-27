// Pure approval contract and single-use operation gate. No I/O or credentials.
import { createHash } from 'node:crypto';

export const LIVE_SETUP_TARGET = Object.freeze({
  project: 'auolnfwetmfcwhtvakzy', appOrigin: 'https://www.sociusfit.com',
  apiOrigin: 'https://auolnfwetmfcwhtvakzy.supabase.co',
  migrationSha256: '3db1bfa44acfe078af7a0278c8b65b78f92489368b9d19a7a31bc7e8e32c6527',
});
export const LIVE_SETUP_LIMITS = Object.freeze({
  owners: 2, workMs: 180000, requestMs: 15000, expiryMs: 15000,
  containmentStartMs: 185000, closedObservationMs: 210000,
});
export const LIVE_SETUP_KEYS = Object.freeze(['initial-create','initial-replacement-create',
  'stored-review','stored-proposal','stored-review-create','stored-stale-reconstruct',
  'current-review','current-proposal','legacy-create','conversion-create','conversion-replacement-create',
  'rolling-confirm-initial','rolling-confirm-replacement','rolling-confirm-review','rolling-confirm-current-review',
  'legacy-confirm','legacy-confirm-replacement']);
export const LIVE_SETUP_STEPS = Object.freeze([
  'rolling-confirm-initial', 'rolling-expire-initial', 'rolling-revision-initial',
  'initial-create', 'initial-elapse', 'initial-revision-check', 'initial-stale-accept', 'initial-read-expired',
  'rolling-confirm-replacement', 'initial-replacement-create', 'initial-replacement-accept', 'initial-accepted-read',
  'rolling-confirm-review', 'rolling-expire-review', 'rolling-revision-review',
  'review-save-partial', 'review-read-saved', 'stored-review-create', 'review-elapse', 'review-revision-check',
  'stored-review-stale-accept', 'stored-review-stale-reconstruct', 'initial-history-read', 'initial-accepted-replay',
  'rolling-confirm-current-review', 'current-review-create', 'current-review-accept', 'current-review-accepted-read', 'initial-history-final',
  'legacy-create', 'legacy-accept', 'legacy-history-read', 'legacy-confirm', 'legacy-expire', 'legacy-revision',
  'conversion-create', 'conversion-elapse', 'conversion-revision-check', 'conversion-stale-accept',
  'legacy-confirm-replacement', 'conversion-replacement-create', 'conversion-replacement-accept',
  'conversion-accepted-read', 'legacy-history-final',
]);
const check = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x);
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function validateLiveSetupManifest(value) {
  check(value?.schema === 'socius-setup-live-1', 'manifest_schema');
  check(uuid(value.runId), 'manifest_run');
  check(value.project === LIVE_SETUP_TARGET.project && value.appOrigin === LIVE_SETUP_TARGET.appOrigin
    && value.apiOrigin === LIVE_SETUP_TARGET.apiOrigin, 'manifest_target');
  check(/^[a-f0-9]{40}$/.test(value.candidateSha ?? '') && /^dpl_[A-Za-z0-9]+$/.test(value.deploymentId ?? ''), 'manifest_deployment');
  check(value.migrationSha256 === LIVE_SETUP_TARGET.migrationSha256, 'manifest_migration');
  check(typeof value.pausedGeneration === 'string' && /^(0|[1-9]\d*)$/.test(value.pausedGeneration)
    && BigInt(value.pausedGeneration) <= 9223372036854775804n, 'manifest_generation');
  check(value.owners && Object.keys(value.owners).sort().join(',') === 'legacy,rolling', 'manifest_owners');
  const owners = Object.values(value.owners);
  check(owners.every(x => uuid(x.userId) && x.email === `setup-${value.runId}-${x.label}@sociusfit-local.invalid`)
    && value.owners.rolling.label === 'rolling' && value.owners.legacy.label === 'legacy'
    && new Set(owners.map(x => x.userId)).size === 2, 'manifest_owner_identity');
  check(value.numericPolicyEnabled === false && value.automaticRetries === 0, 'manifest_policy');
  check(value.idempotencyKeys && Object.keys(value.idempotencyKeys).sort().join(',') === [...LIVE_SETUP_KEYS].sort().join(',')
    && LIVE_SETUP_KEYS.every(k=>uuid(value.idempotencyKeys[k]))
    && new Set(Object.values(value.idempotencyKeys)).size===LIVE_SETUP_KEYS.length, 'manifest_keys');
  check(value.workMs === LIVE_SETUP_LIMITS.workMs && value.expiryMs === LIVE_SETUP_LIMITS.expiryMs, 'manifest_limits');
  return Object.freeze({ hash: sha(value), expectedOpenGeneration: String(BigInt(value.pausedGeneration) + 1n),
    expectedClosedGeneration: String(BigInt(value.pausedGeneration) + 2n), steps: LIVE_SETUP_STEPS.length });
}

// Durable journal acquisition must be atomic and must fail when an intent exists.
// Once an intent is recorded, neither a process restart nor uncertain response
// authorizes that operation again. The journal implementation is a separate gate.
export function createLiveSetupOperationGate(manifest, { journal, now = Date.now, openedAt, signal }) {
  manifest = structuredClone(manifest);
  const validated = validateLiveSetupManifest(manifest);
  check(journal && typeof journal.reserve === 'function' && typeof journal.complete === 'function', 'durable_journal_required');
  check(Number.isSafeInteger(openedAt) && openedAt <= now() && now() - openedAt < manifest.workMs, 'open_time');
  check(signal instanceof AbortSignal && !signal.aborted, 'containment_signal_required');
  const deadline = openedAt + manifest.workMs;
  let index = 0, active = false, failed = false;
  return Object.freeze({
    manifestHash: validated.hash,
    async perform(step, operation, request = {}) {
      check(!failed && !active, 'run_failed_or_busy');
      check(step === LIVE_SETUP_STEPS[index], 'operation_order');
      check(typeof operation === 'function', 'operation_required');
      check(!signal.aborted && now() < deadline, 'work_deadline');
      active = true;
      let timer;
      try {
        await journal.reserve({ runId: manifest.runId, manifestHash: validated.hash, step, index, request: structuredClone(request) });
        check(!signal.aborted && now() < deadline, 'work_deadline');
        const controller = new AbortController();
        const callSignal = AbortSignal.any([signal, controller.signal]);
        const limit = Math.min(step.endsWith('-elapse') ? LIVE_SETUP_LIMITS.expiryMs + 1000 : LIVE_SETUP_LIMITS.requestMs, deadline - now());
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('operation_timeout')); }, limit);
        });
        // Abort also rejects when an injected transport ignores the signal. It
        // does not prove a remote mutation rolled back; reserved intent survives.
        let rejectAbort;
        const abort = new Promise((_, reject) => { rejectAbort = () => reject(new Error('containment_aborted')); signal.addEventListener('abort', rejectAbort, { once: true }); });
        let value;
        try { value = await Promise.race([Promise.resolve().then(() => {
          check(!callSignal.aborted && now() < deadline, 'work_deadline');
          return operation({ signal: callSignal, deadlineAt: Math.min(deadline, now() + limit) });
        }), timeout, abort]); }
        finally { signal.removeEventListener('abort', rejectAbort); }
        check(!signal.aborted && now() <= deadline, 'work_deadline');
        await journal.complete({ runId: manifest.runId, manifestHash: validated.hash, step, index, value });
        check(!signal.aborted && now() <= deadline, 'work_deadline');
        index++;
        return value;
      } catch (error) { failed = true; throw error; }
      finally { clearTimeout(timer); active = false; }
    },
    status() { return { completedSteps: index, failed, active, completed: index === LIVE_SETUP_STEPS.length && !failed }; },
  });
}
