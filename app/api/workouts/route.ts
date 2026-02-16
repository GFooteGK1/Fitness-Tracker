import { NextResponse } from 'next/server'
import { detectCurrentTab } from '@/app/lib/sheets/tab-detector'
import { TabDetectionError } from '@/app/lib/sheets/types'

const SHEET_ID = '1Y0n4WgGu_MzJDDS-6-iAQlaMuZpULj1DIYioSbVW08g'

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

    // Detect the current month's tab dynamically
    // Use the requested date so the correct month tab is selected
    // (avoids UTC vs local timezone mismatch on serverless)
    const requestedDate = new Date(date + 'T00:00:00')
    let tabResult
    try {
      tabResult = await detectCurrentTab(SHEET_ID, requestedDate)
    } catch (error) {
      // Check by error name to avoid instanceof issues with bundled custom classes
      if (error instanceof Error && error.name === 'TabDetectionError') {
        const tabError = error as TabDetectionError
        console.error({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          component: 'WorkoutsAPI',
          action: 'tab_detection_failed',
          details: {
            code: tabError.code,
            message: tabError.message,
            errorDetails: tabError.details
          }
        })
        
        // Provide troubleshooting guidance based on error type
        let troubleshooting = ''
        if (tabError.code === 'CONFIG_ERROR') {
          troubleshooting = 'Please ensure GOOGLE_SHEETS_API_KEY is set in environment variables.'
        } else if (tabError.code === 'API_ERROR') {
          troubleshooting = 'Unable to access Google Sheets API. Check API key permissions and spreadsheet accessibility.'
        } else if (tabError.code === 'NO_TABS_FOUND') {
          troubleshooting = 'No tabs found in the spreadsheet. Verify the spreadsheet ID is correct.'
        }
        
        return NextResponse.json(
          { 
            error: 'Tab detection failed',
            message: tabError.message,
            troubleshooting
          },
          { status: 500 }
        )
      }
      
      // Generic error
      console.error({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        component: 'WorkoutsAPI',
        action: 'unexpected_tab_detection_error',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
      return NextResponse.json(
        { 
          error: 'Tab detection failed',
          message: error instanceof Error ? error.message : 'Unknown error',
          troubleshooting: 'Check server logs for details.'
        },
        { status: 500 }
      )
    }
    
    // Log warning if fallback mode was used
    if (tabResult.isFallback) {
      console.warn({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        component: 'WorkoutsAPI',
        action: 'fallback_tab_used',
        details: {
          tabName: tabResult.tabName,
          sheetGid: tabResult.sheetGid,
          warning: tabResult.warning
        }
      })
    }

    // Fetch the detected sheet tab as CSV (publicly accessible)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${tabResult.sheetGid}`
    
    const response = await fetch(csvUrl, {
      cache: 'no-store' // Always fetch fresh data
    })

    if (!response.ok) {
      throw new Error('Failed to fetch Google Sheet')
    }

    const csvText = await response.text()
    
    // Parse CSV - scan ALL rows to find date headers (multiple weeks)
    // Focus on columns C-J (indices 2-9) where workout data is located
    const lines = csvText.split('\n').filter(line => line.trim())
    const requestDate = normalizeDate(date)
    
    let dateColumnIndex = -1
    let headerRowIndex = -1
    let allDates: string[] = []
    
    // Scan through all rows to find date headers
    // IMPORTANT: We want the LAST occurrence of each date (most recent week)
    // Only look in columns C-J (indices 2-9)
    for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
      const cells = parseCSVLine(lines[rowIdx])
      
      // Check if this row contains dates (look for date patterns in columns C-J only)
      for (let colIdx = 2; colIdx <= 9 && colIdx < cells.length; colIdx++) {
        const normalized = normalizeDate(cells[colIdx])
        if (normalized) {
          allDates.push(normalized)
          
          // Check if this is the date we're looking for
          // Keep updating to get the LAST occurrence (most recent week)
          if (normalized === requestDate) {
            dateColumnIndex = colIdx
            headerRowIndex = rowIdx
          }
        }
      }
    }
    
    if (dateColumnIndex === -1 || headerRowIndex === -1) {
      const sortedDates = [...new Set(allDates)].sort()
      const firstDate = sortedDates[0]
      const lastDate = sortedDates[sortedDates.length - 1]
      
      return NextResponse.json({
        workout: null,
        message: `No workout found for ${date}. Available dates: ${firstDate} to ${lastDate}`,
        found: false,
        availableDates: { first: firstDate, last: lastDate, all: sortedDates }
      })
    }

    console.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      component: 'WorkoutsAPI',
      action: 'date_found_in_sheet',
      details: {
        requestDate,
        headerRowIndex,
        dateColumnIndex
      }
    })

    // Build workout text from rows AFTER the header row until next header or end
    let workoutLines: string[] = []
    
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      
      // Stop if we hit another header row (contains dates in columns C-J)
      // A header row must have at least 2 dates to be considered a header
      let dateCount = 0
      for (let colIdx = 2; colIdx <= 9 && colIdx < cells.length; colIdx++) {
        if (normalizeDate(cells[colIdx])) {
          dateCount++
        }
      }
      
      // Only stop if we found multiple dates (indicating a new week header)
      if (dateCount >= 2) break
      
      const cellValue = cells[dateColumnIndex]?.trim()
      
      if (cellValue && cellValue !== '' && cellValue !== '\r') {
        workoutLines.push(cellValue)
      }
    }

    if (workoutLines.length === 0) {
      return NextResponse.json({
        workout: null,
        message: 'No workout content for this date',
        found: false
      })
    }

    const workoutText = workoutLines.join('\n')

    return NextResponse.json({
      workout: workoutText,
      date: date,
      found: true
    })

  } catch (error) {
    console.error({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      component: 'WorkoutsAPI',
      action: 'fetch_workout_failed',
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper to parse CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

// Helper to normalize dates for comparison
function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  
  // Clean the string
  const cleaned = dateStr.replace(/"/g, '').trim()
  
  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }
  
  // Handle M/D/YYYY format (like 1/9/2026)
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Try parsing as a date
  const date = new Date(cleaned)
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  return ''
}
