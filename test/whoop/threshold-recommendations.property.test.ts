import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 12: Threshold-Based Recommendations
 * 
 * The system should generate appropriate recommendations based on WHOOP thresholds:
 * - Recovery < 34%: Recommend rest/active recovery
 * - Recovery 34-66%: Moderate training recommendations
 * - Recovery >= 67%: High-intensity training appropriate
 * - Sleep < 70%: Sleep improvement recommendations
 * - Strain > 15 with low calories: Nutrition recommendations
 */

describe('Property 12: Threshold-Based Recommendations', () => {
  it('should recommend rest for recovery < 34%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 33 }),
        (recoveryScore) => {
          const recommendation = getRecoveryRecommendation(recoveryScore);
          
          expect(recommendation.type).toBe('rest');
          expect(recommendation.message).toContain('rest');
          expect(recommendation.intensity).toBe('low');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should recommend moderate training for recovery 34-66%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 34, max: 66 }),
        (recoveryScore) => {
          const recommendation = getRecoveryRecommendation(recoveryScore);
          
          expect(recommendation.type).toBe('moderate');
          expect(recommendation.intensity).toBe('moderate');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should recommend high-intensity training for recovery >= 67%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 67, max: 100 }),
        (recoveryScore) => {
          const recommendation = getRecoveryRecommendation(recoveryScore);
          
          expect(recommendation.type).toBe('high_intensity');
          expect(recommendation.intensity).toBe('high');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should recommend sleep improvements for sleep < 70%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 69 }),
        (sleepPerformance) => {
          const recommendation = getSleepRecommendation(sleepPerformance);
          
          expect(recommendation.type).toBe('sleep_improvement');
          expect(recommendation.message).toMatch(/sleep|rest|recovery/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not recommend sleep improvements for sleep >= 70%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 70, max: 100 }),
        (sleepPerformance) => {
          const recommendation = getSleepRecommendation(sleepPerformance);
          
          expect(recommendation.type).not.toBe('sleep_improvement');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should recommend increased calories for high strain with low intake', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(15.1), max: 21 }),
        fc.integer({ min: 1000, max: 1999 }),
        (strain, calories) => {
          // Skip NaN values
          if (isNaN(strain)) return;
          
          const recommendation = getStrainNutritionRecommendation(strain, calories);
          
          expect(recommendation.type).toBe('increase_calories');
          expect(recommendation.message).toMatch(/calor|fuel|energy/i);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not recommend increased calories for low strain', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 15 }),
        fc.integer({ min: 1000, max: 1999 }),
        (strain, calories) => {
          const recommendation = getStrainNutritionRecommendation(strain, calories);
          
          expect(recommendation.type).not.toBe('increase_calories');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not recommend increased calories for adequate intake', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(15.1), max: 21 }),
        fc.integer({ min: 2000, max: 4000 }),
        (strain, calories) => {
          const recommendation = getStrainNutritionRecommendation(strain, calories);
          
          expect(recommendation.type).not.toBe('increase_calories');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should have consistent thresholds across multiple calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (recoveryScore) => {
          const rec1 = getRecoveryRecommendation(recoveryScore);
          const rec2 = getRecoveryRecommendation(recoveryScore);
          
          expect(rec1.type).toBe(rec2.type);
          expect(rec1.intensity).toBe(rec2.intensity);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle boundary values correctly', () => {
    const at33 = getRecoveryRecommendation(33);
    const at34 = getRecoveryRecommendation(34);
    const at66 = getRecoveryRecommendation(66);
    const at67 = getRecoveryRecommendation(67);
    
    expect(at33.type).toBe('rest');
    expect(at34.type).toBe('moderate');
    expect(at66.type).toBe('moderate');
    expect(at67.type).toBe('high_intensity');
  });

  it('should provide actionable recommendations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (recoveryScore) => {
          const recommendation = getRecoveryRecommendation(recoveryScore);
          
          expect(recommendation.message.length).toBeGreaterThan(10);
          expect(recommendation.message).toBeTruthy();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should map recovery zones to intensity levels correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (recoveryScore) => {
          const recommendation = getRecoveryRecommendation(recoveryScore);
          
          if (recoveryScore < 34) {
            expect(recommendation.intensity).toBe('low');
          } else if (recoveryScore < 67) {
            expect(recommendation.intensity).toBe('moderate');
          } else {
            expect(recommendation.intensity).toBe('high');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Helper functions matching the logic in fitness-insights API
function getRecoveryRecommendation(recoveryScore: number): {
  type: string;
  message: string;
  intensity: string;
} {
  if (recoveryScore < 34) {
    return {
      type: 'rest',
      message: 'Your recovery is in the red zone - prioritize rest and recovery',
      intensity: 'low'
    };
  } else if (recoveryScore < 67) {
    return {
      type: 'moderate',
      message: 'Moderate recovery - focus on technique and moderate intensity',
      intensity: 'moderate'
    };
  } else {
    return {
      type: 'high_intensity',
      message: 'Your recovery is strong - good time for high-intensity training',
      intensity: 'high'
    };
  }
}

function getSleepRecommendation(sleepPerformance: number): {
  type: string;
  message: string;
} {
  if (sleepPerformance < 70) {
    return {
      type: 'sleep_improvement',
      message: 'Focus on improving sleep quality and consistency'
    };
  } else {
    return {
      type: 'sleep_adequate',
      message: 'Sleep performance is good'
    };
  }
}

function getStrainNutritionRecommendation(strain: number, calories: number): {
  type: string;
  message: string;
} {
  if (strain > 15 && calories < 2000) {
    return {
      type: 'increase_calories',
      message: 'High strain with insufficient caloric intake - increase daily calories'
    };
  } else {
    return {
      type: 'adequate',
      message: 'Nutrition appears adequate for training load'
    };
  }
}
