import type { CaptureProvenance } from '../capture/contracts'
import { CoachingContextError, contextObject } from './coaching-context'
import { canonicalActivityJson, validateActivityToolInput } from './activity-record-contract'
import { patchSetRecordings } from './activity-measurement-patch'
import { parseQwikArrayRecordings, type RepRecording } from './rep-recording'

/** Local-only preparation. No route, persistence, upload, fetch or auto replay.
 * Full source stays in this separate artifact, never in the MCP command/record.
 * Callers must retain the bytes; a hash/reference alone is not durable retention. */
export interface LocalQwikArtifact {
  version: 'qwik-local-artifact-1'
  ownerId: string
  name: string
  sha256: string
  byteLength: number
  bytes: Uint8Array
  retention: 'local_only_not_uploaded'
}
export interface QwikSetSelection {
  sourceSetId: string
  blockIndex: number
  segmentIndex: number
  eventIndex: number
  collection: 'sets' | 'set_details'
  setIndex: number
  expectedSetId: string | null
  expectedRecording: { fileSha256: string; sourceSetId: string } | null
}
interface WorkoutSnapshot {
  id: string
  user_id: string
  capture_revision: number
  blocks: unknown
  capture_provenance: CaptureProvenance
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fail = (message: string, status: 400 | 409 = 400): never => { throw new CoachingContextError(status, message) }
const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes)))].map(b => b.toString(16).padStart(2, '0')).join('')
const reference = (a: LocalQwikArtifact) => `qwik-local-sha256:${a.sha256}`

/** Copy and hash BEFORE decoding. Invalid JSON/UTF-8 can still be retained. */
export async function retainLocalQwikArtifact(bytes: Uint8Array, ownerId: string, name: string): Promise<LocalQwikArtifact> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > 5_000_000
    || !uuid.test(ownerId) || typeof name !== 'string' || name.length < 1 || name.length > 255) fail('Invalid local QWIK artifact')
  const original = Uint8Array.from(bytes)
  return { version: 'qwik-local-artifact-1', ownerId, name, sha256: await hash(original), byteLength: original.byteLength,
    bytes: original, retention: 'local_only_not_uploaded' }
}
async function verifiedBytes(artifact: LocalQwikArtifact, ownerId: string) {
  if (!artifact || artifact.version !== 'qwik-local-artifact-1' || artifact.retention !== 'local_only_not_uploaded'
    || artifact.ownerId !== ownerId || !uuid.test(ownerId) || !(artifact.bytes instanceof Uint8Array)
    || artifact.bytes.byteLength !== artifact.byteLength || artifact.byteLength < 2 || artifact.byteLength > 5_000_000
    || typeof artifact.name !== 'string' || artifact.name.length < 1 || artifact.name.length > 255) fail('Local artifact identity mismatch', 409)
  const bytes = Uint8Array.from(artifact.bytes)
  if (await hash(bytes) !== artifact.sha256) fail('Local artifact bytes changed', 409)
  return bytes
}
async function decoded(artifact: LocalQwikArtifact, ownerId: string) {
  const bytes = await verifiedBytes(artifact, ownerId)
  // JSON permits no BOM; tolerate one only in the decoded view, not the hash.
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { return fail('Source retained but UTF-8 projection is unavailable') }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  let rows: unknown
  try { rows = JSON.parse(text) } catch { return fail('Source retained but JSON projection is unavailable') }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1000) fail('Source retained but array projection is unavailable')
  return { bytes, text, rows: rows as unknown[] }
}

/** Decoded JSON is a view, not lexical preservation. Exact numeric spelling,
 * whitespace, unknown leaves and all trace bytes remain in originalBytes. */
export async function readLocalQwikSource(artifact: LocalQwikArtifact, ownerId: string, sourceSetId: string) {
  artifact = structuredClone(artifact)
  const { bytes, rows } = await decoded(artifact, ownerId)
  const matches = rows.map((row, index) => ({ row, index })).filter(x => contextObject(x.row) && x.row.id === sourceSetId)
  if (matches.length !== 1) fail('Source set selection is absent or ambiguous')
  return { originalBytes: bytes, rawSet: structuredClone(matches[0].row) as Record<string, unknown>, sourceIndex: matches[0].index,
    interpretation: 'decoded_source_not_normalized' as const }
}
function selectedSet(blocks: unknown, selection: QwikSetSelection) {
  const { blockIndex: bi, segmentIndex: si, eventIndex: ei, collection, setIndex: i } = selection
  if (![bi, si, ei, i].every(n => Number.isSafeInteger(n) && n >= 0) || !['sets', 'set_details'].includes(collection)) fail('Invalid explicit canonical address')
  const block = Array.isArray(blocks) ? blocks[bi] : undefined
  const segment = contextObject(block) && Array.isArray(block.segments) ? block.segments[si] : undefined
  const event = contextObject(segment) && Array.isArray(segment.events) ? segment.events[ei] : undefined
  const sets = contextObject(event) && contextObject(event.performed) ? event.performed[collection] : undefined
  const set = Array.isArray(sets) ? sets[i] : undefined
  if (!contextObject(set) || (set.id ?? null) !== selection.expectedSetId) fail('Explicit canonical set identity mismatch', 409)
  return set
}

/** Only constructs the EXISTING revision-bound amendment. Authorization, write
 * gates, ledger and atomic SQL remain in the existing canonical tool/RPC. */
export async function prepareLocalQwikCapture(input: {
  ownerId: string; requestId: string; expectedRevision: number; snapshot: WorkoutSnapshot
  artifact: LocalQwikArtifact; selections: QwikSetSelection[]
}) {
  // Snapshot the entire accepted graph synchronously before any digest/parser
  // await. The prepared command must not alias caller-owned selection metadata.
  const { ownerId, requestId, expectedRevision, snapshot, artifact, selections } = structuredClone(input)
  if (!snapshot || snapshot.user_id !== ownerId || !uuid.test(ownerId) || !uuid.test(snapshot.id)
    || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || snapshot.capture_revision !== expectedRevision) fail('Read the exact owned workout revision first', 409)
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > 20) fail('Select one to twenty explicit canonical sets')
  const { text } = await decoded(artifact, ownerId)
  const recordings = await parseQwikArrayRecordings(text, { fileName: artifact.name, reference: reference(artifact), sourceSetIds: selections.map(s => s.sourceSetId) })
  // The projection parser hashes its UTF-8 string. Bind back to ORIGINAL bytes,
  // including any BOM, instead of accidentally attesting the normalized view.
  recordings.forEach(r => { r.source.file.sha256 = artifact.sha256; r.source.file.byteLength = artifact.byteLength })
  const patches = selections.map((selection, i) => {
    selectedSet(snapshot.blocks, selection)
    const { sourceSetId: _sourceSetId, expectedSetId: _expectedSetId, ...address } = selection
    return { ...address, recording: recordings[i], provenance: { origin: 'imported_unverified', reviewState: selection.expectedRecording ? 'corrected' : 'unreviewed', sourceReferences: [reference(artifact)] } }
  })
  const command = { entityId: snapshot.id, requestId, expectedRevision, changes: { setRecordings: patches }, provenance: { fields: {} } }
  validateActivityToolInput('amend_workout', command)
  patchSetRecordings(snapshot.blocks, patches, snapshot.capture_provenance) // Preflight whole batch, never mutate or send.
  return { version: 'qwik-local-capture-1' as const, ownerId, command, selections: structuredClone(selections),
    artifactSha256: artifact.sha256, normalizedRecordings: structuredClone(recordings),
    scope: 'local_artifact_plus_bounded_canonical_projection' as const }
}
export type PreparedLocalQwikCapture = Awaited<ReturnType<typeof prepareLocalQwikCapture>>

/** Join ONLY a verified saved-revision response from the canonical tool. A later
 * current revision is not interchangeable with the original receipt snapshot.
 * This checks consistency; it does not authenticate caller-fabricated readback. */
export async function joinLocalQwikReadback(packet: PreparedLocalQwikCapture, artifact: LocalQwikArtifact, saved: {
  requestId: string; readback: string; receipt: { userId: string; entityId: string; entityKind: string; revision: number; state: string }
  savedRecord: WorkoutSnapshot
}) {
  packet = structuredClone(packet); artifact = structuredClone(artifact); saved = structuredClone(saved)
  if (!packet || !contextObject(packet.command) || !contextObject(packet.command.changes)
    || !Array.isArray(packet.command.changes.setRecordings) || !Array.isArray(packet.normalizedRecordings)
    || !saved || !contextObject(saved.receipt) || !contextObject(saved.savedRecord)) fail('Invalid capture/readback packet', 409)
  const { receipt, savedRecord } = saved
  if (packet.version !== 'qwik-local-capture-1' || packet.scope !== 'local_artifact_plus_bounded_canonical_projection'
    || !Array.isArray(packet.selections) || packet.selections.length < 1 || packet.selections.length > 20
    || Object.keys(packet.command.changes).length !== 1 || packet.command.changes.setRecordings.length !== packet.selections.length
    || packet.normalizedRecordings.length !== packet.selections.length) fail('Invalid local capture packet', 409)
  try { validateActivityToolInput('amend_workout', packet.command) } catch { return fail('Invalid local capture command', 409) }
  for (const [i, selection] of packet.selections.entries()) {
    const { sourceSetId: _sourceSetId, expectedSetId: _expectedSetId, ...address } = selection
    const { recording, provenance: _provenance, ...commandAddress } = packet.command.changes.setRecordings[i]
    if (recording.set.id !== selection.sourceSetId || canonicalActivityJson(address) !== canonicalActivityJson(commandAddress)) fail('Capture command/selection mismatch', 409)
  }
  if (saved.readback !== 'verified_saved_revision' || saved.requestId !== packet.command.requestId || receipt.state !== 'saved'
    || receipt.userId !== packet.ownerId || receipt.entityKind !== 'workout' || receipt.entityId !== packet.command.entityId
    || receipt.revision !== packet.command.expectedRevision + 1 || savedRecord.user_id !== packet.ownerId
    || savedRecord.id !== receipt.entityId || savedRecord.capture_revision !== receipt.revision || artifact.sha256 !== packet.artifactSha256) fail('Saved revision/source binding mismatch', 409)
  const { bytes, text, rows } = await decoded(artifact, packet.ownerId)
  const expected = await parseQwikArrayRecordings(text, { fileName: artifact.name, reference: reference(artifact), sourceSetIds: packet.selections.map(s => s.sourceSetId) })
  expected.forEach(r => { r.source.file.sha256 = artifact.sha256; r.source.file.byteLength = artifact.byteLength })
  const sources = []
  for (const [i, selection] of packet.selections.entries()) {
    const set = selectedSet(savedRecord.blocks, selection)
    const retained = contextObject(set.velocity) ? set.velocity.recording : undefined
    if (!contextObject(retained) || canonicalActivityJson(retained) !== canonicalActivityJson(expected[i])
      || canonicalActivityJson(packet.normalizedRecordings[i]) !== canonicalActivityJson(expected[i])
      || canonicalActivityJson(packet.command.changes.setRecordings[i]?.recording) !== canonicalActivityJson(expected[i])) fail('Saved recording differs from the exact source projection', 409)
    const sourceIndex = expected[i].source.setIndex, rawSet = rows[sourceIndex]
    if (!contextObject(rawSet) || rawSet.id !== selection.sourceSetId) fail('Source row index mismatch', 409)
    sources.push({ canonicalAddress: structuredClone(selection), rawSet: structuredClone(rawSet), sourceIndex,
      recording: structuredClone(expected[i]) as RepRecording })
  }
  return { scope: 'verified_saved_revision_with_local_original' as const, revision: receipt.revision,
    currentRevisionNotAsserted: true, originalBytes: bytes, sources, observationsPromoted: false as const, rawUploaded: false as const }
}
