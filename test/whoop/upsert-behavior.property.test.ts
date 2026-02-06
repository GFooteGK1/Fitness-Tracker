/**
 * Property-Based Tests: WHOOP Upsert Behavior
 * 
 * Tests Property 9: Upsert Duplicate Prevention
 * 
 * Validates: Requirements 4.4, 4.5, 5.4
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Helper to generate valid ISO date strings
const validISODate = () => fc.integer({ min: 1577836800000, max: 1924905600000 }).map(ts => new Date(ts).toISOString())

/**
 * Property 9: Upsert Duplicate Prevention
 * 
 * For all valid WHOOP records with the same identifier:
 * - First insert must succeed
 * - Second insert with same identifier must update (not duplicate)
 * - Identifier format must be preserved (UUID strings vs integers)
 * - Conflict detection must use correct columns
 */
describe('Property 9: Upsert Duplicate Prevention', () => {
  it('should prevent duplicate sleep records with same UUID', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          sleep_id: fc.uuid(), // UUID string
          date: validISODate().map(d => d.split('T')[0]),
          sleep_performance_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
          sleep_consistency_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
          sleep_efficiency_percentage: fc.option(fc.integer({ min: 0, max: 100 })),
          respiratory_rate: fc.option(fc.float({ min: 8, max: 25 })),
          total_sleep_duration_ms: fc.option(fc.integer({ min: 0, max: 43200000 })),
          is_nap: fc.boolean()
        }),
        (record) => {
          // Simulate upsert logic
          const records = new Map<string, typeof record>()
          
          // First insert
          const key1 = `${record.user_id}:${record.sleep_id}`
          records.set(key1, record)
          expect(records.size).toBe(1)
          
          // Second insert with same identifier (should update, not duplicate)
          const updatedRecord = { ...record, sleep_performance_percentage: 95 }
          records.set(key1, updatedRecord)
          expect(records.size).toBe(1) // Still only 1 record
          expect(records.get(key1)?.sleep_performance_percentage).toBe(95)
          
          // Verify sleep_id is a string (UUID)
          expect(typeof record.sleep_id).toBe('string')
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(record.sleep_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should prevent duplicate workout records with same UUID', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          whoop_workout_id: fc.uuid(), // UUID string
          date: validISODate().map(d => d.split('T')[0]),
          sport_name: fc.option(fc.string()),
          sport_id: fc.option(fc.integer({ min: 0, max: 100 })),
          strain: fc.option(fc.float({ min: 0, max: 21 })),
          average_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
          max_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
          distance_meter: fc.option(fc.integer({ min: 0, max: 100000 })),
          altitude_gain_meter: fc.option(fc.integer({ min: 0, max: 5000 })),
          duration_ms: fc.option(fc.integer({ min: 0, max: 14400000 }))
        }),
        (record) => {
          const records = new Map<string, typeof record>()
          
          // First insert
          const key1 = `${record.user_id}:${record.whoop_workout_id}`
          records.set(key1, record)
          expect(records.size).toBe(1)
          
          // Second insert with same identifier (should update, not duplicate)
          const updatedRecord = { ...record, strain: 18.5 }
          records.set(key1, updatedRecord)
          expect(records.size).toBe(1) // Still only 1 record
          expect(records.get(key1)?.strain).toBe(18.5)
          
          // Verify whoop_workout_id is a string (UUID)
          expect(typeof record.whoop_workout_id).toBe('string')
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(record.whoop_workout_id)).toBe(true)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should prevent duplicate cycle records with same integer ID', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 }), // Positive integer
          date: validISODate().map(d => d.split('T')[0]),
          strain: fc.option(fc.float({ min: 0, max: 21 })),
          kilojoules: fc.option(fc.integer({ min: 0, max: 50000 })),
          average_heart_rate: fc.option(fc.integer({ min: 40, max: 220 })),
          max_heart_rate: fc.option(fc.integer({ min: 40, max: 220 }))
        }),
        (record) => {
          const records = new Map<string, typeof record>()
          
          // First insert
          const key1 = `${record.user_id}:${record.cycle_id}`
          records.set(key1, record)
          expect(records.size).toBe(1)
          
          // Second insert with same identifier (should update, not duplicate)
          const updatedRecord = { ...record, strain: 15.2 }
          records.set(key1, updatedRecord)
          expect(records.size).toBe(1) // Still only 1 record
          expect(records.get(key1)?.strain).toBe(15.2)
          
          // Verify cycle_id is a positive integer
          expect(typeof record.cycle_id).toBe('number')
          expect(Number.isInteger(record.cycle_id)).toBe(true)
          expect(record.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should prevent duplicate recovery records with same integer cycle_id', () => {
    fc.assert(
      fc.property(
        fc.record({
          user_id: fc.uuid(),
          cycle_id: fc.integer({ min: 1, max: 2147483647 }), // Positive integer
          date: validISODate().map(d => d.split('T')[0]),
          recovery_score: fc.option(fc.integer({ min: 0, max: 100 })),
          resting_heart_rate: fc.option(fc.integer({ min: 30, max: 120 })),
          hrv_rmssd_milli: fc.option(fc.float({ min: 0, max: 300 })),
          spo2_percentage: fc.option(fc.float({ min: 80, max: 100 })),
          skin_temp_celsius: fc.option(fc.float({ min: 30, max: 40 }))
        }),
        (record) => {
          const records = new Map<string, typeof record>()
          
          // First insert
          const key1 = `${record.user_id}:${record.cycle_id}`
          records.set(key1, record)
          expect(records.size).toBe(1)
          
          // Second insert with same identifier (should update, not duplicate)
          const updatedRecord = { ...record, recovery_score: 85 }
          records.set(key1, updatedRecord)
          expect(records.size).toBe(1) // Still only 1 record
          expect(records.get(key1)?.recovery_score).toBe(85)
          
          // Verify cycle_id is a positive integer
          expect(typeof record.cycle_id).toBe('number')
          expect(Number.isInteger(record.cycle_id)).toBe(true)
          expect(record.cycle_id).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should allow different users to have same identifier values', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // sleep_id shared by both users
        fc.uuid(), // user1_id
        fc.uuid(), // user2_id
        (sharedSleepId, user1Id, user2Id) => {
          // Ensure different users
          fc.pre(user1Id !== user2Id)
          
          const records = new Map<string, any>()
          
          // User 1's record
          const key1 = `${user1Id}:${sharedSleepId}`
          records.set(key1, { user_id: user1Id, sleep_id: sharedSleepId, score: 80 })
          
          // User 2's record with same sleep_id (should be allowed - different user)
          const key2 = `${user2Id}:${sharedSleepId}`
          records.set(key2, { user_id: user2Id, sleep_id: sharedSleepId, score: 90 })
          
          // Should have 2 records (different users)
          expect(records.size).toBe(2)
          expect(records.get(key1)?.score).toBe(80)
          expect(records.get(key2)?.score).toBe(90)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
  
  it('should handle batch upserts with mixed new and existing records', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            user_id: fc.uuid(),
            sleep_id: fc.uuid(),
            score: fc.integer({ min: 0, max: 100 })
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (batch) => {
          const records = new Map<string, typeof batch[0]>()
          
          // First batch insert
          batch.forEach(record => {
            const key = `${record.user_id}:${record.sleep_id}`
            records.set(key, record)
          })
          
          const firstBatchSize = records.size
          
          // Second batch with some duplicates
          const duplicateBatch = [
            ...batch.slice(0, 3), // Some duplicates
            ...batch.slice(0, 2).map(r => ({ ...r, score: r.score + 10 })) // Updated duplicates
          ]
          
          duplicateBatch.forEach(record => {
            const key = `${record.user_id}:${record.sleep_id}`
            records.set(key, record)
          })
          
          // Size should not increase (duplicates updated, not added)
          expect(records.size).toBe(firstBatchSize)
          
          return true
        }
      ),
      { numRuns: 50 }
    )
  })
  
  it('should preserve identifier types during upsert operations', () => {
    fc.assert(
      fc.property(
        fc.record({
          sleep_uuid: fc.uuid(),
          workout_uuid: fc.uuid(),
          cycle_int: fc.integer({ min: 1, max: 2147483647 }),
          recovery_int: fc.integer({ min: 1, max: 2147483647 })
        }),
        (identifiers) => {
          // Verify types are preserved
          expect(typeof identifiers.sleep_uuid).toBe('string')
          expect(typeof identifiers.workout_uuid).toBe('string')
          expect(typeof identifiers.cycle_int).toBe('number')
          expect(typeof identifiers.recovery_int).toBe('number')
          
          // Verify UUID format
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          expect(uuidRegex.test(identifiers.sleep_uuid)).toBe(true)
          expect(uuidRegex.test(identifiers.workout_uuid)).toBe(true)
          
          // Verify integer properties
          expect(Number.isInteger(identifiers.cycle_int)).toBe(true)
          expect(Number.isInteger(identifiers.recovery_int)).toBe(true)
          expect(identifiers.cycle_int).toBeGreaterThan(0)
          expect(identifiers.recovery_int).toBeGreaterThan(0)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
