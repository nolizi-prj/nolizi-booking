# SPEC-0001 — Scheduling Core

**Office:** Specifier · **Drafted:** 2026-07-28 · **Status:** awaiting human spec approval
**Gap:** [`GAP-0001`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0001-scheduling.md) · **Duplication finding:** [`DUPLICATION.md`](./DUPLICATION.md) — verdict BUILD
**Acceptance suite:** [`acceptance/cases.json`](./acceptance/cases.json) — **frozen at approval; the Builder may not modify it** (`RULE-6.4-ACCEPTANCE-IMMUTABLE`)

---

## 1 · What this is

Two operations. Nothing else.

```
compute_slots(request) -> {slots: Slot[], diagnostics: Diagnostic[]}     # pure function
book(request)          -> {status, booking_id}                           # has state, has races
cancel(request)        -> {status}                                       # releases an interval
reschedule(request)    -> {status, booking_id}                           # atomic move
```

`cancel` and `reschedule` are not conveniences bolted on later. A booking system
whose only verb is *create* has an exclusivity invariant (B2) that is never
tested against release, and retrofitting release changes that invariant rather
than extending it. They are specified here for that reason.

`compute_slots` is a **pure function of its arguments** — including the clock,
which is passed in. There is no ambient time, no ambient timezone, no I/O. This
is a specification requirement, not an implementation suggestion: acceptance tests
of a function that reads the system clock are not deterministic, and a
non-deterministic acceptance test cannot be the sole truth that C5 says it is.

## 2 · Non-goals

UI · calendar-provider integration ([GAP-0002](https://github.com/pumasi-ai/pumasi/blob/main/gap/0002-calendar-integration.md)) · notifications · payments ·
round-robin or team pooling · persistence · **requester-timezone presentation** ·
**seats per slot** · the limit classes in §2.1.

**Out of scope for this spec, not for the catalog.** All of the above are
sequenced in [`GAP-0004`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0004-feature-parity.md), which records the
steward's direction that this catalog reach feature parity with Cal.com and
Calendly and then exceed it. This item is the engine everything else stands on;
holding the surface area down here is what makes the rest cheap and correct.

**Seats are out of scope here, and B2 depends on that.** `seatsPerTimeSlot > 1` — several
attendees sharing one interval — contradicts B2's "no two confirmed bookings
intersect" outright. This is recorded because B2 silently forecloses the feature:
a later decision to support seats is an amendment to B2, not an addition to it.

The last one is a deliberate design decision: **all output is UTC.** Cross-timezone
slot rendering is a display concern, and keeping it out of the core removes an
entire class of boundary-drift bugs by removing the representation that causes
them. Callers convert for display.

**Confirmed by the steward on 2026-08-01**, after the question was put explicitly
in `INTENT.md`. `DUPLICATION.md` §4 previously listed cross-timezone presentation
among the surface this item would build; that entry has been struck so the
duplication finding and this spec agree. Adding a display layer later remains
additive (§12.1) — the engine keeps one representation, which is the point.

### 2.1 Deferred limit classes — sequenced, not abandoned

*Since 2026-08-01 the direction is explicit feature parity with Cal.com and
Calendly, and beyond it — [`GAP-0004`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0004-feature-parity.md). Every
row below is **item 2 on that roadmap**, to be converted once this engine has an
implementation passing its suite. They are out of scope for this spec, not for
the catalog.*

*Clean-room applies to all of it: matching a feature is legitimate, reproducing
an implementation is not. See `DUPLICATION.md` §5 condition 5.*

Surveyed 2026-07-30. Every row below is a **Cal.com** capability unless marked
otherwise; Calendly was surveyed too but is not the source of these particular
features. Each is a real requirement this core does not meet, deferred explicitly
so its absence is a decision on the record rather than an oversight:

| Deferred | What it is | Why it is not free |
|---|---|---|
| Limits per week / month / year | `max_bookings_per_day` generalized | **Week start must be specified and is not universal** (ISO Monday vs US Sunday vs configured). Cal.com issue #23365 is a week-boundary limit leaking; it is evidence the boundary is error-prone, not proof of any particular rule. Needs a stated week-start before it can be built. |
| Duration limits | Cap on *total booked minutes* per period | A different constraint class from counting bookings; no representation here. |
| Period types | `ROLLING_WINDOW` / fixed `RANGE` / business-days counting | S8 is deliberately absolute. "14 business days" needs owner-local calendar arithmetic and a holiday source. |
| `offset_start` | Shifts the candidate grid (meetings at :05) | S5 hardcodes the grid to the window start. |
| Multiple selectable durations | One event type, several lengths | Changes `duration_minutes` from scalar to set, and with it every S5 candidate. |

None is admitted to this spec. All are `GAP-0004` item 2, and the reason to hold
them is sequencing rather than doubt: each is a pure function over a correct
engine, and each is a known bug source in the incumbents precisely because it was
built on an engine whose boundaries were not nailed down first.

## 3 · Interface contract

Language-neutral. Field names are normative; wire encoding is JSON.
Instants are RFC 3339 with `Z`. Local times are `HH:MM`, 24-hour.

### 3.1 `compute_slots` request

| Field | Type | Notes |
|---|---|---|
| `owner_timezone` | IANA name | e.g. `America/New_York`. Must exist in the pinned tzdata. **One owner in this spec** — see §12 on multi-host. |
| `availability` | `[{weekday, start, end}]` | `weekday` = `MO`..`SU`. Local wall-clock. Recurs weekly. |
| `date_overrides` | `[{date, windows}]` | Local date. **Replaces** that date's weekly rules entirely. `windows: []` means unavailable. |
| `busy` | `[{start, end}]` | Absolute instants. May overlap. Zero-length ignored. |
| `duration_minutes` | int > 0 | |
| `granularity_minutes` | int > 0 | Slot starts step by this from window start. |
| `buffer_before_minutes` | int ≥ 0 | Default 0. |
| `buffer_after_minutes` | int ≥ 0 | Default 0. |
| `minimum_notice_minutes` | int ≥ 0 | Measured from `now`. Default 0. |
| `maximum_horizon_days` | int ≥ 0 | Measured from `now`. Default 3650. |
| `max_bookings_per_day` | int > 0 or null | Counted per **owner-local date**. Default null. |
| `bookings_per_local_date` | `{date: count}` | Existing count, for the cap above. |
| `query` | `{from, to}` | Absolute, half-open. Span bounded — see S14. |
| `max_query_span_days` | int > 0 | Largest permitted `query` span. Default 31. |
| `now` | instant | **Required.** Injected clock. |

### 3.2 Response

```json
{ "slots": [{"start": "...Z", "end": "...Z"}],
  "diagnostics": [{"code": "...", "detail": "...", "date": "..."}] }
```

`date` is **optional**: it is present when a diagnostic concerns a specific
owner-local date (S3, S4) and absent when it concerns the request as a whole
(S14).

Slots sorted ascending by `start`, then `end`. **Slots may overlap each other**
when `granularity < duration` — they are candidates, not a partition.

## 4 · Semantics — the decisions that must not be left to the implementer

Every clause below exists because it is a documented way this gets built wrong.

**S1 · Window materialization.** A local window `[S, E)` on local date `D`
materializes to the absolute interval starting at the **earliest** instant on `D`
whose local time is `S`, and ending at the **first instant at or after that start**
whose local time is `E`.

**The search for `E` is bounded to `D` and the following local date**, which is
what makes overnight windows (`22:00–02:00`) work without letting a window run
for days. If `E` does not occur at or after the start within that bound — because
a transition skipped it — the window is **malformed**, and is skipped with a
`NONEXISTENT_LOCAL_TIME` diagnostic exactly as a nonexistent start is. An
unbounded search would silently turn `23:00–02:30` on a spring-forward eve into a
27-hour window, which is never what a daily availability rule means. *Bound added
2026-08-02; adversarial review of the first implementation found the clause
under-specified here and the behaviour therefore accidental.*

**S2 · Spring forward — window spanning the gap.** Follows from S1 without a
special case. `01:00–04:00` on `2026-03-08` in `America/New_York` materializes to
`06:00Z–08:00Z` — **two absolute hours, not three.** Local `02:00–03:00` never
happens.

**S3 · Spring forward — nonexistent start.** If `S` does not exist on `D`, the
window is **skipped entirely** and a `NONEXISTENT_LOCAL_TIME` diagnostic is
emitted. It is not silently shifted forward. Silence here is how this bug survives
to production.

**S4 · Fall back — ambiguous times.** Follows from S1. `01:00–03:00` on
`2026-11-01` in `America/New_York` materializes to `05:00Z–08:00Z` — **three
absolute hours, not two.** The 01:00 hour occurs twice and both occurrences are
bookable. A `AMBIGUOUS_LOCAL_TIME` diagnostic is emitted.

**S5 · Candidate generation.** Starts are `window_start + k × granularity` for
integer `k ≥ 0`, in absolute time. A candidate is kept only if
`start + duration ≤ window_end`. Slots never spill past a window.

**S6 · Buffers.** A candidate `[s, e)` is rejected if
`[s − buffer_before, e + buffer_after)` intersects any busy interval.
**Buffers are evaluated against busy intervals only, never against window
boundaries** — a slot flush against the end of the day is bookable even though its
trailing buffer extends past it.

**S7 · Minimum notice.** Keep only if `start ≥ now + minimum_notice`.

**S8 · Horizon.** Keep only if `start ≤ now + maximum_horizon_days × 24h`.
Absolute, not calendar-local.

**S9 · Daily cap.** If `max_bookings_per_day` is set and
`bookings_per_local_date[owner_local_date(start)] ≥ max`, all candidates on that
**owner-local** date are dropped. The owner's date, not UTC's, not the requester's.

**S10 · Query clamping.** Keep only if `start ≥ query.from` **and**
`end ≤ query.to`. Half-open, both ends.

**S11 · Date overrides** replace the weekly rules for that local date completely.
They do not merge.

**S12 · Determinism.** Same request ⇒ byte-identical response. No ambient state.

**S14 · Query span is bounded.** If `query.to − query.from` exceeds
`max_query_span_days × 24h` — absolute, as in S8 — return **no slots** and emit
`QUERY_RANGE_TOO_LARGE` (no `date` field; see §3.2). The
range is **not** silently clamped. An unbounded query against the default
3650-day horizon is a resource-exhaustion path, and clamping it quietly returns a
truthful-looking partial answer to a question the caller did not ask. Calendly's
`event_type_available_times` API caps a single call at 31 days; that API limit is
where the default comes from, and it is a default, not a product law.

**S13 · Recurrence.** Weekly rules only in v1. Anything beyond weekly is expressed
as RFC 5545 RRULE and expanded by a **reused library** — writing an RRULE expander
is grounds for rejection at the gate (`DUPLICATION.md` §5.1).

## 5 · Booking semantics

### 5.1 Interface contract

Field names normative, as in §3. All three verbs take `idempotency_key` and
`now`; all revalidate at commit (B3).

| Verb | Request | Response |
|---|---|---|
| `book` | `{start, end, idempotency_key, now, minimum_notice_minutes?}` — or `{slot, …}` where `slot` is a `{start, end}` pair returned by `compute_slots` | `{status, booking_id}` |
| `cancel` | `{booking_id, idempotency_key, now}` | `{status}` |
| `reschedule` | `{booking_id, new_start, new_end, idempotency_key, now, minimum_reschedule_notice_minutes}` | `{status, booking_id}` |

`status` ∈ `confirmed` · `conflict` · `expired` · `cancelled` · `not_found`.
`reschedule` returns the **same** `booking_id`; a move is not a new booking.
Fields marked `?` are optional and default as in §3.1. The acceptance harness
must additionally support **concurrent heterogeneous operations** — a `reschedule`
and a `book` contending for one interval — not only the homogeneous
`book_concurrent` of B-002.

### 5.2 Clauses

**B1 · Idempotency.** `book` takes an `idempotency_key`. Replaying a key returns
the original **booking** — same `booking_id` — and creates no second booking.
"Original booking", not "original response": if that booking has since been
cancelled or moved, the replay reports its state now. See **B5.1**, which is
normative for the divergent cases.

**B2 · Exclusivity.** **Capacity per interval is exactly 1 in this spec.** For
any two confirmed bookings, their `[start, end)` intervals do not intersect.
Under concurrent requests for intersecting slots, **exactly one** returns
`confirmed`; the others return `conflict`.

Capacity is named as a quantity rather than left implicit so that seats-per-slot
(`GAP-0004` item 5) becomes a change of *value*, not a reversal of an invariant.
Nothing here implements capacity > 1, and no acceptance case exercises it — see
§12.

**B3 · Revalidation at commit.** Constraints are re-evaluated at commit time
against the commit-time clock. A slot that was valid at compute time but now
violates minimum notice returns `expired`, not `confirmed`.

**The caller supplies the constraints to revalidate against.** This engine holds
no schedule state — it cannot look up the rules a slot was computed under, and
inventing them would be worse than asking. So `book` accepts the same constraint
fields `compute_slots` took, and revalidates against those. **Omitting them means
revalidating against nothing**, which returns `confirmed` for a slot that should
have expired. Discovered 2026-08-02 when case B-003 omitted
`minimum_notice_minutes` and therefore could not distinguish a correct
implementation from one that never revalidates at all.

**B4 · No partial state.** A non-`confirmed` result leaves no trace that affects
any later call. Two kinds of state are **deliberate** and out of B4's scope: the
idempotency record for a key (B1), and the cancellation record for a cancelled
booking (B5). Both are durable by design and both change later answers. B4
forbids *partial* state — the residue of an operation that did not complete — not
the recorded outcome of one that did.

**B5 · Cancellation releases the interval.** A cancelled booking no longer
constrains B2: the interval becomes bookable again, by anyone, immediately.
Cancelling is idempotent under its key, and cancelling an already-cancelled
booking returns `cancelled`, not an error. Cancelling an unknown `booking_id`
returns `not_found` and creates nothing. The cancellation is recorded; the
*interval* is released. Those are different facts and only the second one affects
B2.

**B5.1 · Replay returns current state, never a resurrection.** Replaying an
`idempotency_key` returns the booking's **`booking_id` and its state as of now** —
not the state at the time the key was first used. Concretely:

- Booking since **cancelled** → returns that `booking_id` with status
  `cancelled`. Not `confirmed`. The interval is not re-reserved, and the replay
  does not conflict with whoever holds it now.
- Booking since **rescheduled** → returns that `booking_id`, status `confirmed`,
  at its **current** interval. The replay does **not** re-claim the interval the
  booking used to occupy, and does not leave it holding two.

B1 is thereby refined, not contradicted: "the original result" means the original
*booking*, not a frozen snapshot of its first response. Without this, B1 promises
a replay returns the original result while B5 released the interval and B6 moved
it — and after a third party books the vacated interval, no implementation can
honour all three.

**B6 · Reschedule is atomic.** `reschedule` either moves the booking to
`[new_start, new_end)` **and** releases the old interval, or changes nothing.
There is no observable state in which the booking occupies both intervals or
neither. Under concurrent contention for the target interval, exactly one caller
wins. A losing `reschedule` returns **`conflict`** and leaves the original
booking `confirmed` at its existing interval, **unmoved and uncancelled.** A failed move must never degrade into a cancellation — that is how a
reschedule silently loses someone's meeting.

**B7 · Reschedule notice runs from the booking's current start.**
`minimum_reschedule_notice_minutes` is measured from `now` against the start the
booking **currently holds**, not the proposed one. After a prior move, "current"
means the moved-to start, not the first one ever booked — the two diverge and the
current start governs. The comparison is `now + notice ≤ current_start`, matching
S7's inequality. Moving a meeting 5 minutes before it
begins is the case this forbids; the new time being far away does not excuse it.
Violation returns `expired` and leaves the booking unmoved.

**Capacity is exactly one.** Every clause above assumes one confirmed booking per
interval (§2, seats). B2 and B5 are both stated in those terms.

## 6 · Environment dependency — mandatory declaration

*(Raised by DEBT.md D-006. This section is the reason that entry exists.)*

This spec's acceptance tests are **not a function of the implementation alone**.
They depend on the IANA tzdata version, which changes offsets for both historical
and future dates. Identical code passes on one machine and fails on another.

Therefore:

- **Pinned:** `tzdata 2026a` — the version the expected values were derived
  against.
- Test setup **must assert** the version and **report** a mismatch loudly. A
  skip is not acceptable; a silently skipped timezone test is worse than a
  failing one.
- **And, more importantly, it must assert the transitions themselves.** See
  §6.1.
- The Verifier matrix **must** include at least two tzdata versions, and report
  divergence as a finding rather than a flake.

### 6.1 · Assert the transitions, not only the label

*Amended 2026-08-02, during the first implementation. The original clause
checked only a version string, and the first host to run this suite had a
different one.*

A version label is a **proxy** for what actually matters. tzdata publishes
several times a year and most releases touch zones this suite never names, so a
label mismatch is a weak signal — and a label match would not prove the
transitions are what we believe either. Either way the label is not the thing
being relied upon.

So the runner asserts, against the host, **every transition the expected values
depend on**:

| Zone | Local time | Must be | Relied on by |
|---|---|---|---|
| `America/New_York` | 2026-03-08 02:30 | nonexistent | S3, C-008, C-023 |
| `America/New_York` | 2026-11-01 01:30 | ambiguous | S4, C-009 |
| `America/New_York` | 2026-06-01 09:00 | normal | most slot cases |
| `Australia/Sydney` | 2026-06-15 09:00 | normal | C-017 |
| `Pacific/Kiritimati` | 2026-06-01 09:00 | normal | C-018 |
| `Pacific/Apia` | 2011-12-30 12:00 | nonexistent | C-022 |

**A transition mismatch halts the run.** If the host's rules disagree with the
ones the expectations were derived from, no expected value in this suite can be
trusted, and continuing would report passes that mean nothing.

**A version mismatch alone is a finding**, printed and recorded, once every
transition above has been verified. This is stricter than the original clause in
the way that matters — it checks the actual dependency — and looser only in the
way that does not.

This table grows whenever a case starts depending on a new zone or date. A case
that relies on a transition absent from it is relying on something unverified.

C5 says nothing merges unless the tests pass. This spec is the first evidence
that "the tests pass" is an incomplete predicate: it must be "the tests pass,
against a declared environment." That is a charter-level gap, filed as `GP-0002`.

## 7 · Risk

`CHARTER.md` Part 4 asks one question: **can this change hurt someone outside the
project?** Assignments live in [`RISK_ZONES.yaml`](./RISK_ZONES.yaml).

| Path | | Why |
|---|---|---|
| `README.md`, `ALTERNATIVES.md`, `INTENT.md` | ordinary | Docs. |
| `acceptance/`, fixtures | ordinary | Tests; they do not ship. |
| booking commit path (`book`, `cancel`, `reschedule`) | **can hurt** | A race here double-books a real person. A lost reschedule silently drops someone's meeting. Real-world harm, not a code-quality defect. |
| availability engine (`compute_slots`) | **can hurt**, by inheritance | See below. |

**Why the pure function is also can-hurt.** It looks like ordinary library code —
no state, no I/O, no races. But `book` depends on it: B3 re-evaluates constraints
at commit time, so a slot `compute_slots` wrongly emits becomes a booking `book`
wrongly confirms. Charter Part 4: *"Anything the can-hurt path depends on is
itself can-hurt."*

This is the inheritance rule doing exactly what it was added for. Without it the
strict gate would guard the commit path while the engine deciding what is
bookable merged on the loose one — a longer, quieter route to the same
double-booking. In practice almost all of SPEC-0001 is can-hurt, and only its
docs and tests are not. That is the correct answer for a scheduler, not an
inconvenience to be classified around.

**What that requires** (charter Part 4, by reference — not restated here, so it
cannot drift): two approving code reviews from two model families other than the
builder's, and a steward release sign-off on a plain-language note.

## 8 · Acceptance criteria

The charter's merge gate applies in full and is **not restated here** — see
`CHARTER.md` Part 3 and Part 4. Two sources of truth for one rule is how they
drift apart. What follows is additional to it, and specific to this spec:

1. Every case in `acceptance/cases.json` passes — 33 cases, 21 slot and 12
   booking.
2. tzdata version assertion passes (§6). Test setup fails loudly on mismatch; a
   skip is not acceptable. The release matrix includes ≥2 tzdata versions and
   reports divergence as a finding, not a flake (`DEBT.md` D-102).
3. No hand-rolled RRULE expander present (`DUPLICATION.md` §5.1).
4. `compute_slots` performs no I/O and reads no ambient clock — asserted by test.
5. Booking cases B-001 – B-012 pass, covering clauses B1–B7. The concurrency
   cases, B-002 and B-010, run ≥1000 iterations each.
6. `ALTERNATIVES.md` exists and states plainly that Cal.com is more complete, is
   AGPL-3.0, and is the better choice for anyone who does not require a
   permissive license (`DUPLICATION.md` §5.3).

## 9 · Seed suite coverage

33 cases. Each maps to a semantic clause; the suite is a floor, not a ceiling.
S13 is the one clause with no runtime case: "no hand-rolled RRULE expander" is a
property of the tree, not of a response, and is enforced at the gate by §8 item 3.

| Cases | Cover |
|---|---|
| C-001 – C-003 | Basic generation, granularity, busy subtraction (S5) |
| C-004 | Buffers vs busy, not vs boundaries (S6) |
| C-005 – C-006 | Minimum notice, horizon (S7, S8) |
| **C-007 – C-009** | **DST: gap-spanning, nonexistent start, ambiguous fall-back (S2–S4)** |
| C-010 – C-011 | Date overrides (S11) |
| C-012 | Daily cap on owner-local date (S9) |
| C-013 | Query clamping (S10) |
| C-014 – C-016 | Degenerate busy, overlapping busy, window spill (S5) |
| C-017 – C-018 | Southern hemisphere, UTC+14 date-boundary crossing |
| C-019 | Leap day |
| C-020 | Query span bound, not silently clamped (S14) |
| C-021 | Determinism: byte-identical across repeat and fresh process (S12) |
| B-001 – B-003 | Idempotency, exclusivity under concurrency, commit revalidation (B1–B3) |
| B-004 | No partial state (B4) |
| B-005 – B-006 | Cancellation releases the interval; cancel is idempotent (B5) |
| B-011 – B-012 | Replay after cancel, and after reschedule, returns current state (B5.1) |
| B-007 | Reschedule atomicity, booking_id preserved (B6) |
| B-008 | Losing reschedule returns `conflict`, original unmoved — deterministic (B6) |
| B-010 | Reschedule vs book under genuine contention, unconditional invariants (B6) |
| B-009 | Reschedule notice measured from the current start (B7) |

## 10 · Specifier's note on writing tests first

Recorded because it is evidence for or against the charter's central bet.

Cases C-007, C-008, C-009, C-017, and C-018 were produced by working through the
edge cases *before* any implementation existed. Three of them — the gap-spanning
window yielding two hours, the ambiguous fall-back window yielding three, and the
Sydney window landing on the **previous UTC date** — have expected values that
contradict the obvious implementation. An implementation-first process would very
likely have produced code that is wrong in those cases and tests that agree with
it, because the tests would have been read off the behavior.

That is the whole argument for Principle 3, and it showed up on the first spec
written under it.

## 11 · Human involvement

Under `CHARTER.md` Part 2, a steward does **not** approve specifications or
acceptance tests — agents author them and a different model family reviews them
(WP 2: *"Agents do all of the development: specification, code, review, testing,
release, and maintenance"*).

The human decisions on this item are recorded in [`INTENT.md`](./INTENT.md):

| Decision | Status |
|---|---|
| This deserves to exist | *pending* |
| The intent statement is correct | *pending* |
| It may touch a can-hurt surface (§7) | *pending* |
| It may be released | not yet applicable |

**Conflict disclosure.** The steward is also the sponsor (`DEBT.md` D-101). The
compensating control is that acceptance tests are frozen before implementation
begins, so the standard is fixed before anyone knows whether the code meets it —
and cross-family review, which is what has actually caught defects here, is
unaffected by the conflict.

## 12 · Designed for what comes next

*Added 2026-08-01 on the steward's direction: the roadmap items in
[`GAP-0004`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0004-feature-parity.md) must be implementable later
without rework.*

**The principle: name the seams, do not build them.** Naming where a future
clause attaches costs nothing and stops the design foreclosing it. Building the
abstraction now would be `L-001` — machinery ahead of evidence — and is
explicitly not what this section does. **No clause below is implemented, and no
acceptance case exercises any of it.**

### 12.1 Already clean — these extend without touching a clause

| Later item | Why it is already free |
|---|---|
| Calendar providers (`GAP-0002`) | `busy` arrives as plain intervals. A provider adapter fills that list; the engine never learns where they came from. This is the design working as intended. |
| Recurrence beyond weekly | S13 already routes it to a reused RFC 5545 expander, which produces the same weekly rules this spec consumes. |
| Routing forms, meeting polls, workflows | Layers above the engine. They choose *which* question to ask it, never how it answers. |
| Requester-timezone presentation | Output is UTC. Adding a display layer is additive; the engine keeps its single representation, which is the point of §2. |
| Enterprise identity | Not the engine's concern at any level. |

### 12.2 Would have needed an amendment — reworded now instead

| Later item | The clause it would have broken | What changed today |
|---|---|---|
| Seats per slot | **B2**, which asserted non-intersection as an invariant | B2 now states capacity is 1 *as a quantity*. Seats becomes a value change, not a reversal. |
| Multi-host / round-robin | `owner_timezone` and `availability`, both singular | Marked as one-owner in §3.1. A host set with one member is the degenerate case; the field shape is unchanged today. |

### 12.3 Still additive, but they touch core clauses — expect review

Named so the cost is known in advance, not so it is paid now:

- **Booking limits per week/month/year** attach at S9, and each brings a boundary
  decision this spec does not make — chiefly **when a week starts**, which is
  locale-dependent and is a live bug in the incumbents.
- **Duration limits** (total booked minutes per period) are a different
  constraint class from counting bookings and need their own clause beside S9.
- **`offset_start`** attaches at S5, shifting the candidate grid from
  `window_start` to `window_start + offset`.
- **Period types** — rolling window, fixed range, business-day counting — attach
  at S8. S8 is deliberately absolute (`now + days × 24h`); business days need
  owner-local calendar arithmetic and a holiday source, which is a new dependency
  rather than a new parameter.

### 12.4 Not on the roadmap at all

**Payments** and **AI-assisted scheduling suggestions**, by steward decision on
2026-08-01. Payments carry money-handling harm and a compliance surface out of
proportion to a first catalog item. AI suggestions would place a
non-deterministic component inside a system whose entire claim is S12 —
determinism. Recorded as a decision rather than an omission; revisitable, but not
open by default.
