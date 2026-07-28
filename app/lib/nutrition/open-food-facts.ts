import { normalizeOpenFoodFactsProduct, parseBarcode, type FoodCatalogDraft } from './barcode'

const OPEN_FOOD_FACTS_BASE_URL = 'https://world.openfoodfacts.org'
const OPEN_FOOD_FACTS_TIMEOUT_MS = 6000
const OPEN_FOOD_FACTS_MAX_BYTES = 256 * 1024
const OPEN_FOOD_FACTS_FIELDS = [
  'code',
  'product_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutrition_data_per',
  'nutriments',
].join(',')

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > OPEN_FOOD_FACTS_MAX_BYTES) {
    throw new Error('Open Food Facts response was too large')
  }

  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteCount = 0
  let result = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    byteCount += value.byteLength
    if (byteCount > OPEN_FOOD_FACTS_MAX_BYTES) {
      await reader.cancel()
      throw new Error('Open Food Facts response was too large')
    }
    result += decoder.decode(value, { stream: true })
  }

  return result + decoder.decode()
}

/**
 * Reads a fixed Open Food Facts v3 product endpoint. The host and field list
 * are application-owned; callers can supply only a validated barcode.
 */
export async function lookupOpenFoodFactsProduct(
  barcode: string,
  fetchImpl: typeof fetch = fetch
): Promise<FoodCatalogDraft | null> {
  const parsedBarcode = parseBarcode(barcode)
  if (!parsedBarcode) throw new Error('Invalid UPC or EAN barcode')

  const url = new URL(`/api/v3/product/${parsedBarcode.value}`, OPEN_FOOD_FACTS_BASE_URL)
  url.searchParams.set('product_type', 'food')
  url.searchParams.set('fields', OPEN_FOOD_FACTS_FIELDS)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPEN_FOOD_FACTS_TIMEOUT_MS)

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SociusFit/0.1.0 (https://github.com/GFooteGK1/Fitness-Tracker)',
      },
    })

    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Open Food Facts request failed (${response.status})`)
    }

    const body = await readBoundedText(response)
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      throw new Error('Open Food Facts returned invalid JSON')
    }
    return normalizeOpenFoodFactsProduct(raw, parsedBarcode.value)
  } finally {
    clearTimeout(timeoutId)
  }
}
