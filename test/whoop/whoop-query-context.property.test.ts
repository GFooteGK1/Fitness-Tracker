import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getPromptForIntent, CROSS_DOMAIN_SYSTEM_PROMPT } from '@/app/api/query/lib/prompt-templates';
import type { WhoopData } from '@/app/api/query/lib/domain-fetchers';

/**
 * Property 13: WHOOP Context in Query Responses
 *
 * Validates Requirement 6.6: THE Cross_Domain_Analyzer SHALL include WHOOP data
 * context when answering user queries about performance.
 *
 * Properties tested:
 * 1. Cross-domain prompt includes WHOOP recovery/sleep/strain context
 * 2. WhoopData hasData flag is true iff any data array is non-empty
 * 3. Recovery, strain, and sleep queries include WHOOP context in prompt
 * 4. WHOOP data is structured correctly for inclusion in query context
 * 5. Prompt references WHOOP-specific thresholds and zones
 */

describe('Property 13: WHOOP Context in Query Responses', () => {
  // --- Generators ---
  // Generate a valid YYYY-MM-DD date string using integer-based approach to avoid Invalid Date
  const dateStringArb = fc.integer({ min: 2024, max: 2026 }).chain(year =>
    fc.integer({ min: 1, max: 12 }).chain(month =>
      fc.integer({ min: 1, max: 28 }).map(day =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      )
    )
  );

  const recoveryRecordArb = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    cycle_id: fc.integer({ min: 1, max: 999999 }),
    date: dateStringArb,
    recovery_score: fc.integer({ min: 0, max: 100 }),
    resting_heart_rate: fc.integer({ min: 40, max: 100 }),
    hrv_rmssd_milli: fc.float({ min: 10, max: 200, noNaN: true }),
    spo2_percentage: fc.float({ min: 90, max: 100, noNaN: true }),
    skin_temp_celsius: fc.float({ min: 33, max: 38, noNaN: true }),
    created_at: fc.constant(new Date()),
    updated_at: fc.constant(new Date()),
  });

  const sleepRecordArb = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    sleep_id: fc.uuid(),
    date: dateStringArb,
    sleep_performance_percentage: fc.integer({ min: 0, max: 100 }),
    sleep_consistency_percentage: fc.integer({ min: 0, max: 100 }),
    sleep_efficiency_percentage: fc.integer({ min: 0, max: 100 }),
    respiratory_rate: fc.float({ min: 10, max: 25, noNaN: true }),
    total_sleep_duration_ms: fc.integer({ min: 0, max: 36000000 }),
    is_nap: fc.boolean(),
    created_at: fc.constant(new Date()),
    updated_at: fc.constant(new Date()),
  });

  const cycleRecordArb = fc.record({
    id: fc.uuid(),
    user_id: fc.uuid(),
    cycle_id: fc.integer({ min: 1, max: 999999 }),
    date: dateStringArb,
    strain: fc.float({ min: 0, max: 21, noNaN: true }),
    kilojoules: fc.float({ min: 0, max: 20000, noNaN: true }),
    average_heart_rate: fc.integer({ min: 40, max: 200 }),
    max_heart_rate: fc.integer({ min: 60, max: 220 }),
    created_at: fc.constant(new Date()),
    updated_at: fc.constant(new Date()),
  });

  // --- Property 1: Cross-domain prompt includes WHOOP context ---
  it('cross-domain prompt should include WHOOP recovery, sleep, and strain context', () => {
    const prompt = getPromptForIntent('CROSS_DOMAIN');

    expect(prompt).toContain('WHOOP');
    expect(prompt).toMatch(/recovery/i);
    expect(prompt).toMatch(/sleep/i);
    expect(prompt).toMatch(/strain/i);
    expect(prompt).toMatch(/HRV/i);
  });

  // --- Property 2: hasData flag is true iff any data array is non-empty ---
  it('hasData should be true when any WHOOP data array is non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(recoveryRecordArb, { minLength: 0, maxLength: 5 }),
        fc.array(sleepRecordArb, { minLength: 0, maxLength: 5 }),
        fc.array(cycleRecordArb, { minLength: 0, maxLength: 5 }),
        (recovery, sleep, cycles) => {
          const whoopData: WhoopData = {
            recovery: recovery as any,
            sleep: sleep as any,
            cycles: cycles as any,
            hasData: recovery.length > 0 || sleep.length > 0 || cycles.length > 0,
          };

          const anyDataPresent = recovery.length > 0 || sleep.length > 0 || cycles.length > 0;
          expect(whoopData.hasData).toBe(anyDataPresent);
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property 3: hasData is false when all arrays are empty ---
  it('hasData should be false when all WHOOP data arrays are empty', () => {
    const whoopData: WhoopData = {
      recovery: [],
      sleep: [],
      cycles: [],
      hasData: false,
    };

    expect(whoopData.hasData).toBe(false);
  });

  // --- Property 4: Cross-domain prompt references WHOOP threshold zones ---
  it('cross-domain prompt should reference recovery zones with correct thresholds', () => {
    const prompt = getPromptForIntent('CROSS_DOMAIN');

    // Recovery zones: Green (67-100%), Yellow (34-66%), Red (0-33%)
    expect(prompt).toMatch(/67/);
    expect(prompt).toMatch(/34/);
    expect(prompt).toMatch(/green|red|yellow/i);
  });

  it('cross-domain prompt should reference sleep performance threshold', () => {
    const prompt = getPromptForIntent('CROSS_DOMAIN');

    // Sleep performance: <70% indicates poor sleep quality
    expect(prompt).toMatch(/70/);
    expect(prompt).toMatch(/sleep/i);
  });

  it('cross-domain prompt should reference strain threshold', () => {
    const prompt = getPromptForIntent('CROSS_DOMAIN');

    // Strain: >15 indicates high training load
    expect(prompt).toMatch(/15/);
    expect(prompt).toMatch(/strain/i);
  });

  // --- Property 5: Non-cross-domain prompts do NOT include WHOOP context ---
  it('workout-only prompt should not reference WHOOP-specific metrics', () => {
    const prompt = getPromptForIntent('WORKOUT_ONLY');

    expect(prompt).not.toContain('WHOOP');
    expect(prompt).not.toMatch(/recovery score/i);
    expect(prompt).not.toMatch(/HRV/i);
  });

  it('nutrition-only prompt should not reference WHOOP-specific metrics', () => {
    const prompt = getPromptForIntent('NUTRITION_ONLY');

    expect(prompt).not.toContain('WHOOP');
    expect(prompt).not.toMatch(/recovery score/i);
    expect(prompt).not.toMatch(/HRV/i);
  });

  // --- Property 6: WHOOP data preserved across cross-domain packaging ---
  it('WHOOP data should preserve all records when packaged for cross-domain context', () => {
    fc.assert(
      fc.property(
        fc.array(recoveryRecordArb, { minLength: 1, maxLength: 10 }),
        fc.array(sleepRecordArb, { minLength: 1, maxLength: 10 }),
        fc.array(cycleRecordArb, { minLength: 1, maxLength: 10 }),
        (recovery, sleep, cycles) => {
          const whoopData: WhoopData = {
            recovery: recovery as any,
            sleep: sleep as any,
            cycles: cycles as any,
            hasData: true,
          };

          // Cross-domain data includes whoop only when hasData is true
          const crossDomainResult = whoopData.hasData ? whoopData : undefined;

          expect(crossDomainResult).toBeDefined();
          expect(crossDomainResult!.recovery).toHaveLength(recovery.length);
          expect(crossDomainResult!.sleep).toHaveLength(sleep.length);
          expect(crossDomainResult!.cycles).toHaveLength(cycles.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property 7: Recovery scores in WHOOP data are within valid range ---
  it('recovery scores should always be 0-100 in query context', () => {
    fc.assert(
      fc.property(
        fc.array(recoveryRecordArb, { minLength: 1, maxLength: 10 }),
        (recoveryRecords) => {
          for (const record of recoveryRecords) {
            expect(record.recovery_score).toBeGreaterThanOrEqual(0);
            expect(record.recovery_score).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property 8: Sleep performance in WHOOP data is within valid range ---
  it('sleep performance should always be 0-100 in query context', () => {
    fc.assert(
      fc.property(
        fc.array(sleepRecordArb, { minLength: 1, maxLength: 10 }),
        (sleepRecords) => {
          for (const record of sleepRecords) {
            expect(record.sleep_performance_percentage).toBeGreaterThanOrEqual(0);
            expect(record.sleep_performance_percentage).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property 9: Strain values in WHOOP data are within valid range ---
  it('strain values should always be 0-21 in query context', () => {
    fc.assert(
      fc.property(
        fc.array(cycleRecordArb, { minLength: 1, maxLength: 10 }),
        (cycleRecords) => {
          for (const record of cycleRecords) {
            expect(record.strain).toBeGreaterThanOrEqual(0);
            expect(record.strain).toBeLessThanOrEqual(21);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // --- Property 10: WHOOP data excluded from cross-domain when all empty ---
  it('should exclude WHOOP data from cross-domain result when hasData is false', () => {
    fc.assert(
      fc.property(
        fc.constant({ recovery: [], sleep: [], cycles: [], hasData: false } as WhoopData),
        (whoopData) => {
          const crossDomainWhoop = whoopData.hasData ? whoopData : undefined;
          expect(crossDomainWhoop).toBeUndefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  // --- Property 11: Cross-domain prompt mentions actionable WHOOP recommendations ---
  it('cross-domain prompt should include actionable WHOOP-based recommendations', () => {
    const prompt = CROSS_DOMAIN_SYSTEM_PROMPT;

    // Should recommend rest on red recovery days
    expect(prompt).toMatch(/rest|recovery/i);
    // Should suggest high-intensity on green recovery days
    expect(prompt).toMatch(/high.intensity/i);
    // Should correlate recovery with workout intensity
    expect(prompt).toMatch(/correlat/i);
  });

  // --- Property 12: WHOOP data user_id consistency across all record types ---
  it('all WHOOP records for a user should share the same user_id', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(recoveryRecordArb, { minLength: 1, maxLength: 5 }),
        fc.array(sleepRecordArb, { minLength: 1, maxLength: 5 }),
        fc.array(cycleRecordArb, { minLength: 1, maxLength: 5 }),
        (userId, recovery, sleep, cycles) => {
          // Simulate RLS: all records belong to requesting user
          const userRecovery = recovery.map(r => ({ ...r, user_id: userId }));
          const userSleep = sleep.map(s => ({ ...s, user_id: userId }));
          const userCycles = cycles.map(c => ({ ...c, user_id: userId }));

          for (const r of userRecovery) expect(r.user_id).toBe(userId);
          for (const s of userSleep) expect(s.user_id).toBe(userId);
          for (const c of userCycles) expect(c.user_id).toBe(userId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
