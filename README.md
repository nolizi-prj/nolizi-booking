# Pumasi Booking

**A booking page people can send someone to pick a time on.** Accounts, a public
booking page, confirmation mail, and management links.

Part of [Pumasi](https://github.com/pumasi-ai/pumasi), a commons of software
built by agents and governed by people. Apache-2.0, inbound equals outbound.

## The one thing to know before using it

**It cannot see your real calendar yet.** The service knows only about bookings
made inside it, so it will offer a time you are already busy and confirm a
booking on top of it. Double-booking against your own calendar is the *expected*
behaviour today. Calendar connection is
[`service/spec/0003`](service/spec/0003/INTENT.md), promoted to next.

**The lawful basis for the personal data it holds is written and in force, and
no lawyer has reviewed it.** The privacy notice, terms and DPA are served by the
running service and say who the operator is, what is collected, on what basis,
how to delete it, and who else sees it. What is genuinely unresolved is narrower:
the international transfer position — the service is operated from the United
States and data is processed there, with no standard contractual clauses in place
— and the review by counsel itself. See
[`DEBT.md` D-105](https://github.com/pumasi-ai/governance/blob/main/governance/DEBT.md),
open at DEGRADING.

**It defaults to five accounts and two hundred bookings, and public sign-up is
off.** Those are deployment defaults an operator may change deliberately, not
caps the service refuses to raise. They start low so a fresh deployment does not
quietly become a service holding thousands of strangers' details before anyone
chose that.

**Not tied to any host.** It needs a port and, optionally, a PostgreSQL URL.
Nothing in the code knows about a particular provider — that is `P12` (no
special protocol is required to participate) and the commercialization
commitment that self-hosting stays first-class forever.

## Run it

    npm install
    npm run build
    node service/dist/server.js

It prints a sign-up link on first start:

    Sign up here:  http://localhost:8080/signup?invite=inv-xxxxxxxx

Follow it and you have an account, a booking page, and availability you can
edit. Share the page link and someone can book a time.

**The invite appears only while there are no accounts.** Once anyone has signed
up it stops, even if asked for explicitly — an invite that keeps appearing is a
back door. After that, mint them deliberately:

    node service/dist/cli.js invite        # prints a sign-up link
    node service/dist/cli.js invites       # list, used and unused

`npm run dev` adds a seeded demo page at `/demo` if you would rather not create
one. No database, no container, no configuration for either path.

## How the repository is laid out

Two workspaces, one product, one repository.

| | Holds |
|---|---|
| [`core/`](core/) | The availability engine. A pure function: no clock, no I/O, no ambient state. [`ENGINE.md`](core/ENGINE.md) |
| [`service/`](service/) | Everything that touches the world: HTTP, PostgreSQL, mail, sessions |

**Why the engine is a separate workspace rather than a separate repository.**
It has a real boundary — purity, its own specification, its own acceptance suite
— and that boundary is enforced by the code and its tests, not by a repository
wall. Splitting it out bought two READMEs, two merge gates, and a
`github:`-URL dependency with no version pinning, in exchange for a reusability
nobody has yet asked for. The day someone wants the engine alone,
`git subtree split` gives it to them with its history intact. Until then, one
product is one repository.

    npm test                    # the engine's acceptance cases, then the service suite
    npm test -w @pumasi/booking-core

The counts are deliberately not written here. This line used to say "36
acceptance cases + 12 unit + 80 service"; two of those three numbers were stale
and the service one was out by a factor of three, because a total in prose has
nothing keeping it true. The command prints them, and the command is never
wrong.

## Databases

| | When | What you get |
|---|---|---|
| **PGlite** (default) | no `DATABASE_URL` | Genuine PostgreSQL in-process, including `btree_gist`, so the exclusion constraints are really enforced. Nothing survives a restart. |
| **PostgreSQL** | `DATABASE_URL` set | Any reachable instance — local, container, or managed. A pooled connection per transaction. |
| **SQLite** | the Workers build | One database per tenant organisation, inside a Durable Object. This is what the hosted deployment runs. |

**No-double-booking holds on every one of them, and by the same kind of
mechanism.** PostgreSQL and PGlite use an `EXCLUDE USING gist` constraint.
SQLite has no exclusion constraints, so the Workers build uses `BEFORE INSERT`
and `BEFORE UPDATE` triggers that `RAISE(ABORT)` — still **inside the database
and atomic with the write**, which is the property `SPEC-0002` P1 actually
requires, rather than a check in application code that P1 exists to forbid. The
abort message deliberately carries the PostgreSQL wording so one conflict path
handles both. A partial unique index enforces one confirmed row per booking on
both dialects.

The distinction that matters is transactions. A transaction needs a connection
to itself: `BEGIN` and `COMMIT` issued as separate statements onto a shared
session let concurrent callers interleave, so a second `BEGIN` lands inside the
first and neither is request-scoped. The pool hands out a dedicated client;
PGlite, having one connection, serialises instead.

## Deploying

Two builds, and this section used to describe only the first one while the
second was the one actually running.

**Self-hosted — anywhere that runs a container or Node 22.**

    docker compose up          # service + PostgreSQL, locally
    docker build -t pumasi .   # then run it wherever

`railway.json` is present as one convenience among several, not a dependency.
Set `PORT`, and `DATABASE_URL` for anything that must outlive the process.
`PGSSL=require` if your provider needs TLS.

**Cloudflare Workers — what `booking.pumasi.ai` runs.** `service/src/worker.ts`,
one Durable Object per tenant organisation with its own SQLite database, and a
directory DO mapping public identifiers to tenants. Mail goes through the Gmail
API rather than SMTP, because Workers cannot open SMTP connections — see
[`SUBPROCESSORS.md`](SUBPROCESSORS.md), which is explicit about which mail path
the subprocessor check does and does not cover.

**Neither build is the real one.** Self-hosting is first-class permanently: the
hosted deployment is convenience, never capability, and never carries a feature
the self-hosted build lacks.

## Mail

SMTP, not a provider SDK — every provider speaks it, so the choice is a URL and
switching costs nothing.

    SMTP_URL=smtp://user:pass@host:587   # real delivery
    MAIL_DIR=./tmp/mail                  # write messages to files instead
    # neither set: messages are recorded in memory and discarded, with a warning

**To try real SMTP without an account**, use Ethereal — nodemailer mints a
throwaway mailbox on demand and gives a URL to read what was sent:

    node -e "require('nodemailer').createTestAccount().then(a=>console.log(
      'smtp://'+encodeURIComponent(a.user)+':'+encodeURIComponent(a.pass)+
      '@'+a.smtp.host+':'+a.smtp.port))"

Export that as `SMTP_URL` and the service logs a preview link for every message
it sends. Note the percent-encoding: an Ethereal username contains `@`, which
otherwise breaks the URL.

Ethereal **captures rather than delivers**, which is what you want for testing.
Real delivery to real inboxes needs a real provider, chosen on data-processing
terms and residency — the same question as the transfer position in `D-105`.

## What the gates refuse

**Configuration fails closed, and refusals are logged rather than silently
ignored.** `PUBLIC_SIGNUP` is off unless explicitly and correctly enabled, and a
value that does not parse is treated as absent rather than guessed in the
dangerous direction. The account and booking ceilings default low and may be
raised or lowered by the operator.

What the service refuses outright is narrower and does not vary with
configuration: it **will not send mail** through a host absent from
[`SUBPROCESSORS.md`](SUBPROCESSORS.md), and it **will not start** on a
timezone-transition or PostgreSQL version mismatch. The mail refusal stops the
mail, not the service — bookings still work and confirmations queue, because the
duty is that nobody's details reach an undisclosed party, not that the product be
offline.

**Public sign-up never hands out a session on an unproven address.** With it on,
signing up creates the account and mails a single-use link; the session begins
when that link is used. An invite, or Google's verified email, is proof; a typed
string is not.

## How correctness is held

The booking path does not trust the form. A submitted interval is checked
against a **fresh** computation from the engine before it is accepted, because
the database only forbids *overlap* — without that check a request for the
middle of the night, a whole week, or a day with no availability would be
confirmed and would lock a real person's calendar.

Exclusivity is enforced by **database constraints**, not application code. A
`SELECT`-then-`INSERT` passes every non-concurrent test and loses races in
production. Two constraints are required and each does different work: one
forbids overlapping confirmed bookings, the other forbids one booking holding
two confirmed intervals — a reschedule that inserts before demoting satisfies
the first while violating the second, and the database would report nothing.

Proven against real PostgreSQL with genuinely parallel connections: 90 contended
rounds where exactly one caller may win.

The engine is held to its own standard: the clock is an argument, so the same
inputs give byte-identical output and the tests can be the arbiter. See
[`core/ENGINE.md`](core/ENGINE.md) for what it gets right that is commonly got
wrong — a window spanning spring-forward, a local time that never occurs, a zone
that skips an entire calendar day.

## Health and readiness

`/healthz` means the process is up. `/readyz` means migrations are complete, the
database answers, and reports the commit and tzdata version in use. Route on
`/readyz`.

## What is not built

See [`service/spec/0002/SPEC.md` §8.1](service/spec/0002/SPEC.md). The booker's
path is complete; accounts, sessions, the owner application, token expiry and
reschedule-over-HTTP are declared but not implemented.

## The specifications are the truth

| | |
|---|---|
| [`core/spec/SPEC.md`](core/spec/SPEC.md) | What the engine must do, and why each clause exists |
| [`core/spec/acceptance/cases.json`](core/spec/acceptance/cases.json) | 36 language-neutral cases — the executable arbiter |
| [`service/spec/0002/SPEC.md`](service/spec/0002/SPEC.md) | What the service must do |
| [`service/spec/0003/INTENT.md`](service/spec/0003/INTENT.md) | Calendar connection, in plain language |

**Where prose and code disagree, the prose governs and the code is a defect.**

## Licence

Apache-2.0, inbound equals outbound. No contributor agreement grants anyone
relicensing power, ever.
