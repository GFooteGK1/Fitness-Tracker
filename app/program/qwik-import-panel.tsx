'use client'

import React, { useRef, useState } from 'react'

import {
  QWIK_MAX_RAW_BYTES,
  parseQwikExport,
  qwikImportForPersistence,
  type QwikImportPreview
} from '@/app/lib/coach/qwik-import'

interface QwikImportPanelProps {
  onImported: () => void | Promise<void>
}

interface PendingImportRequest {
  body: string
  idempotencyKey: string
}

export function QwikImportPanel({ onImported }: QwikImportPanelProps) {
  const [preview, setPreview] = useState<QwikImportPreview | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const pendingRequest = useRef<PendingImportRequest | null>(null)

  const selectFile = async (file: File | null) => {
    pendingRequest.current = null
    setPreview(null)
    setError(null)
    setStatus(null)
    if (!file) return
    if (file.size > QWIK_MAX_RAW_BYTES) {
      setError(`Qwik JSON must be ${formatBytes(QWIK_MAX_RAW_BYTES)} or smaller.`)
      return
    }

    setParsing(true)
    try {
      const rawText = await file.text()
      const parsed = await parseQwikExport(rawText, {
        sourceFileName: file.name,
        ingestedAt: new Date().toISOString()
      })
      setPreview(parsed)
      if (!parsed.canSaveForReview) {
        setError('This file cannot be saved. Correct the listed errors and export it again.')
      }
    } catch {
      setError('Coach could not read this file. Choose a Qwik JSON export and try again.')
    } finally {
      setParsing(false)
    }
  }

  const save = async () => {
    if (!preview?.canSaveForReview) return
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      if (!pendingRequest.current) {
        const idempotencyKey = createIdempotencyKey('qwik-import')
        pendingRequest.current = {
          idempotencyKey,
          body: JSON.stringify({
            action: 'save_for_review',
            idempotencyKey,
            normalizedImport: qwikImportForPersistence(preview)
          })
        }
      }
      const response = await fetch('/api/coach/imports/qwik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: pendingRequest.current.body
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(body, 'Unable to save Qwik import'))

      const disposition = importDisposition(body)
      pendingRequest.current = null
      setPreview(null)
      setInputKey(current => current + 1)
      setStatus(disposition === 'duplicate'
        ? 'This export is already available in Coach data.'
        : 'Qwik measurements saved for your review. Confirm movement mappings below.')
      await onImported()
    } catch (caught) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. '
        : ''
      setError(`${offline}${caught instanceof Error ? caught.message : 'Unable to save Qwik import'} The normalized preview is still here; retry uses the same save key.`)
    } finally {
      setSaving(false)
    }
  }

  const clear = () => {
    pendingRequest.current = null
    setPreview(null)
    setError(null)
    setStatus(null)
    setInputKey(current => current + 1)
  }

  return (
    <article className="rounded-xl border border-dashed border-blue-300 bg-blue-50/60 p-4 dark:border-blue-800 dark:bg-blue-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-gray-950 dark:text-white">Import a Qwik export</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">
            Choose a Qwik JSON 1.10 export. Coach parses and previews it on this device. Only normalized measurements and a source hash are sent.
          </p>
        </div>
        <label className="block text-sm font-semibold text-blue-900 dark:text-blue-200">
          Choose Qwik JSON
          <input
            key={inputKey}
            type="file"
            accept="application/json,.json"
            disabled={parsing || saving}
            onChange={event => void selectFile(event.target.files?.[0] ?? null)}
            className="mt-1 block min-h-11 w-full max-w-sm text-base text-gray-700 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700 dark:text-gray-200"
          />
        </label>
      </div>

      {parsing && <p role="status" className="mt-3 text-sm text-blue-900 dark:text-blue-200">Reading and normalizing on this device…</p>}
      {status && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{status}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</p>}

      {preview && <QwikPreview preview={preview} saving={saving} retrying={pendingRequest.current !== null} onSave={() => void save()} onClear={clear} />}
    </article>
  )
}

function QwikPreview({
  preview,
  saving,
  retrying,
  onSave,
  onClear
}: {
  preview: QwikImportPreview
  saving: boolean
  retrying: boolean
  onSave: () => void
  onClear: () => void
}) {
  const errors = preview.issues.filter(issue => issue.severity === 'error')
  const warnings = preview.issues.filter(issue => issue.severity === 'warning')
  const mappingCounts = preview.sets.reduce((counts, set) => ({
    ...counts,
    [set.movementMapping.status]: counts[set.movementMapping.status] + 1
  }), { mapped: 0, ambiguous: 0, unmapped: 0 })
  const velocityCount = preview.sets.reduce((total, set) => total + set.reps.length, 0)

  return (
    <section aria-labelledby="qwik-preview-title" className="mt-4 rounded-xl border border-blue-200 bg-white p-4 dark:border-blue-900 dark:bg-gray-900">
      <h4 id="qwik-preview-title" className="font-bold text-gray-950 dark:text-white">Normalized preview</h4>
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{preview.sourceFileName} · {preview.sets.length} sets · {velocityCount} velocity readings</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {mappingCounts.mapped} mapped · {mappingCounts.ambiguous} need a choice · {mappingCounts.unmapped} unsupported · hash {preview.sourceFileHash.slice(0, 12)}…
      </p>
      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
        Original JSON and bar-path arrays stay on this device and are not uploaded. Keep the original export as your source copy.
      </p>

      {preview.sets.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {preview.sets.slice(0, 20).map(set => (
            <div key={set.sourceSetId} className="rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-gray-100">{set.sourceExercise}</p>
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{label(set.movementMapping.status)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{set.normalizedLoad.value} kg · {set.reps.length} reps · {dateLabel(set.observedAt)}</p>
            </div>
          ))}
        </div>
      )}
      {preview.sets.length > 20 && <p className="mt-2 text-xs text-gray-500">Showing the first 20 of {preview.sets.length} sets.</p>}

      {preview.issues.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">File checks: {errors.length} errors · {warnings.length} warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {preview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}:${issue.path}:${index}`}>{issue.message}</li>)}
          </ul>
          {preview.issues.length > 8 && <p className="mt-1 text-xs text-gray-500">Showing the first 8 of {preview.issues.length} checks.</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!preview.canSaveForReview || saving} onClick={onSave} className={primaryButton}>
          {saving ? 'Saving…' : retrying ? 'Retry same import' : 'Save for review'}
        </button>
        <button type="button" disabled={saving} onClick={onClear} className={secondaryButton}>Choose another file</button>
      </div>
    </section>
  )
}

const primaryButton = 'min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const secondaryButton = 'min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:border-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

function importDisposition(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const result = 'result' in body && typeof body.result === 'object' && body.result !== null && !Array.isArray(body.result)
    ? body.result
    : null
  return result && 'disposition' in result && typeof result.disposition === 'string'
    ? result.disposition
    : null
}

function formatBytes(value: number): string { return `${Math.round(value / 1_000_000)} MB` }
function label(value: string): string { return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function dateLabel(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) }
function createIdempotencyKey(prefix: string): string { return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}` }
function errorMessage(body: unknown, fallback: string): string { return typeof body === 'object' && body !== null && !Array.isArray(body) && 'error' in body && typeof body.error === 'string' ? body.error : fallback }
