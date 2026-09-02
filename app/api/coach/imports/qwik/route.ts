import { NextResponse } from 'next/server'

import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  readQwikImportSubmission
} from '@/app/lib/coach/qwik-import'

export const runtime = 'nodejs'

interface QwikImportRequest {
  action?: unknown
  idempotencyKey?: unknown
  normalizedImport?: unknown
}

interface QwikImportRpcRow {
  import_id: string
  disposition: 'recorded' | 'replayed' | 'duplicate'
  observation_group_count: number
  review_required: boolean
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    if (body.action !== 'save_for_review') {
      return apiError('Action must be save_for_review', 400)
    }
    if ('rawText' in body || 'bar_path' in body || 'barPath' in body) {
      return apiError('Raw Qwik content is not accepted by this endpoint', 422)
    }

    const normalizedImport = readQwikImportSubmission(body.normalizedImport)
    if (!normalizedImport) {
      return apiError('Normalized Qwik import is invalid', 422)
    }

    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!idempotencyKey) return apiError('A valid idempotency key is required', 400)

    const { data, error } = await supabase.rpc('record_qwik_import_v1', {
      p_idempotency_key: idempotencyKey,
      p_source_file_name: normalizedImport.sourceFileName,
      p_source_file_hash: normalizedImport.sourceFileHash,
      p_source_schema_version: normalizedImport.sourceSchemaVersion,
      p_parser_version: normalizedImport.parserVersion,
      p_captured_at: normalizedImport.ingestedAt,
      p_source_exported_at: normalizedImport.sourceExportedAt,
      p_source_device: normalizedImport.sourceDeviceId,
      p_manifest: {
        sourceByteLength: normalizedImport.sourceByteLength,
        rawStoragePolicy: normalizedImport.rawStoragePolicy,
        rawArtifactUploaded: false,
        warningCount: normalizedImport.warnings.length,
        warningCodes: [...new Set(normalizedImport.warnings.map(issue => issue.code))]
      },
      p_sets: normalizedImport.sets
    })

    if (error) {
      console.error('Qwik import RPC failed:', { code: error.code })
      if (error.code === '22023' || error.code === '23505') {
        return apiError('Qwik import conflicts with an existing request', 409)
      }
      return apiError('Unable to save Qwik import', 503)
    }

    const row = (data?.[0] ?? null) as QwikImportRpcRow | null
    if (
      !row?.import_id
      || !['recorded', 'replayed', 'duplicate'].includes(row.disposition)
    ) return apiError('Unable to save Qwik import', 503)

    return NextResponse.json({
      result: row,
      review: {
        setCount: normalizedImport.sets.length,
        warningCount: normalizedImport.warnings.length
      },
      evidenceStatus: 'pending_review',
      adaptationEligible: false
    }, {
      status: row.disposition === 'recorded' ? 201 : 200,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Qwik import POST error:', error)
    return apiError('Unable to process Qwik import', 500)
  }
}

async function readJson(request: Request): Promise<QwikImportRequest | null> {
  try {
    const value = await request.json()
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as QwikImportRequest
      : null
  } catch {
    return null
  }
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}
