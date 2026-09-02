import { NextResponse } from 'next/server'

import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  buildConfirmedQwikMapping,
  fetchCoachTrustCenter,
  type TrustObservationGroupRow
} from '@/app/lib/coach/trust-center'

export const runtime = 'nodejs'

type TrustAction =
  | 'reaffirm_memory'
  | 'withdraw_memory'
  | 'correct_memory'
  | 'confirm_import'
  | 'reject_import'
  | 'accept_proposal'
  | 'reject_proposal'

interface TrustRequest {
  action?: unknown
  resourceId?: unknown
  reason?: unknown
  idempotencyKey?: unknown
  content?: unknown
  mappings?: unknown
}

interface MemoryRow {
  id: string
  memory_key: string
  kind: string
}

interface ImportRow {
  id: string
  source_file_hash: string
  status: string
}

interface ValueRow {
  group_id: string
  metric_id: string
  value_numeric: number | string | null
  ordinal: number | string
}

interface SelectedMapping {
  groupId: string
  movementId: string
}

export async function GET() {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const trust = await fetchCoachTrustCenter(supabase, user.id)
    return NextResponse.json({ trust }, {
      status: trust.available ? 200 : 503,
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach trust GET error:', error)
    return apiError('Unable to load coach trust center', 500)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const body = await readJson(request)
    if (!body) return apiError('Request body must be valid JSON', 400)
    if (containsProhibitedRawKey(body)) {
      return apiError('Raw measurement content is not accepted by this endpoint', 422)
    }

    const action = trustAction(body.action)
    const resourceId = uuid(body.resourceId)
    const idempotencyKey = validIdempotencyKey(body.idempotencyKey)
    if (!action || !resourceId || !idempotencyKey) {
      return apiError('A valid action, resource, and idempotency key are required', 400)
    }

    const reason = boundedReason(body.reason)
    const result = action === 'reaffirm_memory' || action === 'withdraw_memory'
      ? await reviewMemory(supabase, action, resourceId, reason, idempotencyKey)
      : action === 'correct_memory'
        ? await correctMemory(supabase, user.id, resourceId, body.content, idempotencyKey)
        : action === 'confirm_import'
          ? await confirmImport(supabase, user.id, resourceId, body.mappings, idempotencyKey)
          : action === 'reject_import'
            ? await rejectImport(supabase, resourceId, reason, idempotencyKey)
            : action === 'accept_proposal'
              ? await acceptProposal(supabase, user.id, resourceId)
              : await rejectProposal(supabase, resourceId, reason, idempotencyKey)

    if (result) return result
    const trust = await fetchCoachTrustCenter(supabase, user.id)
    return NextResponse.json({ saved: true, trust }, {
      headers: { 'Cache-Control': 'private, no-store' }
    })
  } catch (error) {
    console.error('Coach trust POST error:', error)
    return apiError('Unable to update coach trust state', 500)
  }
}

async function reviewMemory(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  action: 'reaffirm_memory' | 'withdraw_memory',
  memoryId: string,
  reason: string | null,
  idempotencyKey: string
): Promise<Response | null> {
  if (action === 'withdraw_memory' && !reason) {
    return apiError('A withdrawal reason is required', 400)
  }
  const { error } = await supabase.rpc('review_coach_memory', {
    p_memory_id: memoryId,
    p_action: action === 'reaffirm_memory' ? 'reaffirmed' : 'withdrawn',
    p_reason: reason,
    p_idempotency_key: idempotencyKey
  })
  return rpcError(error, 'memory')
}

async function correctMemory(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  memoryId: string,
  contentValue: unknown,
  idempotencyKey: string
): Promise<Response | null> {
  const content = isRecord(contentValue) ? contentValue : null
  if (!content || JSON.stringify(content).length > 10_000) {
    return apiError('Corrected memory content is invalid', 422)
  }
  const { data, error: readError } = await supabase
    .from('coach_memories')
    .select('id, memory_key, kind')
    .eq('user_id', userId)
    .eq('id', memoryId)
    .eq('status', 'confirmed')
    .limit(1)
  const memory = ((data ?? [])[0] ?? null) as MemoryRow | null
  if (readError) return apiError('Unable to verify coach memory', 503)
  if (!memory) return apiError('Coach memory not found', 404)
  if (!validMemoryContent(memory.memory_key, content)) {
    return apiError('Corrected memory fields do not match this memory', 422)
  }

  const { error } = await supabase.rpc('correct_coach_memory_with_review', {
    p_memory_id: memoryId,
    p_content: content,
    p_idempotency_key: idempotencyKey
  })
  return rpcError(error, 'memory')
}

async function confirmImport(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  importId: string,
  mappingsValue: unknown,
  idempotencyKey: string
): Promise<Response | null> {
  const mappings = selectedMappings(mappingsValue)
  if (!mappings) return apiError('Import mappings are invalid', 422)

  const { data: importData, error: importError } = await supabase
    .from('measurement_imports')
    .select('id, source_file_hash, status')
    .eq('user_id', userId)
    .eq('id', importId)
    .eq('source_system', 'qwik_vbt')
    .limit(1)
  const importRow = ((importData ?? [])[0] ?? null) as ImportRow | null
  if (importError) return apiError('Unable to verify Qwik import', 503)
  if (!importRow) return apiError('Qwik import not found', 404)
  if (importRow.status !== 'pending_review') return apiError('Qwik import was already reviewed', 409)

  const { data: groupData, error: groupError } = await supabase
    .from('performance_observation_groups')
    .select('id, source_import_id, status, observed_at, captured_at, source_system, source_device, source_record_id, assessment_definition_id, assessment_catalog_version, protocol_version, parser_version, comparability_key, comparison_modifiers, metadata')
    .eq('user_id', userId)
    .eq('source_import_id', importId)
    .in('status', ['complete', 'incomplete'])
    .limit(1000)
  if (groupError) return apiError('Unable to verify Qwik observations', 503)
  const groups = (groupData ?? []) as TrustObservationGroupRow[]
  if (groups.length === 0) return apiError('Qwik import has no reviewable observations', 409)

  const { data: valueData, error: valueError } = await supabase
    .from('performance_observation_values')
    .select('group_id, metric_id, value_numeric, ordinal')
    .eq('user_id', userId)
    .in('group_id', groups.map(group => group.id))
    .eq('metric_id', 'bar.mean_velocity')
    .eq('status', 'complete')
    .order('ordinal', { ascending: true })
    .limit(100000)
  if (valueError) return apiError('Unable to verify Qwik measurements', 503)
  const values = (valueData ?? []) as ValueRow[]
  const mappingByGroup = new Map(mappings.map(mapping => [mapping.groupId, mapping.movementId]))
  const resolvedMappings: Array<Record<string, unknown>> = []

  for (const group of groups) {
    const metadata = isRecord(group.metadata) ? group.metadata : {}
    if (metadata.mappingStatus === 'mapped') continue
    if (metadata.mappingStatus !== 'ambiguous') {
      return apiError('An unmapped Qwik exercise cannot be confirmed', 409)
    }
    const movementId = mappingByGroup.get(group.id)
    const firstVelocity = values
      .filter(value => value.group_id === group.id)
      .sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
      .map(value => Number(value.value_numeric))[0]
    const resolved = movementId
      ? buildConfirmedQwikMapping(group, importRow, movementId, firstVelocity)
      : null
    if (!resolved) return apiError('Every ambiguous Qwik exercise needs a supported movement', 422)
    resolvedMappings.push({
      groupId: group.id,
      movementId,
      movementName: resolved.movementName,
      comparison: resolved.comparison,
      comparabilityKey: resolved.comparabilityKey
    })
  }
  if (mappings.some(mapping => !groups.some(group => group.id === mapping.groupId))) {
    return apiError('A Qwik mapping does not belong to this import', 422)
  }

  const { error } = await supabase.rpc('review_qwik_import_v1', {
    p_import_id: importId,
    p_action: 'confirmed',
    p_mappings: resolvedMappings,
    p_reason: null,
    p_idempotency_key: idempotencyKey
  })
  return rpcError(error, 'import')
}

async function rejectImport(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  importId: string,
  reason: string | null,
  idempotencyKey: string
): Promise<Response | null> {
  if (!reason) return apiError('A rejection reason is required', 400)
  const { error } = await supabase.rpc('review_qwik_import_v1', {
    p_import_id: importId,
    p_action: 'rejected',
    p_mappings: [],
    p_reason: reason,
    p_idempotency_key: idempotencyKey
  })
  return rpcError(error, 'import')
}

async function rejectProposal(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  proposalId: string,
  reason: string | null,
  idempotencyKey: string
): Promise<Response | null> {
  if (!reason) return apiError('A rejection reason is required', 400)
  const { error } = await supabase.rpc('reject_adaptation_proposal', {
    p_proposal_id: proposalId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey
  })
  return rpcError(error, 'proposal')
}

async function acceptProposal(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  proposalId: string
): Promise<Response | null> {
  const { data, error: readError } = await supabase
    .from('adaptation_proposals')
    .select('idempotency_key')
    .eq('user_id', userId)
    .eq('id', proposalId)
    .limit(1)
  const key = ((data ?? [])[0] as { idempotency_key?: unknown } | undefined)?.idempotency_key
  if (readError) return apiError('Unable to verify coach proposal', 503)
  if (typeof key !== 'string') return apiError('Coach proposal not found', 404)
  const { error } = await supabase.rpc('accept_adaptation_proposal', {
    p_proposal_id: proposalId,
    p_idempotency_key: key
  })
  return rpcError(error, 'proposal')
}

function rpcError(error: { code?: string } | null, resource: string): Response | null {
  if (!error) return null
  console.error(`Coach trust ${resource} transition failed:`, { code: error.code })
  if (error.code === 'P0002') return apiError(`Coach ${resource} not found`, 404)
  if (error.code === '40001' || error.code === '22023' || error.code === '23505' || error.code === '55000') {
    return apiError(`Coach ${resource} changed; refresh and review again`, 409)
  }
  return apiError(`Unable to update coach ${resource}`, 503)
}

async function readJson(request: Request): Promise<TrustRequest | null> {
  try {
    const value = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function trustAction(value: unknown): TrustAction | null {
  return typeof value === 'string' && [
    'reaffirm_memory',
    'withdraw_memory',
    'correct_memory',
    'confirm_import',
    'reject_import',
    'accept_proposal',
    'reject_proposal'
  ].includes(value) ? value as TrustAction : null
}

function selectedMappings(value: unknown): SelectedMapping[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null
  const mappings: SelectedMapping[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const groupId = uuid(item.groupId)
    const movementId = stableId(item.movementId)
    if (!groupId || !movementId) return null
    mappings.push({ groupId, movementId })
  }
  return new Set(mappings.map(item => item.groupId)).size === mappings.length ? mappings : null
}

function validMemoryContent(memoryKey: string, content: Record<string, unknown>): boolean {
  const allowed: Record<string, readonly string[]> = {
    primary_goal: ['goal', 'primaryDomain', 'secondaryGoals'],
    training_schedule: ['experience', 'trainingDays', 'sessionMinutes', 'startDate'],
    available_equipment: ['equipment', 'resolvedEquipmentIds'],
    training_constraints: ['constraints', 'constraintKinds']
  }
  const fields = allowed[memoryKey]
  return Boolean(fields)
    && Object.keys(content).every(key => fields.includes(key))
    && Object.keys(content).length > 0
}

function containsProhibitedRawKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedRawKey)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => (
    ['rawText', 'bar_path', 'barPath'].includes(key) || containsProhibitedRawKey(child)
  ))
}

function boundedReason(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 3 && trimmed.length <= 500 ? trimmed : null
}

function validIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length >= 8 && trimmed.length <= 200 ? trimmed : null
}

function stableId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(value)
    ? value
    : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
