// Synthetic athlete requirements exercise the existing prose contract. These
// are test data, never defaults or a numerical programming policy.
export const highLowConstraints = {
  constraints: 'Use high-low training within five total days: Monday, Tuesday, Wednesday, Friday and Saturday, 60 minutes each. Saturday competition-team CrossFit is the main competition-style high-day anchor, not a weekly maximal test. Group demanding sprint, jump and heavy-strength work on high days; keep low days genuinely low. The actual team workout replaces or trims overlapping work; do not stack another hard workout. Preserve fresh speed and power quality. Adjust from observed performance, symptoms and recovery, not a wearable score alone. Retain APEX push, pull and 40-yard sprint priorities. Complementary isometrics on each training day must fit the stimulus and total load; do not add strenuous work on rest days. APEX is expected on a Saturday; its exact date is unconfirmed.',
  constraintKinds: [],
}

export const highLowSchedule = {
  schemaVersion: 2,
  experience: 'experienced',
  sessionAvailability: ['monday', 'tuesday', 'wednesday', 'friday', 'saturday'].map(day => ({ day, minutes: 60 })),
}
