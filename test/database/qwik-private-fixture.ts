import { PGlite } from '@electric-sql/pglite'
import { createHash, randomUUID } from 'node:crypto'
import { mcpActivityFixture, mcpOwnerClient } from './mcp-activity-fixture'
import { sqlFile } from './fixture'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { normalizeActivity } from '@/app/lib/capture/normalize'
import { parseQwikArrayRecordings } from '@/app/lib/coach/rep-recording'
import { qwikArrayFixture, recordingBlocks, recordingOptions } from '../coach/rep-recording-fixture'

export const privatePreparation = 'docs/migrations/qwik-private-original-preparation.sql'
export async function qwikPrivateFixture(options: { dataDir?: string; apply?: boolean } = {}) {
  let db = await mcpActivityFixture()
  if (options.dataDir) {
    const dump = await db.dumpDataDir('none')
    await db.close()
    db = new PGlite(options.dataDir, { loadDataDir: dump })
    await db.waitReady
  }
  if (options.apply !== false) await applyPrivatePreparation(db)
  return db
}
/** Test-only grant setup. These grants are NEVER present in prepared source SQL. */
export async function applyPrivatePreparation(db: PGlite) {
  await db.exec("SET socius.qwik_private_disposable_fixture='true'")
  await db.exec(sqlFile(privatePreparation))
  await grantPrivateFixtureAccess(db)
}
export async function grantPrivateFixtureAccess(db: PGlite) {
  await db.exec(`
    CREATE ROLE qwik_private_test_executor NOLOGIN INHERIT;
    GRANT authenticated TO qwik_private_test_executor;
    GRANT USAGE ON SCHEMA qwik_private TO authenticated;
    GRANT EXECUTE ON FUNCTION qwik_private.persist_original(uuid,text,bytea,text,text,timestamptz,bigint,uuid,uuid,integer,jsonb) TO qwik_private_test_executor;
    GRANT EXECUTE ON FUNCTION qwik_private.read_original(uuid,uuid) TO qwik_private_test_executor;
    GRANT EXECUTE ON FUNCTION qwik_private.delete_original(uuid,text,uuid,text,boolean) TO qwik_private_test_executor;
    GRANT EXECUTE ON FUNCTION qwik_private.read_claims(uuid) TO qwik_private_test_executor;
    GRANT EXECUTE ON FUNCTION qwik_private.read_receipt(uuid,text,text) TO qwik_private_test_executor;
    GRANT SELECT(id,user_id,sha256,byte_length,name,state,retained_at,expires_at,deleted_at,deletion_reason) ON qwik_private.artifacts TO authenticated;
    GRANT SELECT ON qwik_private.source_claims,qwik_private.claim_versions TO authenticated;
  `)
}
export async function privateActor(db: PGlite, owner: string) {
  await db.exec('RESET ROLE; SET ROLE qwik_private_test_executor')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner])
}
export async function seedPrivateOwner(db: PGlite, owner: string, namespaceId = randomUUID(), confirmed = true) {
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.users(id) VALUES($1) ON CONFLICT DO NOTHING', [owner])
  await db.query("INSERT INTO qwik_private.owner_policies(user_id,executor_role,byte_quota,max_retention_seconds) VALUES($1,'qwik_private_test_executor',20000000,604800) ON CONFLICT DO NOTHING", [owner])
  await db.query(`INSERT INTO qwik_private.namespaces(id,user_id,source_reference,basis,state,confirmed_at)
    VALUES($1,$2,$3,$4,$5,CASE WHEN $6 THEN now() ELSE NULL END)`,
  [namespaceId, owner, 'synthetic-source-library:' + namespaceId, confirmed ? 'owner_attested_source_account_device' : 'unresolved', confirmed ? 'confirmed' : 'unresolved', confirmed])
  await privateActor(db, owner)
  return namespaceId
}
export interface PrivateClaim {
  sourceSetId: string; sourceIndex: number; blockIndex: number; segmentIndex: number; eventIndex: number
  collection: 'sets' | 'set_details'; setIndex: number; expectedSetId: string | null; expectedClaimVersion: number | null
  correctionReason?: string; recording: unknown
}
export async function seedPrivateRecording(db: PGlite, owner: string, raw = JSON.stringify(qwikArrayFixture()), options: { attachRecordings?: boolean } = {}) {
  await privateActor(db, owner)
  const bytes = new TextEncoder().encode(raw), sha256 = createHash('sha256').update(bytes).digest('hex')
  const decoded = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const recordings = await parseQwikArrayRecordings(decoded, recordingOptions)
  const blocks = recordingBlocks()
  recordings.forEach((recording, i) => {
    recording.source.file.sha256 = sha256; recording.source.file.byteLength = bytes.length
    if (options.attachRecordings !== false) {
      const set = blocks[2].segments[0].events[0].performed.sets[i + 3]
      set.velocity = { ...(set.velocity ?? {}), recording }
    }
  })
  const record = { workout_date: '2026-01-10', input_text: 'Synthetic private QWIK retention fixture', blocks, notes: 'preserve me', rpe: 6.5 }
  const provenance = captureProvenance('workout', 'imported_unverified', 'unreviewed')
  provenance.occurrence = { origin: 'athlete_reported', reviewState: 'athlete_confirmed', sourceReferences: [] }
  const client = mcpOwnerClient(db, owner).db
  const request = await client.rpc('begin_logging_request', { p_key: 'synthetic-private-source:' + randomUUID(), p_fingerprint: 'c'.repeat(64) })
  if (request.error || !request.data) throw new Error('Synthetic canonical request failed')
  const frozen = await client.rpc('freeze_logging_request_items', { p_request_id: request.data.id,
    p_items: [{ sourceItemId: 'synthetic:0', kind: 'workout', ...normalizeActivity('workout', record), provenance, inputMethod: 'text', eventAt: record.workout_date, eventPrecision: 'date' }] })
  if (frozen.error || !frozen.data) throw new Error('Synthetic canonical freeze failed: ' + frozen.error?.message)
  const committed = await client.rpc('commit_logging_request_item', { p_item_id: frozen.data[0].id })
  if (committed.error || !committed.data) throw new Error('Synthetic canonical commit failed: ' + committed.error?.message)
  const entityId = committed.data.entityId as string
  const claims: PrivateClaim[] = recordings.map((recording, i) => ({ sourceSetId: recording.set.id, sourceIndex: recording.source.setIndex,
    blockIndex: 2, segmentIndex: 0, eventIndex: 0, collection: 'sets', setIndex: i + 3,
    expectedSetId: null, expectedClaimVersion: null, recording }))
  return { entityId, bytes, sha256, raw, blocks, provenance, recordings, claims }
}
export async function persistPrivate(db: PGlite, owner: string, input: {
  key?: string; bytes: Uint8Array; sha256: string; name?: string; expiresAt: string
  quota?: number; namespaceId?: string | null; entityId?: string | null; revision?: number | null; claims?: PrivateClaim[]
}) {
  return (await db.query<{ result: Record<string, any> }>(`SELECT qwik_private.persist_original($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result`,
    [owner, input.key ?? randomUUID(), input.bytes, input.sha256, input.name ?? 'synthetic.json', input.expiresAt,
      input.quota ?? 20000000, input.namespaceId ?? null, input.entityId ?? null, input.revision ?? null, JSON.stringify(input.claims ?? [])])).rows[0].result
}
