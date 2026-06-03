import { NextResponse } from 'next/server'
import { createServerClient } from '@/app/lib/auth/supabase-server'
import { apiError } from '@/app/lib/api-response'
import {
  generateWorkoutsCsv,
  generateMealsCsv,
  generateCombinedCsv,
  generatePdf,
  transformWorkoutRows,
  transformMealRows,
  computeSummary,
} from '@/app/lib/export-utils'

const VALID_FORMATS = ['csv', 'pdf'] as const
const VALID_TYPES = ['workouts', 'meals', 'all'] as const

type ExportFormat = (typeof VALID_FORMATS)[number]
type ExportType = (typeof VALID_TYPES)[number]

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') as ExportFormat | null
    const type = searchParams.get('type') as ExportType | null
    const startDate = searchParams.get('start')
    const endDate = searchParams.get('end')

    if (!format || !VALID_FORMATS.includes(format)) {
      return apiError('Invalid format parameter. Must be "csv" or "pdf".', 400)
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return apiError('Invalid type parameter. Must be "workouts", "meals", or "all".', 400)
    }
    if (!startDate || !endDate) {
      return apiError('Both start and end date parameters are required.', 400)
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return apiError('Dates must be in YYYY-MM-DD format.', 400)
    }

    // Fetch data from Supabase
    let workouts: any[] = []
    let meals: any[] = []

    if (type === 'workouts' || type === 'all') {
      const { data, error } = await supabase
        .from('workouts')
        .select('id, workout_date, input_text, blocks, notes, total_duration_min, primary_score, tags')
        .eq('user_id', user.id)
        .gte('workout_date', startDate)
        .lte('workout_date', endDate)
        .order('workout_date', { ascending: true })

      if (error) {
        return apiError('Failed to fetch workouts', 500, error.message)
      }
      workouts = data || []
    }

    if (type === 'meals' || type === 'all') {
      // Convert dates to timestamp boundaries for meal_timestamp comparison
      const startTimestamp = `${startDate}T00:00:00.000Z`
      const endTimestamp = `${endDate}T23:59:59.999Z`

      const { data, error } = await supabase
        .from('meals')
        .select('id, meal_timestamp, items, total_protein, total_carbs, total_fat, total_calories, photo_url')
        .eq('user_id', user.id)
        .gte('meal_timestamp', startTimestamp)
        .lte('meal_timestamp', endTimestamp)
        .order('meal_timestamp', { ascending: true })

      if (error) {
        return apiError('Failed to fetch meals', 500, error.message)
      }
      meals = data || []
    }

    // Get user name for PDF
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name, email')
      .eq('id', user.id)
      .single()

    const userName = profile?.display_name || user.email || ''

    // Transform data
    const workoutRows = transformWorkoutRows(workouts)
    const mealRows = transformMealRows(meals)

    if (format === 'csv') {
      let csv: string
      if (type === 'workouts') {
        csv = generateWorkoutsCsv(workoutRows)
      } else if (type === 'meals') {
        csv = generateMealsCsv(mealRows)
      } else {
        csv = generateCombinedCsv(workoutRows, mealRows)
      }

      const filename = `sociusfit-${type}-${startDate}-to-${endDate}.csv`
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // PDF format
    const summary = computeSummary(workouts, meals, { start: startDate, end: endDate }, userName)
    const pdfBytes = await generatePdf(workoutRows, mealRows, summary, type)
    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength)
    new Uint8Array(pdfArrayBuffer).set(pdfBytes)
    const filename = `sociusfit-${type}-${startDate}-to-${endDate}.pdf`

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return apiError(
      'Export failed',
      500,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}
