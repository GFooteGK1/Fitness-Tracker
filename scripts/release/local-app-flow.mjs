// Real HTTP + Supabase Auth/RLS integration. Synthetic, fixed loopback targets only.
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { CookieAuthStorageAdapter } from '@supabase/auth-helpers-shared';
import { provisionLocalOwnerProfile } from './local-owner-profile.mjs';

const localOutput = new URL('../../output/app-quality-release/', import.meta.url);
const status = JSON.parse(fs.readFileSync(new URL('local-supabase-status.private.json', localOutput), 'utf8'));
if (status.API_URL !== 'http://127.0.0.1:55321') throw new Error('Refusing non-local API');
const dbUrl = new URL(status.DB_URL);
if (dbUrl.hostname !== '127.0.0.1' || dbUrl.port !== '55322') throw new Error('Refusing non-local database');
const fresh = process.argv.includes('--new-run');
if (fresh && process.argv.length !== 3) throw new Error('New runs cannot resume or mutate an existing browser fixture');
const output = fresh ? new URL(`app-flow-${randomUUID()}/`, localOutput) : localOutput;
if (fresh) fs.mkdirSync(output);
const accounts = fresh ? [] : JSON.parse(fs.readFileSync(new URL('synthetic-users.private.json', output), 'utf8'));
if (fresh) {
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const name of ['owner-a', 'owner-b']) {
    const email = `app-${name}-${randomUUID()}@sociusfit-local.invalid`, password = randomUUID() + randomUUID();
    const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (user.error) throw new Error(`Local synthetic account creation failed: ${user.error.code}`);
    accounts.push({ name, email, password, id: user.data.user.id });
    fs.writeFileSync(new URL('synthetic-users.private.json', output), JSON.stringify(accounts, null, 2));
  }
}
if (accounts.length !== 2 || accounts.some(account => !account.email.endsWith('@sociusfit-local.invalid'))) throw new Error('Expected two synthetic local accounts');
const base = 'http://127.0.0.1:3011';
const checks = [];
const assert = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function api(owner, route, body, expected = 200) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner?.cookie ?? '' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) });
  const value = await response.json();
  if (response.status !== expected) throw new Error(`${route}: expected ${expected}, received ${response.status}: ${JSON.stringify(value)}`);
  return value;
}
async function login(account) {
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (signedIn.error) throw new Error('Synthetic direct owner sign-in failed');
  assert(signedIn.data.user.id === account.id, `${account.name}: real Auth identity`);
  if (fresh) await provisionLocalOwnerProfile(client, account.id);
  // Same helper/format used by the browser auth client. UI sign-in is verified separately.
  const parts = [];
  class LocalCookieAdapter extends CookieAuthStorageAdapter {
    setCookie(name, value) { parts.push(`${name}=${encodeURIComponent(value)}`); }
  }
  new LocalCookieAdapter().setItem('sb-127-auth-token', JSON.stringify(signedIn.data.session));
  const cookie = parts.join('; ');
  return { ...account, cookie, client };
}
async function rpc(owner, name, args) {
  const result = await owner.client.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.code}: ${result.error.message}`);
  return result.data;
}
async function logSource(owner) {
  const revisionBefore = await rpc(owner, 'get_coach_context_revision');
  const request = await rpc(owner, 'begin_logging_request', { p_key: randomUUID(), p_fingerprint: 'a'.repeat(64) });
  const work = { workout_date: '2026-09-22', input_text: 'Synthetic controlled squat', blocks: [{ block_type: 'STRENGTH', movements: [{ name: 'Squat', reps: 5, weight: '80 lb' }] }] };
  const provenance = { schemaVersion: 1, occurrence: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }, fields: { quantities: { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] } } };
  const items = await rpc(owner, 'freeze_logging_request_items', { p_request_id: request.id, p_items: [{ sourceItemId: 'local-source', kind: 'workout', record: work, blocks: [{}], provenance, inputMethod: 'text', eventAt: work.workout_date }] });
  await rpc(owner, 'commit_logging_request_item', { p_item_id: items[0].id });
  assert(Number(await rpc(owner, 'get_coach_context_revision')) > Number(revisionBefore), 'Real logged source advances revision');
}
const [owner, other] = await Promise.all(accounts.map(login));
if (process.argv.includes('--verify-browser-accept')) {
  const prior = JSON.parse(fs.readFileSync(new URL('local-app-flow.private.json', output), 'utf8'));
  const priorResult = JSON.parse(fs.readFileSync(new URL('local-app-flow-result.json', output), 'utf8'));
  const state = await api(owner, '/api/coach/weekly');
  assert(state.currentWeek?.window_start === '2026-09-21' && state.currentWeek.id !== prior.created.planVersionId,
    'Browser accepted the adjacent week');
  assert(state.pendingProposal === null, 'Accepted browser proposal no longer pending');
  const historical = await owner.client.from('training_plan_versions').select('intent').eq('id', prior.created.planVersionId).single();
  assert(!historical.error && hash(historical.data.intent) === priorResult.acceptedIntentHash,
    'Historical accepted intent unchanged after browser recovery and acceptance');
  const result = { verifiedAt: new Date().toISOString(), app: base, checks,
    currentPlanId: state.currentWeek.id, priorIntentHash: priorResult.acceptedIntentHash };
  fs.writeFileSync(new URL('local-browser-readback.json', output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
if (process.argv.includes('--invalidate-browser-proposal')) {
  const state = await api(owner, '/api/coach/weekly');
  if (!state.pendingProposal) throw new Error('No owned current pending proposal to invalidate');
  await logSource(owner);
  console.log('Added synthetic owned source while browser retained the pending proposal.');
  process.exit(0);
}
await api(null, '/api/coach/weekly', undefined, 401);
assert(true, 'Anonymous weekly read denied');
const before = await api(owner, '/api/coach/weekly');
const checkpointPath = new URL('local-app-review.private.json', output);
const checkpoint = process.argv.includes('--resume-review') ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null;
if (before.program && !checkpoint) throw new Error('Reserved owner already has a program; preserve it and inspect before rerun');
if (checkpoint && before.currentWeek?.id !== checkpoint.created.planVersionId) throw new Error('Checkpoint differs from owned accepted plan');
if (checkpoint && before.pendingProposal?.id !== checkpoint.review.proposalId) throw new Error('Resume is only valid before mutating the checkpoint proposal sources');
const key = checkpoint?.created.idempotencyKey ?? randomUUID();
const created = checkpoint?.created ?? await api(owner, '/api/coach/weekly', {
  tzOffset: 300, idempotencyKey: key, goalTargetDate: '2027-04-01',
  planningInput: { format: 'complete_programming_intake_v0_3', primaryDomain: 'strength',
    goal: 'Build useful full-body strength', experience: 'consistent', trainingDays: ['monday', 'wednesday', 'friday'],
    sessionMinutes: 60, equipment: 'Bodyweight', resolvedEquipmentIds: ['bodyweight'], constraints: '', constraintKinds: [],
    secondaryGoals: [], startDate: '2026-09-14', setupConfirmed: true },
}, 201);
assert(created.acceptanceRequired && !created.activePlanChanged, 'Initial proposal requires acceptance');
await api(other, `/api/coach/proposals/${created.proposalId}/accept`, { idempotencyKey: key }, 404);
assert(true, 'Foreign owner acceptance denied');
await api(owner, `/api/coach/proposals/${created.proposalId}/accept`, { idempotencyKey: key });
const accepted = await api(owner, '/api/coach/weekly');
assert(accepted.currentWeek?.id === created.planVersionId, 'Owner accepted initial compiled week');
const acceptedHash = hash(accepted.currentWeek.intent);
const reviewBody = checkpoint?.reviewBody ?? { asOf: '2026-09-23T16:00:00.000Z', tzOffset: 300, windowDays: 28, athleteRequestedReview: true,
  reviewIdempotencyKey: randomUUID(), proposalIdempotencyKey: randomUUID() };
const review = checkpoint?.review ?? await api(owner, '/api/coach/weekly/review', reviewBody, 201);
fs.writeFileSync(new URL('local-app-review.private.json', output), JSON.stringify({ created, reviewBody, review }, null, 2));
assert(review.proposalId && !review.activePlanChanged, 'Real weekly review creates pending next week');
await logSource(owner);
const stale = await api(owner, `/api/coach/proposals/${review.proposalId}/accept`, { idempotencyKey: reviewBody.proposalIdempotencyKey }, 409);
assert(stale.error === 'Your training information changed; refresh and create a new proposal', 'Stale acceptance returns the specific freshness conflict');
const afterMutation = await api(owner, '/api/coach/weekly');
assert(afterMutation.pendingProposal === null, 'Stale pending controls removed on readback');
assert(hash(afterMutation.currentWeek.intent) === acceptedHash, 'Source mutation preserves accepted intent');
await api(owner, `/api/coach/proposals/${created.proposalId}/accept`, { idempotencyKey: key });
assert(hash((await api(owner, '/api/coach/weekly')).currentWeek.intent) === acceptedHash, 'Accepted retry remains immutable after source mutation');
const refreshedBody = { ...reviewBody, reviewIdempotencyKey: randomUUID(), proposalIdempotencyKey: randomUUID() };
const refreshed = await api(owner, '/api/coach/weekly/review', refreshedBody, 201);
assert(refreshed.proposalId && refreshed.proposalId !== review.proposalId, 'Fresh review recovers with a new proposal');
// Leave this proposal pending for the actual browser acceptance check.
fs.writeFileSync(new URL('local-app-flow.private.json', output), JSON.stringify({ created, key, review, reviewBody, refreshed, refreshedBody }, null, 2));
const foreign = await api(other, '/api/coach/weekly');
assert(foreign.program === null, 'Other authenticated owner cannot read this program');
const result = { verifiedAt: new Date().toISOString(), app: base, databaseApi: status.API_URL, checks,
  resumedSavedReview: Boolean(checkpoint),
  scope: 'Real local HTTP, Auth and database; synthetic records. Browser and production behavior are separate.',
  acceptedIntentHash: acceptedHash, pendingProposalId: refreshed.proposalId };
fs.writeFileSync(new URL('local-app-flow-result.json', output), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
