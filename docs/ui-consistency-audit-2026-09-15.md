# UI consistency audit — September 15, 2026

## Result

Applied the accepted charcoal/mint design to legacy actions and notices across
authentication, logging, meals, Program, templates, profile, progress, and shared
app surfaces. The changes extend the existing design in `app/globals.css` and
ADR-0010. They do not change data contracts, coaching rules, or save behavior.

Work is on `codex/ui-consistency`, based on fetched `origin/main` commit
`484a35c`, in `.worktrees/ui-consistency`. The initial checkout was an older
feature branch, so it was preserved. Branch publication was subsequently authorized;
production deployment remains outside this change.

## Findings and corrections

| Finding | Correction | Main source |
| --- | --- | --- |
| Blue, purple, and green CTAs bypassed the shared theme | Primary actions use `app-primary`; neutral secondary actions use `app-secondary` | Auth forms, logging pages, meal review, template creation, Program controls |
| Secondary actions competed with submit/save actions | Normalize cancel, clear, retry, disclosure, and auxiliary actions by purpose | `MealInputEnhanced`, `ErrorBoundary`, `TargetManagement`, profile |
| Informational and success notices had several unrelated palettes | Add shared notice variants with light/dark colors | `globals.css`, `Toast`, logging pages, Program status |
| Offline and adherence notices relied on light-only colors | Use themed warning, error, success, and neutral surfaces | `OfflineQueueStatus`, `ConnectivityIndicator`, `WeeklyAdherenceView` |
| Install prompt used legacy buttons and could cover mobile navigation | Use shared panel/actions; offset above navigation and safe area | `InstallPrompt` |
| Field focus, selected weekdays, avatars, and secondary links retained blue accents | Use theme accents and paired action foreground/background colors | Program setup, forms, `UserMenu`, template links |
| Landing and narrative banners retained gradients | Use the existing calm panel surface | Home, `DashboardNarrative`, legacy Program header |
| Native date and checkbox controls retained browser-default appearance | Set native color scheme per theme and shared checkbox/radio accent | `globals.css` |
| PWA manifest retained blue launch chrome | Align static launch colors with the accepted light palette | `public/manifest.json` |

## Design contract

- `app-primary`: the main save, submit, accept, or start action; 48px minimum height.
- `app-secondary`: neutral supporting actions with the same control geometry.
- `app-icon-action`: compact icon controls with at least 44px width and height.
- `app-notice` plus `app-notice-info`, `-success`, `-warning`, or `-error`:
  shared notice surface, with semantic text/icon distinctions.
- `--accent-soft` and `--accent-line`: quiet emphasis and selected/supporting surfaces.
- Pair `--action` with `--action-text`; pair soft accent surfaces with `--accent`.
- Cards retain their block/stacked layout. A button class must not flatten card
  contents or add padding that collapses a fixed-width icon.
- Warning/error, recording, WHOOP recovery, adherence, record-type, and workout-type
  colors retain their meaning. Those colors are not legacy branding to erase.

## Verification

| Check | Evidence |
| --- | --- |
| Focused components and Program regression | 105 tests passed across 19 files |
| Existing browser journeys | Accepted session, interrupted text retry, interrupted photo retry, low-touch navigation, and portion-correction retry passed with simulated accounts and API responses |
| Added browser checks | Four theme cases cover sign-in errors at 320/1280px, selected Program weekdays, compact composer icons, and install-banner clearance/dismissal in both themes |
| Static checks | TypeScript and ESLint passed; production build generated all 78 static pages using placeholder Supabase public configuration |
| Diff hygiene | `git diff --check` passed |
| Independent source review | Contrast, selected states, action hierarchy, stacked cards, icon sizing, notice colors, and animation findings were corrected and rechecked |

Rendered screenshots were inspected for Coach at 320px, workout logging, light/dark
sign-in errors, light/dark Program setup, and light/dark install prompts. Screenshots
are local evidence under `output/playwright/app-quality-results/`; logs are under
`output/ui-consistency/`.

The first focused test run exposed three assertions tied to old CSS class names;
they were updated for the shared styles, then all 105 tests passed. Initial theme
test failures came from matching Next's route announcer as well as the error notice,
and measuring the install animation before it settled. The tests now target the
actual notice and wait for stable geometry.

The first build lacked the public Supabase variables in the isolated worktree.
The successful build used the same explicit placeholder values as browser tests;
production credentials were not copied or changed.

## Limits

This is local source, browser, and build verification. It is not a production or
physical iPhone/PWA validation, and every possible populated/error state was not
visually exercised. Existing browser journeys use simulated services; database
and production behavior are outside this styling change.

Beads tracking was unavailable because `bd` was not installed on PATH or found
in the checked local binary locations. No issue or sync is claimed.
