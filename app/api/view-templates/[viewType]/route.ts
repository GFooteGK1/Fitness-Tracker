import { NextResponse } from 'next/server'
import { apiError } from '@/app/lib/api-response'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import {
  DEFAULT_DASHBOARD_VIEW_TEMPLATE,
  isViewType,
  validateViewTemplate,
  type StoredViewTemplate,
  type ViewType,
} from '@/app/lib/view-templates'

interface ViewTemplateRow {
  id: string
  user_id: string | null
  view_type: string
  version: number
  schema_version: number
  template: unknown
  created_at: string
}

function mapStoredTemplate(
  row: ViewTemplateRow,
  source: 'user' | 'default',
): StoredViewTemplate | null {
  const validated = validateViewTemplate(row.template)
  if (
    !validated.ok ||
    !isViewType(row.view_type) ||
    row.schema_version !== validated.value.schemaVersion ||
    !Number.isInteger(row.version) ||
    row.version < 1
  ) return null

  return {
    id: row.id,
    viewType: row.view_type,
    version: row.version,
    template: validated.value,
    source,
    createdAt: row.created_at,
  }
}

function builtInTemplate(viewType: ViewType): StoredViewTemplate {
  return {
    id: null,
    viewType,
    version: 1,
    template: DEFAULT_DASHBOARD_VIEW_TEMPLATE,
    source: 'built-in',
    createdAt: null,
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ viewType: string }> },
) {
  try {
    const { viewType: rawViewType } = await params
    if (!isViewType(rawViewType)) {
      return apiError('Unsupported view type', 404)
    }

    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    const { data: userRow, error: userError } = await supabase
      .from('view_templates')
      .select('id, user_id, view_type, version, schema_version, template, created_at')
      .eq('user_id', user.id)
      .eq('view_type', rawViewType)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (userError) {
      console.error('Error fetching user view template:', userError)
      return apiError('Failed to fetch view template', 500)
    }
    if (userRow) {
      const mapped = mapStoredTemplate(userRow as ViewTemplateRow, 'user')
      if (!mapped) return apiError('Stored view template is invalid', 500)
      return NextResponse.json(mapped, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    const { data: defaultRow, error: defaultError } = await supabase
      .from('view_templates')
      .select('id, user_id, view_type, version, schema_version, template, created_at')
      .is('user_id', null)
      .eq('view_type', rawViewType)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (defaultError) {
      console.error('Error fetching default view template:', defaultError)
      return apiError('Failed to fetch view template', 500)
    }

    const mappedDefault = defaultRow
      ? mapStoredTemplate(defaultRow as ViewTemplateRow, 'default')
      : null
    if (defaultRow && !mappedDefault) {
      return apiError('Stored default view template is invalid', 500)
    }

    return NextResponse.json(mappedDefault ?? builtInTemplate(rawViewType), {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('View template GET error:', error)
    return apiError('Failed to fetch view template', 500)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ viewType: string }> },
) {
  try {
    const { viewType: rawViewType } = await params
    if (!isViewType(rawViewType)) {
      return apiError('Unsupported view type', 404)
    }

    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return apiError('Unauthorized', 401)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return apiError('Request body must be valid JSON', 400)
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('Request body must be an object', 400)
    }

    const bodyKeys = Object.keys(body)
    if (bodyKeys.some(key => key !== 'template' && key !== 'expectedVersion')) {
      return apiError('Request body contains unsupported fields', 400)
    }

    const { template, expectedVersion } = body as {
      template?: unknown
      expectedVersion?: unknown
    }
    const validated = validateViewTemplate(template)
    if (!validated.ok) {
      return NextResponse.json(
        { error: 'Invalid view template', details: validated.errors },
        { status: 400 },
      )
    }
    if (
      expectedVersion !== undefined &&
      (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 0)
    ) {
      return apiError('expectedVersion must be a non-negative integer', 400)
    }

    const { data: latestRow, error: latestError } = await supabase
      .from('view_templates')
      .select('version')
      .eq('user_id', user.id)
      .eq('view_type', rawViewType)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestError) {
      console.error('Error fetching latest view template version:', latestError)
      return apiError('Failed to save view template', 500)
    }

    const currentVersion = latestRow?.version ?? 0
    if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
      return NextResponse.json(
        { error: 'View template changed; reload before saving', currentVersion },
        { status: 409 },
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('view_templates')
      .insert({
        user_id: user.id,
        view_type: rawViewType,
        version: currentVersion + 1,
        schema_version: validated.value.schemaVersion,
        template: validated.value,
      })
      .select('id, user_id, view_type, version, schema_version, template, created_at')
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'View template changed; reload before saving', currentVersion },
          { status: 409 },
        )
      }
      console.error('Error inserting view template:', insertError)
      return apiError('Failed to save view template', 500)
    }

    const mapped = mapStoredTemplate(inserted as ViewTemplateRow, 'user')
    if (!mapped) return apiError('Saved view template is invalid', 500)

    return NextResponse.json(mapped, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('View template POST error:', error)
    return apiError('Failed to save view template', 500)
  }
}
