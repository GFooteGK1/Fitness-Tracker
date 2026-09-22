# Programming quality validation environment

Issue: Fitness-Tracker-i40.3. Workspace: `.worktrees/programming-quality`.
2026-09-21. Owner: implementation lead. Status: resolved on attempt 3.

The first full typecheck used the root checkout's `node_modules` because the new isolated checkout had none. Focused tests passed, but the full typecheck reported missing `@playwright/test` and `@electric-sql/pglite`, plus an older Vite type rejecting `oxc`. This is an incomplete/mismatched dependency tree, not proof of source regressions in those unchanged files. It also found a new synthetic fixture using display unit `m/s` instead of the canonical `m_per_s`; that fixture is corrected.

Next discriminating check: compare lockfile hashes with the existing release checkout and, if identical and complete, use its installed dependency tree through a local junction. Rerun typecheck with those dependencies. No install, dependency change, deletion, or production action is needed.

Attempt 2: both lockfiles have SHA256 `B2419B0C94C73FD48FA9FD7EBB77FC99C0D19E77D590570147816DE28E8B3B0A`; release dependencies contain the missing packages and Vitest 4.1.11. Junction creation failed because the first Vitest run created a local `node_modules/.vite` cache in the new checkout. The subsequent command could not locate TypeScript there. Inspection found only `.vite` in that directory. Revised hypothesis: preserve this generated cache under the checkout's ignored `.next` directory, then create the dependency junction. Check resolved source and destination remain inside the isolated checkout before the move. Third attempt is bounded to that environment correction and the typecheck.

Attempt 3 succeeded. Both move paths were checked against the resolved isolated checkout. The generated cache was preserved at `.next/validation-node-cache`; a `node_modules` junction points to the existing release dependency directory. Full `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed with exit code 0. No dependencies were installed or changed. Future verification should use the worktree-local command paths. The fixture's canonical-unit correction remains a real source fix.
