import { vi } from 'vitest'
/** RPC boundary fixture; executable transaction/replay tests live in test/database. */
export function loggingRpc(id = 'saved-1', onSave?: (record: any, blocks: any[]) => void, saveError: unknown = null) {
  return vi.fn(async (name: string, args: any) => {
    if (name === 'begin_logging_request') return { data: {id:'receipt-1',claimed:true,status:'processing'}, error:null }
    if (name === 'finish_logging_request') return { data: args.p_response, error:null }
    if (name === 'save_logged_activity') {
      onSave?.(args.p_record,args.p_blocks)
      return {data:saveError ? null : id, error:saveError}
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
}
