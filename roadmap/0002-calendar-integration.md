# GAP-0002 — Calendar provider integration

> *Filed in the commons as `GAP-0002` and moved here on 2026-08-29. A gap is a
> commons artifact until it becomes a product; after that its roadmap belongs
> beside the code that has to change. History before the move is in
> [`pumasi-ai/pumasi`](https://github.com/pumasi-ai/pumasi/commits/main/gap/0002-calendar-integration.md).*

**Filed:** 2026-08-03 · **Status:** open, **promoted to next** by the steward
**Reserved since:** 2026-07-28, referenced by `GAP-0001` §5 and both specs
**Intent:** [`service/spec/0003/INTENT.md`](https://github.com/pumasi-ai/pumasi-booking/blob/main/service/spec/0003/INTENT.md) *(in `pumasi-booking`)*

---

## 1 · The need, stated plainly

The service knows only about bookings made inside it. An owner's real
commitments are invisible to it, so it will offer a time that is already taken
and confirm a booking on top of it. **Double-booking against the owner's own
calendar is not an edge case; it is the expected behaviour.**

That is the difference between a demonstration and a product. Cal.com and
Calendly both treat calendar connection as part of the product, not an
integration to be added later, and the steward is right that a scheduling tool
without it is not competing with them.

## 2 · Why it was deferred, and why that reasoning has expired

`GAP-0001` §5 deferred this to keep run one *"can-hurt-by-correctness rather
than can-hurt-by-secrets"* — it is the first item that holds credentials to
something outside the project.

That was the right call **for an engine with no users**. It is the wrong call for
a service that is about to be used, because the harm it avoided (a leaked token)
is now smaller than the harm it causes (a real person double-booked by software
that promised not to).

## 3 · The narrow permission is the whole design

Both providers answer *"when is this person busy"* without disclosing what the
meetings are:

| Provider | Endpoint | Returns |
|---|---|---|
| Google | `freeBusy.query` | Busy start/end only. No titles, attendees, or locations. |
| Microsoft 365 | `calendar: getSchedule` | The same, at `Calendars.ReadBasic` — the least-privileged delegated permission. |

**That is exactly the shape SPEC-0001 already takes.** The engine's `busy`
parameter is a list of plain intervals and it never learns where they came from,
so a provider adapter fills that list and no clause changes. SPEC-0001 §12.1
predicted this: *"a provider adapter fills that list; the engine never learns
where they came from. This is the design working as intended."*

The consequence worth stating: **we ask for busy times, not calendar contents.**
Less to hold, less to leak, and a consent screen that is honest about how little
is wanted. Writing a booking *into* a calendar needs a broader permission and
should be a separate, optional grant.

## 4 · What this brings that nothing else here has

- **A token that reads someone's calendar** — the most valuable thing the system
  would store, and the first credential to something outside the project.
- **Google and Microsoft as subprocessors**, which `SUBPROCESSORS.md` requires be
  named publicly first — and which the service enforces by refusing to start
  otherwise.
- **A provider review process.** Google reviews applications requesting calendar
  access before the general public may connect; until it clears, connections are
  limited to nominated test accounts. That is calendar time rather than work, so
  it should start early. *Whether the busy-only permission attracts the same
  review or a lighter one is unconfirmed, and is recorded as unknown rather than
  assumed.*
- **A failure mode that must fail closed.** If the connection breaks — revoked,
  expired, provider outage — the service must **stop offering times**, not guess.
  Continuing to take bookings while blind to the calendar is the exact harm this
  item exists to prevent, arriving through the door marked "resilience".

## 5 · Sequencing

`GAP-0004` had this at item 4, after limits and recurrence. **Promoted to next**
on 2026-08-03: those are refinements of a product that works, and this is what
makes it work at all.

Conversion to a spec follows the confirmed intent statement, per the charter.
