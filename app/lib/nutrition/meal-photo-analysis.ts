import { complete } from '@/app/lib/llm/client'
import { extractJson } from '@/app/lib/llm/json'
import { calculateTotalMacros } from '@/app/lib/macro-validation'
import type { FoodItem } from '@/app/lib/types/food-tracking'

const MAX_ITEMS = 20
const MAX_TEXT_LENGTH = 200
const MAX_NOTES_LENGTH = 1000

const ITEM_BOUNDS = {
  protein: 200,
  carbs: 300,
  fat: 150,
  calories: 2000,
} as const

const TOTAL_BOUNDS = {
  total_protein: 500,
  total_carbs: 1000,
  total_fat: 300,
  total_calories: 5000,
} as const

export const MEAL_PHOTO_ANALYSIS_PROMPT = `Analyze this food photo and return JSON only:
{
  "items": [
    {
      "food": "specific food name",
      "portion": "estimated portion with units",
      "protein": 0,
      "carbs": 0,
      "fat": 0,
      "calories": 0
    }
  ],
  "total_protein": 0,
  "total_carbs": 0,
  "total_fat": 0,
  "total_calories": 0,
  "confidence": 0.8,
  "notes": ""
}

Identify only visible food. Use finite non-negative numbers. Per item, protein
must be at most 200g, carbs 300g, fat 150g, and calories 2000. Confidence must
be between 0 and 1. Return no markdown or explanatory text outside the JSON.`

export interface MealPhotoAnalysis {
  items: FoodItem[]
  total_protein: number
  total_carbs: number
  total_fat: number
  total_calories: number
  confidence: number
  notes: string
}

export type MealPhotoMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/gif'

export class MealPhotoAnalysisError extends Error {
  readonly code: 'invalid_json' | 'invalid_schema'

  constructor(code: 'invalid_json' | 'invalid_schema', message: string) {
    super(message)
    this.name = 'MealPhotoAnalysisError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(
  value: unknown,
  field: string,
  maximumLength = MAX_TEXT_LENGTH
): string {
  if (typeof value !== 'string') {
    throw new MealPhotoAnalysisError('invalid_schema', `${field} must be a string`)
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    throw new MealPhotoAnalysisError('invalid_schema', `${field} is out of bounds`)
  }
  return trimmed
}

function boundedNumber(
  value: unknown,
  field: string,
  maximum: number
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new MealPhotoAnalysisError('invalid_schema', `${field} is out of bounds`)
  }
  return value
}

function parseFoodItem(value: unknown, index: number): FoodItem {
  if (!isRecord(value)) {
    throw new MealPhotoAnalysisError('invalid_schema', `items[${index}] must be an object`)
  }

  return {
    food: boundedString(value.food, `items[${index}].food`),
    portion: boundedString(value.portion, `items[${index}].portion`),
    protein: boundedNumber(value.protein, `items[${index}].protein`, ITEM_BOUNDS.protein),
    carbs: boundedNumber(value.carbs, `items[${index}].carbs`, ITEM_BOUNDS.carbs),
    fat: boundedNumber(value.fat, `items[${index}].fat`, ITEM_BOUNDS.fat),
    calories: boundedNumber(value.calories, `items[${index}].calories`, ITEM_BOUNDS.calories),
  }
}

/**
 * Parse and strictly validate untrusted vision-model output.
 *
 * The model-supplied totals are validated but never trusted as canonical.
 * Persisted totals are always recomputed from the individually validated items.
 */
export function parseMealPhotoAnalysis(text: string): MealPhotoAnalysis {
  const parsed = extractJson<unknown>(text)
  if (!isRecord(parsed)) {
    throw new MealPhotoAnalysisError('invalid_json', 'Response did not contain a JSON object')
  }

  if (
    !Array.isArray(parsed.items) ||
    parsed.items.length === 0 ||
    parsed.items.length > MAX_ITEMS
  ) {
    throw new MealPhotoAnalysisError('invalid_schema', 'items is out of bounds')
  }

  const items = parsed.items.map(parseFoodItem)

  for (const [field, maximum] of Object.entries(TOTAL_BOUNDS)) {
    boundedNumber(parsed[field], field, maximum)
  }

  const confidence = boundedNumber(parsed.confidence, 'confidence', 1)
  let notes = ''
  if (parsed.notes !== undefined) {
    if (typeof parsed.notes !== 'string' || parsed.notes.length > MAX_NOTES_LENGTH) {
      throw new MealPhotoAnalysisError('invalid_schema', 'notes is out of bounds')
    }
    notes = parsed.notes.trim()
  }

  const totals = calculateTotalMacros(items)
  boundedNumber(totals.protein, 'calculated total_protein', TOTAL_BOUNDS.total_protein)
  boundedNumber(totals.carbs, 'calculated total_carbs', TOTAL_BOUNDS.total_carbs)
  boundedNumber(totals.fat, 'calculated total_fat', TOTAL_BOUNDS.total_fat)
  boundedNumber(totals.calories, 'calculated total_calories', TOTAL_BOUNDS.total_calories)

  return {
    items,
    total_protein: totals.protein,
    total_carbs: totals.carbs,
    total_fat: totals.fat,
    total_calories: totals.calories,
    confidence,
    notes,
  }
}

export async function analyzeMealPhoto(input: {
  base64Image: string
  mediaType: MealPhotoMediaType
}): Promise<MealPhotoAnalysis> {
  const llmResult = await complete({
    purpose: 'vision',
    maxTokens: 1024,
    temperature: 0,
    reasoningEffort: 'low',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          mediaType: input.mediaType,
          base64: input.base64Image,
        },
        { type: 'text', text: MEAL_PHOTO_ANALYSIS_PROMPT },
      ],
    }],
  })

  return parseMealPhotoAnalysis(llmResult.text)
}
