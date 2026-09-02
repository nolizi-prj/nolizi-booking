# Phase 2 delivery record

**Release target:** 0.3.0
**Production authority:** Cloudflare Worker + tenant Durable Objects
**Rule:** a checked capability needs a Worker build, automated edge-case coverage,
and browser evidence where it has a user interface.

## Product comparison applied

- Calendly's owner information architecture informed the grouped Scheduling,
  Team tools, Automation, and Workspace navigation. Mobile navigation collapses
  behind one accessible control instead of wrapping twelve unrelated links.
- Cal.com's team scheduling model informed explicit solo, round-robin, and
  collective choices. Pumasi keeps stronger atomic overlap constraints and
  fail-closed calendar checks rather than copying implementation code.
- Calendly's availability exceptions informed date-range out-of-office entry;
  a round-robin host who is unavailable naturally drops out of the union, so
  another available host covers the time without moving a confirmed booking.
- Calendly and Cal.com's automation recovery surfaces informed webhook delivery
  status and tenant-scoped retry. Stored payloads, attendee data, and secrets do
  not appear in the history table.
- Meeting polls, routing, and reusable questions follow the progressive pattern
  used across Calendly and Cal.com: ask one decision at a time and show a useful
  empty state before configuration exists.

## Delivered capability matrix

| Capability | Cloudflare implementation | Verification |
|---|---|---|
| Organizations, invitations, roles, isolation | Directory DO assigns tenant tags; org membership queries enforce admin/owner scope; unknown members receive one-time email invites | `teams.test.ts`, directory and enterprise suites |
| Round-robin and collective events | Per-host availability union/intersection; least-loaded assignment; collective booking/cancellation is atomic | `teams.test.ts` |
| Out-of-office coverage | Availability exceptions accept inclusive ranges up to 90 days; round-robin automatically uses another available host | `parity.test.ts`, team slot tests |
| Routing, questions, contacts, blocks | Tenant-scoped routes and stored answers; public routing answers are not retained | routing, questions, meetings, gatekeeping suites |
| Polls and single-use links | Tokenized public voting and one-use booking links | routing/polls and meetings suites |
| Workflows including no-show | Created/cancelled/rescheduled/before/after/no-show lifecycle jobs; no-show fires only on mark, not clear | `automation.test.ts` |
| Signed webhooks and recovery | HMAC-SHA256, exponential retry, latest-50 delivery status, manual retry scoped through booking ownership | `automation.test.ts` |
| API keys and idempotent API | Raw keys shown once and stored as digests; booking replay protection | automation and booking suites |
| Google, Microsoft, Zoom | Busy checks, destination calendars, write/move/cancel, reconnect/disconnect, private location handling | calendar, parity, video suites |
| Branding and sharing | Workspace logo and colour on landing and booking pages; email-ready offered-time snippets, embeds and single-use links | branding and meetings suites |
| Responsive/accessibility UX | Grouped navigation, mobile menu, visible focus, skip link, sequential booking progress, grouped timezone picker, live selected-time summary | front-door and browser booking suites |

## Cleanup decisions

- Removed unused identity parameters, constants, imports, and test variables.
- Enabled TypeScript unused-local and unused-parameter enforcement so dead code
  fails the build instead of accumulating again.
- Kept the Node/PostgreSQL entry as a tested portability/reference deployment.
  It is not obsolete, but Cloudflare remains the release authority.
- Kept legacy schedule-keyed availability reads because migrated accounts may
  still contain those rows. Deleting that fallback would strand real data.
- Kept concurrency, DST, privacy, and cross-tenant tests even when old: they
  protect active invariants and are not obsolete merely because they are stable.

## Exit gate

- Full core, acceptance, service, Worker, PostgreSQL and SQLite suites pass.
- Public booking works at desktop and mobile viewport sizes in a real browser.
- Production reports 0.3.0 healthy/ready after Durable Object migration 017.
- Google sign-in repairs an interrupted directory/tenant account and reaches
  the authenticated application for the named affected account.
- No accepted high-priority issue remains open.
