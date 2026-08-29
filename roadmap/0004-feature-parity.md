# GAP-0004 — Scheduling feature parity, and beyond it

> *Filed in the commons as `GAP-0004` and moved here on 2026-08-29. A gap is a
> commons artifact until it becomes a product; after that its roadmap belongs
> beside the code that has to change. History before the move is in
> [`pumasi-ai/pumasi`](https://github.com/pumasi-ai/pumasi/commits/main/gap/0004-feature-parity.md).*

**Filed:** 2026-08-01 · **Status:** open, roadmap — **not converted to a spec**
**Signed:** *(single identity; the steward is also the sponsor — `governance/DEBT.md` D-101)*
**Related:** SPEC-0001 ([`core/spec`](https://github.com/pumasi-ai/pumasi-booking/tree/main/core/spec)) (the engine, built) ·
`GAP-0002` *(calendar integration — reserved, unwritten)* ·
[`core/spec/DUPLICATION.md`](https://github.com/pumasi-ai/pumasi-booking/blob/main/core/spec/DUPLICATION.md)

---

## 1 · The direction

The steward's instruction, recorded verbatim in
[`core/spec/INTENT.md`](https://github.com/pumasi-ai/pumasi-booking/blob/main/core/spec/INTENT.md):

> We will not copy Cal.com, but we will review them carefully and implement all
> the features and UX if needed in a similar or same way. In addition, we will
> implement even some features which are not included in the free tier.

Plus: adopt whatever is good in Calendly.

So the target is **not** a minimal scheduling library. It is a permissively
licensed equivalent of the category leaders, and eventually a superset. This gap
records that as a sequence, because a target that large cannot be one item and
must not become one spec.

## 2 · The licence constraint that shapes everything here

**This gap is the largest standing threat to `P1`**, which is unamendable: all
catalog software is Apache-2.0, inbound-equals-outbound.

| Source | Licence | What we may do |
|---|---|---|
| Cal.com core | **AGPL-3.0** | Study behaviour. Match features. **Never copy or closely paraphrase code.** AGPL code in an Apache-2.0 work makes it a derivative and breaks P1. |
| Cal.com `/ee` | **Proprietary** — Enterprise Licence, not open source | Study *published behaviour and documentation* only. Do not read the source. More restricted than the AGPL part, not less. |
| Calendly | Closed, SaaS | Observe the product. Read public docs. Nothing else is available and nothing else is needed. |
| Standards (RFC 5545, CalDAV, SAML, OIDC, SCIM) | Open specifications | **Implement directly from these.** Most "enterprise" features are standards, so the standard is both the safer and the better source. |

**Features and behaviour are not copyrightable; implementations are.** Matching a
feature set is legitimate and is what this gap is for. Reproducing an
implementation is not.

### 2.1 Clean-room separation is mandatory for this work

The rule, which applies to every item descending from this gap:

1. A **study agent** reads the reference implementation or product and writes a
   **behavioural description** — inputs, outputs, edge cases, observable
   behaviour. It emits **no code**, not even sketches or signatures.
2. A **build agent that has not read the reference** implements from that
   description alone.
3. The two must be **different model families**, which the merge gate already
   requires for other reasons, so this costs nothing structurally.
4. The provenance is recorded on the change: what was studied, by whom, and that
   the implementer did not read it.

This is the standard defence against contamination claims, and it happens to fit
an agent-built commons unusually well — separating who-read-what is trivial here
and notoriously hard with human teams.

**Where a public standard exists, skip the study step entirely and implement from
the standard.** It is cheaper, cleaner, and produces better software.

## 3 · The sequence

Ordered by dependency, not by attractiveness. Every later item assumes the
earlier ones are correct.

| # | Item | Why here |
|---|---|---|
| **1** | **Scheduling core** — slots, booking, cancel, reschedule | Built — [`core/spec`](https://github.com/pumasi-ai/pumasi-booking/tree/main/core/spec). Everything below depends on "when is this person free, and can this slot be claimed" being right. |
| **1b** | **Deployable service** — accounts, booking pages, confirmations, cancel/reschedule links, deployed from GitHub to Railway | [`service/spec/0002`](https://github.com/pumasi-ai/pumasi-booking/tree/main/service/spec/0002), added 2026-08-01 on the steward's direction, written **in parallel** with item 1 rather than after it. Wraps the engine; does not replace it. It is numbered 1b because it is a delivery vehicle for item 1, not a further feature — everything from item 2 down now lands *inside* it. |
| **2** | **Booking limits and periods** — per week/month/year, total-duration caps, rolling windows, business-day counting, fixed date ranges, `offset_start` | Pure functions over item 1. Cheap once the engine is correct, and each is a known bug source in the incumbents. Currently deferred in `SPEC.md` §2.1. |
| **3** | **Recurrence** — RFC 5545 RRULE expansion via a reused library | Standard, and `DUPLICATION.md` §5.1 already forbids hand-rolling an expander. |
| **2b** | **Calendar providers** — Google, Microsoft | [`GAP-0002`](./0002-calendar-integration.md). **Promoted 2026-08-03**, from item 4 to next after the engine. Not a refinement: without it the service offers times the owner is already busy and confirms bookings on top of them, so it is the difference between a demonstration and a product. Still the first item holding third-party credentials. |
| **5** | **Multi-host scheduling** — collective availability, round-robin, pooled assignment, seats per slot | Changes the exclusivity invariant (`B2`), so it is an amendment to item 1's semantics rather than an addition. Both Cal.com and Calendly have it. |
| **6** | **Routing** — forms that qualify and direct a booker to the right host | Calendly's most distinctive feature. Pure logic over items 1 and 5. |
| **7** | **Meeting polls** — propose times, participants vote, book the winner | Calendly has it; Cal.com does not. A genuine differentiator and largely independent of the rest. |
| **8** | **Workflows** — reminders, follow-ups, no-show handling | Needs notification transport, which is its own item. |
| **9** | **Enterprise identity** — SSO, SAML, OIDC, SCIM | Cal.com's *paid* tier. **Implement from the standards, never from their code.** This is the "beyond the free tier" instruction, and the standards route makes it both legal and better. |
| **10** | **Managed/templated events, white-labelling** | Also paid-tier there. Mostly configuration surface once 1–9 exist. |

**Not on this roadmap — steward decision, 2026-08-01:** payments and AI-assisted
scheduling suggestions. Payments carry money-handling harm and a compliance
surface out of proportion to a first catalog. AI suggestions would place a
non-deterministic component inside a system whose entire claim is determinism
(`SPEC.md` S12). Recorded as a decision rather than an omission — revisitable on
evidence, but not open by default, and not to be reintroduced by accretion.

## 4 · What "and beyond" should mean

Matching a feature list is not a reason for anyone to switch. Two things could be:

- **Correctness the incumbents do not have.** Both leaders have open bugs in
  daylight-saving handling and booking-limit boundaries — see `GAP-0001` §2 and
  `SPEC.md` §10. A scheduling engine that is *demonstrably* right at the
  boundaries, with the test suite public and reproducible, is a claim neither can
  currently make.
- **Embeddability.** Both are products first. A permissively licensed engine
  designed to be embedded — no server required, no storage assumed — is the thing
  that is actually unavailable today, and is why `DUPLICATION.md` returned BUILD.

Feature parity is the price of being taken seriously. Neither of the above is
achieved by having more features than Cal.com.

## 5 · Readiness without premature building

The steward's requirement is that these items be implementable later **without
rework**. That is not the same as building for them now, and the difference
matters: building the abstraction before the requirement is
[`L-001`](https://github.com/pumasi-ai/governance/blob/main/lessons/L-001-governance-ahead-of-evidence.md), which is the failure
this project has already paid for once.

**The line: name the seams, do not build them.**

`SPEC.md` §12 does exactly this for the engine. It separates the roadmap into
what extends cleanly (calendar providers arrive as plain busy intervals; routing,
polls and workflows sit above the engine and never change how it answers), what
would have required *amending* a frozen clause, and what merely touches one.

Only the second category justified changing anything today, and only in wording:

- **B2** stated non-intersection as an invariant, which seats-per-slot reverses.
  It now states capacity is 1 *as a quantity*, so item 5 becomes a change of
  value rather than an amendment to a semantic clause.
- **`owner_timezone`** is marked as one-owner, making a host set with a single
  member the degenerate case for item 5's multi-host work.

Neither change alters behaviour, and no acceptance case moved. That is the whole
budget readiness should get before there is an implementation to learn from.

## 6 · Why this is a gap and not ten specs

Ten specs written now would be ten specifications written against zero users, no
implementation experience, and an engine that does not exist yet — which is
[`L-001`](https://github.com/pumasi-ai/governance/blob/main/lessons/L-001-governance-ahead-of-evidence.md).

**Item 1b is being specified now, in parallel with item 1**, at the steward's
direction and against the recommendation to sequence it. The risk accepted is
that the wrapper is specified against an engine whose real shape is unproven; the
mitigation is that the engine's interface is already frozen by 33 acceptance
cases, so the surface the wrapper depends on is not guesswork.

**Convert item 2 when item 1 has an implementation that passes its suite.** Then
one item at a time, each with its own intent statement, each confirmed before the
specification is written. The sequence above is a plan, not a backlog, and it
should be re-derived from evidence at each step rather than followed because it
is written down.
