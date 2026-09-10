# SociusFit UI modernization

## Design brief

- User: an athlete logging training and meals on a phone.
- Job: see the next planned action and record useful evidence with little entry.
- Constraints: existing accepted plans, canonical save/retry contracts, system
  light/dark preference, 44px touch controls, 16px inputs, no new dependency.
- Primary action: open today's workout or start a meal/workout entry.
- Success: daily actions precede historical detail; key inputs have direct
  entry paths; no fake data or inferred completion enters the product.
- States: loading and unavailable reads remain distinct from no plan; completed
  sessions show a terminal status; save errors preserve existing retry paths.
- Existing conventions: App Router, Tailwind, Supabase auth, canonical Program
  completion and meal photo correction components.
- Directions considered in the conversation: calm performance, athlete's
  notebook, and ambient coach.
- Selection: calm performance visual style with action-first daily hierarchy.
  Keep detailed numeric controls when their meaning matters to coaching.

## First implementation slice

Today, Progress, and Log navigation; accepted-session summary; compact WHOOP
metrics; expandable narrative; quieter Program introduction and update control;
meal entry shortcuts and estimate summary; mint session-completion controls.

This is a functional foundation for the approved mockup, not a replacement of
every existing screen. Photo saving still precedes correction; full portion
scaling, precise review-before-first-save, and the Coach chat redesign remain
separate work. No commit, push, migration, or deployment is implied.
