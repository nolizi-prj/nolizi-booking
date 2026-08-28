# What we think you want — the deployable service

**One page. For the steward. No jargon, no clause numbers, no test IDs.** Confirm
it or correct it. Everything downstream is built against this page, and if this
page is wrong, nothing further can catch it — every agent reviewing the work will
be checking against the same mistaken idea.

## What we understood

A **real, running scheduling product** that people can sign up for and use. Not a
component this time: accounts, a public booking page, confirmations, the lot.
Deployed on Railway, from GitHub, so a change pushed to the repo goes live.

It sits on top of the engine (`spec/0001`), which stays a pure library and keeps
doing the hard arithmetic. This piece is everything around it: storing things,
serving pages, knowing who is who, and sending mail.

Both are being written now, in parallel.

## What "working" will mean

Someone who has never heard of us can, in one sitting:

- **Sign up**, say when they are normally free, and get a link they can share.
- Send that link to a stranger, who **opens it, sees real available times**, picks
  one, and enters their name and email.
- **Both people get a confirmation**, and the time is gone from the page for
  everyone else — including someone who clicked the same slot at the same second.
- Either can **cancel or move it** from a link in that mail, and the time frees up
  or shifts correctly.
- It is **still right on the days the clocks change**, because the engine
  underneath is the one we are getting right on purpose.

And for you: **push to GitHub, and the running site updates.**

## Not in this piece

- **Connecting to Google or Outlook calendars.** Busy times are the ones booked
  here. Real calendar sync is the next piece, and it is the one that starts
  handling other people's account credentials.
- Teams, round-robin, shared meetings with several attendees
- Payments, and any AI suggesting times — both off the roadmap by your decision
- Weekly and monthly limits — the engine has per-day only, as agreed

## The four questions — three answered, one still open

**Answered by the steward, 2026-08-01.**

**1. Whose personal data are we prepared to hold, and on what basis?**
→ **Sequential opening.** Deploy early with only the steward on it. Answer the
privacy question before anyone else can sign up — not before the first deploy.

This is the recommended answer and it is now a hard gate, not an intention: the
debt register (`D-105`) blocks **public signup** until we can say what is
collected, on what basis, how someone deletes it, and where it lives. It does not
block building or deploying. Private use keeps the question theoretical; a
stranger's email address in the database ends that.

**2. Who can sign up — anyone, or invite-only?**
→ **Invite-only.** One setting, and it buys the time to answer question 1
properly. Opening it is a deliberate act with a precondition, not a default.

**3. Which mail provider?**
→ **Still open, and deliberately not blocking.** The spec defines mail as a
*port* — a small interface the service calls — with one adapter behind it. The
provider becomes a configuration choice we can make later and change without
touching anything else.

We will need to pick one before real mail is sent, because whoever it is holds
your users' email addresses too. Recommendation when you want it: a transactional
provider with a data-processing agreement, chosen at the same time as the
question-1 answer, since it is the same question wearing different clothes.

**4. How closely should the booking page follow Cal.com's?**
→ **Closely, on behaviour and layout.** Booking pages are conventional and the
conventions are what people already know how to use.

One agent studies their page and writes down how it behaves. A different agent
builds from that description, never having looked at their code. Matching how
something looks and works is fine; matching how it is built is not.

## What happens after you confirm

Agents write the specification and its tests. A different AI model reviews it.
The tests are frozen before code is written. Then it is built, reviewed by
different models again, and you see one more page — plain language — before
anything is released to anyone but you.

You will not be asked to read the specification or the tests.

| | |
|---|---|
| **Steward** | confirmed 2026-08-01 |
| **This deserves to exist** | **yes** |
| **This page is correct** | **yes** — three of four questions answered; the mail provider is open by design and does not block |
| **May touch a can-hurt surface** | **yes** — holds other people's personal data, books on their behalf, sends mail in their name |
| **May be opened to the public** | **no, blocked** — `D-105` must be answered first |

*The steward is also the sponsor of this item. That conflict is recorded in the
debt register rather than hidden; the control against it is that the tests are
frozen before implementation, and that the reviews come from models that did not
write the work.*
