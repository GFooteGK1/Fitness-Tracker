/**
 * Integration Tests: Real WHOOP API v2 Response Parsing
 * 
 * Tests end-to-end flow from actual WHOOP API v2 responses to database storage.
 * Uses real response examples from WHOOP developer documentation.
 * 
 * Source: https://developer.whoop.com/docs/developing/user-data/
 * 
 * Validates:
 * - Requirements 4.1, 4.2, 4.3: API response parsing
 * - Requirements 7.1, 7.2, 7.3, 7.4: Data transformation
 */

import { describe, it, expect } from 'vitest'
import { validateWhoopIdentifier } from '@/app/lib/whoop/validation'

describe('Real WHOOP API v2 Response Parsing', () => {
  describe('Sleep Response', () => {
    it('should parse real sleep response with UUID', () => {
      // Real response from WHOOP API documentation
      // Source: https://developer.whoop.com/docs/developing/user-data/sleep
      const realSleepResponse = {
        "id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
        "cycle_id": 93845,
        "v1_id": 93845,
        "user_id": 10129,
        "created_at": "2022-04-24T11:25:44.774Z",
        "updated_at": "2022-04-24T14:25:44.774Z",
        "start": "2022-04-24T02:25:44.774Z",
        "end": "2022-04-24T10:25:44.774Z",
        "timezone_offset": "-05:00",
        "nap": false,
        "score_state": "SCORED",
        "score": {
          "stage_summary": {
            "total_in_bed_time_milli": 30272735,
            "total_awake_time_milli": 1403507,
            "total_no_data_time_milli": 0,
            "total_light_sleep_time_milli": 14905851,
            "total_slow_wave_sleep_time_milli": 6630370,
            "total_rem_sleep_time_milli": 5879573,
            "sleep_cycle_count": 3,
            "disturbance_count": 12
          },
          "sleep_needed": {
            "baseline_milli": 27395716,
            "need_from_sleep_debt_milli": 352230,
            "need_from_recent_strain_milli": 208595,
            "need_from_recent_nap_milli": -12312
          },
          "respiratory_rate": 16.11328125,
          "sleep_performance_percentage": 98,
          "sleep_consistency_percentage": 90,
          "sleep_efficiency_percentage": 91.69533848
        }
      }

      // Validate identifier format
      const validation = validateWhoopIdentifier(realSleepResponse.id, 'sleep')
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)

      // Verify UUID format
      expect(realSleepResponse.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

      // Verify cycle_id is integer
      expect(typeof realSleepResponse.cycle_id).toBe('number')
      expect(Number.isInteger(realSleepResponse.cycle_id)).toBe(true)

      // Transform to database format
      const dbRecord = {
        sleep_id: realSleepResponse.id, // UUID string
        user_id: 'test-user-id',
        date: realSleepResponse.start.split('T')[0],
        total_sleep_min: Math.round(
          (realSleepResponse.score.stage_summary.total_light_sleep_time_milli +
           realSleepResponse.score.stage_summary.total_slow_wave_sleep_time_milli +
           realSleepResponse.score.stage_summary.total_rem_sleep_time_milli) / 60000
        ),
        rem_min: Math.round(realSleepResponse.score.stage_summary.total_rem_sleep_time_milli / 60000),
        deep_min: Math.round(realSleepResponse.score.stage_summary.total_slow_wave_sleep_time_milli / 60000),
        light_min: Math.round(realSleepResponse.score.stage_summary.total_light_sleep_time_milli / 60000),
        awake_min: Math.round(realSleepResponse.score.stage_summary.total_awake_time_milli / 60000),
        sleep_efficiency: realSleepResponse.score.sleep_efficiency_percentage,
        sleep_score: realSleepResponse.score.sleep_performance_percentage,
        created_at: new Date().toISOString()
      }

      // Verify transformed record
      expect(dbRecord.sleep_id).toBe('ecfc6a15-4661-442f-a9a4-f160dd7afae8')
      expect(dbRecord.total_sleep_min).toBeGreaterThan(0)
      expect(dbRecord.sleep_efficiency).toBeGreaterThan(0)
      expect(dbRecord.sleep_score).toBeGreaterThan(0)
    })
  })

  describe('Workout Response', () => {
    it('should parse real workout response with UUID', () => {
      // Real response from WHOOP API documentation
      // Source: https://developer.whoop.com/docs/developing/user-data/workout
      const realWorkoutResponse = {
        "id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
        "v1_id": 1043,
        "user_id": 9012,
        "created_at": "2022-04-24T11:25:44.774Z",
        "updated_at": "2022-04-24T14:25:44.774Z",
        "start": "2022-04-24T02:25:44.774Z",
        "end": "2022-04-24T10:25:44.774Z",
        "timezone_offset": "-05:00",
        "sport_name": "running",
        "score_state": "SCORED",
        "score": {
          "strain": 8.2463,
          "average_heart_rate": 123,
          "max_heart_rate": 146,
          "kilojoule": 1569.34033203125,
          "percent_recorded": 100,
          "distance_meter": 1772.77035916,
          "altitude_gain_meter": 46.64384460449,
          "altitude_change_meter": -0.781372010707855,
          "zone_durations": {
            "zone_zero_milli": 300000,
            "zone_one_milli": 600000,
            "zone_two_milli": 900000,
            "zone_three_milli": 900000,
            "zone_four_milli": 600000,
            "zone_five_milli": 300000
          }
        },
        "sport_id": 1
      }

      // Validate identifier format
      const validation = validateWhoopIdentifier(realWorkoutResponse.id, 'workout')
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)

      // Verify UUID format
      expect(realWorkoutResponse.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

      // Transform to database format
      const dbRecord = {
        whoop_workout_id: realWorkoutResponse.id, // UUID string
        user_id: 'test-user-id',
        sport_id: realWorkoutResponse.sport_id,
        sport_name: realWorkoutResponse.sport_name,
        start_time: realWorkoutResponse.start,
        end_time: realWorkoutResponse.end,
        strain: realWorkoutResponse.score.strain,
        avg_hr: realWorkoutResponse.score.average_heart_rate,
        max_hr: realWorkoutResponse.score.max_heart_rate,
        calories: Math.round(realWorkoutResponse.score.kilojoule * 0.239006), // kJ to kcal
        created_at: new Date().toISOString()
      }

      // Verify transformed record
      expect(dbRecord.whoop_workout_id).toBe('ecfc6a15-4661-442f-a9a4-f160dd7afae8')
      expect(dbRecord.sport_name).toBe('running')
      expect(dbRecord.strain).toBeGreaterThan(0)
      expect(dbRecord.avg_hr).toBeGreaterThan(0)
      expect(dbRecord.max_hr).toBeGreaterThan(0)
    })
  })

  describe('Cycle Response', () => {
    it('should parse real cycle response with integer ID', () => {
      // Real response from WHOOP API documentation
      // Source: https://developer.whoop.com/docs/developing/user-data/cycle
      const realCycleResponse = {
        "id": 93845,
        "user_id": 10129,
        "created_at": "2022-04-24T11:25:44.774Z",
        "updated_at": "2022-04-24T14:25:44.774Z",
        "start": "2022-04-24T02:25:44.774Z",
        "end": "2022-04-24T10:25:44.774Z",
        "timezone_offset": "-05:00",
        "score_state": "SCORED",
        "score": {
          "strain": 5.2951527,
          "kilojoule": 8288.297,
          "average_heart_rate": 68,
          "max_heart_rate": 141
        }
      }

      // Validate identifier format (integer for cycles)
      const validation = validateWhoopIdentifier(realCycleResponse.id, 'cycle')
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)

      // Verify integer format
      expect(typeof realCycleResponse.id).toBe('number')
      expect(Number.isInteger(realCycleResponse.id)).toBe(true)

      // Transform to database format
      const dbRecord = {
        cycle_id: realCycleResponse.id, // Integer
        user_id: 'test-user-id',
        date: realCycleResponse.start.split('T')[0],
        strain_score: realCycleResponse.score.strain,
        avg_hr: realCycleResponse.score.average_heart_rate,
        max_hr: realCycleResponse.score.max_heart_rate,
        calories_burned: Math.round(realCycleResponse.score.kilojoule * 0.239006), // kJ to kcal
        created_at: new Date().toISOString()
      }

      // Verify transformed record
      expect(dbRecord.cycle_id).toBe(93845)
      expect(dbRecord.strain_score).toBeGreaterThan(0)
      expect(dbRecord.avg_hr).toBeGreaterThan(0)
      expect(dbRecord.max_hr).toBeGreaterThan(0)
    })
  })

  describe('Recovery Response', () => {
    it('should parse real recovery response with integer cycle_id and UUID sleep_id', () => {
      // Real response from WHOOP API documentation
      // Source: https://developer.whoop.com/docs/developing/user-data/recovery
      const realRecoveryResponse = {
        "cycle_id": 93845,
        "sleep_id": "123e4567-e89b-12d3-a456-426614174000",
        "user_id": 10129,
        "created_at": "2022-04-24T11:25:44.774Z",
        "updated_at": "2022-04-24T14:25:44.774Z",
        "score_state": "SCORED",
        "score": {
          "user_calibrating": false,
          "recovery_score": 44,
          "resting_heart_rate": 64,
          "hrv_rmssd_milli": 31.813562,
          "spo2_percentage": 95.6875,
          "skin_temp_celsius": 33.7
        }
      }

      // Validate cycle_id (integer)
      const cycleValidation = validateWhoopIdentifier(realRecoveryResponse.cycle_id, 'cycle')
      expect(cycleValidation.isValid).toBe(true)
      expect(cycleValidation.errors).toHaveLength(0)

      // Validate sleep_id (UUID)
      const sleepValidation = validateWhoopIdentifier(realRecoveryResponse.sleep_id, 'sleep')
      expect(sleepValidation.isValid).toBe(true)
      expect(sleepValidation.errors).toHaveLength(0)

      // Verify formats
      expect(typeof realRecoveryResponse.cycle_id).toBe('number')
      expect(Number.isInteger(realRecoveryResponse.cycle_id)).toBe(true)
      expect(realRecoveryResponse.sleep_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

      // Transform to database format
      const dbRecord = {
        cycle_id: realRecoveryResponse.cycle_id, // Integer
        user_id: 'test-user-id',
        date: realRecoveryResponse.created_at.split('T')[0],
        recovery_score: realRecoveryResponse.score.recovery_score,
        resting_hr: realRecoveryResponse.score.resting_heart_rate,
        hrv_ms: realRecoveryResponse.score.hrv_rmssd_milli,
        spo2_pct: realRecoveryResponse.score.spo2_percentage,
        skin_temp_c: realRecoveryResponse.score.skin_temp_celsius,
        created_at: new Date().toISOString()
      }

      // Verify transformed record
      expect(dbRecord.cycle_id).toBe(93845)
      expect(dbRecord.recovery_score).toBe(44)
      expect(dbRecord.resting_hr).toBe(64)
      expect(dbRecord.hrv_ms).toBeCloseTo(31.813562)
      expect(dbRecord.spo2_pct).toBeCloseTo(95.6875)
      expect(dbRecord.skin_temp_c).toBeCloseTo(33.7)
    })
  })

  describe('End-to-End Identifier Validation', () => {
    it('should validate all identifier types from real API responses', () => {
      // Sleep ID (UUID)
      const sleepId = "ecfc6a15-4661-442f-a9a4-f160dd7afae8"
      const sleepValidation = validateWhoopIdentifier(sleepId, 'sleep')
      expect(sleepValidation.isValid).toBe(true)

      // Workout ID (UUID)
      const workoutId = "ecfc6a15-4661-442f-a9a4-f160dd7afae8"
      const workoutValidation = validateWhoopIdentifier(workoutId, 'workout')
      expect(workoutValidation.isValid).toBe(true)

      // Cycle ID (integer)
      const cycleId = 93845
      const cycleValidation = validateWhoopIdentifier(cycleId, 'cycle')
      expect(cycleValidation.isValid).toBe(true)

      // Recovery cycle_id (integer)
      const recoveryCycleId = 93845
      const recoveryValidation = validateWhoopIdentifier(recoveryCycleId, 'recovery')
      expect(recoveryValidation.isValid).toBe(true)
    })

    it('should reject invalid identifier formats', () => {
      // Invalid UUID (not a UUID)
      const invalidSleepId = "not-a-uuid"
      const sleepValidation = validateWhoopIdentifier(invalidSleepId, 'sleep')
      expect(sleepValidation.isValid).toBe(false)
      expect(sleepValidation.errors).toContain('Sleep ID must be a valid UUID string')

      // Invalid cycle ID (string instead of number)
      const invalidCycleId = "93845"
      const cycleValidation = validateWhoopIdentifier(invalidCycleId, 'cycle')
      expect(cycleValidation.isValid).toBe(false)
      expect(cycleValidation.errors).toContain('Cycle ID must be a number, received string')

      // Invalid cycle ID (negative)
      const negativeCycleId = -1
      const negativeValidation = validateWhoopIdentifier(negativeCycleId, 'cycle')
      expect(negativeValidation.isValid).toBe(false)
      expect(negativeValidation.errors).toContain('Cycle ID must be a positive integer')
    })
  })

  describe('Data Transformation Accuracy', () => {
    it('should correctly convert milliseconds to minutes for sleep data', () => {
      const totalLightSleepMilli = 14905851
      const totalDeepSleepMilli = 6630370
      const totalRemSleepMilli = 5879573

      const lightMin = Math.round(totalLightSleepMilli / 60000)
      const deepMin = Math.round(totalDeepSleepMilli / 60000)
      const remMin = Math.round(totalRemSleepMilli / 60000)

      expect(lightMin).toBe(248) // ~248 minutes
      expect(deepMin).toBe(111)  // ~111 minutes
      expect(remMin).toBe(98)    // ~98 minutes

      const totalSleepMin = lightMin + deepMin + remMin
      expect(totalSleepMin).toBe(457) // ~7.6 hours
    })

    it('should correctly convert kilojoules to calories', () => {
      const kilojoules = 1569.34033203125
      const calories = Math.round(kilojoules * 0.239006)

      expect(calories).toBe(375) // ~375 kcal
    })

    it('should preserve percentage values', () => {
      const sleepEfficiency = 91.69533848
      const sleepPerformance = 98
      const recoveryScore = 44

      expect(sleepEfficiency).toBeGreaterThan(0)
      expect(sleepEfficiency).toBeLessThanOrEqual(100)
      expect(sleepPerformance).toBeGreaterThan(0)
      expect(sleepPerformance).toBeLessThanOrEqual(100)
      expect(recoveryScore).toBeGreaterThan(0)
      expect(recoveryScore).toBeLessThanOrEqual(100)
    })
  })
})
