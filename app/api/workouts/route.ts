import { NextResponse } from 'next/server'
import { detectCurrentTab } from '@/app/lib/sheets/tab-detector'
import { TabDetectionError } from '@/app/lib/sheets/types'
import { fetchWorkoutForDate, PROGRAMMING_SHEET_ID } from '@/app/lib/sheets/workout-fetcher'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json(
        { error: 'Date parameter required' },
        { status: 400 }
      )
    }

    // Validate that tab detection is possible before delegating, so we can
    // return structured error responses with troubleshooting guidance.
    const requestedDate = new Date(date + 'T00:00:00')
    let tabResult
    try {
      tabResult = await detectCurrentTab(PROGRAMMING_SHEET_ID, requestedDate)
    } catch (error) {
      if (error instanceof Error && error.name === 'TabDetectionError') {
        const tabError = error as TabDetectionError
        console.error({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          component: 'WorkoutsAPI',
          action: 'tab_detection_failed',
          details: { code: tabError.code, message: tabError.message, errorDetails: tabError.details }
        })

        let troubleshooting = ''
        if (tabError.code === 'CONFIG_ERROR') {
          troubleshooting = 'Please ensure GOOGLE_SHEETS_API_KEY is set in environment variables.'
        } else if (tabError.code === 'API_ERROR') {
          troubleshooting = 'Unable to access Google Sheets API. Check API key permissions and spreadsheet accessibility.'
        } else if (tabError.code === 'NO_TABS_FOUND') {
          troubleshooting = 'No tabs found in the spreadsheet. Verify the spreadsheet ID is correct.'
        }

        return NextResponse.json(
          { error: 'Tab detection failed', message: tabError.message, troubleshooting },
          { status: 500 }
        )
      }

      console.error({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        component: 'WorkoutsAPI',
        action: 'unexpected_tab_detection_error',
        details: { error: error instanceof Error ? error.message : String(error) }
      })
      return NextResponse.json(
        { error: 'Tab detection failed', message: error instanceof Error ? error.message : 'Unknown error', troubleshooting: 'Check server logs for details.' },
        { status: 500 }
      )
    }

    if (tabResult.isFallback) {
      console.warn({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        component: 'WorkoutsAPI',
        action: 'fallback_tab_used',
        details: { tabName: tabResult.tabName, sheetGid: tabResult.sheetGid, warning: tabResult.warning }
      })
    }

    // Delegate CSV fetch + parse to the shared utility
    const workoutText = await fetchWorkoutForDate(date)

    if (!workoutText) {
      return NextResponse.json({
        workout: null,
        found: false,
        message: `No workout found for ${date}`
      })
    }

    return NextResponse.json({ workout: workoutText, date, found: true })

  } catch (error) {
    console.error({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      component: 'WorkoutsAPI',
      action: 'fetch_workout_failed',
      details: { error: error instanceof Error ? error.message : String(error) }
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
