console.log('[TYPES-ONLY] Loading')

import type {
  SheetTab,
  ParsedTabDate,
  ScoredTab,
  TabDetectionResult
} from './types'

console.log('[TYPES-ONLY] Types imported')

export function selectBestTab(tabs: SheetTab[], month: number, year: number): TabDetectionResult {
  console.log('[TYPES-ONLY] selectBestTab called')
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

export async function detectCurrentTab(spreadsheetId: string): Promise<TabDetectionResult> {
  console.log('[TYPES-ONLY] detectCurrentTab called')
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

console.log('[TYPES-ONLY] Loaded')
