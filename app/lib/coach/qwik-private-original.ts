import { createHash } from 'node:crypto'
import { CoachingContextError } from './coaching-context'
import { joinLocalQwikReadback, type LocalQwikArtifact, type PreparedLocalQwikCapture } from './qwik-exact-capture'

/** Inactive private preparation: no HTTP/MCP route, provider client, credentials,
 * signed URL, upload or automatic deletion. Only a trusted owner-scoped SQL port
 * may be injected. The prepared database has no production grants/policy rows. */
export interface PrivateQwikSql {
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }>
}
type SavedCapture = Parameters<typeof joinLocalQwikReadback>[2]
export type PrivateQwikRetention = { mode: 'until_explicit_clear' }
  | { mode: 'finite_until'; expiresAt: string }
export interface PrivateRetentionInput {
  requestId: string
  artifact: LocalQwikArtifact
  retention: PrivateQwikRetention
  binding?: {
    namespaceId: string
    capture: PreparedLocalQwikCapture
    savedCapture: SavedCapture
    corrections?: { sourceSetId: string; expectedClaimVersion: number; reason: string }[]
  }
}
type Metadata = { artifactId: string; userId: string; sha256: string; byteLength: number; state: string; [key: string]: unknown }
type RawResult = { state: 'available'; metadata: Metadata; originalBytes: Uint8Array }
  | { state: 'missing_or_unauthorized' | 'expired' | 'deleted' | 'corrupt'; metadata?: Metadata }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const unavailable = (): never => { throw new CoachingContextError(503, 'Private original operation unavailable') }
const invalid = (): never => { throw new CoachingContextError(400, 'Invalid private original operation') }

/** Trusted quota is an additional limiting hint; the SQL owner policy is the
 * actual authority and can only be stricter. Missing policy denies persistence.
 * The caller must select an explicit mode. No production policy is defaulted. */
export function createPrivateQwikOriginalClient(sql: PrivateQwikSql, ownerId: string, policy: { quotaBytes: number }) {
  if (!uuid.test(ownerId) || !policy || !Number.isSafeInteger(policy.quotaBytes) || policy.quotaBytes < 2) invalid()
  ownerId = ownerId.toLowerCase()
  const quotaBytes = policy.quotaBytes
  async function query<T>(statement: string, params: unknown[]) {
    try { return (await sql.query<T>(statement, params)).rows }
    catch (error) {
      const code = (error as { code?: string })?.code
      if (code === '42501') throw new CoachingContextError(403, 'Private original unavailable for this owner')
      if (['23505','23503','40001','55000'].includes(code ?? '')) throw new CoachingContextError(409, 'Private original identity or revision conflict')
      if (['22023','23514','23502'].includes(code ?? '')) invalid()
      return unavailable() // No raw SQL/provider diagnostics or source bytes in errors.
    }
  }
  async function readOriginal(artifactId: string): Promise<RawResult> {
    if (!uuid.test(artifactId)) invalid()
    artifactId = artifactId.toLowerCase()
    const rows = await query<{ metadata: Metadata; bytes: Uint8Array | null }>(
      'SELECT * FROM qwik_private.read_original($1::uuid,$2::uuid)', [ownerId, artifactId])
    if (rows.length === 0) return { state: 'missing_or_unauthorized' }
    if (rows.length !== 1) return unavailable()
    const { metadata, bytes } = rows[0]
    if (!metadata || metadata.userId !== ownerId || metadata.artifactId !== artifactId
      || !/^[a-f0-9]{64}$/.test(metadata.sha256) || !Number.isSafeInteger(metadata.byteLength)
      || metadata.byteLength < 2 || metadata.byteLength > 5_000_000
      || (metadata.retentionMode === 'until_explicit_clear' ? metadata.expiresAt !== null
        : metadata.retentionMode !== 'finite_until' || typeof metadata.expiresAt !== 'string'
          || !Number.isFinite(Date.parse(metadata.expiresAt)))
      || metadata.retentionMode === 'until_explicit_clear' && metadata.state === 'expired') return unavailable()
    if (metadata.state !== 'available') {
      if (bytes !== null || !['expired','deleted','corrupt'].includes(metadata.state)) return unavailable()
      return { state: metadata.state as 'expired' | 'deleted' | 'corrupt', metadata: structuredClone(metadata) }
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== metadata.byteLength || sha(bytes) !== metadata.sha256) {
      return { state: 'corrupt', metadata: structuredClone(metadata) }
    }
    // Rehash retrieved bytes independently of the DB's CHECK/getter assertions.
    return { state: 'available', metadata: structuredClone(metadata), originalBytes: Uint8Array.from(bytes) }
  }
  const availability = (raw: RawResult) => ({ state: raw.state,
    ...(raw.state === 'available' ? { verifiedSha256: raw.metadata.sha256, byteLength: raw.originalBytes.byteLength } : {}) })

  return {
    readOriginal,
    async persist(input: PrivateRetentionInput) {
      // Reject huge forged buffers before cloning, then freeze the complete graph
      // before readback verification can await or caller-owned metadata can move.
      if (!(input?.artifact?.bytes instanceof Uint8Array) || input.artifact.bytes.byteLength > 5_000_000) invalid()
      const frozen = structuredClone(input), { artifact, requestId, retention, binding } = frozen
      if (!retention || typeof retention !== 'object' || Array.isArray(retention)
        || Object.hasOwn(frozen, 'expiresAt')
        || Object.keys(retention).some(key => !['mode', 'expiresAt'].includes(key))
        || (retention.mode === 'until_explicit_clear' ? Object.hasOwn(retention, 'expiresAt')
          : retention.mode !== 'finite_until' || typeof retention.expiresAt !== 'string'
            || !/(?:Z|[+-]\d\d:\d\d)$/.test(retention.expiresAt) || !Number.isFinite(Date.parse(retention.expiresAt)))) invalid()
      const expiresAt = retention.mode === 'finite_until' ? retention.expiresAt : null
      if (!uuid.test(requestId) || artifact.version !== 'qwik-local-artifact-1' || artifact.ownerId !== ownerId
        || artifact.retention !== 'local_only_not_uploaded' || artifact.byteLength !== artifact.bytes.byteLength
        || artifact.byteLength < 2 || sha(artifact.bytes) !== artifact.sha256
        || typeof artifact.name !== 'string' || artifact.name.length < 1 || artifact.name.length > 255) invalid()
      let claims: Record<string, unknown>[] = [], entityId: string | null = null, revision: number | null = null
      if (binding) {
        if (!uuid.test(binding.namespaceId) || binding.capture.ownerId !== ownerId) invalid()
        const joined = await joinLocalQwikReadback(binding.capture, artifact, binding.savedCapture)
        entityId = binding.savedCapture.receipt.entityId; revision = joined.revision
        const corrections = binding.corrections ?? [], ids = new Set<string>()
        for (const correction of corrections) {
          if (ids.has(correction.sourceSetId) || !joined.sources.some(s => s.recording.set.id === correction.sourceSetId)
            || !Number.isSafeInteger(correction.expectedClaimVersion) || correction.expectedClaimVersion < 1
            || typeof correction.reason !== 'string' || correction.reason.trim().length < 1 || correction.reason.length > 500) invalid()
          ids.add(correction.sourceSetId)
        }
        claims = joined.sources.map(source => {
          const { expectedRecording: _expectedRecording, sourceSetId, ...address } = source.canonicalAddress
          const correction = corrections.find(c => c.sourceSetId === sourceSetId)
          return { ...address, sourceSetId, sourceIndex: source.sourceIndex, recording: source.recording,
            expectedClaimVersion: correction?.expectedClaimVersion ?? null,
            ...(correction ? { correctionReason: correction.reason } : {}) }
        })
      }
      const rows = await query<{ receipt: Record<string, unknown> }>(
        'SELECT qwik_private.persist_original($1::uuid,$2::text,$3::bytea,$4::text,$5::text,$6::text,$7::timestamptz,$8::bigint,$9::uuid,$10::uuid,$11::integer,$12::jsonb) receipt',
        [ownerId, requestId, artifact.bytes, artifact.sha256, artifact.name, retention.mode, expiresAt, quotaBytes,
          binding?.namespaceId ?? null, entityId, revision, JSON.stringify(claims)])
      const receipt = structuredClone(rows[0]?.receipt)
      if (rows.length !== 1 || !receipt || receipt.userId !== ownerId || receipt.sha256 !== artifact.sha256
        || receipt.byteLength !== artifact.byteLength || typeof receipt.artifactId !== 'string'
        || receipt.retentionMode !== retention.mode
        || (expiresAt === null ? receipt.expiresAt !== null : typeof receipt.expiresAt !== 'string'
          || Date.parse(receipt.expiresAt) !== Date.parse(expiresAt))) return unavailable()
      // A commit receipt is not a current retrieval assertion, including on replay.
      const raw = await readOriginal(receipt.artifactId)
      return { receipt, raw: availability(raw) }
    },
    async recover(requestId: string, operation: 'retain' | 'delete' = 'retain') {
      if (!uuid.test(requestId) || !['retain','delete'].includes(operation)) invalid()
      const rows = await query<{ receipt: Record<string, unknown> | null }>(
        'SELECT qwik_private.read_receipt($1::uuid,$2::text,$3::text) receipt', [ownerId, requestId, operation])
      const receipt = structuredClone(rows[0]?.receipt)
      if (rows.length !== 1) return unavailable()
      if (!receipt) return { state: 'unconfirmed' as const, absenceProvesNoWrite: false as const }
      if (receipt.userId !== ownerId || typeof receipt.artifactId !== 'string') return unavailable()
      return { state: 'saved' as const, receipt, raw: availability(await readOriginal(receipt.artifactId)) }
    },
    async deleteOriginal(input: { requestId: string; artifactId: string; reason: string; consent: 'clear_private_original_bytes' }) {
      const { requestId, artifactId, reason, consent } = structuredClone(input)
      if (!uuid.test(requestId) || !uuid.test(artifactId) || consent !== 'clear_private_original_bytes'
        || typeof reason !== 'string' || reason.trim().length < 1 || reason.length > 500) invalid()
      const rows = await query<{ receipt: Record<string, unknown> }>(
        'SELECT qwik_private.delete_original($1::uuid,$2::text,$3::uuid,$4::text,$5::boolean) receipt', [ownerId, requestId, artifactId, reason, true])
      const receipt = structuredClone(rows[0]?.receipt)
      if (rows.length !== 1 || !receipt || receipt.userId !== ownerId || receipt.artifactId !== artifactId) return unavailable()
      return { receipt, raw: availability(await readOriginal(artifactId)), physicalErasureAsserted: false as const }
    },
    async readClaims() {
      const rows = await query<{ claims: unknown }>('SELECT qwik_private.read_claims($1::uuid) claims', [ownerId])
      if (rows.length !== 1 || !Array.isArray(rows[0].claims)) return unavailable()
      return structuredClone(rows[0].claims)
    },
  }
}
