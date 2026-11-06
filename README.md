# SociusFit

SociusFit is evolving into a durable fitness context and workflow service for the
athlete's chosen LLM. The accepted target puts conversation, interpretation and
program authorship in that LLM; Socius retains facts, provenance, deterministic
calculations and validated persistence. See [ADR-0039](docs/decisions/ADR-0039-chosen-llm-and-durable-context.md).

The transition is incomplete. The repository also retains the first-party
application and embedded model-backed paths. Their presence is not evidence that
they should be deleted, or that every source capability is enabled in a deployment.

## Start here

- [Current architecture overview](docs/architecture/PROJECT-OVERVIEW.md): implemented interfaces, gates, retained dependencies and verification limits.
- [Architecture map](docs/architecture/ARCHITECTURE-MAP.md): module boundaries and data flows; verify affected code before a change.
- [Chosen-LLM transition plan](docs/plans/socius-durable-context-goal-2026-10-19.md): existing ordered roadmap, with dated checkpoint tables rather than live rollout status.
- [External activity-operation contract](docs/decisions/ADR-0044-chatgpt-activity-record-operations.md): typed records, corrections, receipts and remaining external workflow slices.
- [January 11 state summary](docs/sessions/CURRENT-STATE-SUMMARY.md): historical record, not current readiness.

## Interfaces in the current source

| Surface | Implemented role | Boundary |
| --- | --- | --- |
| MCP at `/api/mcp` | Two coaching reads plus six activity operations: eight descriptors in total | Owner-pilot authorization and rollout gates apply; see the [tool inventory and gates](docs/architecture/PROJECT-OVERVIEW.md#external-tools-and-rollout-gates). |
| `/coach` and `/v2` | The same embedded chat client, calling `/api/agent/process` | Still uses server-side models; it has not been retired. |
| `/query` | Redirects to `/coach` | The separate legacy `/api/query` endpoint remains. External usage has not been established by the cleanup. |
| Web logging, dashboard and Program | Direct workout/meal entry, facts/views and durable program workflows | Some entry paths still call providers. Stored accepted plans and completion history must remain interpretable. |

The source inventory is detailed and linked in the
[overview](docs/architecture/PROJECT-OVERVIEW.md#retained-application-and-provider-dependencies).
Source presence does not establish deployed flags, complete athlete coverage,
general multi-client support or successful visual plugin rendering.

## Local development

Use Node.js **24.x**, as specified in [package.json](package.json), and the
committed lockfile:

```bash
npm ci
npm run dev
```

The development server defaults to [http://localhost:3000](http://localhost:3000).
Configure `.env.local` for an approved development target using the
[example settings](.env.local.example). Keep credentials out of source control.
The existing MCP authorization code has a specific owner-pilot configuration;
it is not a generic self-service connection for arbitrary projects or clients.

Anthropic/OpenAI credentials are required for the server-side tasks you enable,
not for deterministic MCP record operations themselves. The
[provider-neutral seam](app/lib/llm/client.ts) supports per-purpose routing;
screening and audio also have direct OpenAI callers. Do not remove these
dependencies while required ingestion or embedded application callers remain.

Schema history is maintained in [Supabase migrations](supabase/migrations) and
[documented migrations](docs/migrations). A single historical bootstrap file is
not a complete current schema or an instruction to modify an existing database.
Match schema, application and configuration to the intended release.

## Verification

The repository's [CI workflow](.github/workflows/ci.yml) runs tests, type-check,
lint, build and local mobile browser journeys. Commands are defined in
[package.json](package.json):

```bash
npm test
node node_modules/typescript/bin/tsc --noEmit --pretty false
npm run lint
npm run build
npm run test:browser
```

Some tests require explicit live/evaluation or local-service gates; a passing
default run is not proof those paths were exercised. See the
[live-test environment loader](test/live-env.ts) and each gated test's requirements.
Use synthetic/local fixtures for ordinary verification.

## Release and remaining work

Code, CI results, deployment identity/configuration, actual owner/host behavior
and product acceptance are separate evidence. A source flag, a merged commit or
a deployment status alone does not establish all of them. This README makes no
blanket security certification, production-readiness, latency or cost claim.

Remaining transition work is tracked in the existing
[ordered plan](docs/plans/socius-durable-context-goal-2026-10-19.md) and
[operation contract](docs/decisions/ADR-0044-chatgpt-activity-record-operations.md).
Retirement of embedded authoring requires replacement proof and its own release
decision. Preserve authorization, historical plans, provenance, idempotency and
uncertain-save recovery while simplifying the application.

Follow [AGENTS.md](AGENTS.md) for repository instructions and the existing Beads
tracker. Deployment, schema, credential and activation changes require their
applicable release authority; this documentation does not enable them.

## License

MIT
