/**
 * Test version 2 - with all imports
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

export function selectBestTab(tabs: any[], month: number, year: number) {
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

export async function detectCurrentTab(spreadsheetId: string) {
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}
