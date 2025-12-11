import { NextResponse } from 'next/server'

const SHEET_ID = '1Y0n4WgGu_MzJDDS-6-iAQlaMuZpULj1DIYioSbVW08g'

export async function GET() {
  try {
    // Fetch the sheet as CSV (publicly accessible)
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`
    
    console.log('Fetching from:', csvUrl)
    
    const response = await fetch(csvUrl, {
      cache: 'no-store'
    })

    console.log('Response status:', response.status)

    if (!response.ok) {
      return NextResponse.json({
        error: 'Failed to fetch Google Sheet',
        status: response.status,
        statusText: response.statusText,
        message: 'Make sure the sheet is shared as "Anyone with the link can view"'
      }, { status: response.status })
    }

    const csvText = await response.text()
    
    // Parse first few lines
    const lines = csvText.split('\n').slice(0, 10) // First 10 lines
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    
    return NextResponse.json({
      success: true,
      sheetId: SHEET_ID,
      headers: headers,
      sampleRows: lines.slice(1, 6), // Next 5 rows
      totalLines: csvText.split('\n').length,
      message: 'Sheet is accessible!'
    })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Could not access the sheet. Make sure it is shared publicly.'
    }, { status: 500 })
  }
}
