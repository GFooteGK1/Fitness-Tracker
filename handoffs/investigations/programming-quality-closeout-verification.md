# i40.14 artifact verification

Owner: release executor. Status: resolved September 26, 2026. Worktree:
`.worktrees/programming-quality`. No application changes or production repair.

## Evidence and attempts

1. A direct unauthenticated GET of the retained unique Vercel deployment returned
   302 to Vercel authentication. No protection bypass or new credential was
   created. The existing authenticated Chrome session could read the exact URL.
2. Independent review rejected the first draft checker because any build string
   and nonempty asset could pass. Before execution, it was changed to require a
   reference from the exact authenticated deployment and to compare build and
   sampled asset hashes. This was a tooling-review finding, not a production failure.
3. The authenticated exact-deployment page exposed its build ID and assets. Its
   one CSS bundle download succeeded but took 1,345 seconds. Do not use this
   browser capture for bounded emergency rollback; retain CLI rollback.
4. Executed comparison attempt 1 at 17:02 UTC passed all platform metadata and
   exact build checks, but reported `Canonical script paths differ from exact
   deployment`. The reference had nine hydrated DOM script nodes. A read of the
   same deployment's observed resource inventory independently showed the tenth
   signin page chunk, which was absent from the hydrated DOM. The public HTML
   contained exactly that tenth chunk. Signup/privacy prefetches were unrelated
   to entrypoint enumeration. No evidence of stale deployment or application failure.
5. Comparison attempt 2 used a new v2 reference including the observed signin
   resource and retained the original reference and failure receipt. It passed
   exact source/deployment, build, all ten entrypoint paths, the 58,505-byte CSS
   SHA256, aliases, redirects and 31 binding identities at 17:04:11 UTC.

Acceptance also includes successful owner reads with unchanged accepted-plan
contents, main CI and zero observed post-merge 5xx rows. No rollback was needed.
Failed comparison count: one executed false-negative, resolved on the second
comparison. The prior draft-review finding and initial unauthenticated lookup
remain documented. Future checks should use observed page resources as well as
hydrated script nodes; neither alone should be mislabeled complete source HTML.
