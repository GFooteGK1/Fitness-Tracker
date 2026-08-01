'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { MealUploadResponse } from '@/app/lib/types/food-tracking'
import { getMealTimestamp } from '@/app/lib/timezone-utils'
import {
  parseBarcode,
  scaleNutrition,
  type FoodCatalogDraft,
} from '@/app/lib/nutrition/barcode'
import { startBarcodeDecoder } from '@/app/lib/nutrition/barcode-scanner'
import type { CommonMeal } from '@/app/lib/nutrition/fast-log'
import { fetchWithTimeout, RequestTimeoutError } from '@/app/lib/client/fetch-with-timeout'

interface FastMealLoggerProps {
  selectedDate?: Date
  onLogged?: (response: MealUploadResponse) => void
  onError?: (error: string) => void
}

const BARCODE_DECODER_ERROR_MESSAGE = 'Barcode recognition could not start. Enter the code manually.'

function waitForNextPaint(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()))
}

function requestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function manualDraft(barcodeInput = ''): FoodCatalogDraft | null {
  const barcode = barcodeInput ? parseBarcode(barcodeInput) : null
  if (barcodeInput && !barcode) return null
  return {
    name: '',
    brand: '',
    barcode: barcode?.value,
    barcodeLookupKey: barcode?.lookupKey,
    source: 'manual_label',
    sourceKey: barcode?.lookupKey || '',
    sourceRef: barcode?.value,
    servingAmount: 1,
    servingUnit: 'serving',
    servingLabel: '1 serving',
    nutritionBasis: 'per_serving',
    nutrition: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    sourceNutrition: { protein: 0, carbs: 0, fat: 0, calories: 0 },
    sourcePayload: { entry: 'manual_label' },
  }
}

export default function FastMealLogger({ selectedDate, onLogged, onError }: FastMealLoggerProps) {
  const [commonMeals, setCommonMeals] = useState<CommonMeal[]>([])
  const [loadingCommon, setLoadingCommon] = useState(true)
  const [loggingMealId, setLoggingMealId] = useState<string | null>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lookupStatus, setLookupStatus] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [draft, setDraft] = useState<FoodCatalogDraft | null>(null)
  const [servings, setServings] = useState(1)
  const [loggingFood, setLoggingFood] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerStarting, setScannerStarting] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const decoderStopRef = useRef<null | (() => void)>(null)
  const scannerActiveRef = useRef(false)
  const scannerRequestRef = useRef(0)
  const commonRequestIdsRef = useRef(new Map<string, string>())
  const foodRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void fetch('/api/meals/common?limit=4')
      .then(async response => {
        if (!response.ok) throw new Error('Common meals unavailable')
        return response.json() as Promise<{ meals?: CommonMeal[] }>
      })
      .then(result => {
        if (active) setCommonMeals(Array.isArray(result.meals) ? result.meals : [])
      })
      .catch(error => console.warn('Unable to load common meals:', error))
      .finally(() => {
        if (active) setLoadingCommon(false)
      })
    return () => {
      active = false
    }
  }, [])

  const stopScanner = useCallback(() => {
    scannerRequestRef.current += 1
    scannerActiveRef.current = false
    decoderStopRef.current?.()
    decoderStopRef.current = null
    for (const track of streamRef.current?.getTracks() || []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScannerStarting(false)
    setScannerOpen(false)
  }, [])

  useEffect(() => stopScanner, [stopScanner])

  useEffect(() => {
    foodRequestIdRef.current = null
  }, [draft, servings])

  const showError = useCallback((message: string) => {
    setLookupStatus(message)
    onError?.(message)
  }, [onError])

  const lookupBarcode = useCallback(async (code: string) => {
    const parsed = parseBarcode(code)
    if (!parsed) {
      showError('Enter a valid UPC or EAN barcode.')
      return
    }

    setLookingUp(true)
    setBarcodeInput(parsed.value)
    setLookupStatus('Looking up product…')
    setDraft(null)
    try {
      const response = await fetchWithTimeout(`/api/foods/barcode?code=${encodeURIComponent(parsed.value)}`, {}, 12_000)
      const result = await response.json()
      if (!response.ok) {
        setBarcodeInput(parsed.value)
        setLookupStatus(result.error || 'Product not found. Enter the label manually.')
        return
      }
      setBarcodeInput(result.food.barcode || parsed.value)
      setDraft(result.food)
      setServings(1)
      setLookupStatus(result.origin === 'catalog'
        ? 'Loaded your reviewed food. Confirm the serving before logging.'
        : 'Product found. Verify these values against the package label.')
    } catch (error) {
      showError(error instanceof RequestTimeoutError
        ? 'Barcode lookup timed out. Retry or enter the label manually.'
        : 'Barcode lookup failed. Retry or enter the label manually.')
    } finally {
      setLookingUp(false)
    }
  }, [showError])

  const startScanner = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setLookupStatus('Camera barcode scanning is not supported here. Enter the code manually.')
      return
    }

    const requestId = scannerRequestRef.current + 1
    scannerRequestRef.current = requestId
    scannerActiveRef.current = true
    const requestIsActive = () => (
      scannerActiveRef.current && scannerRequestRef.current === requestId
    )

    setScannerStarting(true)
    setScannerOpen(true)
    setLookupStatus('Starting camera...')
    try {
      // Render the preview before opening the permission prompt. Installed iOS
      // apps can resume more slowly than Safari after the prompt closes.
      await waitForNextPaint()
      if (!requestIsActive()) return

      const video = videoRef.current
      if (!video) {
        stopScanner()
        showError('Barcode camera preview could not start. Enter the code manually.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      if (!requestIsActive()) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      streamRef.current = stream

      const stopDecoder = await startBarcodeDecoder(stream, video, code => {
        if (!requestIsActive()) return
        setBarcodeInput(code)
        stopScanner()
        void lookupBarcode(code)
      }, () => {
        if (!requestIsActive()) return
        stopScanner()
        showError(BARCODE_DECODER_ERROR_MESSAGE)
      })
      if (!requestIsActive()) {
        stopDecoder()
        return
      }
      decoderStopRef.current = stopDecoder
      setScannerStarting(false)
      setLookupStatus('Center the barcode — upright or sideways.')
    } catch (error) {
      if (!requestIsActive()) return
      stopScanner()
      const cameraError = error instanceof DOMException ? error.name : ''
      if (cameraError === 'NotAllowedError') {
        showError('Camera permission was denied. Allow camera access in browser settings and try again.')
      } else if (cameraError === 'NotFoundError') {
        showError('No camera was found. Enter the barcode manually.')
      } else if (cameraError === 'NotReadableError') {
        showError('The camera is already in use. Close the other camera app and try again.')
      } else if (error instanceof Error && error.name === 'BarcodeDecoderError') {
        showError(BARCODE_DECODER_ERROR_MESSAGE)
      } else {
        showError('Camera access was unavailable. Enter the barcode manually.')
      }
    }
  }, [lookupBarcode, showError, stopScanner])

  const logCommonMeal = async (meal: CommonMeal) => {
    const retryRequestId = commonRequestIdsRef.current.get(meal.sourceMealId) || requestId()
    commonRequestIdsRef.current.set(meal.sourceMealId, retryRequestId)
    setLoggingMealId(meal.sourceMealId)
    try {
      const response = await fetch('/api/meals/quick-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMealId: meal.sourceMealId,
          requestId: retryRequestId,
          timestamp: getMealTimestamp(selectedDate),
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log common meal')
      commonRequestIdsRef.current.delete(meal.sourceMealId)
      onLogged?.({ mealId: result.mealId, analysisStatus: 'complete' })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to log common meal')
    } finally {
      setLoggingMealId(null)
    }
  }

  const beginManualEntry = () => {
    const nextDraft = manualDraft(barcodeInput)
    if (!nextDraft) {
      showError('Enter a valid UPC or EAN barcode, or clear it to enter a label without one.')
      return
    }
    setDraft(nextDraft)
    setServings(1)
    setLookupStatus('Enter the values printed on the nutrition label.')
  }

  const updateNutrition = (field: keyof FoodCatalogDraft['nutrition'], value: number) => {
    setDraft(current => current ? {
      ...current,
      nutrition: { ...current.nutrition, [field]: value },
    } : current)
  }

  const logReviewedFood = async () => {
    if (!draft) return
    const retryRequestId = foodRequestIdRef.current || requestId()
    foodRequestIdRef.current = retryRequestId
    setLoggingFood(true)
    try {
      const response = await fetch('/api/foods/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: retryRequestId,
          timestamp: getMealTimestamp(selectedDate),
          servings,
          food: draft,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to log product')
      foodRequestIdRef.current = null
      onLogged?.({ mealId: result.mealId, analysisStatus: 'complete' })
      setDraft(null)
      setBarcodeInput('')
      setLookupStatus('Product logged.')
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to log product')
    } finally {
      setLoggingFood(false)
    }
  }

  const scaled = draft ? scaleNutrition(draft.nutrition, servings) : null

  return (
    <div className="space-y-4">
      {(loadingCommon || commonMeals.length > 0) && (
        <section aria-labelledby="common-meals-heading" className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="mb-3">
            <h3 id="common-meals-heading" className="font-semibold text-gray-900 dark:text-gray-100">Common meals</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Copy a past meal with a fresh time. No AI analysis.</p>
          </div>
          {loadingCommon ? (
            <p className="text-sm text-gray-500">Loading recent meals…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {commonMeals.map(meal => (
                <button
                  key={meal.signature}
                  type="button"
                  onClick={() => void logCommonMeal(meal)}
                  disabled={loggingMealId !== null}
                  aria-label={`Log ${meal.title}`}
                  className="min-h-12 rounded-lg border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-blue-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="block font-medium text-gray-900 dark:text-gray-100">
                    {loggingMealId === meal.sourceMealId ? 'Logging…' : meal.title}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {Math.round(meal.totals.calories)} cal · {Math.round(meal.totals.protein)}g protein
                    {meal.timesLogged > 1 ? ` · ${meal.timesLogged} times` : ' · recent'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="barcode-heading" className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <div className="mb-3">
          <h3 id="barcode-heading" className="font-semibold text-gray-900 dark:text-gray-100">Barcode or nutrition label</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Scan a UPC/EAN or enter package values yourself.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">UPC or EAN barcode</span>
            <input
              value={barcodeInput}
              onChange={event => setBarcodeInput(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="UPC or EAN"
              className="min-h-12 w-full rounded-lg border-2 border-gray-200 bg-white px-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </label>
          <button
            type="button"
            onClick={() => void lookupBarcode(barcodeInput)}
            disabled={lookingUp || !barcodeInput.trim()}
            className="min-h-12 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {lookingUp ? 'Looking up…' : 'Look up'}
          </button>
          <button
            type="button"
            onClick={() => void startScanner()}
            disabled={scannerStarting || scannerOpen}
            className="min-h-12 rounded-lg border-2 border-blue-600 px-4 font-semibold text-blue-700 disabled:border-gray-400 disabled:text-gray-400 dark:text-blue-300"
          >
            {scannerStarting ? 'Starting...' : scannerOpen ? 'Scanning...' : 'Scan UPC'}
          </button>
        </div>

        <button
          type="button"
          onClick={beginManualEntry}
          className="mt-3 min-h-11 text-sm font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
        >
          Enter label manually
        </button>

        {scannerOpen && (
          <div className="mt-3 rounded-lg bg-black p-2">
            <div className="relative overflow-hidden rounded">
              <video ref={videoRef} aria-label="Barcode camera preview" autoPlay playsInline muted className="max-h-64 w-full object-cover" />
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-1/2 max-w-48 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]">
                <span className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-white/70" />
                <span className="absolute bottom-4 left-1/2 top-4 w-0.5 -translate-x-1/2 bg-white/70" />
              </div>
            </div>
            <button type="button" onClick={stopScanner} className="mt-2 min-h-11 w-full rounded bg-white px-3 font-medium text-gray-900">
              Cancel scan
            </button>
          </div>
        )}

        {lookupStatus && <p role="status" className="mt-3 text-sm text-gray-600 dark:text-gray-300">{lookupStatus}</p>}

        {draft && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">Review label</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {draft.source === 'open_food_facts' ? (
                  <>Data from <a href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer" className="underline">Open Food Facts</a>. Verify it against the package.</>
                ) : 'These structured values are saved for faster future logging; no label image is retained.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Product name
                <input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Brand (optional)
                <input value={draft.brand} onChange={event => setDraft({ ...draft, brand: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Serving label
                <input value={draft.servingLabel} onChange={event => setDraft({ ...draft, servingLabel: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Serving amount
                  <input type="number" min="0.001" step="0.1" value={draft.servingAmount} onChange={event => setDraft({ ...draft, servingAmount: Number(event.target.value) })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Serving unit
                  <input value={draft.servingUnit} onChange={event => setDraft({ ...draft, servingUnit: event.target.value })} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
                </label>
              </div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Servings eaten
                <input type="number" min="0.1" max="20" step="0.1" value={servings} onChange={event => setServings(Number(event.target.value))} className="mt-1 min-h-12 w-full rounded-lg border px-3 text-base dark:border-gray-600 dark:bg-gray-700" />
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nutrition per {draft.servingLabel || 'serving'}</legend>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['protein', 'carbs', 'fat', 'calories'] as const).map(field => (
                  <label key={field} className="text-xs font-medium capitalize text-gray-600 dark:text-gray-400">
                    {field}
                    <input
                      aria-label={`${field} per serving`}
                      type="number"
                      min="0"
                      step="0.1"
                      value={draft.nutrition[field]}
                      onChange={event => updateNutrition(field, Number(event.target.value))}
                      className="mt-1 min-h-12 w-full rounded-lg border px-2 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            {scaled && (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-300">
                Log total: {scaled.calories} cal · {scaled.protein}g protein · {scaled.carbs}g carbs · {scaled.fat}g fat
              </p>
            )}

            <button
              type="button"
              onClick={() => void logReviewedFood()}
              disabled={loggingFood || !draft.name.trim() || !draft.servingLabel.trim() || !draft.servingUnit.trim() || !Number.isFinite(draft.servingAmount) || draft.servingAmount <= 0 || !Number.isFinite(servings) || servings <= 0}
              className="min-h-12 w-full rounded-lg bg-green-600 px-4 font-semibold text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {loggingFood ? 'Logging…' : 'Log reviewed food'}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
