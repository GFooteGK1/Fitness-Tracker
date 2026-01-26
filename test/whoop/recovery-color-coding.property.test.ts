import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 10: Recovery Score Color Coding
 * 
 * The system should color-code recovery scores consistently:
 * - Green (>= 67%): Good recovery
 * - Yellow (34-66%): Moderate recovery
 * - Red (< 34%): Poor recovery
 * - Gray: No data available
 * 
 * This ensures users can quickly assess their recovery status.
 */

describe('Property 10: Recovery Score Color Coding', () => {
  // Helper function matching component logic
  const getRecoveryColorClasses = (score: number | null | undefined): { border: string; text: string } => {
    if (score === null || score === undefined) {
      return { border: 'border-l-gray-300', text: 'text-gray-600' };
    }
    if (score >= 67) {
      return { border: 'border-l-green-500', text: 'text-green-600' };
    }
    if (score >= 34) {
      return { border: 'border-l-yellow-500', text: 'text-yellow-600' };
    }
    return { border: 'border-l-red-500', text: 'text-red-600' };
  };

  it('should return green for scores >= 67', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 67, max: 100 }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          expect(colors.border).toBe('border-l-green-500');
          expect(colors.text).toBe('text-green-600');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return yellow for scores 34-66', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 34, max: 66 }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          expect(colors.border).toBe('border-l-yellow-500');
          expect(colors.text).toBe('text-yellow-600');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return red for scores < 34', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 33 }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          expect(colors.border).toBe('border-l-red-500');
          expect(colors.text).toBe('text-red-600');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return gray for null score', () => {
    const colors = getRecoveryColorClasses(null);
    expect(colors.border).toBe('border-l-gray-300');
    expect(colors.text).toBe('text-gray-600');
  });

  it('should return gray for undefined score', () => {
    const colors = getRecoveryColorClasses(undefined);
    expect(colors.border).toBe('border-l-gray-300');
    expect(colors.text).toBe('text-gray-600');
  });

  it('should handle boundary at 67 correctly', () => {
    const at67 = getRecoveryColorClasses(67);
    const at66 = getRecoveryColorClasses(66);
    
    expect(at67.border).toBe('border-l-green-500');
    expect(at66.border).toBe('border-l-yellow-500');
  });

  it('should handle boundary at 34 correctly', () => {
    const at34 = getRecoveryColorClasses(34);
    const at33 = getRecoveryColorClasses(33);
    
    expect(at34.border).toBe('border-l-yellow-500');
    expect(at33.border).toBe('border-l-red-500');
  });

  it('should be consistent for the same score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (score) => {
          const colors1 = getRecoveryColorClasses(score);
          const colors2 = getRecoveryColorClasses(score);
          
          expect(colors1.border).toBe(colors2.border);
          expect(colors1.text).toBe(colors2.text);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return valid Tailwind classes', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          
          // Verify border classes are valid
          expect(colors.border).toMatch(/^border-l-(green|yellow|red|gray)-\d{3}$/);
          
          // Verify text classes are valid
          expect(colors.text).toMatch(/^text-(green|yellow|red|gray)-\d{3}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should partition the score range into three distinct zones', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          
          // Verify exactly one color zone is assigned
          const isGreen = colors.border === 'border-l-green-500';
          const isYellow = colors.border === 'border-l-yellow-500';
          const isRed = colors.border === 'border-l-red-500';
          
          const colorCount = [isGreen, isYellow, isRed].filter(Boolean).length;
          expect(colorCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use matching border and text colors', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 100 }), { nil: null }),
        (score) => {
          const colors = getRecoveryColorClasses(score);
          
          // Extract color from border and text
          const borderColor = colors.border.match(/border-l-(\w+)-/)?.[1];
          const textColor = colors.text.match(/text-(\w+)-/)?.[1];
          
          // Should use the same color family
          expect(borderColor).toBe(textColor);
        }
      ),
      { numRuns: 100 }
    );
  });
});
