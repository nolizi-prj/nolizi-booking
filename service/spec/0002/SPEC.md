# SPEC-0002 — Scheduling Service

**Drafted:** 2026-08-01 · **Status:** awaiting cross-family spec review
**Intent:** [`INTENT.md`](./INTENT.md) — confirmed by the steward 2026-08-01
**Depends on:** [`core/spec`](../../../core/spec/SPEC.md) — the engine
**Roadmap:** [`GAP-0004`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0004-feature-parity.md) item 1b
**Acceptance suite:** [`acceptance/cases.json`](./acceptance/cases.json) — **frozen when spec review completes; the builder may not modify it**

---

## 1 · What this is

A deployable scheduling service. Accounts, availability configuration, a public
booking page, confirmation mail, and cancel/reschedule links. Deployed from
GitHub to Railway.

It **wraps** SPEC-0001 and does not reimplement it. The division is:

```
SPEC-0001 compute_slots   pure. no clock, no I/O, no state.
SPEC-0001 book/cancel/    stateful semantics — WHAT must be true of a booking.
          reschedule      Storage-agnostic by contract; it names no store.
SPEC-0002 (this)          the store, the I/O, the identity. HOW those hold.
```

SPEC-0001 is not stateless — B1 to B7 describe state transitions. What it does
not do is choose a store or perform I/O. This service supplies both, and P1 is
where its choice of store is what makes B2 and B6 true rather than aspirational.

Every question of the form *"which slots are available"* or *"may this booking be
made"* is answered by calling the engine. This service never re-derives a slot,
never adjusts a time, and never decides availability on its own. Where it is
tempted to, that is a defect in the engine's interface, not a licence to compute
here.

## 2 · Non-goals

Calendar-provider sync ([`GAP-0002`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0002-calendar-integration.md), **promoted to next**) · teams, round-robin, pooled or multi-attendee
bookings · payments · AI suggestions · weekly/monthly/duration limits · recurring
bookings · SMS · a native mobile app.

**Public signup is a non-goal of this version, and is blocked** — see D1.

## 3 · Surfaces

| Surface | Who reaches it | Auth |
|---|---|---|
| Owner app | The account holder | Session cookie |
| Public booking page | Anyone with the link | None |
| Booking management link | Whoever holds the emailed link | Bearer token (L1) |
| Health and readiness | The platform | None |

Wire format is JSON over HTTPS for programmatic surfaces; the booking page is
server-rendered HTML. Instants are RFC 3339 with `Z`, as in the engine.

## 4 · Semantics

Every clause below exists because it is a documented way this gets built wrong.

### 4.1 · Identity and access — `I`

**I1 · Invite-only.** No account is created without a valid, unconsumed invite.
An invite is single-use and is consumed atomically with account creation; two
concurrent redemptions of one invite create **exactly one** account.

**I2 · Public signup is disabled by a flag that fails closed.** Absent or
unparseable configuration means disabled. Enabling it is an explicit act by the
operator, and the service honours it. It is no longer refused unconditionally:
the basis D1 refers to is written and in force, so this is a deployment decision
rather than a governance block.

**I3 · Sessions** are opaque server-side references in an `HttpOnly`, `Secure`,
`SameSite=Lax` cookie. Never a token containing claims the client can read, and
never the account identifier. Logout invalidates server-side, not only by
clearing the cookie.

**I4 · An owner may read and change only their own schedules and bookings.**
Enforced at the query, not by hiding controls in the interface. Every
owner-scoped read is filtered by the session's account at the point of data
access.

**I5 · The booker never authenticates.** Booking requires no account, ever.
Requiring one to book would defeat the purpose of a booking link.

**I6 · Unauthenticated surfaces are rate-limited, with stated numbers.** The
booking page and the management link accept requests from anyone with a URL.
Without a limit they are a free channel for enumeration, spam bookings against a
real person's calendar, and mail amplification to arbitrary addresses.

Defaults, configurable but never unbounded: **60 page views per IP per minute**,
**5 booking attempts per IP per minute**, **20 bookings per schedule per hour**,
**10 management-link lookups per IP per minute**. Exceeding a limit returns a
retry signal, and **sends no mail**. A rate limit with no number is a promise to
implement one later; these are the numbers.

### 4.2 · Persistence and exclusivity — `P`

**P1 · Exclusivity is enforced by the database, not by application code.** Two
constraints are required, and each enforces a *different* invariant. In
PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for `WITH =` in GiST

-- P1a: no two confirmed bookings for one owner overlap  (SPEC-0001 B2)
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    owner_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- P1b: one booking holds at most one confirmed interval  (SPEC-0001 B6)
CREATE UNIQUE INDEX bookings_one_confirmed_per_booking
  ON bookings (booking_id) WHERE (status = 'confirmed');
```

**P1a · No two confirmed bookings for one owner overlap.** *This is the clause
the whole service turns on.* The obvious implementation — query for a conflict,
then insert if none — is a time-of-check-to-time-of-use race: under concurrency both requests see a free slot and both insert. It passes
every test that does not run concurrently, which is most tests. SPEC-0001 B2
promises exactly one winner; **only the database can keep that promise.**

**P1b · One booking, at most one confirmed interval — and it is not redundant.**
P1a alone forbids
*overlap*. It does not forbid one booking holding *two non-overlapping* confirmed
intervals — which is exactly the state a reschedule passes through if it inserts
the new interval before demoting the old one. The rows do not overlap, P1a stays
satisfied, and SPEC-0001 B6 — *never both, never neither* — is violated with the
database reporting no problem. This was found in adversarial review of the first
draft of this spec, which had P1a only.

**P2a · A reschedule is one transaction.** The demotion of the old row and the
insertion of the new one commit together or not at all. Combined with P1b, there
is no observable moment in which a booking holds two intervals or none.

A violation of either constraint surfaces as an integrity error, which is caught
and returned as `conflict`.

**P2c · Two reschedules of the same booking are serialised, and the outcome is
defined.** A reschedule takes a per-owner advisory lock and then a row lock on
the booking's current confirmed row, demoting *that* row — not the row it read
earlier. Whatever the interleaving, all of the following hold:

- the booking ends with **exactly one** confirmed interval — never two, never
  none;
- that interval is one that some caller actually asked for;
- a caller that does not get its way returns **`conflict`**, not an integrity
  error it cannot interpret;
- the booking is **never left cancelled** by a failed move.

**It does not say "exactly one succeeds", and an earlier draft did.** That
wording assumed the writers race and one reads stale state. Once they are
properly serialised, two reschedules carrying *different idempotency keys* are
two genuine intents applied in order: the first moves the booking, the second
moves it again, both succeed, and the booking ends where the second asked. That
is correct, not a violation — a double-submit is what B1's idempotency key
exists to collapse, and these are not double-submits.

*Corrected 2026-08-02, when the implementation was first run against real
PostgreSQL with genuinely parallel connections. The clause had been written
against a mental model of racing rather than of queuing, and the test faithfully
asserted the wrong thing.*

P1b still makes the two-confirmed-row state impossible, but impossibility is not
a policy: without this clause a second writer could abort with an integrity error
the caller cannot interpret, and SPEC-0001 B6 requires a losing reschedule to be
a defined, non-destructive outcome.

**P2b · The engine stays pure across the boundary.** `now` is supplied by this
service on every call. The engine is never given access to a clock, a connection,
or an environment variable. Asserted by test.

**P3 · Constraints are revalidated inside the committing transaction**, with the
commit-time clock, per SPEC-0001 B3. A slot valid when the page rendered may be
invalid when the button is pressed; the answer is `expired`, decided at commit,
not at render.

**P4 · Bookings are append-only in effect.** Cancelling and rescheduling record
new state and preserve the prior record. History is required to explain what
happened to a booking, and destroying it makes B5 and B6 unauditable.

**P5 · Storage is PostgreSQL.** Chosen for the exclusion constraint in P1, which
is the requirement, not a preference. A store without an equivalent primitive
cannot satisfy P1 and is therefore not a substitution.

**P6 · Migrations run to completion before the new version serves traffic**, and
are forward-only. A half-migrated schema serving requests is how a booking system
loses bookings.

### 4.3 · Booking flow — `F`

**F1 · The engine decides what may be booked, not the form.** Slots come from
`compute_slots`, unmodified. The page may format and filter for display; it may
not add, shift, or extend.

**And a submitted interval is checked against a fresh computation before it is
accepted** — booking and rescheduling alike. Added 2026-08-02 after a
pre-handover review found the service trusting hidden form fields: it took
whatever `start` and `end` were posted, and the database only forbids *overlap*,
so a request for a night, a whole week, the wrong duration, or a day with no
availability at all would have been confirmed and would have locked a real
person's calendar. This is what §1 meant by every "may this booking be made"
question going to the engine, and it was the largest defect found in that
review.

**F2 · Times are converted for display only, at the edge.** The engine returns
UTC (SPEC-0001 §2). Rendering converts to the viewer's timezone in one place,
and no converted value is ever sent back to the server or stored. This is the
architecture the steward confirmed on 2026-08-01, and F2 is where it is kept
honest.

**F3 · Booking requires a name and an email address. Nothing else.** No phone, no
address, no free-text notes in this version. Every additional field is personal
data we would have to justify holding (D2).

**F4 · The page is a snapshot and says so.** A slot may be taken between render
and submit. That returns `conflict` with the refreshed list, not an error page.
This is normal operation, not a failure.

**F5 · Double submission is idempotent.** The page carries an idempotency key;
replaying it returns the original booking rather than creating a second, per
SPEC-0001 B1 and B5.1. Users double-click.

### 4.4 · Management links — `L`

**L1 · A management link carries a bearer token of at least 128 bits from a
cryptographically secure source.** Not a booking id, not a sequence, not a hash of
anything guessable. Anyone holding the link can act; that is understood and is why
the token must be unguessable.

**L2 · A token authorises exactly one booking**, and reveals nothing about any
other. Enumerating tokens must not enumerate bookings.

**L3 · Tokens expire** at the later of the booking's end time plus a grace period,
or the point at which the booking is cancelled. An indefinitely valid link in an
old mailbox is a standing liability.

**L4 · Cancelling releases the interval immediately** (SPEC-0001 B5); the slot is
bookable by anyone at once. Rescheduling is atomic (B6) and preserves the
`booking_id`.

### 4.5 · Mail — `M`

**M1 · Mail is a port, and the adapter speaks SMTP.** The service calls a small
interface; the transport sits behind it. No provider type, field, or error
appears outside the adapter.

**SMTP rather than a provider SDK**, decided 2026-08-02, for the same reason
`GAP-0004` §2 implements enterprise features from their standards: the standard
is both the safer and the better source. Every provider speaks it, so the choice
becomes a URL in configuration and switching costs nothing — no vendor library
enters the tree, and `INTENT.md` question 3 stops being a blocking decision. Pick
a provider on data-processing terms and residency when mail must actually leave
the building, which is the same question as D-105 in different clothing.

Three adapters ship: SMTP for real delivery, a file writer for development so
messages can be read without a server or an account, and a recorder for tests.
The file writer is deliberately not a silent no-op — a mail path that appears to
work and sends nothing is how "we tested it" becomes untrue.

**M2 · Mail is sent after commit, never inside the transaction.** A slow or
failing provider must not hold a database transaction open or roll back a
confirmed booking.

**M3 · Mail failure never invalidates a booking.** The booking is confirmed, the
page says so, and delivery is retried. A booking that exists only if an email was
delivered makes a third party's outage into lost meetings.

**M4 · Confirmation mail carries the management link (L1) and the meeting time in
the recipient's stated timezone**, converted at send, in one place, from the UTC
value.

**M5 · Both parties are notified** on booking, cancellation and reschedule. The
owner learns their calendar changed; the booker learns their meeting did. Omitting
either produces a person who believes something false about their own day.

### 4.6 · Data protection — `D`

**D1 · Operating limits are configurable, and the privacy basis is stated.** The
lawful basis for holding owner and booker data is written, in force, and
checkable in `src/legal.ts`: contract plus legitimate interest for account
holders, and the account holder's legitimate interest — with this service acting
as their **processor** — for bookers. `DEBT.md` D-105 remains open at DEGRADING
for what is genuinely outstanding: the legal entity name, the governing law, the
transfer mechanism, and a review by counsel.

**The ceilings stay, as defaults, and are now raisable.**

| Ceiling | Default | May be lowered | May be raised |
|---|---|---|---|
| Owner accounts | 5 | yes | yes, by configuration |
| Total bookings retained | 200 | yes | yes, by configuration |

Reaching a ceiling refuses the next write with a clear message and does not
degrade anything already stored. Public signup is likewise a configuration
decision (I2) rather than a permanent block.

*Why the ceilings survive as defaults.* A fresh deployment should not silently
become a service holding thousands of strangers' details before anyone chose
that. A default that must be raised deliberately keeps the choice visible. What
changed is that raising it is now a decision an operator is allowed to make,
rather than one the code refused on behalf of a question nobody had been assigned
to answer.

*What the earlier version got wrong, recorded rather than quietly dropped.* The
un-raisable ceiling and permanent signup block were compensating controls for an
unanswered question. They were strict about a private, deletable database of
booking details while the same project published a natural person's identity and
environment fingerprint permanently and unrecallably by default. The care now
sits where the irreversibility is — see CHARTER §5.2's published/held split.

**D9 · The booker is told, at the point of collection, in one sentence.** The
booking form states what is stored, who can see it, and how to have it deleted,
with a link to the detail. Not a policy nobody opens — one visible line, next to
the field where the person is typing their address. This costs nothing and is the
minimum owed to someone handing over their email to software they have never
heard of.

**D2 · Collect what the stated purpose supports, and record the reason beside
each field.** The purpose is operating the service and improving it, and that is
what `src/legal.ts` tells people.

*Personal data stays minimal*, because it is the category where collection is
hardest to justify and deletion has to actually work. Owner: email, display name,
timezone, availability rules. Booker: name, email, the interval, and their
timezone for display. No new **personal** field without a recorded reason.

*Operating and quality data is not held to that standard*, because it is not
about a person. Feature usage, timings, error and crash detail, and the shape of
a configuration are collected freely under CHARTER §5.2's held tier — they carry
no booker or owner identity, they are what tells us why the software failed for
someone, and refusing them was a rule against learning anything. The boundary is
the same line the charter draws: **how the software behaved is ours; what a user
put into it is theirs.**

**D3 · Deletion works and is reachable.** An owner can delete their account and
everything belonging to it. A booker can delete their booking data from the
management link. Deletion removes the data; it does not merely hide it.

**D4 · A booker's email is never shown to anyone but the owner of that booking**,
and never appears in a URL, a log line, or a report.

**D5 · Automatic reporting carries no owner or booker identity, in either
tier.** Not their names, addresses, or meeting times. Charter Part 5.1 requires
this item to implement reporting and a working opt-out.

What each tier may carry, since §5.2 now defines two:

| Tier | May carry | Never carries |
|---|---|---|
| **Published** | Conformance results, environment facts, the operator's signature. | Anything about owners or bookers, including counts derived from them. |
| **Held** | Feature usage, timings, error and crash detail, configuration shape — including *aggregate* counts such as how many bookings a deployment holds. | Names, email addresses, meeting times, note contents, or any value a booker typed. |

Aggregate counts move to the held tier rather than staying forbidden outright:
"this deployment holds 4 schedules and 60 bookings" is operating signal, is not
about any identifiable person, and is exactly the kind of fact that shows whether
the product works. It is never published and never signed.

*Stated precisely, because the absolute version is false:* the report **is**
signed with the operator's own identity (`REPORTING.md`), which is personal data
about **the operator**. What D5 forbids is data about **the people the operator
serves** — who never chose to publish anything. The distinction is the whole
point: an operator publishes their own conformance result; their bookers do not
publish anything, ever.

**D6 · Every subprocessor is named before it holds anyone's data.** The mail
provider and the hosting platform both see personal data. Each is listed publicly
with what it receives and why, before the first message is sent. An unnamed
subprocessor is data shared without disclosure, whatever the intention.

**Enforcement is a loud refusal to send, not a refusal to start.** Configuring a
mail host absent from `SUBPROCESSORS.md` logs a prominent warning at startup and
**refuses to send mail through it** until it is listed. The service still boots,
still serves booking pages, and still records bookings. Refusing to start turned
a disclosure duty into an outage: no privacy regime requires a service to be
down, and taking the whole product offline over an undisclosed *mail* host
punished the operator far past the harm. The duty is that nobody's details reach
an unnamed party — refusing the send satisfies it exactly.

**D7 · Deletion reaches as far as we control, and says where it stops.** D3
removes application data. Backups, replicas, and subprocessor copies expire on
their own schedules, and those schedules are documented rather than implied. A
deletion promise that quietly excludes backups is the most common false statement
in privacy policies.

**D8 · A management link is a bearer credential and its powers are bounded
accordingly.** Anyone holding it can cancel or reschedule (L1). It may **not**
delete personal data outright without a confirmation step from the same link,
because a forwarded email should not be able to destroy a record silently.

### 4.7 · Operations — `O`

**O1 · Deployment is from GitHub to Railway on push to the default branch.** The
running service corresponds to a commit, and which commit is discoverable from
the service itself.

**O2 · Secrets live in the platform, never in the repository.** Database URL, mail
credentials, session key. A secret in git is a secret to rotate, and the
`.gitignore` is a convenience rather than a control.

**O4 · The service refuses to start on a tzdata or PostgreSQL version
mismatch** (§5), and reports the versions it is running on its readiness surface.
Serving wrong times while reporting health is the failure §5 exists to prevent.

**O3 · Health and readiness are distinct.** Health means the process is up.
Readiness means migrations are complete and the database answers. The platform
must not route traffic to a ready-looking instance that cannot serve.

**O5 · Time is UTC everywhere server-side.** The server's local timezone is never
consulted. The only timezone-aware operations are the engine's, which take it as
an argument, and display conversion at the edge (F2).

## 5 · Environment dependency

Inherits SPEC-0001 §6 in full: the engine's behaviour depends on the IANA tzdata
version, which must be pinned and asserted at startup — **not only in tests.** A
service that starts with the wrong tzdata will compute wrong slots and report
that it is healthy.

- **Pinned:** `tzdata 2026a`, matching the engine.
- Startup asserts the version and **fails to start** on mismatch. Serving wrong
  times is worse than not serving.
- PostgreSQL version is pinned; the exclusion constraint in P1 is version-
  sensitive and is asserted by a migration test.

## 6 · Risk

`CHARTER.md` Part 4: **can this change hurt someone outside the project?**

**Yes, throughout.** This item holds third parties' personal data, books on their
behalf, and sends mail in their name. Per `RISK_ZONES.yaml`, everything except
documentation and tests is can-hurt, and the inheritance rule reaches the rest:
the whole service is substrate for the booking path.

**What that requires:** two approving code reviews from two model families other
than the builder's, plus a steward release sign-off on a plain-language note.
The release note must state D-105's status (`DEBT.md`).

## 7 · Acceptance criteria

The charter's merge gate applies in full and is **not restated here** — see
`CHARTER.md` Part 3, Part 4 and Part 5.1. Additional to it:

1. Every case in `acceptance/cases.json` passes.
2. **The exclusivity constraint is proven at the database level:** concurrent
   booking of one interval, ≥1000 iterations, exactly one `confirmed`. The test
   must fail if the constraint is dropped and the application check alone remains.
3. tzdata assertion fails startup on mismatch (§5).
4. The engine is called with an injected clock and performs no I/O — asserted by
   test across the boundary (P2).
5. Public signup cannot be enabled while D-105 is open — asserted by test.
6. Deletion is verified by absence, not by a flag (D3).
7. Reporting exists, the opt-out works, and behaviour is identical with it on and
   off — the five gate checks in `CHARTER.md` Part 5.1.
8. Provenance is recorded for any surface studied from Cal.com or Calendly: what
   was studied, by whom, and that the implementer did not read their code
   (`DUPLICATION.md` §5 condition 5).

## 8 · Suite coverage

The suite is a floor, not a ceiling.

**41 cases.** Every clause has at least one; the mapping is checked mechanically
rather than asserted here, because a hand-maintained coverage table drifts from
the suite it describes — that is [`L-007`](https://github.com/pumasi-ai/governance/blob/main/lessons/L-007-restating-a-rule-forks-it.md).

| Cases | Cover |
|---|---|
| I-001 – I-006 | Invite consumption under concurrency; signup flag fails closed; session properties; cross-account denial; booker needs no credential; rate limiting (I1–I6) |
| P-001 – P-008 | Exclusivity under concurrency; **both** constraints present structurally; engine purity; commit-time revalidation; **reschedule never holds two intervals or none**; history preserved; store primitive required; migration ordering (P1a–P6) |
| F-001 – F-005 | Slots unmodified; display conversion only; minimal fields; stale-slot conflict; double-submit idempotency (F1–F5) |
| L-001 – L-004 | Token entropy and scope; no cross-booking disclosure; expiry; cancel releases and reschedule preserves id (L1–L4) |
| M-001 – M-005 | Adapter isolation; sent after commit; provider outage leaves booking confirmed; recipient-timezone rendering; both parties notified (M1–M5) |
| D-001 – D-008 | Signup blocked while D-105 open; minimal collection; deletion by absence; no email disclosure; reporting excludes user data; subprocessors named; deletion reach stated; link cannot delete in one step (D1–D8) |
| O-001 – O-005 | Deployed commit discoverable; no secrets in repo; readiness distinct from health; refuses to start on version mismatch; host timezone irrelevant (O1–O5) |

**P-005 is the case that matters most.** The first draft of this spec would have
passed every other case in this suite while permitting a booking to hold two
intervals at once.

## 8.1 · Implementation status

*Recorded 2026-08-02 after the first implementation and its adversarial review.
A specification that lists clauses without saying which are built is a
specification that will be believed.*

**Built and tested** — the booker's path, end to end: F1–F5, B3/B4, L1/L2, M1–M5,
D1/D2/D8/D9, I5/I6, O1/O3, P1a/P1b/P2a/P2c/P3/P4/P5/P6.

**Declared but NOT implemented.**

| Clause | Missing |
|---|---|
| **O2** | Secret loading is present, but the only secret so far is the database URL. |

Everything else in this specification is built and tested.

**Implemented since — D3, D6, D7, O4, O5 (2026-08-02).** An owner can delete
their account, removing their bookers' details with it — verified by absence
across every table. The subprocessor list is **published and enforced**: the
service refuses to start if configured to send through a host not named in
`SUBPROCESSORS.md`, so the document is a control rather than a description. The
retention statement says how far deletion actually reaches, including that sent
mail cannot be recalled. The service refuses to start on a timezone-transition
disagreement, and results are asserted identical under three different host
timezones.

**Implemented since — L3, L4 (2026-08-02).** A management link now expires seven
days after the booking ends, enforced in the lookup rather than at each call
site, and expressed as "not found" so an expired link is indistinguishable from
a wrong one. Reschedule has a route: the manage page offers the engine's other
available times, the move is atomic, a loser gets the refreshed list, and both
parties are notified.

**Implemented since — I1, I2, I3, I4 (2026-08-02).** Invites are consumed
atomically with account creation and proven under 15 rounds of parallel
redemption; sign-in is passwordless with single-use expiring links; sessions are
opaque server-side references invalidated on logout; and owner-scoped access is
filtered **at the query**, verified by reaching for another owner's schedule by
direct identifier rather than by looking for a button.

**Database drivers — resolved 2026-08-02.** `DATABASE_URL` now selects
node-postgres with a pooled **connection per transaction**, which is what makes a
transaction actually request-scoped; without it, `BEGIN` and `COMMIT` issued from
concurrent handlers onto one session interleave. With no URL the service runs on
in-process PGlite — genuine PostgreSQL including `btree_gist`, so the constraints
are real, but nothing survives a restart.

**Host independence is a requirement, not a preference.** `P12` says no special
protocol is required to participate, and the commercialization foundations make
self-hosting first-class forever. The service therefore needs a port and
optionally a database URL, and nothing more. A container image and a compose file
cover the general case; any provider-specific file in the tree is one convenience
among several and never a dependency.

**Closed 2026-08-02.** PostgreSQL 18 now runs as a **user process** — no root, no
container — so the pooled path and genuine parallel connections are part of the
ordinary suite rather than something only CI can reach. That immediately found
two things nothing else could:

- **Deadlocks under contention.** Concurrent inserts of overlapping ranges block
  on each other inside the exclusion constraint, and with enough contenders the
  wait graph cycles and PostgreSQL aborts victims. The store rethrew those, so
  under load *nobody* won — breaking SPEC-0001 B2's "exactly one returns
  confirmed". Contenders for one owner now take a per-owner advisory lock and
  **queue**, so the constraint still decides who holds the interval while the
  free-for-all that produced cycles is gone. A bounded retry remains as a
  backstop.
- **P2c said the wrong thing**, and its test faithfully asserted it. See P2c.

PGlite is still the default and is still genuine PostgreSQL, but it has one
connection: nothing there can interleave, so no race is ever run. Both are kept —
PGlite for a zero-configuration start, a real server for anything about
concurrency.

## 9 · Human involvement

Under `CHARTER.md` Part 2 the steward does not approve specifications or tests.
The confirmed decisions for this item are in [`INTENT.md`](./INTENT.md):

| Decision | Status |
|---|---|
| This deserves to exist | **yes**, 2026-08-01 |
| The intent statement is correct | **yes**, 2026-08-01 |
| May touch a can-hurt surface | **yes**, 2026-08-01 |
| May be released to the public | **blocked** — D-105 |

**Conflict disclosure.** The steward is also the sponsor (`DEBT.md` D-101). The
compensating control is that the acceptance suite is frozen when spec review
completes, before implementation, and that reviews come from model families that
did not write the work.
