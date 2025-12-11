import { NextResponse } from 'next/server'

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

    // Fetch the sheet as CSV (publicly accessible)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`
    
    const response = await fetch(csvUrl, {
      cache: 'no-store' // Always fetch fresh data
    })

    if (!response.ok) {
      throw new Error('Failed to fetch Google Sheet')
    }

    const csvText = await response.text()
    
    // Parse CSV - scan ALL rows to find date headers (multiple weeks)
    const lines = csvText.split('\n').filter(line => line.trim())
    const requestDate = normalizeDate(date)
    
    let dateColumnIndex = -1
    let headerRowIndex = -1
    let allDates: string[] = []
    
    // Scan through all rows to find date headers
    // IMPORTANT: We want the LAST occurrence of each date (most recent week)
    for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
      const cells = parseCSVLine(lines[rowIdx])
      
      // Check if this row contains dates (look for date patterns)
      for (let colIdx = 0; colIdx < cells.length; colIdx++) {
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
    
    console.log('Looking for date:', requestDate)
    console.log('Found dates:', allDates.sort())
    console.log('Using header row:', headerRowIndex, 'column:', dateColumnIndex)
    
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

    console.log('Found date at row:', headerRowIndex, 'column:', dateColumnIndex)

    // Build workout text from rows AFTER the header row until next header or end
    let workoutLines: string[] = []
    
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i])
      
      // Stop if we hit another header row (contains dates)
      let isHeaderRow = false
      for (let colIdx = 0; colIdx < cells.length; colIdx++) {
        if (normalizeDate(cells[colIdx])) {
          isHeaderRow = true
          break
        }
      }
      
      if (isHeaderRow) break
      
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
    console.error('Error fetching workout:', error)
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
  
  // Handle M/D/YYYY format (like 7/28/2025)
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
