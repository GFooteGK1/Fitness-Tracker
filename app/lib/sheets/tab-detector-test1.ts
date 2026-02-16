/**
 * Test version 1 - with parseTabName import
 */

import { parseTabName } from './tab-name-parser'

export function selectBestTab(tabs: any[], month: number, year: number) {
  // Use parseTabName to ensure it's not tree-shaken
  const test = parseTabName('January 2026')
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
