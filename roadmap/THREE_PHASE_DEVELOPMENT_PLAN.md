# Pumasi Booking — three-phase development plan

**Baseline reviewed:** 2026-09-02
**Production target:** Cloudflare Workers + Durable Objects/SQLite at `booking.pumasi.ai`
**Release rule:** a capability is not available until the Worker path is tested, deployed, and verified in a browser.

## Product and design evidence

This plan was derived from the local Calendly journey captured under
`pumasi-site-screenshot/calendly/2026-08-28`, and from the local source trees
for Cal.com, Cal.com DIY, Calendso, Easy!Appointments, and Tymeslot under
`booking_sites/`.

Patterns worth adopting:

- Calendly keeps the public booking decision sequential: understand the event,
  select a date, select one time, then provide details and confirm. It shows the
  visitor's timezone beside the calendar and makes available days visually
  distinct.
- Calendly's owner UI separates Scheduling, Meetings, Availability, and
  Integrations. Empty states explain the next useful action instead of merely
  showing an empty table.
- Cal.com treats slot reservation, availability revalidation, booking creation,
  rescheduling, and cancellation as separate operations with explicit stale-slot
  and idempotency handling. Pumasi keeps its stronger database-enforced overlap
  constraint and revalidates immediately before insertion.
- Easy!Appointments keeps provider/service availability and appointment state
  explicit. Pumasi uses the same clarity while retaining an immutable UTC core
  and IANA-zone presentation.
- All competitor-derived ideas are behavioral/design references only. No source
  is copied into this Apache-2.0 project.

Patterns to avoid:

- Treating a day marker as proof that its time controls rendered (issue #32).
- Raw, ungrouped configuration surfaces that expose implementation details to a
  first-time user.
- Calling Node/PostgreSQL-only behavior production-ready when Cloudflare serves
  a different path.
- Trusting a submitted slot, silently moving a DST-gap time, or resolving a
  booking conflict with an application-only check.
- Shipping credentials, private meeting URLs, calendar tokens, or internal IDs
  into a public page or feedback report.

## Phase 1 — dependable individual scheduling

**Outcome:** one person can create a trustworthy booking page and another can
book, receive, manage, cancel, or reschedule a meeting without assistance.

### Account and onboarding

- Invite/email, Google, and Microsoft sign-in with actionable configuration
  refusals and secure state sealing.
- First-run profile: name, public booking slug, timezone, default working hours,
  and default 30-minute event type.
- Clear setup checklist for calendar connection, availability, event type, and
  public-page preview.

### Scheduling and availability

- Event-type create/edit/archive with title, slug, duration, description,
  location, buffers, notice, booking horizon, and assigned availability.
- Named weekly availability with multiple intervals, date overrides, holidays,
  and IANA timezone semantics.
- Google and Microsoft busy-time checks; fail closed when a connected provider
  cannot verify availability.
- DST-correct slot generation, lead time, buffers, limits, and atomic
  double-booking prevention.

### Booker and meeting journey

- Responsive two-panel booking page with event summary, human-readable timezone,
  available-day states, visible time buttons, details/questions, privacy notice,
  and clear stale-slot recovery.
- Confirmation page and email with ICS; meeting location revealed only when it
  is safe to do so.
- Owner Meetings view with search/upcoming/past, attendee details, notes,
  cancellation/no-show controls, and private management links.
- Booker cancellation and rescheduling with one-time scoped tokens and booking
  revalidation.

### Operational product baseline

- Cloudflare Worker is the production authority; Node/PostgreSQL remains a
  portability/reference deployment, never release evidence for the hosted app.
- Durable Object migrations, readiness checks, rate limits, structured failure
  behavior, and rollback instructions.
- One synchronized SemVer, visible footer, `/version`, `/healthz`, `/readyz`,
  build commit, and environment identity.
- Feedback button on public and authenticated pages with diagnostic context,
  screenshot redaction/limits, persistent rate limiting, and GitHub delivery.
- Browser regression for the public date-to-time transition and core booking
  completion, plus engine/service/concurrency tests.

**Phase 1 exit:** the full gate passes; staging and production report the same
release; a browser selects an available day and sees times; a real booking can
be created and managed; no accepted high-priority issue remains open.

## Phase 2 — teams, sharing, and automation

**Outcome:** a small organization can coordinate scheduling across people and
repeatable processes.

- Organizations, invitations, roles, resource isolation, collective and
  round-robin event types, host reassignment, and out-of-office coverage.
- Routing forms, reusable/custom questions, contacts, block/exclusion rules,
  meeting polls, and single-use links.
- Reminder/follow-up/no-show workflows, webhook signing/retries, API keys,
  idempotent public APIs, and delivery history.
- Google Meet, Microsoft Teams, and Zoom lifecycle verification, including
  disconnect/reconnect and safe public-location disclosure.
- Availability list/calendar views, date-specific hours, multiple connected
  calendars, conflict-calendar selection, and destination-calendar selection.
- Team branding, managed event types, share-via-email, offer-times snippets,
  and accessibility/mobile browser coverage.

**Phase 2 exit:** team routing and automation are exercised on the Cloudflare
deployment, isolation tests cover every shared resource, and provider failures
have visible retry/recovery paths.

## Phase 3 — enterprise operations and ecosystem

**Outcome:** organizations can govern, integrate, and audit Booking at scale.

- SAML/OIDC organization SSO, SCIM provisioning, domain controls, granular RBAC,
  audit export, retention/deletion controls, and admin center.
- Advanced analytics, team utilization, conversion funnel, exports, scheduled
  reports, and privacy-aware observability.
- Integration catalog and stable API/webhook platform with rotation, replay,
  delivery inspection, quotas, and compatibility policy.
- Localization, regional formats, advanced holiday/travel schedules, pooled
  resources/rooms, recurring group capacity, and admin-managed templates.
- Backup/restore drills, Durable Object point-in-time recovery, incident runbooks,
  security review, accessibility conformance, and performance/load budgets.

**Phase 3 exit:** enterprise controls are verified in production-like tenants,
recovery is rehearsed, public contracts are versioned, and operational evidence
supports promotion beyond beta.

## Continuous-development rules

1. Re-read the relevant competitor flow and implementation before each feature;
   record the lesson, do not clone the code.
2. Add the failure/edge-case test before the repair whenever the behavior can be
   reproduced deterministically.
3. Verify both calendar truth and database truth immediately before booking.
4. Preserve user data and unrelated worktree changes; migrations are additive.
5. Promote staging before production and verify runtime version/readiness after
   propagation.
6. Close an issue only with production evidence. Source, tests, or a deployment
   command alone are insufficient.
