import assert from 'node:assert/strict'
import http from 'node:http'
import { afterEach, test } from 'node:test'
import { createProbeServer, probeUploadPath } from './server.mjs'

const openServers = new Set()

afterEach(async () => {
  await Promise.all(
    Array.from(openServers, (server) => new Promise((resolve) => server.close(resolve))),
  )
  openServers.clear()
})

async function startServer(options) {
  const server = createProbeServer(options)
  openServers.add(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

function request({ port, method, path = probeUploadPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (incoming) => {
        incoming.resume()
        incoming.on('end', () => {
          resolve({ status: incoming.statusCode, headers: incoming.headers })
        })
      },
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

test('OPTIONS declares non-resumable support with 501 and no Upload-Limit', async () => {
  const receipts = []
  const port = await startServer({ onReceipt: (receipt) => receipts.push(receipt) })

  const response = await request({ port, method: 'OPTIONS' })

  assert.equal(response.status, 501)
  assert.equal(response.headers['upload-limit'], undefined)
  assert.match(response.headers['x-probe-request-id'], /^[0-9a-f-]{36}$/)
  assert.deepEqual(
    receipts.map(({ method, status, bytesDiscarded }) => ({ method, status, bytesDiscarded })),
    [{ method: 'OPTIONS', status: 501, bytesDiscarded: 0 }],
  )
})

test('POST discards bytes and returns only safe probe identifiers', async () => {
  const receipts = []
  const port = await startServer({ onReceipt: (receipt) => receipts.push(receipt) })
  const body = Buffer.from('disposable-photo-bytes')

  const response = await request({
    port,
    method: 'POST',
    headers: {
      authorization: 'Bearer must-not-be-logged',
      'content-type': 'image/jpeg',
      'upload-incomplete': '?0',
    },
    body,
  })

  assert.equal(response.status, 201)
  assert.match(response.headers['x-server-resource-id'], /^discarded-[0-9a-f-]{36}$/)
  assert.equal(receipts[0].bytesDiscarded, body.length)
  assert.deepEqual(receipts[0].protocolHeaders, {
    contentLength: String(body.length),
    contentType: 'image/jpeg',
    uploadComplete: null,
    uploadIncomplete: '?0',
    uploadLength: null,
    uploadOffset: null,
  })
  assert.equal(JSON.stringify(receipts).includes('must-not-be-logged'), false)
  assert.equal(JSON.stringify(receipts).includes('disposable-photo-bytes'), false)
})

test('unrelated paths and methods stay closed', async () => {
  const port = await startServer()

  assert.equal((await request({ port, method: 'POST', path: '/api/meals/upload' })).status, 404)
  const response = await request({ port, method: 'GET' })
  assert.equal(response.status, 405)
  assert.equal(response.headers.allow, 'OPTIONS, POST')
})
