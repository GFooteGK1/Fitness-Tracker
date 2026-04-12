import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES,
  searchTemplates,
  filterTemplatesByCategory,
  validateTemplate,
  getWorkoutTypeLabel,
  getWorkoutTypeBadgeColor,
  getCategoryLabel,
  formatMovementSummary,
  formatTemplateAsWorkoutText,
  estimateDuration,
  type WorkoutTemplate,
  type Movement,
} from '@/app/lib/workout-templates';

// ------------------------------------------
// Template Data Validation
// ------------------------------------------

describe('Template Data Validation', () => {
  it('all built-in templates have required fields', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.type).toBeTruthy();
      expect(t.movements.length).toBeGreaterThan(0);
      expect(Array.isArray(t.tags)).toBe(true);
    }
  });

  it('all built-in templates have unique IDs', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all movements have names', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      for (const m of t.movements) {
        expect(m.name).toBeTruthy();
      }
    }
  });

  it('has at least 15 benchmark WODs', () => {
    const benchmarks = BUILT_IN_TEMPLATES.filter((t) => t.category === 'benchmark');
    expect(benchmarks.length).toBeGreaterThanOrEqual(15);
  });

  it('has at least 5 hero WODs', () => {
    const heroes = BUILT_IN_TEMPLATES.filter((t) => t.category === 'hero');
    expect(heroes.length).toBeGreaterThanOrEqual(5);
  });

  it('has strength templates', () => {
    const strength = BUILT_IN_TEMPLATES.filter((t) => t.category === 'strength');
    expect(strength.length).toBeGreaterThan(0);
  });

  it('has conditioning templates', () => {
    const conditioning = BUILT_IN_TEMPLATES.filter((t) => t.category === 'conditioning');
    expect(conditioning.length).toBeGreaterThan(0);
  });

  it('has gymnastics templates', () => {
    const gymnastics = BUILT_IN_TEMPLATES.filter((t) => t.category === 'gymnastics');
    expect(gymnastics.length).toBeGreaterThan(0);
  });

  it('classic benchmark WODs are present', () => {
    const names = BUILT_IN_TEMPLATES.map((t) => t.name);
    expect(names).toContain('Fran');
    expect(names).toContain('Grace');
    expect(names).toContain('Murph');
    expect(names).toContain('Diane');
    expect(names).toContain('Helen');
    expect(names).toContain('Cindy');
    expect(names).toContain('Annie');
    expect(names).toContain('Karen');
    expect(names).toContain('Isabel');
    expect(names).toContain('Elizabeth');
  });

  it('type field is a valid WorkoutType', () => {
    const validTypes = ['amrap', 'emom', 'for_time', 'strength', 'custom'];
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validTypes).toContain(t.type);
    }
  });

  it('category field is a valid TemplateCategory', () => {
    const validCategories = [
      'benchmark',
      'hero',
      'strength',
      'conditioning',
      'gymnastics',
      'custom',
    ];
    for (const t of BUILT_IN_TEMPLATES) {
      expect(validCategories).toContain(t.category);
    }
  });

  it('timeCap is positive when present', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      if (t.timeCap !== undefined) {
        expect(t.timeCap).toBeGreaterThan(0);
      }
    }
  });

  it('rounds is positive when present', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      if (t.rounds !== undefined) {
        expect(t.rounds).toBeGreaterThan(0);
      }
    }
  });
});

// ------------------------------------------
// Validate Template Function
// ------------------------------------------

describe('validateTemplate', () => {
  it('returns no errors for a valid template', () => {
    const errors = validateTemplate({
      name: 'Test WOD',
      type: 'for_time',
      movements: [{ name: 'Push-Ups', reps: 50 }],
    });
    expect(errors).toHaveLength(0);
  });

  it('requires a name', () => {
    const errors = validateTemplate({
      name: '',
      type: 'for_time',
      movements: [{ name: 'Push-Ups' }],
    });
    expect(errors).toContain('Template name is required');
  });

  it('requires a type', () => {
    const errors = validateTemplate({
      name: 'Test',
      movements: [{ name: 'Push-Ups' }],
    });
    expect(errors).toContain('Workout type is required');
  });

  it('requires at least one movement', () => {
    const errors = validateTemplate({
      name: 'Test',
      type: 'for_time',
      movements: [],
    });
    expect(errors).toContain('At least one movement is required');
  });

  it('requires movement names', () => {
    const errors = validateTemplate({
      name: 'Test',
      type: 'for_time',
      movements: [{ name: '' }],
    });
    expect(errors.some((e) => e.includes('needs a name'))).toBe(true);
  });

  it('validates time cap range', () => {
    const errors = validateTemplate({
      name: 'Test',
      type: 'amrap',
      movements: [{ name: 'Push-Ups' }],
      timeCap: 200,
    });
    expect(errors.some((e) => e.includes('Time cap'))).toBe(true);
  });

  it('validates rounds range', () => {
    const errors = validateTemplate({
      name: 'Test',
      type: 'for_time',
      movements: [{ name: 'Push-Ups' }],
      rounds: 0,
    });
    expect(errors.some((e) => e.includes('Rounds'))).toBe(true);
  });

  it('accepts valid time cap and rounds', () => {
    const errors = validateTemplate({
      name: 'Test',
      type: 'amrap',
      movements: [{ name: 'Push-Ups', reps: 10 }],
      timeCap: 20,
      rounds: 5,
    });
    expect(errors).toHaveLength(0);
  });
});

// ------------------------------------------
// Search & Filter Logic
// ------------------------------------------

describe('searchTemplates', () => {
  it('returns all templates for empty query', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, '');
    expect(result.length).toBe(BUILT_IN_TEMPLATES.length);
  });

  it('finds templates by name', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, 'Fran');
    expect(result.some((t) => t.name === 'Fran')).toBe(true);
  });

  it('finds templates by movement name', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, 'thruster');
    expect(result.length).toBeGreaterThan(0);
    expect(
      result.some((t) =>
        t.movements.some((m) => m.name.toLowerCase().includes('thruster'))
      )
    ).toBe(true);
  });

  it('finds templates by tag', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, 'olympic lifting');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      const match =
        t.tags.some((tag) => tag.includes('olympic lifting')) ||
        t.name.toLowerCase().includes('olympic lifting') ||
        t.description.toLowerCase().includes('olympic lifting') ||
        t.movements.some((m) => m.name.toLowerCase().includes('olympic lifting'));
      expect(match).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    const lower = searchTemplates(BUILT_IN_TEMPLATES, 'grace');
    const upper = searchTemplates(BUILT_IN_TEMPLATES, 'GRACE');
    expect(lower.length).toBe(upper.length);
    expect(lower.map((t) => t.id)).toEqual(upper.map((t) => t.id));
  });

  it('returns empty array for nonsense query', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, 'xyzzy123nonsense');
    expect(result).toHaveLength(0);
  });

  it('searches in description', () => {
    const result = searchTemplates(BUILT_IN_TEMPLATES, 'iconic');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('filterTemplatesByCategory', () => {
  it('returns all templates for "all" category', () => {
    const result = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'all');
    expect(result.length).toBe(BUILT_IN_TEMPLATES.length);
  });

  it('filters by benchmark category', () => {
    const result = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'benchmark');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.category).toBe('benchmark');
    }
  });

  it('filters by hero category', () => {
    const result = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'hero');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.category).toBe('hero');
    }
  });

  it('filters by strength category', () => {
    const result = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'strength');
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(t.category).toBe('strength');
    }
  });

  it('returns empty for custom category (no built-in custom templates)', () => {
    const result = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'custom');
    expect(result).toHaveLength(0);
  });

  it('combined search and filter works', () => {
    const filtered = filterTemplatesByCategory(BUILT_IN_TEMPLATES, 'benchmark');
    const searched = searchTemplates(filtered, 'pull-up');
    expect(searched.length).toBeGreaterThan(0);
    for (const t of searched) {
      expect(t.category).toBe('benchmark');
    }
  });
});

// ------------------------------------------
// Pre-fill Flow (Template to Workout Text)
// ------------------------------------------

describe('formatTemplateAsWorkoutText', () => {
  it('formats a simple for_time template', () => {
    const template: WorkoutTemplate = {
      id: 'test',
      name: 'Test WOD',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Push-Ups', reps: 50 },
        { name: 'Sit-Ups', reps: 50 },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('Test WOD');
    expect(text).toContain('For time:');
    expect(text).toContain('50 Push-Ups');
    expect(text).toContain('50 Sit-Ups');
  });

  it('formats an AMRAP template with time cap', () => {
    const template: WorkoutTemplate = {
      id: 'test-amrap',
      name: 'Cindy',
      category: 'benchmark',
      description: '',
      type: 'amrap',
      timeCap: 20,
      movements: [
        { name: 'Pull-Ups', reps: 5 },
        { name: 'Push-Ups', reps: 10 },
        { name: 'Air Squats', reps: 15 },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('Cindy');
    expect(text).toContain('20 min AMRAP');
    expect(text).toContain('5 Pull-Ups');
  });

  it('includes weights', () => {
    const template: WorkoutTemplate = {
      id: 'test-weight',
      name: 'Grace',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Clean & Jerk', reps: 30, weight: '135/95 lb' },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('@ 135/95 lb');
  });

  it('applies scale weights', () => {
    const template: WorkoutTemplate = {
      id: 'test-scale',
      name: 'Grace',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Clean & Jerk', reps: 30, weight: '135/95 lb' },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template, {
      'Clean & Jerk': '95/65 lb',
    });
    expect(text).toContain('@ 95/65 lb');
    expect(text).not.toContain('135/95 lb');
  });

  it('includes distance and duration', () => {
    const template: WorkoutTemplate = {
      id: 'test-dist',
      name: 'Test',
      category: 'conditioning',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Run', distance: '400m' },
        { name: 'Bike', duration: '2 min' },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('(400m)');
    expect(text).toContain('(2 min)');
  });

  it('includes rounds for multi-round for_time', () => {
    const template: WorkoutTemplate = {
      id: 'test-rounds',
      name: 'Helen',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      rounds: 3,
      movements: [
        { name: 'Run', distance: '400m' },
        { name: 'KB Swings', reps: 21 },
        { name: 'Pull-Ups', reps: 12 },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('3 rounds for time');
  });

  it('formats EMOM template', () => {
    const template: WorkoutTemplate = {
      id: 'test-emom',
      name: 'Test EMOM',
      category: 'conditioning',
      description: '',
      type: 'emom',
      timeCap: 12,
      movements: [
        { name: 'Power Cleans', reps: 3 },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('EMOM 12 min');
  });

  it('formats strength template with sets', () => {
    const template: WorkoutTemplate = {
      id: 'test-str',
      name: '5x5 Back Squat',
      category: 'strength',
      description: '',
      type: 'strength',
      rounds: 5,
      movements: [
        { name: 'Back Squat', reps: 5 },
      ],
      tags: [],
    };
    const text = formatTemplateAsWorkoutText(template);
    expect(text).toContain('5 sets');
  });
});

// ------------------------------------------
// Utility Functions
// ------------------------------------------

describe('getWorkoutTypeLabel', () => {
  it('returns correct labels', () => {
    expect(getWorkoutTypeLabel('amrap')).toBe('AMRAP');
    expect(getWorkoutTypeLabel('emom')).toBe('EMOM');
    expect(getWorkoutTypeLabel('for_time')).toBe('For Time');
    expect(getWorkoutTypeLabel('strength')).toBe('Strength');
    expect(getWorkoutTypeLabel('custom')).toBe('Custom');
  });
});

describe('getWorkoutTypeBadgeColor', () => {
  it('returns non-empty strings for all types', () => {
    expect(getWorkoutTypeBadgeColor('amrap')).toBeTruthy();
    expect(getWorkoutTypeBadgeColor('emom')).toBeTruthy();
    expect(getWorkoutTypeBadgeColor('for_time')).toBeTruthy();
    expect(getWorkoutTypeBadgeColor('strength')).toBeTruthy();
    expect(getWorkoutTypeBadgeColor('custom')).toBeTruthy();
  });
});

describe('getCategoryLabel', () => {
  it('returns correct labels', () => {
    expect(getCategoryLabel('benchmark')).toBe('Benchmark WODs');
    expect(getCategoryLabel('hero')).toBe('Hero WODs');
    expect(getCategoryLabel('strength')).toBe('Strength');
    expect(getCategoryLabel('conditioning')).toBe('Conditioning');
    expect(getCategoryLabel('gymnastics')).toBe('Gymnastics');
    expect(getCategoryLabel('custom')).toBe('Custom');
  });
});

describe('formatMovementSummary', () => {
  it('summarizes movements with reps', () => {
    const t: WorkoutTemplate = {
      id: 'test',
      name: 'Test',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Thrusters', reps: '21-15-9' },
        { name: 'Pull-Ups', reps: '21-15-9' },
      ],
      tags: [],
    };
    const summary = formatMovementSummary(t);
    expect(summary).toContain('Thrusters');
    expect(summary).toContain('Pull-Ups');
    expect(summary).toContain('21-15-9');
  });

  it('summarizes movements without reps', () => {
    const t: WorkoutTemplate = {
      id: 'test',
      name: 'Test',
      category: 'conditioning',
      description: '',
      type: 'custom',
      movements: [{ name: 'Run', distance: '400m' }],
      tags: [],
    };
    const summary = formatMovementSummary(t);
    expect(summary).toContain('Run');
  });
});

describe('estimateDuration', () => {
  it('returns time cap if present', () => {
    const t: WorkoutTemplate = {
      id: 'test',
      name: 'Test',
      category: 'benchmark',
      description: '',
      type: 'amrap',
      timeCap: 20,
      movements: [{ name: 'Push-Ups', reps: 10 }],
      tags: [],
    };
    expect(estimateDuration(t)).toBe('20 min');
  });

  it('estimates for_time duration based on volume', () => {
    const t: WorkoutTemplate = {
      id: 'test',
      name: 'Test',
      category: 'benchmark',
      description: '',
      type: 'for_time',
      movements: [
        { name: 'Push-Ups', reps: 100 },
        { name: 'Sit-Ups', reps: 100 },
        { name: 'Squats', reps: 100 },
      ],
      tags: [],
    };
    const duration = estimateDuration(t);
    expect(duration).toBeTruthy();
  });

  it('returns an estimate for strength templates', () => {
    const t: WorkoutTemplate = {
      id: 'test',
      name: 'Test',
      category: 'strength',
      description: '',
      type: 'strength',
      movements: [{ name: 'Back Squat', reps: 5 }],
      tags: [],
    };
    expect(estimateDuration(t)).toBe('20-30 min');
  });
});
