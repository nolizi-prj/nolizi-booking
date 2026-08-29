# Duplication Finding — GAP-0001 (scheduling)

**Office:** Curator · **Filed:** 2026-07-28
**Required by:** `RULE-7-DEDUP` — no Seed admission without this finding
**Verdict:** **BUILD**, narrowly, with mandatory reuse of four existing libraries

---

## 1 · Why this finding is required

Pumasi exists to end duplication. If it admits a project that duplicates
something already available, it is doing the thing it exists to prevent, and it
loses standing to complain about anyone else doing it. So the Curator's default
answer is **don't build**, and building requires an argument.

## 2 · Prior art surveyed

### 2.1 Products that solve the whole problem

| Project | License | Verdict | Reason |
|---|---|---|---|
| **Cal.com** | **AGPL-3.0** core + commercial `/ee` (open core) | **Unavailable** | See §3 |
| **Easy!Appointments** | GPL-3.0 | Unavailable | Copyleft; same analysis as §3 |
| **Rallly** | AGPL-3.0 | Unavailable + different product (group poll, not availability) |
| Calendly, SavvyCal, Chili Piper, Microsoft Bookings, Cronofy, Nylas | proprietary | Unavailable | Not inspectable, not reusable |

### 2.2 Libraries that solve *parts* of the problem — and must be reused

| Library | License | Solves | Finding |
|---|---|---|---|
| **RFC 5545 (iCalendar)** + `rrule` / `rschedule` | BSD / MIT | Recurrence expansion | **Reuse. Do not reimplement.** Recurrence is a solved, standardized problem and a reimplementation would be exactly the duplication this project opposes. |
| **IANA tzdata** | public domain | Timezone offsets, DST rules | **Reuse, and pin the version.** See §5. |
| **Temporal** (TC39) / `luxon` / `date-fns-tz` / `zoneinfo` | permissive | Timezone-aware arithmetic | **Reuse.** Platform-native where available. |
| **RFC 7986 / CalDAV** | standard | Interchange formats | **Conform, don't invent.** |

## 3 · The finding that decides it

**Cal.com is AGPL-3.0.** It is a mature, well-maintained, feature-complete
scheduling platform, and by any ordinary open-source reasoning the correct
answer would be "use Cal.com."

Pumasi cannot. Charter commitment **C1** fixes the catalog at **Apache-2.0,
inbound-equals-outbound**, and C1 is unamendable. AGPL-3.0 code cannot be
relicensed to Apache-2.0, cannot be vendored into an Apache-2.0 work, and cannot
be forked into the commons. Cal.com is not merely inconvenient to adopt; it is
**structurally invisible** to Pumasi.

The same reasoning eliminates every other maintained open-source scheduler found.

**Therefore, restated precisely:** it is not true that no open-source scheduler
exists. It is true that **no permissively-licensed scheduling core exists**, and
that is the gap. The finding is narrow and it is honest, and it should be
recorded in those terms rather than as "nothing exists."

### 3.1 Escalation to Council — a strategic consequence

This finding generalizes beyond scheduling and is escalated for a decision the
Curator office cannot make:

> **C1 makes the entire copyleft ecosystem invisible to the commons.** In every
> category where the best open-source work is GPL or AGPL, Pumasi must rebuild
> rather than adopt — which is duplication, performed by the project whose
> founding purpose is ending duplication.

This is a genuine and permanent tension in the whitepaper, not a bug in this
finding. C1 is unamendable, so the tension cannot be resolved by changing the
license. What *can* be decided is how the commons talks about it and where it
points people:

- **Option A — declare it.** Publish, per category, "the best answer here is
  AGPL and you should probably use it." Pumasi builds only where permissive
  matters (embedding, commercial redistribution, agent-assembled composition).
  Costs catalog size; buys enormous credibility.
- **Option B — build anyway, silently.** Maximizes catalog size. Makes Pumasi a
  permissive re-implementation factory pointed at other people's copyleft work,
  which is a bad-faith position that will be noticed and named.
- **Option C — scope to components.** Concentrate on the small composable pieces
  where no copyleft incumbent exists *because the piece is too small to be a
  product*, and where agent-level duplication is actually concentrated.

**Curator's recommendation: A + C.** Declare the copyleft answer honestly per
category, and aim the catalog at the component layer where the duplication
evidence is strongest. Filed as `GP-0003` (unwritten) for Council decision.

## 4 · Scope of the build, after reuse

Given mandatory reuse of recurrence, tzdata, and timezone arithmetic, the
remaining surface is genuinely novel and genuinely small:

- availability-rule model → materialized free intervals over a query window
- subtraction of busy intervals, with buffers applied on both sides
- constraint application: duration, granularity/increment, minimum notice,
  maximum horizon, per-day caps, date overrides
- **booking commit that admits exactly one winner per slot under concurrency**

Estimated ~1,200–1,800 LOC. Everything else is reuse.

**Amended 2026-08-01 — one item removed.** This list originally included
*"cross-timezone slot presentation without boundary drift"*. It was struck when
the steward confirmed that output stays in a single neutral representation and
callers convert for display (`SPEC.md` §2, `INTENT.md`).

Recorded rather than silently deleted, because the discrepancy mattered: an
adversarial review found that this finding had scoped presentation **into** the
BUILD justification while `SPEC.md` §2 declared it a non-goal — the verdict and
the spec disagreeing about what was being built. The resolution is that the
non-goal stands and this list now matches it.

**The verdict does not depend on the removed item.** BUILD rests on the licence
constraint alone: Cal.com is more complete and is unavailable to anyone needing a
permissive licence (§3). Removing presentation from the surface makes the
remaining work smaller and the justification narrower, which is the honest
direction for a duplication finding to move.

## 5 · Mandatory conditions on admission

1. **No recurrence engine may be written.** Depend on an RFC 5545 implementation.
   A PR containing a hand-rolled RRULE expander is rejected at the gate.
2. **tzdata version must be pinned and asserted at test setup** (DEBT.md D-006).
3. **`ALTERNATIVES.md` is a required deliverable**, stating plainly that Cal.com
   is more complete, is AGPL, and is the right answer for anyone who does not
   need a permissive license. Pumasi does not compete by omission.
4. **Re-evaluate at Working maturity.** If a permissively-licensed core appears in
   the interim, this item is a deprecation candidate.
5. **Clean-room separation, whenever a licence-incompatible reference is
   studied.** Added 2026-08-01, when the steward directed that Cal.com be
   reviewed closely and its feature set matched (`GAP-0004`).

   Features and behaviour are not copyrightable and may be matched freely.
   Implementations are. So:

   - The agent that **reads** the reference writes only a **behavioural
     description** — inputs, outputs, edge cases. **No code, not even sketches or
     signatures.**
   - The agent that **implements** must not have read the reference, and must be
     a **different model family** — which the merge gate requires anyway.
   - Provenance is recorded on the change: what was studied, by whom, and that
     the implementer did not read it.
   - **Cal.com's `/ee` tree is proprietary, not AGPL.** Its *source* is not read
     at all, under any separation. Published behaviour and documentation only.
   - **Where a public standard exists — RFC 5545, CalDAV, SAML, OIDC, SCIM —
     implement from the standard and skip the study step.** Cheaper, cleaner, and
     it produces better software than imitation does.

   This condition protects `P1`, which is unamendable. AGPL-derived code inside
   an Apache-2.0 catalog item is not a licence bug to be fixed later; it is a
   breach of a permanent commitment, and the remedy is removal.

## 6 · Verdict

**BUILD** — narrowly scoped, with mandatory reuse per §3 and conditions per §5.
The justification is a license constraint, not a technical deficiency in the
incumbent, and the record says so.
