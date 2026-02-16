console.log('[NO-IMPORTS] Loading')

export function selectBestTab(tabs: any[], month: number, year: number) {
  console.log('[NO-IMPORTS] selectBestTab called')
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

export async function detectCurrentTab(spreadsheetId: string) {
  console.log('[NO-IMPORTS] detectCurrentTab called')
  return {
    sheetGid: '1000',
    tabName: 'Test',
    confidence: 1.0,
    isFallback: false
  }
}

console.log('[NO-IMPORTS] Loaded')
