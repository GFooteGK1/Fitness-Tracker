import { describe, it, expect } from 'vitest'
import {
  generateWorkoutsCsv,
  generateMealsCsv,
  generateCombinedCsv,
  transformWorkoutRows,
  transformMealRows,
  computeSummary,
  type WorkoutRow,
  type MealRow,
} from '@/app/lib/export-utils'

// --- CSV Generation Tests ---

describe('generateWorkoutsCsv', () => {
  it('should produce a header row with correct column names', () => {
    const csv = generateWorkoutsCsv([])
    expect(csv).toBe('Date,Exercise,Sets,Reps,Weight,Notes,Duration (min)')
  })

  it('should produce valid CSV rows', () => {
    const rows: WorkoutRow[] = [
      { date: '2026-04-01', exercise: 'Back Squat', sets: '5', reps: '5', weight: '225lb', notes: 'Felt good', duration: '45' },
      { date: '2026-04-02', exercise: 'Deadlift', sets: '3', reps: '3', weight: '315lb', notes: '', duration: '30' },
    ]
    const csv = generateWorkoutsCsv(rows)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-04-01,Back Squat,5,5,225lb,Felt good,45')
    expect(lines[2]).toBe('2026-04-02,Deadlift,3,3,315lb,,30')
  })

  it('should escape commas and quotes in fields', () => {
    const rows: WorkoutRow[] = [
      { date: '2026-04-01', exercise: 'Clean & Jerk', sets: '1', reps: '1', weight: '185lb', notes: 'PR attempt, felt "heavy"', duration: '20' },
    ]
    const csv = generateWorkoutsCsv(rows)
    const lines = csv.split('\n')
    // notes field should be escaped: "PR attempt, felt ""heavy"""
    expect(lines[1]).toContain('"PR attempt, felt ""heavy"""')
  })

  it('should handle newlines in data fields', () => {
    const rows: WorkoutRow[] = [
      { date: '2026-04-01', exercise: 'Workout', sets: '', reps: '', weight: '', notes: 'Line 1\nLine 2', duration: '' },
    ]
    const csv = generateWorkoutsCsv(rows)
    expect(csv).toContain('"Line 1\nLine 2"')
  })
})

describe('generateMealsCsv', () => {
  it('should produce a header row with correct column names', () => {
    const csv = generateMealsCsv([])
    expect(csv).toBe('Date,Meal Name,Calories,Protein (g),Carbs (g),Fat (g),Photo URL')
  })

  it('should produce valid CSV rows for meals', () => {
    const rows: MealRow[] = [
      { date: '2026-04-01', meal_name: 'Chicken Breast', calories: 300, protein: 45, carbs: 0, fat: 8, photo_url: '' },
      { date: '2026-04-01', meal_name: 'Rice', calories: 200, protein: 4, carbs: 44, fat: 1, photo_url: '' },
    ]
    const csv = generateMealsCsv(rows)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe('2026-04-01,Chicken Breast,300,45,0,8,')
  })
})

describe('generateCombinedCsv', () => {
  it('should include both workout and meal sections', () => {
    const workouts: WorkoutRow[] = [
      { date: '2026-04-01', exercise: 'Squat', sets: '5', reps: '5', weight: '225lb', notes: '', duration: '40' },
    ]
    const meals: MealRow[] = [
      { date: '2026-04-01', meal_name: 'Oatmeal', calories: 350, protein: 12, carbs: 55, fat: 8, photo_url: '' },
    ]
    const csv = generateCombinedCsv(workouts, meals)
    expect(csv).toContain('--- WORKOUTS ---')
    expect(csv).toContain('--- MEALS ---')
    expect(csv).toContain('Squat')
    expect(csv).toContain('Oatmeal')
  })
})

// --- Data Transformation Tests ---

describe('transformWorkoutRows', () => {
  it('should transform workouts with blocks and movements', () => {
    const workouts = [
      {
        workout_date: '2026-04-01',
        input_text: '5x5 Back Squat @ 225',
        blocks: [
          {
            block_type: 'strength',
            block_title: 'Strength',
            movements: [
              { name: 'Back Squat', sets: 5, reps: 5, weight: 225, unit: 'lb' },
            ],
          },
        ],
        notes: 'Easy day',
        total_duration_min: 45,
      },
    ]
    const rows = transformWorkoutRows(workouts)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      date: '2026-04-01',
      exercise: 'Back Squat',
      sets: '5',
      reps: '5',
      weight: '225lb',
      notes: 'Easy day',
      duration: '45',
    })
  })

  it('should handle workouts with no blocks', () => {
    const workouts = [
      {
        workout_date: '2026-04-01',
        input_text: 'Grace: 9:47 Rx',
        blocks: [],
        notes: '',
        total_duration_min: null,
      },
    ]
    const rows = transformWorkoutRows(workouts)
    expect(rows).toHaveLength(1)
    expect(rows[0].exercise).toBe('Grace: 9:47 Rx')
  })

  it('should handle blocks without movements', () => {
    const workouts = [
      {
        workout_date: '2026-04-02',
        input_text: 'AMRAP 12',
        blocks: [
          { block_type: 'amrap', block_title: 'AMRAP 12 min', rounds_completed: 8 },
        ],
        notes: '',
        total_duration_min: 12,
      },
    ]
    const rows = transformWorkoutRows(workouts)
    expect(rows).toHaveLength(1)
    expect(rows[0].exercise).toBe('AMRAP 12 min')
    expect(rows[0].reps).toBe('8')
  })
})

describe('transformMealRows', () => {
  it('should transform meals with individual food items', () => {
    const meals = [
      {
        meal_timestamp: '2026-04-01T12:00:00Z',
        items: [
          { food: 'Chicken Breast', calories: 300, protein: 45, carbs: 0, fat: 8 },
          { food: 'Brown Rice', calories: 200, protein: 4, carbs: 44, fat: 1 },
        ],
        total_protein: 49,
        total_carbs: 44,
        total_fat: 9,
        total_calories: 500,
        photo_url: 'https://example.com/photo.jpg',
      },
    ]
    const rows = transformMealRows(meals)
    expect(rows).toHaveLength(2)
    expect(rows[0].meal_name).toBe('Chicken Breast')
    expect(rows[0].protein).toBe(45)
    expect(rows[1].meal_name).toBe('Brown Rice')
    expect(rows[0].photo_url).toBe('https://example.com/photo.jpg')
  })

  it('should handle meals with no items', () => {
    const meals = [
      {
        meal_timestamp: '2026-04-01T12:00:00Z',
        items: [],
        total_protein: 40,
        total_carbs: 30,
        total_fat: 10,
        total_calories: 370,
        photo_url: '',
      },
    ]
    const rows = transformMealRows(meals)
    expect(rows).toHaveLength(1)
    expect(rows[0].meal_name).toBe('Meal')
    expect(rows[0].calories).toBe(370)
  })
})

// --- Summary Tests ---

describe('computeSummary', () => {
  it('should compute correct summary stats', () => {
    const workouts = [
      { workout_date: '2026-04-01' },
      { workout_date: '2026-04-02' },
    ]
    const meals = [
      { meal_timestamp: '2026-04-01T08:00:00Z', total_calories: 500, total_protein: 40, total_carbs: 50, total_fat: 15 },
      { meal_timestamp: '2026-04-01T12:00:00Z', total_calories: 700, total_protein: 50, total_carbs: 60, total_fat: 20 },
      { meal_timestamp: '2026-04-02T08:00:00Z', total_calories: 400, total_protein: 30, total_carbs: 40, total_fat: 10 },
    ]
    const summary = computeSummary(workouts, meals, { start: '2026-04-01', end: '2026-04-02' }, 'Test User')

    expect(summary.totalWorkouts).toBe(2)
    expect(summary.totalMeals).toBe(3)
    // Total calories: 1600, unique days: 2, avg: 800
    expect(summary.avgDailyCalories).toBe(800)
    expect(summary.totalProtein).toBe(120)
    expect(summary.totalCarbs).toBe(150)
    expect(summary.totalFat).toBe(45)
    expect(summary.userName).toBe('Test User')
  })

  it('should handle empty data', () => {
    const summary = computeSummary([], [], { start: '2026-04-01', end: '2026-04-01' }, '')
    expect(summary.totalWorkouts).toBe(0)
    expect(summary.totalMeals).toBe(0)
    expect(summary.avgDailyCalories).toBe(0)
  })
})

// --- Date Filtering Tests ---

describe('date filtering via transformations', () => {
  it('should correctly extract dates from meal timestamps', () => {
    const meals = [
      { meal_timestamp: '2026-04-01T23:59:59Z', items: [{ food: 'Late Snack', calories: 100, protein: 5, carbs: 10, fat: 3 }], photo_url: '' },
      { meal_timestamp: '2026-04-02T00:00:01Z', items: [{ food: 'Early Breakfast', calories: 300, protein: 20, carbs: 30, fat: 10 }], photo_url: '' },
    ]
    const rows = transformMealRows(meals)
    expect(rows[0].date).toBe('2026-04-01')
    expect(rows[1].date).toBe('2026-04-02')
  })

  it('should handle null/undefined timestamps gracefully', () => {
    const meals = [
      { meal_timestamp: null, items: [], total_calories: 100, total_protein: 10, total_carbs: 10, total_fat: 5, photo_url: '' },
    ]
    const rows = transformMealRows(meals)
    expect(rows[0].date).toBe('')
  })
})
