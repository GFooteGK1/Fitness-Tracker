/**
 * Tab Detector - Main orchestrator for dynamic sheet tab detection
 */

import { fetchSheetTabs } from './google-sheets-client'
import { parseTabName } from './tab-name-parser'
import { tabCache } from './tab-cache'
import type {
  SheetTab,
  ParsedTabDate,
  ScoredTab,
  TabDetectionResult
} from './types'
import { TabDetectionError } from './types'

/**
 * Score a tab based on whether it matches the current month/year
 */
function scoreTab(
  parsedDate: ParsedTabDate | null,
  currentMonth: number,
  currentYear: number
): number {
  if (!parsedDate) return 0
  if (parsedDate.month === currentMonth && parsedDate.year === currentYear) {
    return parsedDate.confidence
  }
  return 0
}

/**
 * Select a fallback tab when no current month match is found
 */
function selectFallbackTab(
  scoredTabs: ScoredTab[],
  currentMonth: number,
  currentYear: number
): TabDetectionResult {
  const datedTabs = scoredTabs.filter(st => st.parsedDate !== null)
  
  if (datedTabs.length > 0) {
    // Sort by most recent date (year DESC, month DESC, index DESC)
    datedTabs.sort((a, b) => {
      const aDate = a.parsedDate!
      const bDate = b.parsedDate!
      if (bDate.year !== aDate.year) return bDate.year - aDate.year
      if (bDate.month !== aDate.month) return bDate.month - aDate.month
      return b.tab.index - a.tab.index
    })
    
    // Prefer past/current dates over future dates
    // Find the most recent tab that is not in the future
    let fallback = datedTabs.find(st => {
      const date = st.parsedDate!
      return date.year < currentYear || (date.year === currentYear && date.month < currentMonth)
    })
    
    // If no past dates found, use the most recent date (even if future)
    if (!fallback) {
      fallback = datedTabs[0]
    }
    
    console.warn('[TabDetection] TabDetector: fallback_activated', {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      component: 'TabDetector',
      action: 'fallback_activated',
      details: {
        selectedTab: fallback.tab.title,
        selectedGid: fallback.tab.sheetId.toString(),
        confidence: fallback.parsedDate!.confidence,
        isFallback: true,
        reason: 'No tab found for current month, using most recent dated tab'
      }
    })
    
    return {
      sheetGid: fallback.tab.sheetId.toString(),
      tabName: fallback.tab.title,
      confidence: fallback.parsedDate!.confidence,
      isFallback: true,
      detectedDate: { month: fallback.parsedDate!.month, year: fallback.parsedDate!.year },
      warning: 'No tab found for current month, using most recent dated tab'
    }
  }
  
  const rightmost = scoredTabs.reduce((max, st) => 
    st.tab.index > max.tab.index ? st : max
  )
  
  console.warn('[TabDetection] TabDetector: fallback_activated', {
    timestamp: new Date().toISOString(),
    level: 'WARN',
    component: 'TabDetector',
    action: 'fallback_activated',
    details: {
      selectedTab: rightmost.tab.title,
      selectedGid: rightmost.tab.sheetId.toString(),
      confidence: 0.5,
      isFallback: true,
      reason: 'No dated tabs found, using rightmost tab'
    }
  })
  
  return {
    sheetGid: rightmost.tab.sheetId.toString(),
    tabName: rightmost.tab.title,
    confidence: 0.5,
    isFallback: true,
    warning: 'No dated tabs found, using rightmost tab'
  }
}

/**
 * Select the best tab from a list of tabs for the given month/year
 */
export function selectBestTab(
  tabs: SheetTab[],
  currentMonth: number,
  currentYear: number
): TabDetectionResult {
  const scoredTabs: ScoredTab[] = tabs.map(tab => {
    const parsedDate = parseTabName(tab.title)
    return {
      tab,
      parsedDate,
      score: scoreTab(parsedDate, currentMonth, currentYear)
    }
  })
  
  const matchingTabs = scoredTabs.filter(st => st.score > 0)
  
  if (matchingTabs.length > 0) {
    matchingTabs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.tab.index - a.tab.index
    })
    
    const best = matchingTabs[0]
    console.log('[TabDetection] TabDetector: tab_detected', {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      component: 'TabDetector',
      action: 'tab_detected',
      details: {
        selectedTab: best.tab.title,
        selectedGid: best.tab.sheetId.toString(),
        confidence: best.score,
        isFallback: false
      }
    })
    
    return {
      sheetGid: best.tab.sheetId.toString(),
      tabName: best.tab.title,
      confidence: best.score,
      isFallback: false,
      detectedDate: best.parsedDate ? { month: best.parsedDate.month, year: best.parsedDate.year } : undefined
    }
  }
  
  return selectFallbackTab(scoredTabs, currentMonth, currentYear)
}

/**
 * Detect the current month's tab from a Google Sheets spreadsheet
 * 
 * @param spreadsheetId - The spreadsheet ID
 * @param referenceDate - Optional date to determine which month's tab to find.
 *   Defaults to current UTC date. Pass the user's requested date to avoid
 *   timezone mismatches between server (UTC) and user's local time.
 */
export async function detectCurrentTab(
  spreadsheetId: string,
  referenceDate?: Date
): Promise<TabDetectionResult> {
  const date = referenceDate ?? new Date()
  const currentMonth = date.getMonth() + 1
  const currentYear = date.getFullYear()
  
  const cached = tabCache.get(spreadsheetId, currentMonth, currentYear)
  if (cached) {
    console.log('[TabDetection] TabDetector: cache_hit', {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      component: 'TabDetector',
      action: 'cache_hit',
      details: {
        spreadsheetId,
        cachedTab: cached.tabName,
        cachedGid: cached.sheetGid
      }
    })
    
    return {
      sheetGid: cached.sheetGid,
      tabName: cached.tabName,
      confidence: cached.confidence,
      isFallback: false,
      detectedDate: { month: cached.detectedMonth, year: cached.detectedYear }
    }
  }
  
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) {
    console.error('[TabDetection] TabDetector: missing API key', { spreadsheetId })
    throw new TabDetectionError(
      'GOOGLE_SHEETS_API_KEY environment variable is not set',
      'CONFIG_ERROR',
      { spreadsheetId }
    )
  }
  
  const tabs = await fetchSheetTabs(spreadsheetId, apiKey)
  
  if (tabs.length === 0) {
    throw new TabDetectionError(
      'No tabs found in spreadsheet',
      'NO_TABS_FOUND',
      { spreadsheetId }
    )
  }
  
  const result = selectBestTab(tabs, currentMonth, currentYear)
  
  if (!result.isFallback && result.detectedDate) {
    tabCache.set(spreadsheetId, {
      sheetGid: result.sheetGid,
      tabName: result.tabName,
      confidence: result.confidence,
      detectedMonth: result.detectedDate.month,
      detectedYear: result.detectedDate.year,
      timestamp: Date.now()
    })
  }
  
  return result
}
