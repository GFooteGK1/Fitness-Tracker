import type { MacroTotals } from '@/app/lib/types/food-tracking'

export type FoodDataSource = 'open_food_facts' | 'manual_label'
export type NutritionBasis = 'per_serving' | 'per_100g'

export interface ParsedBarcode {
  value: string
  lookupKey: string
}

export interface FoodCatalogDraft {
  catalogEntryId?: string
  name: string
  brand: string
  barcode?: string
  barcodeLookupKey?: string
  source: FoodDataSource
  sourceKey: string
  sourceRef?: string
  servingAmount: number
  servingUnit: string
  servingLabel: string
  nutritionBasis: NutritionBasis
  nutrition: MacroTotals
  sourceNutrition: MacroTotals
  sourcePayload: Record<string, unknown>
}

function validGtinCheckDigit(value: string): boolean {
  if (!/^\d+$/.test(value) || value.length < 2) return false
  const digits = [...value].map(Number)
  const checkDigit = digits.pop()
  if (checkDigit === undefined) return false

  let sum = 0
  let weight = 3
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight
    weight = weight === 3 ? 1 : 3
  }

  return (10 - (sum % 10)) % 10 === checkDigit
}

function validUpceCheckDigit(value: string): boolean {
  const normalized = value.length === 7 ? `0${value}` : value
  if (!/^[01]\d{7}$/.test(normalized)) return false

  const numberSystem = normalized[0]
  const compressed = normalized.slice(1, 7)
  const checkDigit = normalized[7]
  const lastDigit = compressed[5]
  let manufacturer: string
  let product: string

  if (['0', '1', '2'].includes(lastDigit)) {
    manufacturer = `${compressed.slice(0, 2)}${lastDigit}00`
    product = `00${compressed.slice(2, 5)}`
  } else if (lastDigit === '3') {
    manufacturer = `${compressed.slice(0, 3)}00`
    product = `000${compressed.slice(3, 5)}`
  } else if (lastDigit === '4') {
    manufacturer = `${compressed.slice(0, 4)}0`
    product = `0000${compressed[4]}`
  } else {
    manufacturer = compressed.slice(0, 5)
    product = `0000${lastDigit}`
  }

  return validGtinCheckDigit(`${numberSystem}${manufacturer}${product}${checkDigit}`)
}

function openFoodFactsLookupKey(value: string): string {
  const significant = value.replace(/^0+/, '') || '0'
  if (significant.length <= 7) return significant.padStart(8, '0')
  if (significant.length >= 9 && significant.length <= 12) return significant.padStart(13, '0')
  return value
}

export function parseBarcode(input: string): ParsedBarcode | null {
  const rawValue = input.trim().replace(/[\s-]+/g, '')
  // Recover a manually omitted leading zero only when the resulting UPC-A
  // still passes its checksum.
  const value = /^\d{11}$/.test(rawValue) ? `0${rawValue}` : rawValue
  if (!/^\d+$/.test(value) || /^0+$/.test(value) || ![7, 8, 12, 13, 14].includes(value.length)) {
    return null
  }

  // Open Food Facts treats seven-digit UPC-E values as a compact code with a
  // missing leading zero. UPC-E must be expanded before checking its digit;
  // eight-digit input can also be a normal EAN-8 code.
  const hasValidCheckDigit = value.length === 7
    ? validUpceCheckDigit(value)
    : validGtinCheckDigit(value) || (value.length === 8 && validUpceCheckDigit(value))
  if (!hasValidCheckDigit) return null

  return { value, lookupKey: openFoodFactsLookupKey(value) }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function nutritionFrom(nutriments: Record<string, unknown>, suffix: 'serving' | '100g'): MacroTotals | null {
  const protein = nonNegativeNumber(nutriments[`proteins_${suffix}`])
  const carbs = nonNegativeNumber(nutriments[`carbohydrates_${suffix}`])
  const fat = nonNegativeNumber(nutriments[`fat_${suffix}`])
  const calories = nonNegativeNumber(nutriments[`energy-kcal_${suffix}`])
  if (protein === null || carbs === null || fat === null || calories === null) return null
  return { protein, carbs, fat, calories }
}

function servingDetails(product: Record<string, unknown>): {
  amount: number
  unit: string
  label: string
} | null {
  const label = text(product.serving_size)
  const normalizedAmount = nonNegativeNumber(product.serving_quantity)
  const normalizedUnit = text(product.serving_quantity_unit)
  if (normalizedAmount !== null && normalizedAmount > 0 && normalizedUnit) {
    return {
      amount: normalizedAmount,
      unit: normalizedUnit,
      label: label || `${normalizedAmount} ${normalizedUnit}`,
    }
  }

  const match = label.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/)
  if (!match) return label ? { amount: 1, unit: 'serving', label } : null
  return {
    amount: Number(match[1]),
    unit: match[2] || 'serving',
    label,
  }
}

/** Normalizes the small v3 product projection used by our server adapter. */
export function normalizeOpenFoodFactsProduct(raw: unknown, requestedBarcode: string): FoodCatalogDraft | null {
  const root = record(raw)
  const product = record(root?.product)
  if (!product) return null

  const name = text(product.product_name)
  const nutriments = record(product.nutriments)
  if (!name || !nutriments) return null

  const returnedBarcode = parseBarcode(text(product.code)) || parseBarcode(requestedBarcode)
  if (!returnedBarcode) return null

  const serving = servingDetails(product)
  const servingNutrition = serving ? nutritionFrom(nutriments, 'serving') : null
  const per100gNutrition = nutritionFrom(nutriments, '100g')
  const nutrition = servingNutrition || per100gNutrition
  if (!nutrition) return null

  const nutritionBasis: NutritionBasis = servingNutrition ? 'per_serving' : 'per_100g'
  const servingAmount = servingNutrition && serving ? serving.amount : 100
  const servingUnit = servingNutrition && serving ? serving.unit : 'g'
  const servingLabel = servingNutrition && serving ? serving.label : '100 g'
  const brand = text(product.brands)

  return {
    name,
    brand,
    barcode: returnedBarcode.value,
    barcodeLookupKey: returnedBarcode.lookupKey,
    source: 'open_food_facts',
    sourceKey: returnedBarcode.lookupKey,
    sourceRef: returnedBarcode.value,
    servingAmount,
    servingUnit,
    servingLabel,
    nutritionBasis,
    nutrition,
    sourceNutrition: { ...nutrition },
    sourcePayload: {
      providerSchema: 'open_food_facts_v3',
      code: returnedBarcode.value,
      nutritionDataPer: text(product.nutrition_data_per) || undefined,
    },
  }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

export function scaleNutrition(nutrition: MacroTotals, servings: number): MacroTotals {
  return {
    protein: rounded(nutrition.protein * servings),
    carbs: rounded(nutrition.carbs * servings),
    fat: rounded(nutrition.fat * servings),
    calories: rounded(nutrition.calories * servings),
  }
}
