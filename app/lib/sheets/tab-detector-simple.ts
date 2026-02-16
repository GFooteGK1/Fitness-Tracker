/**
 * Simple tab detector for testing exports
 */

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
