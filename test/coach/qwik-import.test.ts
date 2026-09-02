import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  QWIK_IMPORT_PARSER_VERSION,
  decideQwikImportReplay,
  parseQwikExport,
  qwikImportForPersistence,
  qwikSetForPersistence,
  readQwikImportSubmission
} from '@/app/lib/coach/qwik-import'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const fixturePath = join(
  repositoryRoot,
  'test',
  'fixtures',
  'qwik',
  'qwik-vbt-json-1.10.json'
)
const rawFixture = readFileSync(fixturePath, 'utf8')
const input = {
  sourceFileName: 'qwik-export-2026-08-31.json',
  ingestedAt: '2026-08-31T22:30:00.000Z'
}

describe('Qwik JSON import parser', () => {
  it('normalizes the fixture while preserving source identity, timing, units, and private provenance', async () => {
    const preview = await parseQwikExport(rawFixture, input)

    expect(preview.canSaveForReview).toBe(true)
    expect(preview.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'movement_review_required',
        sourceRecordId: 'set-goblet-review-1'
      })
    ])
    expect(preview.sourceFileHash).toMatch(/^[0-9a-f]{64}$/)
    expect(preview.sourceDeviceId).toBe('greg_iphone')
    expect(preview.rawArtifact).toMatchObject({
      storageKind: 'not_persisted',
      retentionClass: 'user_retained_not_uploaded',
      retentionDays: null,
      expiresAt: null,
      includesBarPathArrays: true
    })
    expect(preview.sourcePayloadMetadata).toEqual({
      athlete_label: 'fixture-athlete',
      export_reason: 'manual backup'
    })

    const paused = preview.sets[0]
    expect(paused).toMatchObject({
      sourceSetId: 'set-bench-paused-1',
      observedAt: '2026-08-31T21:02:00.000Z',
      sourceCapturedAt: '2026-08-31T21:05:00.000Z',
      workoutDate: '2026-08-31',
      originalLoad: { value: 220.462262, unit: 'lbs' },
      rpe: 8,
      notes: null,
      techniqueModifiers: ['paused'],
      movementMapping: {
        status: 'mapped',
        canonicalMovementId: 'barbell_bench_press'
      }
    })
    expect(paused.normalizedLoad.value).toBeCloseTo(100, 4)
    expect(paused.reps).toHaveLength(2)
    expect(paused.reps[0]).toMatchObject({
      sourceRepId: 'rep-paused-1',
      meanConcentricVelocityMps: 0.58,
      meanEccentricVelocityMps: 0.32,
      pauseDurationSeconds: 1.04,
      rangeOfMotionMeters: 0.43,
      barPath: { retainedInPrivateRawArtifact: true, present: true, pointCount: 2 }
    })
    expect(paused.values.map(value => [value.metricId, value.ordinal])).toEqual([
      ['strength.load', 0],
      ['strength.repetitions', 0],
      ['bar.mean_velocity', 0],
      ['bar.mean_velocity', 1]
    ])
  })

  it('uses technique tags in comparability and keeps ambiguous movement mappings pending review', async () => {
    const preview = await parseQwikExport(rawFixture, input)
    const [paused, normal, ambiguous] = preview.sets

    expect(paused.comparabilityKey).toMatch(/^comparison-v1\|/)
    expect(normal.comparabilityKey).toMatch(/^comparison-v1\|/)
    expect(paused.comparabilityKey).not.toBe(normal.comparabilityKey)
    expect(ambiguous.movementMapping).toEqual({
      status: 'ambiguous',
      canonicalMovementId: null,
      canonicalMovementName: null,
      candidateMovementIds: ['dumbbell_goblet_squat', 'kettlebell_goblet_squat']
    })
    expect(ambiguous.comparabilityKey).toBeNull()
  })

  it('omits the raw export and full bar paths from normalized persistence data', async () => {
    const preview = await parseQwikExport(rawFixture, input)
    const persisted = JSON.stringify(qwikSetForPersistence(preview.sets[0]))
    const submission = qwikImportForPersistence(preview)

    expect(persisted).toContain('barPathPointCount')
    expect(persisted).not.toContain('"x"')
    expect(persisted).not.toContain('"y"')
    expect(readQwikImportSubmission(submission)).toEqual(submission)
    expect(readQwikImportSubmission({ ...submission, rawText: rawFixture })).toBeNull()
  })

  it('makes replay and duplicate behavior deterministic and rejects key reuse with changed content', async () => {
    const hash = (await parseQwikExport(rawFixture, input)).sourceFileHash
    const existing = [{
      id: 'import-1',
      idempotencyKey: 'qwik-upload-1',
      sourceFileHash: hash,
      parserVersion: QWIK_IMPORT_PARSER_VERSION,
      status: 'pending_review' as const
    }]

    expect(decideQwikImportReplay(existing, {
      idempotencyKey: 'qwik-upload-1', sourceFileHash: hash
    })).toEqual({ action: 'replay', importId: 'import-1' })
    expect(decideQwikImportReplay(existing, {
      idempotencyKey: 'qwik-upload-2', sourceFileHash: hash
    })).toEqual({ action: 'duplicate', importId: 'import-1' })
    expect(decideQwikImportReplay(existing, {
      idempotencyKey: 'qwik-upload-1', sourceFileHash: 'f'.repeat(64)
    })).toMatchObject({ action: 'conflict', importId: 'import-1' })
  })

  it('reports malformed rows without allowing a partial save', async () => {
    const malformed = JSON.parse(rawFixture) as { sets: Array<Record<string, unknown>> }
    malformed.sets[1] = {
      ...malformed.sets[1],
      reps: [{ rep_id: 'bad-rep', concentric: { mean_velocity_mps: -1 } }]
    }

    const preview = await parseQwikExport(JSON.stringify(malformed), input)

    expect(preview.sets.map(set => set.sourceSetId)).toEqual([
      'set-bench-paused-1',
      'set-goblet-review-1'
    ])
    expect(preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        code: 'invalid_metric',
        sourceRecordId: 'set-bench-normal-1'
      })
    ]))
    expect(preview.canSaveForReview).toBe(false)
  })

  it('fails closed on undocumented export versions and duplicate source IDs', async () => {
    const unsupported = JSON.parse(rawFixture) as {
      export_format_version: string
      sets: Array<Record<string, unknown>>
    }
    unsupported.export_format_version = '1.11'
    unsupported.sets[1] = {
      ...unsupported.sets[1],
      set_id: unsupported.sets[0].set_id
    }

    const preview = await parseQwikExport(JSON.stringify(unsupported), input)

    expect(preview.canSaveForReview).toBe(false)
    expect(preview.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'unsupported_format',
      'duplicate_source_id'
    ]))
  })
})
