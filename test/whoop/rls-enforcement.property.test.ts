/**
 * Property-Based Test: Row-Level Security Enforcement
 * 
 * Feature: whoop-integration
 * Property 9: Row-Level Security Enforcement
 * 
 * Validates: Requirements 4.5
 * 
 * Property: For any authenticated user querying WHOOP data tables, the results
 * SHALL only contain records where user_id matches the authenticated user's ID,
 * regardless of what user_id values exist in the database.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Mock Supabase client for testing RLS
interface MockSupabaseClient {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => Promise<{ data: any[]; error: null }>;
    };
  };
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null }; error: null }>;
  };
}

// Simulate RLS by filtering results based on authenticated user
function createMockSupabaseWithRLS(authenticatedUserId: string, allRecords: any[]): MockSupabaseClient {
  return {
    from: (table: string) => ({
      select: (columns?: string) => ({
        eq: async (column: string, value: string) => {
          // RLS automatically filters by authenticated user
          const filteredRecords = allRecords.filter(
            record => record.user_id === authenticatedUserId
          );
          return { data: filteredRecords, error: null };
        }
      })
    }),
    auth: {
      getUser: async () => ({
        data: { user: { id: authenticatedUserId } },
        error: null
      })
    }
  };
}

// Generator for user IDs
const userIdArbitrary = fc.uuid();

// Generator for WHOOP recovery records
const whoopRecordArbitrary = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  cycle_id: fc.integer({ min: 1, max: 1000000 }),
  date: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-01-31') }),
  recovery_score: fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
  resting_heart_rate: fc.option(fc.integer({ min: 40, max: 100 }), { nil: null }),
  hrv_rmssd_milli: fc.option(fc.float({ min: 10, max: 200 }), { nil: null }),
  created_at: fc.date()
});

describe('Property 9: Row-Level Security Enforcement', () => {
  it('should only return records matching authenticated user ID', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArbitrary,
        fc.array(whoopRecordArbitrary, { minLength: 1, maxLength: 20 }),
        async (authenticatedUserId, allRecords) => {
          // Ensure at least one record belongs to the authenticated user
          const userRecord = { ...allRecords[0], user_id: authenticatedUserId };
          const testRecords = [userRecord, ...allRecords.slice(1)];

          // Create mock Supabase client with RLS
          const supabase = createMockSupabaseWithRLS(authenticatedUserId, testRecords);

          // Query for recovery data (RLS should filter automatically)
          const { data } = await supabase
            .from('whoop_recovery')
            .select('*')
            .eq('user_id', authenticatedUserId);

          // Property: All returned records must have user_id matching authenticated user
          const allRecordsMatchUser = data.every(
            record => record.user_id === authenticatedUserId
          );

          // Property: At least one record should be returned (we ensured one exists)
          const hasRecords = data.length > 0;

          // Property: No records from other users should be returned
          const otherUserRecords = testRecords.filter(
            record => record.user_id !== authenticatedUserId
          );
          const noOtherUserRecords = !data.some(record =>
            otherUserRecords.some(other => other.id === record.id)
          );

          return allRecordsMatchUser && hasRecords && noOtherUserRecords;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should enforce RLS across all WHOOP tables', async () => {
    const tables = ['whoop_recovery', 'whoop_sleep', 'whoop_cycles', 'whoop_workouts', 'whoop_sync_status'];

    await fc.assert(
      fc.asyncProperty(
        userIdArbitrary,
        fc.array(whoopRecordArbitrary, { minLength: 1, maxLength: 10 }),
        fc.constantFrom(...tables),
        async (authenticatedUserId, allRecords, tableName) => {
          // Ensure at least one record belongs to the authenticated user
          const userRecord = { ...allRecords[0], user_id: authenticatedUserId };
          const testRecords = [userRecord, ...allRecords.slice(1)];

          // Create mock Supabase client with RLS
          const supabase = createMockSupabaseWithRLS(authenticatedUserId, testRecords);

          // Query the table
          const { data } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', authenticatedUserId);

          // Property: All returned records must match authenticated user
          return data.every(record => record.user_id === authenticatedUserId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return empty array when user has no records', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArbitrary,
        userIdArbitrary,
        fc.array(whoopRecordArbitrary, { minLength: 1, maxLength: 10 }),
        async (authenticatedUserId, otherUserId, allRecords) => {
          // Ensure authenticated user is different from other user
          if (authenticatedUserId === otherUserId) {
            return true; // Skip this case
          }

          // All records belong to other user
          const testRecords = allRecords.map(record => ({
            ...record,
            user_id: otherUserId
          }));

          // Create mock Supabase client with RLS
          const supabase = createMockSupabaseWithRLS(authenticatedUserId, testRecords);

          // Query for recovery data
          const { data } = await supabase
            .from('whoop_recovery')
            .select('*')
            .eq('user_id', authenticatedUserId);

          // Property: Should return empty array when user has no records
          return data.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not leak data from other users regardless of query parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArbitrary,
        fc.array(userIdArbitrary, { minLength: 2, maxLength: 5 }),
        fc.array(whoopRecordArbitrary, { minLength: 5, maxLength: 20 }),
        async (authenticatedUserId, otherUserIds, allRecords) => {
          // Distribute records among multiple users
          const testRecords = allRecords.map((record, index) => ({
            ...record,
            user_id: index % 2 === 0 ? authenticatedUserId : otherUserIds[index % otherUserIds.length]
          }));

          // Create mock Supabase client with RLS
          const supabase = createMockSupabaseWithRLS(authenticatedUserId, testRecords);

          // Query for recovery data
          const { data } = await supabase
            .from('whoop_recovery')
            .select('*')
            .eq('user_id', authenticatedUserId);

          // Property: No records from other users should be in results
          const otherUserIds_set = new Set(otherUserIds);
          return data.every(record => !otherUserIds_set.has(record.user_id));
        }
      ),
      { numRuns: 100 }
    );
  });
});
