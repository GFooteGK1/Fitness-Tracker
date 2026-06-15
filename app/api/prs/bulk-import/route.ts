import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import { getAnthropicClient, getAnthropicModel } from '@/app/lib/anthropic-client'
import { invalidatePassiveCache } from '@/app/lib/agents/context-builder'

interface ParsedPR {
  benchmark_name: string
  score_value: number
  score_display: string
  date: string
  rx_status: 'RX' | 'SCALED'
}

const PARSE_PROMPT = `Parse the following text into personal records for CrossFit benchmark workouts.

For each PR found, extract:
- benchmark_name: Canonical name (e.g. "Fran", "Grace", "Murph", "Back Squat 1RM")
- score_value: Numeric value for comparison:
  - FOR_TIME benchmarks: total seconds (e.g. 4:32 → 272)
  - AMRAP benchmarks: rounds*1000 + extra_reps (e.g. 7+5 → 7005)
  - STRENGTH/lifts: weight in lbs (e.g. 225)
- score_display: Human-readable score string (e.g. "4:32", "7+5", "225 lb")
- date: YYYY-MM-DD format. If only a month/year is given, use the 1st of the month. If only a year, use Jan 1. If no date, use "unknown".
- rx_status: "RX" or "SCALED" (default to "RX" if not specified)

Return ONLY a JSON array of objects. No markdown, no explanation. Example:
[{"benchmark_name":"Fran","score_value":272,"score_display":"4:32","date":"2025-06-15","rx_status":"RX"}]

If no PRs can be parsed, return an empty array: []

Text to parse:
`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const body = await request.json()
    const { text } = body as { text?: string }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return apiError('Text field is required', 400)
    }

    if (text.length > 10000) {
      return apiError('Text too long (max 10,000 characters)', 400)
    }

    // Use Claude to parse the raw text into structured PRs
    const message = await getAnthropicClient().messages.create({
      model: getAnthropicModel('workout'),
      max_tokens: 2000,
      messages: [{ role: 'user', content: PARSE_PROMPT + text }],
      // @ts-expect-error - timeout signal
      signal: AbortSignal.timeout(30_000)
    })

    const responseText = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsedPRs: ParsedPR[]
    try {
      // Handle potential markdown code blocks
      const jsonStr = responseText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      parsedPRs = JSON.parse(jsonStr)
    } catch {
      return apiError('Failed to parse Claude response as JSON', 500, responseText.slice(0, 500))
    }

    if (!Array.isArray(parsedPRs)) {
      return apiError('Expected JSON array from Claude', 500)
    }

    // Validate and filter
    const errors: string[] = []
    const validPRs: ParsedPR[] = []

    for (let i = 0; i < parsedPRs.length; i++) {
      const pr = parsedPRs[i]

      if (!pr.benchmark_name || typeof pr.benchmark_name !== 'string') {
        errors.push(`PR ${i + 1}: missing benchmark_name`)
        continue
      }
      if (pr.score_value == null || typeof pr.score_value !== 'number') {
        errors.push(`PR ${i + 1} (${pr.benchmark_name}): missing or invalid score_value`)
        continue
      }
      if (!pr.score_display || typeof pr.score_display !== 'string') {
        errors.push(`PR ${i + 1} (${pr.benchmark_name}): missing score_display`)
        continue
      }
      if (!pr.date || pr.date === 'unknown') {
        errors.push(`PR ${i + 1} (${pr.benchmark_name}): no date could be determined — skipping`)
        continue
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(pr.date)) {
        errors.push(`PR ${i + 1} (${pr.benchmark_name}): invalid date format "${pr.date}"`)
        continue
      }

      validPRs.push({
        benchmark_name: pr.benchmark_name,
        score_value: pr.score_value,
        score_display: pr.score_display,
        date: pr.date,
        rx_status: pr.rx_status === 'SCALED' ? 'SCALED' : 'RX'
      })
    }

    if (validPRs.length === 0) {
      return NextResponse.json({
        imported: 0,
        prs: [],
        errors: errors.length > 0 ? errors : ['No PRs could be parsed from the provided text']
      })
    }

    // Bulk insert
    const rows = validPRs.map(pr => ({
      user_id: user.id,
      benchmark_name: pr.benchmark_name,
      date: pr.date,
      score_value: pr.score_value,
      score_display: pr.score_display,
      rx_status: pr.rx_status,
      is_pr: true,
      workout_id: null
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('benchmark_prs')
      .insert(rows)
      .select('id, benchmark_name, score_display, date, rx_status')

    if (insertError) {
      return apiError('Failed to insert PRs', 500, insertError.message)
    }

    invalidatePassiveCache(user.id)

    return NextResponse.json({
      imported: inserted?.length ?? 0,
      prs: inserted ?? [],
      errors
    })
  } catch (error) {
    console.error('[prs/bulk-import] error:', error)
    return apiError(
      'Internal server error',
      500,
      error instanceof Error ? error.message : undefined
    )
  }
}
