# ADR-0038 - Owner OAuth for the personal context pilot

- **Status:** Owner-permission scope selected; disabled release published; corrected email-only candidate qualified locally
- **Date:** 2026-10-18
- **Deciders:** Greg

## Context

Greg selected ChatGPT and dot as conversation destinations and explicitly accepts normal broader owner permissions for this personal pilot, subject to exact action-time consent. The first exposed tool reads a coherent factual context package. Existing Supabase scopes govern identity fields rather than database privileges, and ordinary owner access can include writes. The reviewed MCP routes are deployed disabled. Native OAuth Server is now on after exact approval; discovery-only production lacks client/callback configuration, so data is blocked. No client, plugin or account grant exists. Activation stopped on auto-enabled OIDC scopes in ChatGPT discovery.

## Decision

We reuse supported existing-provider owner OAuth for the private personal pilot, expose only the read-only context tool, and accurately disclose the credential's broader rights before consent.

## Consequences

- Positive: avoids a separate identity platform, restricted role, read gateway or custom revocation ledger for this bounded pilot.
- Negative: the host-held owner credential may permit reads and mutations beyond the exposed tool; tool metadata does not narrow it. Broader access does not authorize arbitrary tool actions.
- Neutral: owner isolation, trusted token validation, no service-role credentials and exact action-time confirmation remain required. No grant, persistent permission, credential or deployment is created by this decision.
- Neutral: OAuth-server availability, resource/audience handling, exact scopes/effective rights, expiry/revocation and actual ChatGPT/dot tool retrieval still require verification. Disabled-by-default routes now prepare owner token verification, provider grant checking, public discovery and explicit consent. Local synthetic qualification is complete; the published older candidate remains disabled. The new local candidate and unapplied client-specific audience-hook proposal are not deployed. Public discovery on the identified project explicitly reports OAuth Server disabled.

## Alternatives considered

Use a dedicated restricted database role plus a fixed read gateway. Optional exploration was stopped after Greg accepted broader owner access; it would add policy and gateway work beyond his selected personal-pilot scope. No persistent version of that system was applied.

Create a separate OAuth broker or identity provider. Rejected for this increment because it adds credential lifecycle and mapping infrastructure instead of reusing the existing provider.

Publish a generic service-role-backed tool. Rejected: it bypasses owner RLS and exceeds the authorized account scope.

## Bounded qualification update

Use exactly `email` with OIDC off for the minimum owner OAuth access-token flow. Supabase HS256 access tokens remain supported; asymmetric signing was a consequence of the earlier `openid`/ID-token choice, not a prerequisite for all OAuth access. Existing signature, issuer, resource audience, exact client/scope, owner and active-grant validation remains mandatory. Native audience adjustment preserves `authenticated` and appends the canonical MCP resource only for the registered pilot's signed nested client ID/email scope. It adds no identity role or policy framework. Both host scope behavior and native hook issuance/refresh require staged live qualification after approval; an unexpected OpenID requirement stops for a specific decision. See the bounded enablement packet and final qualification receipt. No signing migration is approved by this ADR.
