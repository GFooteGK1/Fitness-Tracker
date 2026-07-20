/**
 * Unit tests for the Supabase puller's pure helpers (no network).
 */
import { describe, it, expect } from 'vitest'
import {
  isHttpUrl,
  mediaTypeFromPath,
  mealRowToTruth,
  deriveStoragePath,
  type MealRow,
} from '../../scripts/eval/pull-supabase'

describe('isHttpUrl', () => {
  it('detects http/https', () => {
    expect(isHttpUrl('https://x.supabase.co/a.jpg')).toBe(true)
    expect(isHttpUrl('http://x/a.jpg')).toBe(true)
    expect(isHttpUrl('meals/u1/a.jpg')).toBe(false)
  })
})

describe('mediaTypeFromPath', () => {
  it('maps extensions and ignores query strings', () => {
    expect(mediaTypeFromPath('a.png')).toBe('image/png')
    expect(mediaTypeFromPath('a.webp')).toBe('image/webp')
    expect(mediaTypeFromPath('a.gif')).toBe('image/gif')
    expect(mediaTypeFromPath('a.jpg?token=xyz')).toBe('image/jpeg')
    expect(mediaTypeFromPath('a.jpeg')).toBe('image/jpeg')
    expect(mediaTypeFromPath('nofsomethingelse')).toBe('image/jpeg')
  })
})

describe('mealRowToTruth', () => {
  it('coerces string DECIMALs to numbers', () => {
    const row: MealRow = {
      id: 'm1',
      user_id: 'u1',
      photo_url: 'x.jpg',
      total_protein: '30.5',
      total_carbs: '40',
      total_fat: '10.2',
      total_calories: '410',
    }
    expect(mealRowToTruth(row)).toEqual({ protein: 30.5, carbs: 40, fat: 10.2, calories: 410 })
  })
})

describe('deriveStoragePath', () => {
  it('builds meals/<user>/<file> from a signed URL, dropping query params', () => {
    expect(deriveStoragePath('https://x.supabase.co/storage/v1/object/sign/meal-photos/abc.jpg?token=zzz', 'u1')).toBe(
      'meals/u1/abc.jpg'
    )
  })
})
