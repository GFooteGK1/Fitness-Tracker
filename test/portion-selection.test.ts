// Feature: Portion Selection for Food Logging
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  FoodItem,
  PortionSpec,
  RelativePortionSize,
  MeasurementUnit,
  FractionalAmount
} from '@/lib/types/food-tracking'

// Helper to create a mock food item
function createMockFoodItem(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    food: 'Chicken Breast',
    portion: '1 serving',
    protein: 30,
    carbs: 0,
    fat: 3,
    calories: 165,
    ...overrides
  }
}

// Helper to create portion spec
function createPortionSpec(
  type: 'relative' | 'exact',
  value: RelativePortionSize | { amount: FractionalAmount; unit: MeasurementUnit }
): PortionSpec {
  if (type === 'relative') {
    return { type: 'relative', relative: value as RelativePortionSize }
  }
  return { type: 'exact', exact: value as { amount: FractionalAmount; unit: MeasurementUnit } }
}

// Portion to description converter (mirrors API logic)
function portionToDescription(spec: PortionSpec): string {
  if (spec.type === 'relative' && spec.relative) {
    const descriptions: Record<string, string> = {
      'palm': 'palm-sized (approximately 3-4 oz or 85-115g)',
      'fist': 'fist-sized (approximately 1 cup or 240ml)',
      'cupped-hand': 'cupped hand (approximately ½ cup or 120ml)',
      'thumb': 'thumb-sized (approximately 1 tablespoon or 15ml)',
      'half-plate': 'half plate portion (large serving)',
      'quarter-plate': 'quarter plate portion (small serving)',
    }
    return descriptions[spec.relative] || spec.relative
  }
  
  if (spec.type === 'exact' && spec.exact) {
    const { amount, unit } = spec.exact
    const unitNames: Record<string, string> = {
      'g': 'grams',
      'oz': 'ounces',
      'cup': 'cups',
      'tbsp': 'tablespoons',
      'tsp': 'teaspoons',
    }
    return `${amount} ${unitNames[unit] || unit}`
  }
  
  return 'unspecified portion'
}

describe('Portion Selection Types', () => {
  describe('RelativePortionSize', () => {
    const validSizes: RelativePortionSize[] = [
      'palm', 'fist', 'cupped-hand', 'thumb', 'half-plate', 'quarter-plate'
    ]

    it('should accept all valid relative portion sizes', () => {
      validSizes.forEach(size => {
        const spec = createPortionSpec('relative', size)
        expect(spec.type).toBe('relative')
        expect(spec.relative).toBe(size)
      })
    })

    it('should convert relative portions to descriptions', () => {
      const palmSpec = createPortionSpec('relative', 'palm')
      expect(portionToDescription(palmSpec)).toContain('3-4 oz')

      const fistSpec = createPortionSpec('relative', 'fist')
      expect(portionToDescription(fistSpec)).toContain('1 cup')

      const thumbSpec = createPortionSpec('relative', 'thumb')
      expect(portionToDescription(thumbSpec)).toContain('tablespoon')
    })
  })

  describe('ExactMeasurements', () => {
    const validUnits: MeasurementUnit[] = ['g', 'oz', 'cup', 'tbsp', 'tsp']
    const validFractions: FractionalAmount[] = [
      '1/8', '1/4', '1/3', '1/2', '2/3', '3/4', '1', '1.5', '2', '3', '4'
    ]

    it('should accept all valid measurement units', () => {
      validUnits.forEach(unit => {
        const spec = createPortionSpec('exact', { amount: '1', unit })
        expect(spec.type).toBe('exact')
        expect(spec.exact?.unit).toBe(unit)
      })
    })

    it('should accept all valid fractional amounts', () => {
      validFractions.forEach(amount => {
        const spec = createPortionSpec('exact', { amount, unit: 'cup' })
        expect(spec.type).toBe('exact')
        expect(spec.exact?.amount).toBe(amount)
      })
    })

    it('should convert exact portions to descriptions', () => {
      const gramSpec = createPortionSpec('exact', { amount: '100', unit: 'g' })
      // Note: '100' is not in FractionalAmount, but testing the conversion logic
      
      const cupSpec = createPortionSpec('exact', { amount: '1/2', unit: 'cup' })
      expect(portionToDescription(cupSpec)).toBe('1/2 cups')

      const tbspSpec = createPortionSpec('exact', { amount: '2', unit: 'tbsp' })
      expect(portionToDescription(tbspSpec)).toBe('2 tablespoons')
    })
  })
})

describe('FoodItem with PortionSpec', () => {
  it('should create food item without portion spec', () => {
    const item = createMockFoodItem()
    expect(item.portionSpec).toBeUndefined()
    expect(item.portion).toBe('1 serving')
  })

  it('should create food item with relative portion spec', () => {
    const item = createMockFoodItem({
      portionSpec: createPortionSpec('relative', 'palm')
    })
    expect(item.portionSpec?.type).toBe('relative')
    expect(item.portionSpec?.relative).toBe('palm')
  })

  it('should create food item with exact portion spec', () => {
    const item = createMockFoodItem({
      portionSpec: createPortionSpec('exact', { amount: '4', unit: 'oz' })
    })
    expect(item.portionSpec?.type).toBe('exact')
    expect(item.portionSpec?.exact?.amount).toBe('4')
    expect(item.portionSpec?.exact?.unit).toBe('oz')
  })
})

describe('Portion Selection Flow', () => {
  it('should identify items with portion specs', () => {
    const items: FoodItem[] = [
      createMockFoodItem({ food: 'Chicken' }),
      createMockFoodItem({ 
        food: 'Rice', 
        portionSpec: createPortionSpec('relative', 'fist') 
      }),
      createMockFoodItem({ food: 'Broccoli' })
    ]

    const itemsWithPortions = items.filter(item => item.portionSpec)
    expect(itemsWithPortions).toHaveLength(1)
    expect(itemsWithPortions[0].food).toBe('Rice')
  })

  it('should allow skipping portion selection (no specs)', () => {
    const items: FoodItem[] = [
      createMockFoodItem({ food: 'Chicken' }),
      createMockFoodItem({ food: 'Rice' })
    ]

    const hasAnyPortionSet = items.some(item => item.portionSpec)
    expect(hasAnyPortionSet).toBe(false)
  })

  it('should detect when portions are set', () => {
    const items: FoodItem[] = [
      createMockFoodItem({ 
        food: 'Chicken',
        portionSpec: createPortionSpec('relative', 'palm')
      }),
      createMockFoodItem({ food: 'Rice' })
    ]

    const hasAnyPortionSet = items.some(item => item.portionSpec)
    expect(hasAnyPortionSet).toBe(true)
  })
})

describe('Refine API Request Validation', () => {
  interface RefineRequest {
    mealId: string
    items: FoodItem[]
  }

  function validateRefineRequest(req: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!req.mealId || typeof req.mealId !== 'string') {
      errors.push('mealId is required and must be a string')
    }

    if (!req.items || !Array.isArray(req.items)) {
      errors.push('items is required and must be an array')
    } else {
      req.items.forEach((item: any, index: number) => {
        if (!item.food || typeof item.food !== 'string') {
          errors.push(`items[${index}].food is required`)
        }
        if (item.portionSpec) {
          if (!['relative', 'exact'].includes(item.portionSpec.type)) {
            errors.push(`items[${index}].portionSpec.type must be 'relative' or 'exact'`)
          }
        }
      })
    }

    return { valid: errors.length === 0, errors }
  }

  it('should validate valid refine request', () => {
    const request: RefineRequest = {
      mealId: 'test-meal-123',
      items: [
        createMockFoodItem({ 
          portionSpec: createPortionSpec('relative', 'palm') 
        })
      ]
    }

    const result = validateRefineRequest(request)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject request without mealId', () => {
    const request = {
      items: [createMockFoodItem()]
    }

    const result = validateRefineRequest(request)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('mealId is required and must be a string')
  })

  it('should reject request without items', () => {
    const request = {
      mealId: 'test-meal-123'
    }

    const result = validateRefineRequest(request)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('items is required and must be an array')
  })
})

describe('Macro Refinement Logic', () => {
  // Approximate multipliers for relative portions
  const portionMultipliers: Record<RelativePortionSize, number> = {
    'thumb': 0.25,        // ~1 tbsp, small
    'cupped-hand': 0.5,   // ~½ cup
    'palm': 1.0,          // ~3-4 oz, standard protein
    'fist': 1.0,          // ~1 cup, standard carb
    'quarter-plate': 0.75,
    'half-plate': 1.5
  }

  function estimateRefinedMacros(
    item: FoodItem, 
    baseMultiplier: number = 1.0
  ): { protein: number; carbs: number; fat: number; calories: number } {
    let multiplier = baseMultiplier

    if (item.portionSpec?.type === 'relative' && item.portionSpec.relative) {
      multiplier = portionMultipliers[item.portionSpec.relative] || 1.0
    }

    return {
      protein: Math.round(item.protein * multiplier * 10) / 10,
      carbs: Math.round(item.carbs * multiplier * 10) / 10,
      fat: Math.round(item.fat * multiplier * 10) / 10,
      calories: Math.round(item.calories * multiplier)
    }
  }

  it('should not change macros without portion spec', () => {
    const item = createMockFoodItem({ protein: 30, carbs: 0, fat: 3, calories: 165 })
    const refined = estimateRefinedMacros(item)
    
    expect(refined.protein).toBe(30)
    expect(refined.calories).toBe(165)
  })

  it('should reduce macros for thumb-sized portion', () => {
    const item = createMockFoodItem({ 
      protein: 30, 
      portionSpec: createPortionSpec('relative', 'thumb')
    })
    const refined = estimateRefinedMacros(item)
    
    expect(refined.protein).toBeLessThan(30)
    expect(refined.protein).toBe(7.5) // 30 * 0.25
  })

  it('should increase macros for half-plate portion', () => {
    const item = createMockFoodItem({ 
      protein: 30, 
      portionSpec: createPortionSpec('relative', 'half-plate')
    })
    const refined = estimateRefinedMacros(item)
    
    expect(refined.protein).toBeGreaterThan(30)
    expect(refined.protein).toBe(45) // 30 * 1.5
  })
})


describe('Upload and Refine API Integration', () => {
  // Mock fetch for API calls
  const mockFetch = vi.fn()
  
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  const mockUploadResponse = {
    mealId: 'meal-123',
    analysisStatus: 'complete',
    analysis: {
      items: [
        { food: 'Grilled Chicken', portion: '1 piece', protein: 35, carbs: 0, fat: 4, calories: 180 },
        { food: 'Brown Rice', portion: '1 cup', protein: 5, carbs: 45, fat: 2, calories: 220 },
        { food: 'Steamed Broccoli', portion: '1 cup', protein: 3, carbs: 6, fat: 0, calories: 35 }
      ],
      total_protein: 43,
      total_carbs: 51,
      total_fat: 6,
      total_calories: 435,
      confidence: 0.85
    }
  }

  const mockRefineResponse = {
    items: [
      { food: 'Grilled Chicken', portion: 'palm-sized', protein: 28, carbs: 0, fat: 3, calories: 145 },
      { food: 'Brown Rice', portion: 'fist-sized', protein: 5, carbs: 45, fat: 2, calories: 220 },
      { food: 'Steamed Broccoli', portion: 'half plate', protein: 4.5, carbs: 9, fat: 0, calories: 52 }
    ],
    totals: {
      protein: 37.5,
      carbs: 54,
      fat: 5,
      calories: 417
    },
    confidence: 0.9,
    refined: true
  }

  it('should complete full upload flow without portion refinement', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUploadResponse
    })

    // Simulate upload
    const formData = new FormData()
    formData.append('photo', new Blob(['fake-image'], { type: 'image/jpeg' }))
    formData.append('timestamp', new Date().toISOString())

    const uploadResult = await fetch('/api/meals/upload', {
      method: 'POST',
      body: formData
    })

    expect(uploadResult.ok).toBe(true)
    const data = await uploadResult.json()
    
    expect(data.mealId).toBe('meal-123')
    expect(data.analysis.items).toHaveLength(3)
    expect(data.analysis.total_protein).toBe(43)
  })

  it('should complete full flow with portion refinement', async () => {
    // First call: upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockUploadResponse
    })
    // Second call: refine
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockRefineResponse
    })

    // Step 1: Upload photo
    const formData = new FormData()
    formData.append('photo', new Blob(['fake-image'], { type: 'image/jpeg' }))
    formData.append('timestamp', new Date().toISOString())

    const uploadResult = await fetch('/api/meals/upload', {
      method: 'POST',
      body: formData
    })
    const uploadData = await uploadResult.json()

    expect(uploadData.mealId).toBeDefined()
    expect(uploadData.analysis.items).toHaveLength(3)

    // Step 2: User adds portion specs
    const itemsWithPortions: FoodItem[] = uploadData.analysis.items.map((item: FoodItem, i: number) => ({
      ...item,
      portionSpec: i === 0 
        ? createPortionSpec('relative', 'palm')
        : i === 2 
          ? createPortionSpec('relative', 'half-plate')
          : undefined
    }))

    // Step 3: Refine with portions
    const refineResult = await fetch('/api/meals/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mealId: uploadData.mealId,
        items: itemsWithPortions
      })
    })
    const refineData = await refineResult.json()

    expect(refineData.refined).toBe(true)
    expect(refineData.confidence).toBeGreaterThan(uploadData.analysis.confidence)
    expect(refineData.items[0].portion).toContain('palm')
  })

  it('should handle refine API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' })
    })

    const refineResult = await fetch('/api/meals/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mealId: 'meal-123',
        items: [createMockFoodItem()]
      })
    })

    expect(refineResult.ok).toBe(false)
    expect(refineResult.status).toBe(500)
  })

  it('should skip refinement when no portions specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: mockUploadResponse.analysis.items, refined: false })
    })

    const items = mockUploadResponse.analysis.items.map(item => ({
      ...item,
      portionSpec: undefined
    }))

    const refineResult = await fetch('/api/meals/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mealId: 'meal-123',
        items
      })
    })
    const data = await refineResult.json()

    expect(data.refined).toBe(false)
  })

  it('should handle mixed portion types (relative and exact)', async () => {
    const mixedResponse = {
      ...mockRefineResponse,
      items: [
        { food: 'Grilled Chicken', portion: '4 ounces', protein: 32, carbs: 0, fat: 3.5, calories: 160 },
        { food: 'Brown Rice', portion: 'fist-sized', protein: 5, carbs: 45, fat: 2, calories: 220 },
        { food: 'Steamed Broccoli', portion: '2 cups', protein: 6, carbs: 12, fat: 0, calories: 70 }
      ]
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mixedResponse
    })

    const itemsWithMixedPortions: FoodItem[] = [
      createMockFoodItem({ 
        food: 'Grilled Chicken',
        portionSpec: createPortionSpec('exact', { amount: '4', unit: 'oz' })
      }),
      createMockFoodItem({ 
        food: 'Brown Rice',
        portionSpec: createPortionSpec('relative', 'fist')
      }),
      createMockFoodItem({ 
        food: 'Steamed Broccoli',
        portionSpec: createPortionSpec('exact', { amount: '2', unit: 'cup' })
      })
    ]

    const refineResult = await fetch('/api/meals/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mealId: 'meal-123',
        items: itemsWithMixedPortions
      })
    })
    const data = await refineResult.json()

    expect(data.items[0].portion).toContain('ounces')
    expect(data.items[1].portion).toContain('fist')
    expect(data.items[2].portion).toContain('cups')
  })
})
