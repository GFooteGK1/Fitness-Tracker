# Progress design follow-up

The prior styling pass aligned controls but left Progress with its older page composition: separate colored category tiles, prominent WHOOP content, and decorative record treatment. This follow-up applies the existing Today hierarchy to Progress.

## Changes

- Use the shared narrow layout, title, panels, and secondary actions.
- Group monthly and all-time workout totals with a neutral training mix. Category counts remain all-time and may overlap; both facts are explicit.
- Show recent records as compact rows. Failed requests have a retry state distinct from an empty record history.
- Use compact WHOOP presentation for connected, disconnected, unhealthy, and failed reads. Keep HRV and sleep efficiency available under Recovery details.
- Preserve export, logging, nutrition, and record-history actions.

## Verification

- Six focused component tests pass, covering populated, loading, empty, failed, retry, export, and compact WHOOP states, including numeric zero.
- ESLint passes.
- Production build and its TypeScript checks pass with placeholder public Supabase configuration.
- Two browser scenarios pass with simulated authentication and API data. Both themes cover 320, 390, and 1280 pixel widths, no horizontal overflow, export open/close, records retry, populated data, and disconnected empty states.
- Visually inspected mobile light, narrow dark, and empty dark screenshots in `output/playwright/app-quality-results/`.

Browser fixtures are synthetic; these checks do not verify live account data or WHOOP OAuth.
