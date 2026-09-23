# Programming-quality CI observer test race

- **Issue:** Fitness-Tracker-i40.11 release verification
- **Status:** focused correction verified locally; root review and a new reviewed CI checkpoint remain
- **Failing evidence:** GitHub Actions run `35918981558`, checkpoint `5ee779e`, Run tests; saved complete failed-step log in ignored `output/app-quality-release/ci-35918981558-failed.log`.
- **Failure count:** one observed hosted failure; no blind CI reruns

The sole failed test was `test/components/next-action-card.test.tsx`, “shows one persisted action and only acknowledges shown after entering the viewport”. Exact failure at line 26: `TypeError: intersect is not a function`. The run reported 3483 passing tests, 1 failed test and 19 skipped tests across 315 files. The new pause regression suite did not fail.

The component installs its IntersectionObserver in a passive `useEffect` after a recommendation row becomes available. The test waited only for the title in the DOM, then invoked a callback that the observer constructor had not yet supplied. Rendering the title is not a synchronization barrier for that effect. The module-scoped callback was also never reset between tests, which could conceal a missing registration in later cases.

The bounded fix changes only the component test: reset the callback before each test and explicitly wait for its registration before simulating intersection. Assertions still require no shown event before viewport entry; a non-intersecting notification now verifies that condition before the positive notification. No runtime, timeout, migration or dependency changes are needed. The discriminating verification is the focused component suite plus TypeScript; repeat full CI only through root's reviewed checkpoint/push workflow.

Local verification on 2026-09-23: `npx vitest run test/components/next-action-card.test.tsx --exclude 'output/**'` passed all 11 tests; `npx tsc --noEmit`, focused ESLint and `git diff --check` passed. No second hosted attempt or remote rerun was made by this agent. The failed CI receipt remains preserved; local success is not a claim that the next hosted run has passed.
