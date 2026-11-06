import { describe, it, expect } from 'vitest';
import { getPromptForIntent, CROSS_DOMAIN_SYSTEM_PROMPT } from '@/app/api/query/lib/prompt-templates';

/** Exercises production prompt assets; query source/auth contracts live in test/query. */
describe('Property 13: WHOOP Context in Query Responses', () => {
  it('cross-domain prompt should include WHOOP recovery, sleep, and strain context', () => {
    const prompt = getPromptForIntent('CROSS_DOMAIN');

    expect(prompt).toContain('WHOOP');
    expect(prompt).toMatch(/recovery/i);
    expect(prompt).toMatch(/sleep/i);
    expect(prompt).toMatch(/strain/i);
    expect(prompt).toMatch(/HRV/i);
  });

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

  it('cross-domain prompt should include actionable WHOOP-based recommendations', () => {
    const prompt = CROSS_DOMAIN_SYSTEM_PROMPT;

    // Should recommend rest on red recovery days
    expect(prompt).toMatch(/rest|recovery/i);
    // Should suggest high-intensity on green recovery days
    expect(prompt).toMatch(/high.intensity/i);
    // Should correlate recovery with workout intensity
    expect(prompt).toMatch(/correlat/i);
  });
});
