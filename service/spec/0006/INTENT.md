# What we think you want — the Zoom button works on a deployment that has no calendar

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-08-31; its veto window is in `DECISIONS.md`. The stage is beta,
so work proceeds now and a veto reverts.

## What we understood

`VALUE.md` says this product is for, among others, "the operator who wants to
run it themselves. A port, and optionally a PostgreSQL URL." Someone who takes
that at its word, sets up a Zoom app, and does **not** connect a Google
calendar, gets a button that starts a connection it can never finish.

The trip out works: the integrations page offers "Connect with Zoom", the
browser goes to Zoom, the operator approves. The trip back does not: the page
Zoom returns to answers **"Calendar integration is not configured"** and stops
— before it ever looks to see that this was a Zoom connection and not a
calendar one. There is no error the operator can act on and nothing they did
wrong.

The reason is an accident of where one piece of machinery was put. The little
signed ticket that travels out to Zoom and comes back — the thing that says
*whose* connection this is — was written as part of the calendar code, so the
return page checks for calendar support before it checks anything else. Same
accident, second symptom: when there is no calendar, the button falls back to
building that ticket **unsigned**, as plain readable text anybody could write
themselves.

Today nothing can be broken with the unsigned ticket, because the return page
refuses it along with everything else — the 404 is the only reason it is safe.
That is exactly why the two are one job. Removing the 404 on its own would
turn a dead branch into a live door where a stranger names whose account a
Zoom connection gets attached to.

## What "working" will mean

- **The ticket is its own thing, and it is always signed.** It is sealed with
  the deployment's existing secret key — the same key that encrypts stored
  credentials — and no unsigned version of it exists anywhere, on any path,
  for any reason.
- **A deployment with a Zoom app and no calendar can complete a Zoom
  connection.** The return page decides what to do by reading the signed
  ticket, which is what it was always meant to do.
- **A deployment with no secret key refuses at the start, in words.** Instead
  of building an unsigned ticket, the button says the key is missing — the
  same answer the connection storage already gives, now given before the
  round trip instead of after it.
- **Calendar connections are unchanged.** A calendar callback on a deployment
  with no calendar still answers exactly what it answers today.
- **Nothing about Zoom itself changes.** Same provider, same app, same
  permissions, same stored connection.

## What we are deliberately not building

- **No new provider, account, app registration, or wider permission.** This is
  the correctness of a surface that already shipped. The open question about
  whether conferencing scope grows is `Q-007`, and this waits for it exactly
  as `spec/0005` did.
- **No change to what a booking page shows, what a confirmation contains, or
  how a meeting is created.** `spec/0005` settled those and they stay settled.
- **No deletion or migration of anything stored.** A ticket lives fifteen
  minutes; there is nothing to migrate.
- **Not the neighbouring bug we found while reading.** "Sign in with
  Microsoft" is switched off on any deployment without *Google* calendar
  credentials, for the same accidental reason. It is a different surface with
  different consequences and it is written down rather than folded in here.

## What we are unsure about — with the answer we assume on silence

1. **A deployment with no secret key should refuse to start a Zoom connect,
   rather than start one that cannot be stored.** It already refuses to store
   the result; refusing at the start is the same decision made earlier and
   more usefully. *Assumed on silence: refuse at the start, with the reason.*
2. **The other flows that ride the same return page — Google sign-in,
   Microsoft sign-in, an organisation's own identity provider — keep the
   exact reachability they have today.** They are guarded by their own
   credentials and none of them becomes reachable anywhere it is not already.
   *Assumed on silence: no change to any of them.*
3. **The neighbouring Microsoft sign-in bug is recorded, not fixed here.**
   *Assumed on silence: recorded for the roadmap owner to rank.*
