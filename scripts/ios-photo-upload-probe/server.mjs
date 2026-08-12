import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const probeUploadPath = '/probe/photo'

function protocolHeaders(headers) {
  return {
    contentLength: headers['content-length'] ?? null,
    contentType: headers['content-type'] ?? null,
    uploadComplete: headers['upload-complete'] ?? null,
    uploadIncomplete: headers['upload-incomplete'] ?? null,
    uploadLength: headers['upload-length'] ?? null,
    uploadOffset: headers['upload-offset'] ?? null,
  }
}

function sendEmpty(response, statusCode, headers = {}) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-length': '0',
    ...headers,
  })
  response.end()
}

export function createProbeRequestHandler({
  onReceipt = () => {},
  maximumBytes = 100 * 1024 * 1024,
} = {}) {
  return (request, response) => {
    const requestID = randomUUID()
    const requestURL = new URL(request.url ?? '/', 'http://127.0.0.1')

    if (requestURL.pathname !== probeUploadPath) {
      sendEmpty(response, 404)
      return
    }

    if (request.method === 'OPTIONS') {
      const receipt = {
        requestID,
        method: 'OPTIONS',
        path: requestURL.pathname,
        status: 501,
        protocolHeaders: protocolHeaders(request.headers),
        bytesDiscarded: 0,
      }
      onReceipt(receipt)
      sendEmpty(response, 501, { 'x-probe-request-id': requestID })
      return
    }

    if (request.method !== 'POST') {
      sendEmpty(response, 405, { allow: 'OPTIONS, POST' })
      return
    }

    let bytesDiscarded = 0
    let rejected = false

    request.on('data', (chunk) => {
      bytesDiscarded += chunk.length
      if (!rejected && bytesDiscarded > maximumBytes) {
        rejected = true
        sendEmpty(response, 413, { 'x-probe-request-id': requestID })
        request.destroy()
      }
    })

    request.on('end', () => {
      if (rejected) return

      const receipt = {
        requestID,
        method: 'POST',
        path: requestURL.pathname,
        status: 201,
        protocolHeaders: protocolHeaders(request.headers),
        bytesDiscarded,
      }
      onReceipt(receipt)
      sendEmpty(response, 201, {
        'x-probe-request-id': requestID,
        'x-server-resource-id': `discarded-${requestID}`,
      })
    })
  }
}

export function createProbeServer(options) {
  return http.createServer(createProbeRequestHandler(options))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number.parseInt(process.env.IOS_PHOTO_PROBE_PORT ?? '8787', 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('IOS_PHOTO_PROBE_PORT must be an integer from 1 through 65535')
  }

  const server = createProbeServer({
    onReceipt(receipt) {
      process.stdout.write(`${JSON.stringify(receipt)}\n`)
    },
  })

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `OPTIONS 501 probe listening on http://127.0.0.1:${port}${probeUploadPath}\n`,
    )
  })
}
