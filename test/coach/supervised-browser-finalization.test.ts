import { describe, expect, it } from 'vitest'
import { createServer, request as httpRequest } from 'node:http'
import { once } from 'node:events'
import { localFinalization, LocalRequestDrain } from '../../scripts/release/supervised-browser-finalization'
const runId = '11111111-1111-4111-8111-111111111111', programId = '22222222-2222-4222-8222-222222222222'
const request = { operation: 'finalize', runId, programId, requestId: '33333333-3333-4333-8333-333333333333' }
describe('local qualification finalization marker', () => {
  it('binds one explicit finalization to the exact run and fixture', () => {
    expect(localFinalization(request, runId, programId)).toEqual(request)
    for (const bad of [null, [], {}, { ...request, runId: programId }, { ...request, programId: runId },
      { ...request, operation: 'reset' }, { ...request, requestId: 'unbounded' }, { ...request, target: 'hosted' }]) {
      expect(localFinalization(bad, runId, programId)).toBeNull()
    }
  })
  it('waits for admitted async work even after its client disconnected and server sockets closed', async () => {
    const drain = new LocalRequestDrain()
    let settle!: () => void, admitted!: () => void, handled = false, finalized = false
    const work = new Promise<void>(resolve => { settle = resolve })
    const admission = new Promise<void>(resolve => { admitted = resolve })
    const server = createServer(async (_req, res) => {
      const release = drain.admit()!
      admitted()
      try { await work; handled = true; res.end('done') } finally { release() }
    })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const port = (server.address() as { port: number }).port
    const client = httpRequest({ hostname: '127.0.0.1', port, method: 'GET' })
    client.on('error', () => {})
    client.end()
    try {
      await admission
      // Disconnect intentionally emits ECONNRESET before close; it is expected.
      const clientClosed = new Promise<void>(resolve => client.once('close', resolve)); client.destroy(); await clientClosed
      const drained = drain.begin().then(() => { finalized = true })
      expect(drain.admit()).toBeNull()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      expect(handled).toBe(false); expect(finalized).toBe(false)
      settle(); await drained
      expect(handled).toBe(true); expect(finalized).toBe(true)
    } finally { settle(); client.destroy(); server.close() }
  })
})
