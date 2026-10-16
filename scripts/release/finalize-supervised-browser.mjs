/** Requests the exact local harness to drain and perform its final readback.
 * No signals, network requests, Auth issuance or database mutations. */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
const runId = process.argv[2], uuid = v => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
if (process.argv.length !== 3 || !uuid(runId)) throw Error('Exact local browser run required')
const directory = `output/playwright/supervised-browser-${runId}`, receipt = JSON.parse(readFileSync(`${directory}/server-receipt.json`, 'utf8'))
const bytes = readFileSync(`${directory}/prior-row-digests.json`), baseline = JSON.parse(bytes)
if (receipt.runId !== runId || receipt.status !== 'listening' || receipt.origin !== 'http://127.0.0.1:3013'
  || receipt.target !== 'http://127.0.0.1:55321' || receipt.globalNumericalPolicy !== false || !uuid(receipt.programId)
  || baseline.runId !== runId || baseline.programId !== receipt.programId || baseline.target !== receipt.target
  || receipt.priorSnapshotSha256 !== createHash('sha256').update(bytes).digest('hex')
  || !receipt.journal.every(e => e.disposition === 'response_received')) throw Error('Exact listening run with durable baseline and confirmed journal required')
const request = { operation: 'finalize', runId, programId: receipt.programId, requestId: randomUUID() }
writeFileSync(`${directory}/finalize.json`, JSON.stringify(request), { flag: 'wx' })
console.log(JSON.stringify({ requested: true, runId, requestId: request.requestId, next: 'Read stopped receipt and run final read-only verifier; this request alone is not final verification.' }))
