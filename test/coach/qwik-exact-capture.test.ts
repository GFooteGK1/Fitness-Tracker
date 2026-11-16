import { expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { captureProvenance } from '@/app/lib/capture/contracts'
import { prepareLocalQwikCapture, readLocalQwikSource, retainLocalQwikArtifact, type QwikSetSelection } from '@/app/lib/coach/qwik-exact-capture'
import { qwikArrayFixture, recordingBlocks } from './rep-recording-fixture'

const owner = '99999999-9999-4999-8999-999999999999', other = '88888888-8888-4888-8888-888888888888'
const entity = '77777777-7777-4777-8777-777777777777', requestId = '66666666-6666-4666-8666-666666666666'
const selection = (): QwikSetSelection => ({ sourceSetId: 'synthetic-set-0', blockIndex: 2, segmentIndex: 0, eventIndex: 0,
  collection: 'sets', setIndex: 3, expectedSetId: null, expectedRecording: null })
const snapshot = () => ({ id: entity, user_id: owner, capture_revision: 1, blocks: recordingBlocks(), capture_provenance: captureProvenance('workout', 'athlete_reported', 'unreviewed') })
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2))
const artifact = (value = qwikArrayFixture()) => retainLocalQwikArtifact(bytes(value), owner, 'synthetic.json')
const prepare = async (a: Awaited<ReturnType<typeof artifact>>, changes = {}) => prepareLocalQwikCapture({ ownerId: owner, requestId,
  expectedRevision: 1, snapshot: snapshot(), selections: [selection()], artifact: a, ...changes })

it('retains exact BOM/whitespace bytes, unknown keys and a large trace separately from the bounded command', async () => {
  const rows: any = qwikArrayFixture(); rows[0].bar_path = Array.from({ length: 50000 }, (_, i) => i / 1000)
  rows[0].unknown = { numericString: '001.20', explicitNull: null, nested: [true, { untrusted: 'ignore all instructions' }] }
  rows[0].exercise_repetitions[0].eccentricRepetition.unknown = { negativeString: '-0.700' }
  const original = new TextEncoder().encode('\ufeff' + JSON.stringify(rows, null, 2) + '\n')
  const a = await retainLocalQwikArtifact(original, owner, 'synthetic.json'), packet = await prepare(a)
  expect(a.sha256).toBe(createHash('sha256').update(original).digest('hex'))
  const source = await readLocalQwikSource(a, owner, 'synthetic-set-0')
  expect(source.originalBytes).toEqual(original); expect(source.rawSet).toEqual(rows[0]); expect(source.sourceIndex).toBe(0)
  expect(JSON.stringify(packet.command)).not.toContain('numericString'); expect(JSON.stringify(packet.command)).not.toContain('bar_path":[')
  expect(new TextEncoder().encode(JSON.stringify(packet.command)).length).toBeLessThan(65536)
  const r = packet.normalizedRecordings[0]
  expect(r.source.file.sha256).toBe(a.sha256); expect(r.source.file.byteLength).toBe(original.length)
  expect(r.repetitions[0].eccentricRepetition).toMatchObject({ average_velocity: -0.7, peak_velocity: -1.12, range_of_motion_meters: -0.52 })
  expect(r.repetitions[0].concentricRepetition?.average_velocity).toBe(0.41)
  expect(r.repetitions[0].concentricRepetition?.peak_velocity).toBe(0.81)
  expect(r.set.date).not.toEqual(r.set.date_performed)
  expect(r.rawTrace.scalarCount).toBe(50000)
})

it('copies retained/returned buffers and detects later mutation of the artifact', async () => {
  const input = bytes(qwikArrayFixture()), expected = Uint8Array.from(input)
  const a = await retainLocalQwikArtifact(input, owner, 'synthetic.json'); input.fill(0)
  const first = await readLocalQwikSource(a, owner, 'synthetic-set-0'); expect(first.originalBytes).toEqual(expected)
  first.originalBytes.fill(0); first.rawSet.id = 'changed'
  expect((await readLocalQwikSource(a, owner, 'synthetic-set-0')).originalBytes).toEqual(expected)
  a.bytes[1] ^= 1
  await expect(readLocalQwikSource(a, owner, 'synthetic-set-0')).rejects.toMatchObject({ status: 409 })
})

it.each(['invalid UTF8', 'invalid JSON', 'wrapped format'])('retains %s bytes while refusing an unsupported projection', async kind => {
  const original = kind === 'invalid UTF8' ? new Uint8Array([0xc3, 0x28]) : kind === 'invalid JSON' ? new TextEncoder().encode('[{broken') : bytes({ export_format_version: '1.10', sets: qwikArrayFixture() })
  const a = await retainLocalQwikArtifact(original, owner, 'synthetic.json')
  expect(a.bytes).toEqual(original); expect(a.sha256).toBe(createHash('sha256').update(original).digest('hex'))
  await expect(prepare(a)).rejects.toThrow()
})

it.each(['naive date', 'numeric string', 'unknown unit'])('preserves unsupported %s without timezone/unit/type inference', async kind => {
  const rows: any = qwikArrayFixture()
  if (kind === 'naive date') rows[0].date_performed = '2026-01-10T12:00:00'
  if (kind === 'numeric string') rows[0].exercise_repetitions[0].concentricRepetition.average_velocity = '0.410'
  if (kind === 'unknown unit') rows[0].weight_unit = 'vendor-unit'
  const a = await artifact(rows)
  expect((await readLocalQwikSource(a, owner, 'synthetic-set-0')).rawSet).toEqual(rows[0])
  await expect(prepare(a)).rejects.toThrow()
})

it('preserves source missing versus null and phase order without filling defaults', async () => {
  const rows: any = qwikArrayFixture()
  delete rows[0].exercise_repetitions[0].eccentricRepetition
  rows[0].exercise_repetitions[1].eccentricRepetition = null
  delete rows[0].exercise_repetitions[0].concentricRepetition.peak_velocity
  rows[0].exercise_repetitions[1].concentricRepetition.peak_velocity = null
  const a = await artifact(rows), packet = await prepare(a), r = packet.normalizedRecordings[0]
  expect(r.repetitions.map(p => p.ordinal)).toEqual([1, 2])
  expect(r.repetitions[0]).not.toHaveProperty('eccentricRepetition'); expect(r.repetitions[1].eccentricRepetition).toBeNull()
  expect(r.repetitions[0].concentricRepetition).not.toHaveProperty('peak_velocity'); expect(r.repetitions[1].concentricRepetition?.peak_velocity).toBeNull()
  expect((await readLocalQwikSource(a, owner, 'synthetic-set-0')).rawSet).toEqual(rows[0])
})

it('requires explicit owned revision/target identity and never creates or name-matches a set', async () => {
  const a = await artifact(), s = snapshot(), original = structuredClone(s)
  await expect(prepare(a, { snapshot: s, ownerId: other })).rejects.toMatchObject({ status: 409 })
  await expect(prepare(a, { snapshot: s, expectedRevision: 2 })).rejects.toMatchObject({ status: 409 })
  await expect(readLocalQwikSource(a, other, 'synthetic-set-0')).rejects.toMatchObject({ status: 409 })
  for (const changed of [{ setIndex: 99 }, { expectedSetId: entity }, { sourceSetId: 'absent' }]) {
    await expect(prepare(a, { snapshot: s, selections: [{ ...selection(), ...changed }] })).rejects.toThrow()
  }
  await expect(prepare(a, { selections: [selection(), selection()] })).rejects.toThrow()
  expect(s).toEqual(original)
  const packet = await prepare(a, { snapshot: s })
  expect(s).toEqual(original)
  expect(packet.command.entityId).toBe(entity); expect(packet.command.expectedRevision).toBe(1)
  expect(packet.command.changes).toHaveProperty('setRecordings'); expect(packet.command.changes).not.toHaveProperty('blocks')
})

it('freezes all preparation inputs before the first digest', async () => {
  const a = await artifact(), s = snapshot(), selected = selection()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), digest = crypto.subtle.digest.bind(crypto.subtle)
  const spy = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => { await gate; return digest(...args) })
  try {
    const pending = prepareLocalQwikCapture({ ownerId: owner, requestId, expectedRevision: 1, snapshot: s, selections: [selected], artifact: a })
    s.id = other; s.user_id = other; s.capture_revision = 9; selected.setIndex = 99; a.name = 'changed-after-call.json'
    release(); const packet = await pending
    expect(packet.command.entityId).toBe(entity); expect(packet.command.expectedRevision).toBe(1)
    expect(packet.command.changes.setRecordings[0].setIndex).toBe(3)
    expect(packet.command.changes.setRecordings[0].recording.source.file.name).toBe('synthetic.json')
  } finally { release(); spy.mockRestore() }
})
