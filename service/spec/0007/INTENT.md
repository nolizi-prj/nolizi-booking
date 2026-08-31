# What we think you want — signing in does not require a Google calendar

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-08-31; its veto window is in `DECISIONS.md`. The stage is beta,
so work proceeds now and a veto reverts.

## What we understood

`VALUE.md` sells two ways into this product that have nothing to do with
calendars: **"Continue with Microsoft"** on the front door, and **an
organisation's own single sign-on** — the enterprise identity C3 lists in the
free tier, where a company points the product at its own identity provider and
its people sign in with their work account.

Neither works unless the operator has also set up **Google Calendar**.

Not Microsoft Calendar. Not "a calendar". Specifically Google Calendar
credentials, which is a different company's product from either of the two
things being asked for.

What that looks like from outside:

- An operator sets up a Microsoft app and runs the product. The login page
  offers "Continue with Microsoft", because the page checks whether Microsoft
  is configured — and it is. Pressing the button answers **"Microsoft sign-in
  is not configured."** The button and the answer disagree, and the answer is
  wrong.
- A company configures its own single sign-on. Everyone in the company is sent
  to `/login/sso/…` when they type their work address, and every one of them
  is told **"SSO is not configured on this deployment."** It is configured.
  The product read the wrong thing and stopped before it looked.

Nobody who hits either of these did anything wrong, and nothing they can read
tells them the missing piece is a third-party calendar they never asked for.

The cause is the same accident of placement we fixed one surface over last
week. The little signed ticket that travels out to an identity provider and
comes back — the thing that says which sign-in is arriving and whose — used to
be part of the calendar code. It is now its own thing, sealed with the
deployment's own secret key and nothing else. These two doors were never
updated to ask for it directly: they still ask "is there a calendar?" and take
the answer as if it were "can I sign someone in?".

**Who this costs.** Not the people on `booking.pumasi.ai` — that deployment has
Google Calendar configured, so neither door is shut there. It costs the
self-hoster `VALUE.md` §1 courts by name, and it is a live counter-example to
our own claim that no single host is load-bearing.

## What "working" will mean

- **A deployment with Microsoft credentials and no Google Calendar can sign a
  person in with Microsoft**, all the way through: the button, the trip to
  Microsoft, and the trip back.
- **A deployment with an organisation's own single sign-on and no Google
  Calendar can sign that organisation's people in**, on both the self-hosted
  build and the deployed one.
- **Each door still checks its own configuration, and says so when it is
  missing.** A deployment with no Microsoft app still answers "Microsoft
  sign-in is not configured." An organisation with no single sign-on
  configured still gets told exactly that. A deployment with no secret key
  cannot seal a ticket and so cannot start either flow — and refuses, rather
  than starting one it cannot finish.
- **The ticket is still always signed.** No door starts emitting a readable,
  writable one. Making these doors reachable by making them unguarded would be
  a worse defect than the one being closed, and the tests say so out loud.
- **Everything else keeps exactly the reachability it has today.** Google
  sign-in, connecting a calendar, and the callback that receives all of them
  are untouched, and each is checked rather than assumed.

## What we are deliberately not building

- **No new provider, account, app registration, or wider permission.** Both
  doors already exist and already ship. This is the correctness of a surface
  that is already there, which is why it does not wait on `Q-007`.
- **No change to the deployed Cloudflare build's own router.** Its
  "Continue with Microsoft" was never gated on a calendar and is already
  right; the organisation sign-on route it forwards is fixed by the same
  single change as the self-hosted build. Changing the router and calling this
  done would close nothing, and that is written into the tests.
- **No change to the words either refusal says.** They are accurate for the
  only conditions that can still produce them, and the Microsoft one has to
  stay identical to the one the deployed build already returns — two builds
  answering the same question differently is the failure `L-009` records.
- **No deployment.** Who carries a merged build to `booking.pumasi.ai` is
  `Q-012`, open. This change does not reach a user until that is answered, and
  since it cannot occur on `booking.pumasi.ai` at all, the people it helps are
  the ones who deploy the repository themselves.

## What we are unsure about — with the answer we assume on silence

1. **The organisation sign-on route should keep checking the deployment before
   it looks up the organisation.** Without a secret key nothing can be sealed
   whatever the lookup finds, so the order saves a query and leaks nothing.
   *Assumed on silence: keep today's order; only the condition changes.*
2. **Where a calendar is configured, its own sealer keeps sealing.** A
   deployment can hold a calendar whose key did not come from the environment
   variable, and a ticket must open under the key that sealed it.
   *Assumed on silence: prefer the calendar's sealer when one exists, exactly
   as the callback already does.*
3. **The two refusals stay word-for-word as they are.** An operator missing a
   secret key would be better served by a message naming it, but that is a
   separable change to user-visible text and this one is about reachability.
   *Assumed on silence: unchanged text, and the gap recorded here rather than
   folded in.*
