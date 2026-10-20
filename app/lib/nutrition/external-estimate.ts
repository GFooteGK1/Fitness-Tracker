import { createHash } from 'node:crypto'

/** External model output is untrusted data. No model, database or network calls. */
export class ExternalEstimateError extends Error {
  constructor(message = 'Invalid external estimate.', readonly status = 422) { super(message) }
}
export const EXTERNAL_ESTIMATE_VERSION = 1
export const EXTERNAL_ESTIMATE_MAX_BYTES = 64 * 1024
// Matches prepared SQL and native EstimateHandoffLimits.receiptBytes.
// Receipt includes the items in both originalEstimate and the draft record.
export const EXTERNAL_ESTIMATE_RECEIPT_MAX_BYTES = 128 * 1024
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const hash = /^[a-f0-9]{64}$/
const keys = ['protein', 'carbs', 'fat', 'calories'] as const
export interface CaptureEnvelope { requestId: string; capturedAt: string; contentHash: string }
export interface ExternalFood { food: string; portion: string; protein: number; carbs: number; fat: number; calories: number }
export interface ExternalEstimate {
  schemaVersion: 1; capture: CaptureEnvelope
  estimate: { items: ExternalFood[]; totals: Record<typeof keys[number], number>; estimatedAt: string; model: string }
}
function fail(): never { throw new ExternalEstimateError() }
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
function exact(v: unknown, names: string[]) {
  const o = record(v)
  if (Object.keys(o).sort().join(',') !== [...names].sort().join(',')) fail()
  return o
}
function text(v: unknown, maximum: number): string {
  if (typeof v !== 'string' || !v.trim() || v.includes('\0') || Buffer.byteLength(v, 'utf8') > maximum
    || Array.from(v).some(c => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff)) fail()
  return v
}
function timestamp(v: unknown): string {
  const s = text(v, 30)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s)) fail()
  const d = new Date(s)
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 19) !== s.slice(0, 19)) fail()
  return d.toISOString()
}
/** Strict JSON only, including duplicate decoded keys. Never extract from prose. */
export function strictEstimateJson(raw: string): unknown {
  if (Buffer.byteLength(raw, 'utf8') > EXTERNAL_ESTIMATE_MAX_BYTES) fail()
  let result: unknown
  try { result = JSON.parse(raw) } catch { return fail() }
  let i = 0
  const whitespace = () => { while (/\s/.test(raw[i] ?? '') && i < raw.length) i++ }
  const string = (): string => {
    const start = i++
    while (i < raw.length) {
      if (raw[i] === '\\') { i += 2; continue }
      if (raw[i++] === '"') return JSON.parse(raw.slice(start, i))
    }
    return fail()
  }
  const value = (depth: number): void => {
    if (depth > 12) fail()
    whitespace()
    if (raw[i] === '{') {
      i++; whitespace(); const seen = new Set<string>()
      while (raw[i] !== '}') {
        const key = string()
        if (seen.has(key)) fail()
        seen.add(key); whitespace(); i++; value(depth + 1); whitespace()
        if (raw[i] !== ',') break
        i++; whitespace()
      }
      i++; return
    }
    if (raw[i] === '[') {
      i++; whitespace()
      while (raw[i] !== ']') {
        value(depth + 1); whitespace()
        if (raw[i] !== ',') break
        i++
      }
      i++; return
    }
    if (raw[i] === '"') { string(); return }
    while (i < raw.length && !/[\s,\]}]/.test(raw[i])) i++
  }
  value(0)
  return result
}
function mills(v: unknown, maximum: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > maximum
    || v !== Math.round(v * 1000) / 1000) fail()
  return Math.round(v * 1000)
}
export function validateExternalEstimate(raw: unknown): ExternalEstimate {
  const root = exact(raw, ['schemaVersion', 'capture', 'estimate'])
  if (root.schemaVersion !== 1) fail()
  const c = exact(root.capture, ['requestId', 'capturedAt', 'contentHash'])
  if (typeof c.requestId !== 'string' || !uuid.test(c.requestId) || typeof c.contentHash !== 'string' || !hash.test(c.contentHash)) fail()
  const capture = { requestId: c.requestId, contentHash: c.contentHash, capturedAt: timestamp(c.capturedAt) }
  const e = exact(root.estimate, ['items', 'totals', 'estimatedAt', 'model'])
  if (!Array.isArray(e.items) || !e.items.length || e.items.length > 20) fail()
  const sums = { protein: 0, carbs: 0, fat: 0, calories: 0 }
  const itemLimits = { protein: 500, carbs: 1000, fat: 500, calories: 10000 }
  const totalLimits = { protein: 1000, carbs: 2000, fat: 1000, calories: 20000 }
  const items = e.items.map(v => {
    const item = exact(v, ['food', 'portion', ...keys])
    const numbers = Object.fromEntries(keys.map(k => { const n = mills(item[k], itemLimits[k]); sums[k] += n; return [k, n / 1000] }))
    return { food: text(item.food, 256), portion: text(item.portion, 128), ...numbers } as ExternalFood
  })
  const totals = exact(e.totals, [...keys])
  for (const k of keys) if (mills(totals[k], totalLimits[k]) !== sums[k]) fail()
  return { schemaVersion: 1, capture, estimate: { items, totals: Object.fromEntries(keys.map(k => [k, sums[k] / 1000])) as ExternalEstimate['estimate']['totals'],
    estimatedAt: timestamp(e.estimatedAt), model: text(e.model, 128) } }
}
export function parseExternalImport(raw: string): ExternalEstimate {
  const root = exact(strictEstimateJson(raw), ['schemaVersion', 'capture', 'estimateJSON'])
  if (typeof root.estimateJSON !== 'string') fail()
  return validateExternalEstimate({ schemaVersion: root.schemaVersion, capture: root.capture, estimate: strictEstimateJson(root.estimateJSON) })
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  if (v !== null && typeof v === 'object') return '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => JSON.stringify(k) + ':' + canonical(x)).join(',') + '}'
  return JSON.stringify(v)
}
export const externalEstimateFingerprint = (v: ExternalEstimate) => createHash('sha256').update(canonical(v)).digest('hex')
