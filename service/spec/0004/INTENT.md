# What we think you want — the software reports back, and can be told not to

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-08-30; its veto window is in `DECISIONS.md`. The stage is beta,
so work proceeds now and a veto reverts.

## What we understood

The rules this project runs under say a product may not call itself
**launched** until the software can report back how it behaved, and until
anyone running it can switch that off in one step. Today the switch exists and
is wired to nothing — the software sends nothing, and the privacy page says so.
You asked for the real thing, and for the promise about how long the private
kind of report is kept to be published at the same time.

## What "working" will mean

- The software can produce two kinds of report. A **conformance report** — did
  the test suite pass in this environment, on what platform — which the sender
  signs and deliberately makes public, because that is the contribution that
  widens our test evidence beyond one machine. And an **operating report** —
  what platform it runs on, the shape of its configuration, uptime, how many
  errors — which is private to the foundation, never published.
- **Neither kind ever carries anything about the people using the service.**
  No name, no email address, no meeting time, nothing a booker typed, and not
  even counts of them.
- **One documented command prints exactly what would be sent**, before
  anything is sent, and what it prints is what goes.
- **Turning it off is one setting** (`PUMASI_REPORTING=false`), it covers
  both kinds, and the software behaves identically afterwards.
- **When it starts, it says out loud** that reporting is on and how to turn
  it off.
- **The retention promise is published**: operating reports are kept twelve
  months and then deleted, deletable earlier on request; conformance reports
  are public and permanent, which is exactly why they stay narrow.

## What we are deliberately not building

- **The receiving end.** No foundation intake service exists yet. Reports are
  addressed to the documented intake address; until it is live, a send fails,
  is logged once, and is dropped — nothing is queued or retried into a pile.
  The intake, when built, may not accept operating reports until its deletion
  path works (that is the standing debt entry's own condition).
- **Reporting from the Cloudflare deployment.** The live service is sharded
  one-world-per-organisation; deciding what "one deployment, one report" means
  there is a real design question we are not answering in passing. The
  self-hosted path reports; the Cloudflare path still sends nothing, and the
  live privacy page will keep saying so, truthfully, per path.
- Any new data category. Adding one later means a new schema version and a
  fresh review, not a quiet field.

## What we are unsure about — with the answer we assume on silence

1. **The intake address**: we default it to `https://report.pumasi.ai/v1/reports`
   and document it as not yet live. *Assumed on silence: yes.*
2. **Twelve months** as the operating-report retention period. *Assumed on
   silence: yes.*
3. **Leaving the Cloudflare deployment out**, revisited no later than the
   launched promotion. *Assumed on silence: acceptable for beta.*
