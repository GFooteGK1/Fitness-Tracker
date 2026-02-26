/**
 * Shared workout-fetcher utility
 *
 * Encapsulates the Google Sheets tab detection + CSV fetch + date-column parse
 * logic so it can be used by both:
 *   - app/api/workouts/route.ts  (HTTP endpoint for the client)
 *   - app/lib/agents/context-builder.ts  (server-side trainer context)
 */

import { detectCurrentTab } from '@/app/lib/sheets/tab-detector'

// The hardcoded programming spreadsheet ID — shared by all callers.
export const PROGRAMMING_SHEET_ID = '1Y0n4WgGu_MzJDDS-6-iAQlaMuZpULj1DIYioSbVW08g'

/**
 * Fetches the workout text for a given date (YYYY-MM-DD) from the Google Sheet.
 *
 * Returns the workout as a newline-joined string of content lines, or `null`
 * when the date is not found, the sheet is unavailable, or any error occurs.
 * All errors are swallowed so callers can treat null as "no program available."
 */
export async function fetchWorkoutForDate(date: string): Promise<string | null> {
  try {
    // 1. Detect which month tab corresponds to this date
    const requestedDate = new Date(date + 'T00:00:00')
    const tabResult = await detectCurrentTab(PROGRAMMING_SHEET_ID, requestedDate)

    // 2. Download the tab as CSV
    const csvUrl = `https://docs.google.com/spreadsheets/d/${PROGRAMMING_SHEET_ID}/export?format=csv&gid=${tabResult.sheetGid}`
    const csvResponse = await fetch(csvUrl, { cache: 'no-store' })
    if (!csvResponse.ok) return null

    const csvText = await csvResponse.text()

    // 3. Parse the CSV — find the column for the requested date, then extract content rows
    const workoutText = parseWorkoutFromCSV(csvText, date)
    return workoutText
  } catch {
    // Silently return null so the caller can fall back gracefully
    return null
  }
}

/**
 * Parses the raw CSV text from a programming sheet and returns the workout
 * content lines for a specific date as a newline-joined string, or null if
 * the date is not present in the sheet.
 *
 * Sheet layout assumptions:
 * - Date headers appear in columns C–J (0-indexed: 2–9)
 * - Workout content rows follow immediately after the date header row
 * - A new date-header row (≥2 dates in columns C–J) signals the end of the block
 */
export function parseWorkoutFromCSV(csvText: string, date: string): string | null {
  const lines = csvText.split('\n').filter(line => line.trim())
  const requestDate = normalizeDate(date)

  let dateColumnIndex = -1
  let headerRowIndex = -1

  // Scan all rows to find the date header — keep the LAST occurrence so that
  // when the same date appears in multiple weeks we use the most-recent block.
  for (let rowIdx = 0; rowIdx < lines.length; rowIdx++) {
    const cells = parseCSVLine(lines[rowIdx])
    for (let colIdx = 2; colIdx <= 9 && colIdx < cells.length; colIdx++) {
      const normalized = normalizeDate(cells[colIdx])
      if (normalized === requestDate) {
        dateColumnIndex = colIdx
        headerRowIndex = rowIdx
      }
    }
  }

  if (dateColumnIndex === -1 || headerRowIndex === -1) return null

  // Collect content rows until the next week-header row (or end of sheet)
  const workoutLines: string[] = []
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])

    // A row is a week-header if it has ≥2 date values in columns C–J
    let dateCount = 0
    for (let colIdx = 2; colIdx <= 9 && colIdx < cells.length; colIdx++) {
      if (normalizeDate(cells[colIdx])) dateCount++
    }
    if (dateCount >= 2) break

    const cellValue = cells[dateColumnIndex]?.trim()
    if (cellValue && cellValue !== '\r') {
      workoutLines.push(cellValue)
    }
  }

  return workoutLines.length > 0 ? workoutLines.join('\n') : null
}

// ─── Private helpers ─────────────────────────────────────────────────────────

/** Parses a single CSV line, respecting double-quoted fields. */
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

/**
 * Normalizes a cell value to YYYY-MM-DD format for date comparison.
 * Handles: already-ISO, M/D/YYYY, and any value parseable by `Date`.
 * Returns an empty string for non-date values.
 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  const cleaned = dateStr.replace(/"/g, '').trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned

  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const [, month, day, year] = slashMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const date = new Date(cleaned)
  if (!isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return ''
}
