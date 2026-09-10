# ADR-0010: Complete low-touch entry and retire Leaderboards

Status: Accepted
Date: 2026-09-10

## Context and decision

Greg approved the remaining app UX assessment and removal of Leaderboards.
The user is an athlete capturing evidence on a phone. Success means entry is
immediately accessible, known context is reusable, and saved/empty/error states
are truthful. The existing charcoal/mint system and canonical save contracts
remain the foundation.

Coach shares navigation and exposes context on demand. Logging starts with the
composer. Template favorites and recent draft weights are account-scoped local
preferences; they never imply a performed workout. Profile edits require an
explicit save. Initial setup requires age eligibility and a goal; body measures
remain optional until needed, with no fabricated nutrition targets.

Meal-photo analysis displays the real response immediately. Estimates are still
saved before review; corrections and whole-meal scaling use the existing meal
update endpoint. A failed request cannot synthesize a saved record identifier.

First attempts are stored as quiet baselines. Only improvements over previous
values are returned for celebration and counted in PR summaries. Faster-is-better
time records require FOR_TIME blocks. Historical baseline rows remain available
in Records through an explicit inclusion control. Celebrations group improvements
and provide close, Escape, and swipe dismissal without automatic rotation.

Leaderboard pages, API endpoints, widget, and unused ranking implementation are
removed. Historical tables and migrations remain intact. The legacy view-template
section identifier remains parseable for stored configuration compatibility, but
is absent from defaults and hidden in rendered highlights.

## Alternatives and tradeoff

A visual-only reskin would retain unnecessary input and misleading feedback.
A new logging backend would enlarge the release risk. We extend existing entry
and correction contracts instead; photo review does not precede its first save.
Account-local favorites do not sync across devices.

## Verification contract

Exercise empty/partial nutrition, photo failure and correction retry, grouped PR
and baseline behavior, optional body metrics with age eligibility, explicit
profile save/cancel/error, reusable templates, persistent mobile navigation,
small-screen composer clearance, existing canonical logging journeys, and build
route removal. Use simulated account/API data for write-flow browser checks.
