console.log('[WITH-IMPORTS] Loading')

import { fetchSheetTabs } from './google-sheets-client'
import { parseTabName } from './tab-name-parser'
import { tabCache } from './tab-cache'

console.log('[WITH-IMPORTS] Value imports loaded')

import type {
  SheetTab,
  ParsedTabDate,
  ScoredTab,
  TabDetectionResult
} from './types'

console.log('[WITH-IMPORTS] Type imports loaded')

export function selectBestTab(tabs: SheetTab[], month: number, year: number): TabDetectionResult {
  console.log('[WITH-IMPORTS] selectBestTab called')
  // Use the imports to prevent tree-shaking
  const _ = { fetchSheetTabs, parseTabName, tabCache }
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

export async function detectCurrentTab(spreadsheetId: string): Promise<TabDetectionResult> {
  console.log('[WITH-IMPORTS] detectCurrentTab called')
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

console.log('[WITH-IMPORTS] Loaded, exports:', { selectBestTab: typeof selectBestTab, detectCurrentTab: typeof detectCurrentTab })
