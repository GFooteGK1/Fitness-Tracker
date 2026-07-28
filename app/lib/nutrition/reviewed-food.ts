import type { MacroTotals } from '@/app/lib/types/food-tracking'
import {
  parseBarcode,
  type FoodCatalogDraft,
  type FoodDataSource,
  type NutritionBasis,
} from './barcode'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ReviewedFoodRequest {
  requestId: string
  timestamp: string
  servings: number
  food: FoodCatalogDraft
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function boundedText(value: unknown, maxLength: number, required = true): string | null {
  if (typeof value !== 'string') return required ? null : ''
  const normalized = value.trim()
  if ((required && !normalized) || normalized.length > maxLength) return null
  return normalized
}

function boundedNumber(value: unknown, max: number, positive = false): number | null {
  const parsed = typeof value === 'number' ? value : NaN
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (positive && parsed <= 0)) return null
  return parsed
}

function macros(value: unknown): MacroTotals | null {
  const candidate = object(value)
  if (!candidate) return null
  const protein = boundedNumber(candidate.protein, 500)
  const carbs = boundedNumber(candidate.carbs, 1000)
  const fat = boundedNumber(candidate.fat, 300)
  const calories = boundedNumber(candidate.calories, 5000)
  if (protein === null || carbs === null || fat === null || calories === null) return null
  return { protein, carbs, fat, calories }
}

export function parseReviewedFoodRequest(raw: unknown): ReviewedFoodRequest | null {
  const root = object(raw)
  const food = object(root?.food)
  if (!root || !food) return null

  const requestId = boundedText(root.requestId, 36)
  const timestamp = boundedText(root.timestamp, 40)
  const servings = boundedNumber(root.servings, 20, true)
  const name = boundedText(food.name, 160)
  const brand = boundedText(food.brand, 160, false)
  const source = food.source as FoodDataSource
  const servingAmount = boundedNumber(food.servingAmount, 100000, true)
  const servingUnit = boundedText(food.servingUnit, 24)
  const servingLabel = boundedText(food.servingLabel, 120)
  const nutritionBasis = food.nutritionBasis as NutritionBasis
  const nutrition = macros(food.nutrition)
  const sourceNutrition = macros(food.sourceNutrition) || nutrition
  const sourcePayload = object(food.sourcePayload) || {}

  if (!requestId || !UUID_PATTERN.test(requestId) || !timestamp || !Number.isFinite(Date.parse(timestamp)) ||
    servings === null || !name || brand === null || !['open_food_facts', 'manual_label'].includes(source) ||
    servingAmount === null || !servingUnit || !servingLabel ||
    !['per_serving', 'per_100g'].includes(nutritionBasis) || !nutrition || !sourceNutrition) {
    return null
  }

  if (JSON.stringify(sourcePayload).length > 32768) return null

  const barcode = typeof food.barcode === 'string' && food.barcode.trim()
    ? parseBarcode(food.barcode)
    : null
  if (food.barcode && !barcode) return null
  if (source === 'open_food_facts' && !barcode) return null

  const suppliedSourceKey = boundedText(food.sourceKey, 160, false)
  const sourceKey = source === 'open_food_facts'
    ? barcode!.lookupKey
    : suppliedSourceKey || barcode?.lookupKey || `manual:${requestId}`
  const sourceRef = boundedText(food.sourceRef, 200, false) || barcode?.value

  return {
    requestId,
    timestamp,
    servings,
    food: {
      catalogEntryId: typeof food.catalogEntryId === 'string' && UUID_PATTERN.test(food.catalogEntryId)
        ? food.catalogEntryId
        : undefined,
      name,
      brand,
      barcode: barcode?.value,
      barcodeLookupKey: barcode?.lookupKey,
      source,
      sourceKey,
      sourceRef,
      servingAmount,
      servingUnit,
      servingLabel,
      nutritionBasis,
      nutrition,
      sourceNutrition,
      sourcePayload,
    },
  }
}

function changed(left: number, right: number): boolean {
  return Math.abs(left - right) > 0.01
}

export function buildFoodCorrections(source: FoodCatalogDraft, reviewed: FoodCatalogDraft): Record<string, unknown> {
  const corrections: Record<string, unknown> = {}
  for (const key of ['protein', 'carbs', 'fat', 'calories'] as const) {
    if (changed(source.nutrition[key], reviewed.nutrition[key])) {
      corrections[key] = { from: source.nutrition[key], to: reviewed.nutrition[key] }
    }
  }
  if (source.name !== reviewed.name) corrections.name = { from: source.name, to: reviewed.name }
  if (source.brand !== reviewed.brand) corrections.brand = { from: source.brand, to: reviewed.brand }
  if (source.servingLabel !== reviewed.servingLabel) {
    corrections.servingLabel = { from: source.servingLabel, to: reviewed.servingLabel }
  }
  if (changed(source.servingAmount, reviewed.servingAmount)) {
    corrections.servingAmount = { from: source.servingAmount, to: reviewed.servingAmount }
  }
  if (source.servingUnit !== reviewed.servingUnit) {
    corrections.servingUnit = { from: source.servingUnit, to: reviewed.servingUnit }
  }
  if (source.nutritionBasis !== reviewed.nutritionBasis) {
    corrections.nutritionBasis = { from: source.nutritionBasis, to: reviewed.nutritionBasis }
  }
  return corrections
}
