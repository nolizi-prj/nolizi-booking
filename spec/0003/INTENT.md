# What we think you want — calendar connection

**One page. For the steward. No jargon, no clause numbers, no test IDs.** Confirm
it or correct it. Everything downstream is built against this page, and if this
page is wrong, nothing further can catch it — every agent reviewing the work will
be checking against the same mistaken idea.

## What we understood

Connect the service to the calendar people already use — **Google Calendar and
Microsoft 365** — so that it stops being a demo.

Right now the service only knows about bookings made inside it. If you have a
dentist appointment in your own calendar on Tuesday at two, this service will
happily offer Tuesday at two to a stranger and confirm it. **That is the single
thing standing between this and something you could actually put in front of
people**, and it is why Cal.com and Calendly both treat calendar connection as
part of the product rather than an add-on.

You were right to push back on the smaller version we suggested. Sending an
invitation file that people can add to their own calendar is nice, but it solves
the easy direction. The hard and necessary one is your existing commitments
blocking times here.

## What "working" will mean

- You connect your calendar once, from a button, and never think about it again.
- **Times when you are busy stop being offered**, within a minute or so of your
  calendar changing.
- A booking made here **appears in your calendar**, with the person's name, so
  you see it where you already look.
- Cancel or move it here, and your calendar follows.
- Disconnecting is one click, takes effect immediately, and **deletes what we
  hold** rather than just forgetting to ask again.
- If the connection breaks — you revoke it, the password changes, the provider
  has an outage — the service **stops offering times rather than guessing**. A
  scheduling tool that keeps taking bookings while blind to your calendar is
  worse than one that says it cannot help right now.

## The thing that makes this smaller than it sounds

Both providers can answer **"when is this person busy"** without handing over
what the meetings are. Google and Microsoft each have an endpoint that returns
only start and end times — no titles, no attendees, no locations. That is
exactly, and only, what our engine needs.

So we ask for the narrow permission, not "read my calendar". Less to hold, less
to leak, less to explain, and the consent screen someone sees is honest about how
little we want.

Writing a booking *into* your calendar does need permission to add events. We
suggest making that **a separate, optional choice** — blocking times works with
the narrow permission alone, and someone who only wants that should not have to
grant more.

## Not in this piece

- Reading what your meetings actually are. We take busy times, not contents.
- Calendars other than Google and Microsoft, though the same shape fits CalDAV
  and Apple later.
- Choosing *which* of your several calendars to check — first version uses your
  primary one.

## What we are unsure about — four questions

**1. Which one first, or both together?**
Google is the larger share; Microsoft 365 is where the companies are. Both are a
similar amount of work and neither is hard once the first is done.
**Our recommendation: Google first**, then Microsoft immediately after, because
the second is mostly repetition and the design should be proven against one
before it is generalised.

**2. Do you want bookings written into your calendar, or only busy times read?**
Reading busy times is the part that prevents double-booking. Writing events is a
convenience that needs a broader permission.
**Our recommendation: build reading first, add writing as an option.**

**3. Google will need to review the application, and that takes time.**
Google reviews applications asking for calendar access before letting the general
public connect. Until that clears, connections are limited to a handful of
accounts you nominate — which is fine for testing and blocks a public launch.
It is worth starting that review early because the waiting is calendar time, not
work.
**We need to confirm whether the narrow busy-only permission is subject to the
same review, or a lighter one. We do not yet know, and we would rather say so
than assume.**

**4. This adds Google and Microsoft as parties who hold something of ours.**
Not your bookers' data — but a token that lets us ask about your calendar. That
token is the most valuable thing this service would store, and our own rules
require naming any such party publicly before it holds anything.

It also brushes against the privacy question you deferred. Reading a calendar is
a materially bigger step than holding a name and an email.
**Our recommendation: name them properly and treat the connection token as the
most protected thing in the system — but this is worth your explicit agreement
rather than our assumption.**

## What happens after you confirm

Agents write the specification and its tests. A different AI model reviews it.
The tests are frozen before code is written. Then it is built, reviewed by
different models again, and you see one more page — plain language — before
anything is released.

You will not be asked to read the specification or the tests.

| | |
|---|---|
| **This deserves to exist** | authorised — `MANDATE.md` item 3, 2026-08-27 |
| **May touch a can-hurt surface** | authorised by the same mandate entry — holds credentials that read a person's calendar |
| **This page** | published 2026-08-03 · **veto window closes 2026-08-29** (`DECISIONS.md` Q-001, charter v0.4) — on silence, the recommendations above are the decisions |

*The steward is also the sponsor of this item. That conflict is recorded in the
debt register rather than hidden; the control against it is that the tests are
frozen before implementation, and that the reviews come from models that did not
write the work.*
