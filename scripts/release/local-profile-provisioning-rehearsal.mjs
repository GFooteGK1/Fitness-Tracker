// Real local Auth/PostgREST regression. No schema changes, retries, or cleanup.
// Requires the reviewed profile trigger fixture in the existing local stack.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { provisionLocalOwnerProfile } from './local-owner-profile.mjs';

if (process.argv.length !== 2) throw new Error('No target overrides accepted');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'output/app-quality-release');
const status = JSON.parse(fs.readFileSync(path.join(output, 'local-supabase-status.private.json'), 'utf8'));
const db = new URL(status.DB_URL);
assert.equal(status.API_URL, 'http://127.0.0.1:55321');
assert.equal(db.hostname, '127.0.0.1');
assert.equal(db.port, '55322');
assert.equal(db.pathname, '/postgres');
const podman = path.join(output, 'tools/podman-5.8.3/podman-5.8.3/usr/bin/podman.exe');
const container = 'supabase_db_sociusfit-programming-local';
const pod = args => execFileSync(podman, ['--connection', 'sociusfit-local', ...args], { encoding: 'utf8', timeout: 15000 });
const inspected = JSON.parse(pod(['inspect', container]))[0];
assert.equal(inspected.Config.Labels['com.supabase.cli.project'], 'sociusfit-programming-local');
// A fixed search_path makes PostgreSQL deparse the function schema explicitly.
const catalog = JSON.parse(pod(['exec', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
  `SET search_path TO pg_catalog;
   SELECT json_build_object('definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid),'enabled',t.tgenabled)
   FROM pg_trigger t WHERE t.tgrelid='public.user_profiles'::regclass AND t.tgname='set_user_profile_user_id' AND NOT t.tgisinternal;`]));
const fixture = fs.readFileSync(path.join(root, 'scripts/release/fixtures/profile-owner-trigger.sql'), 'utf8');
const normalized = value => value.replaceAll('\r\n', '\n').replace(/;\s*$/, '').trim();
const expectedFunction = fixture.slice(fixture.indexOf('CREATE OR REPLACE FUNCTION'), fixture.indexOf('CREATE TRIGGER'));
const expectedTrigger = fixture.slice(fixture.indexOf('CREATE TRIGGER'));
assert.equal(normalized(catalog.function), normalized(expectedFunction), 'Exact retained production trigger function required');
assert.equal(normalized(catalog.definition), normalized(expectedTrigger));
assert.equal(catalog.enabled, 'O');

// Persist credentials before dependent operations; never emit them or delete users.
const runId = randomUUID();
const run = path.join(output, `profile-provisioning-${runId}`);
fs.mkdirSync(run);
const accounts = [];
const checks = ['fixed local target and exact enabled profile trigger verified'];
const client = key => createClient(status.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(status.SERVICE_ROLE_KEY);
const record = (condition, label) => { assert.ok(condition, label); checks.push(label); };
try {
  const actors = [];
  for (const name of ['owner', 'other']) {
    const email = `profile-${name}-${runId}@sociusfit-local.invalid`;
    const password = randomUUID() + randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw new Error(`Local Auth creation failed: ${created.error.code}`);
    const id = created.data.user.id;
    accounts.push({ id, email, password });
    fs.writeFileSync(path.join(run, 'accounts.private.json'), JSON.stringify(accounts, null, 2));
    const rejected = await admin.from('user_profiles').upsert({ user_id: id });
    record(rejected.error?.code === '23502', `${name}: service-role profile upsert reproduces 23502`);
    const empty = await admin.from('user_profiles').select('user_id').eq('user_id', id);
    record(!empty.error && empty.data.length === 0, `${name}: failed upsert left no profile`);
    const actor = client(status.ANON_KEY);
    const login = await actor.auth.signInWithPassword({ email, password });
    record(!login.error && login.data.user.id === id, `${name}: real owner Auth sign-in`);
    await provisionLocalOwnerProfile(actor, id);
    await provisionLocalOwnerProfile(actor, id);
    checks.push(`${name}: owner profile create and repeated upsert readback passed`);
    actors.push({ id, client: actor });
  }
  const [owner, other] = actors;
  const hidden = await other.client.from('user_profiles').select('user_id').eq('user_id', owner.id);
  record(!hidden.error && hidden.data.length === 0, 'other owner cannot read profile');
  const blocked = await other.client.from('user_profiles').update({ fitness_goals: ['weight_loss'] }).eq('user_id', owner.id).select('user_id');
  record(!blocked.error && blocked.data.length === 0, 'other owner cannot update profile');
  const retained = await owner.client.from('user_profiles').select('user_id,fitness_goals').single();
  record(!retained.error && retained.data.user_id === owner.id && JSON.stringify(retained.data.fitness_goals) === '["performance"]', 'owner readback remains unchanged');
  fs.writeFileSync(path.join(run, 'receipt.json'), JSON.stringify({ runId, at: new Date().toISOString(), passed: true, checks }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, receipt: path.relative(root, path.join(run, 'receipt.json')) }));
} catch (error) {
  fs.writeFileSync(path.join(run, 'receipt.json'), JSON.stringify({ runId, at: new Date().toISOString(), passed: false, checks, error: error.message }, null, 2));
  throw error;
}
