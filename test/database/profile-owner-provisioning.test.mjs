import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { provisionLocalOwnerProfile } from '../../scripts/release/local-owner-profile.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const source = readFileSync('docs/migrations/complete-holistic-migration.sql', 'utf8').replaceAll('\r\n', '\n');
const trigger = readFileSync('scripts/release/fixtures/profile-owner-trigger.sql', 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)) + end.length);
let db;

describe('production profile ownership trigger in the local rehearsal', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
      INSERT INTO auth.users VALUES ('${owner}'), ('${other}');
      ${slice('CREATE TABLE user_profiles (', '\n);')}
      ${trigger}
      ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated, service_role;
      ${['view', 'insert', 'update'].map(verb => slice(`CREATE POLICY "Users can ${verb} their own profile"`, ';')).join('\n')}
    `);
  });
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false); TRUNCATE public.user_profiles;");
  });
  async function actor(id) {
    await db.exec('RESET ROLE;');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
    await db.exec(`SET ROLE ${id ? 'authenticated' : 'service_role'};`);
  }

  it('reproduces 23502 for service-role provisioning even with an explicit owner UUID', async () => {
    await actor(null);
    await expect(db.query('INSERT INTO public.user_profiles(user_id) VALUES ($1) ON CONFLICT(user_id) DO UPDATE SET fitness_goals=EXCLUDED.fitness_goals', [owner]))
      .rejects.toMatchObject({ code: '23502' });
    expect((await db.query('SELECT * FROM public.user_profiles')).rows).toEqual([]);
  });

  it('uses a fixed catalog search path to retain explicit trigger-function qualification', async () => {
    await db.exec('SET search_path TO pg_catalog;');
    try {
      const result = await db.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='public.user_profiles'::regclass AND tgname='set_user_profile_user_id'");
      expect(result.rows[0].definition).toBe(trigger.slice(trigger.indexOf('CREATE TRIGGER')).trim().replace(/;$/, ''));
    } finally {
      await db.exec('RESET search_path;');
    }
  });

  it('allows the authenticated owner to create and repeat the profile upsert', async () => {
    await actor(owner);
    const upsert = `INSERT INTO public.user_profiles(user_id,fitness_goals) VALUES ($1,$2::jsonb)
      ON CONFLICT(user_id) DO UPDATE SET fitness_goals=EXCLUDED.fitness_goals RETURNING user_id,fitness_goals`;
    await db.query(upsert, [owner, '["performance"]']);
    const result = await db.query(upsert, [owner, '["general_health"]']);
    expect(result.rows).toEqual([{ user_id: owner, fitness_goals: ['general_health'] }]);
    expect((await db.query('SELECT count(*)::int AS n FROM public.user_profiles')).rows[0].n).toBe(1);
  });

  it('derives INSERT ownership from the caller and isolates other-owner reads and updates', async () => {
    await actor(owner);
    await db.query('INSERT INTO public.user_profiles(user_id) VALUES ($1)', [owner]);
    await actor(other);
    expect((await db.query('SELECT user_id FROM public.user_profiles WHERE user_id=$1', [owner])).rows).toEqual([]);
    expect((await db.query("UPDATE public.user_profiles SET fitness_goals='[\"weight_loss\"]' WHERE user_id=$1 RETURNING user_id", [owner])).rows).toEqual([]);
    // An attempted forged INSERT becomes the caller's own profile, not the victim's.
    expect((await db.query('INSERT INTO public.user_profiles(user_id) VALUES ($1) RETURNING user_id', [owner])).rows)
      .toEqual([{ user_id: other }]);
    await actor(owner);
    expect((await db.query('SELECT fitness_goals FROM public.user_profiles')).rows).toEqual([{ fitness_goals: [] }]);
  });

  it('rejects changing an existing profile owner through UPDATE', async () => {
    await actor(owner);
    await db.query('INSERT INTO public.user_profiles(user_id) VALUES ($1)', [owner]);
    await expect(db.query('UPDATE public.user_profiles SET user_id=$1 WHERE user_id=$2', [other, owner]))
      .rejects.toMatchObject({ code: '42501' });
  });
});

describe('local owner provisioning helper', () => {
  it('refuses a missing or different authenticated identity before any profile write', async () => {
    for (const identity of [{ data: { user: null }, error: null }, { data: { user: { id: other } }, error: null }]) {
      const client = { auth: { getUser: vi.fn().mockResolvedValue(identity) }, from: vi.fn() };
      await expect(provisionLocalOwnerProfile(client, owner)).rejects.toThrow('expected authenticated owner');
      expect(client.from).not.toHaveBeenCalled();
    }
  });

  it('requires owner readback and propagates database failure without retry', async () => {
    for (const result of [{ data: { user_id: owner }, error: null }, { data: null, error: { code: '23502' } }, { data: { user_id: other }, error: null }]) {
      const upsert = vi.fn().mockReturnValue({ select: () => ({ single: async () => result }) });
      const client = { auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) }, from: () => ({ upsert }) };
      const call = provisionLocalOwnerProfile(client, owner);
      if (result.error || result.data.user_id !== owner) await expect(call).rejects.toThrow('provisioning failed');
      else await expect(call).resolves.toBeUndefined();
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0][0].user_id).toBe(owner);
    }
  });
});
