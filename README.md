# Pumasi Booking

**A deployable booking service.** Accounts, a public booking page, confirmation
mail, and management links. Send someone the link and they pick a time.

*Package name `@pumasi/scheduling-service`. The repository is named for what it
contains and is deliberately not renamed to match the product — a repository
says what it holds, a product says what you use, and renaming code to follow
branding breaks every clone and fork for no gain.*

Part of [Pumasi](https://github.com/pumasi-ai/pumasi). Implements
[`spec/0002/SPEC.md`](spec/0002/SPEC.md) and wraps
[`@pumasi/scheduling-core`](https://github.com/pumasi-ai/scheduling-core) — it
does not reimplement it. Every availability question goes to the engine and
every exclusivity question goes to the database; neither is decided here.

## The one thing to know before using it

**It cannot see your real calendar yet.** The service knows only about bookings
made inside it, so it will offer a time you are already busy and confirm a
booking on top of it. Double-booking against your own calendar is the *expected*
behaviour today. Calendar connection is
[`spec/0003`](spec/0003/INTENT.md), promoted to next.

**There is no settled lawful basis for the personal data it holds.** The service
caps itself at five accounts and two hundred bookings and refuses to raise those
ceilings until that is resolved. See
[`DEBT.md` D-105](https://github.com/pumasi-ai/governance/blob/main/governance/DEBT.md).

**Not tied to any host.** It needs a port and, optionally, a PostgreSQL URL.
Nothing in the code knows about a particular provider — that is `P12` (no
special protocol is required to participate) and the commercialization
commitment that self-hosting stays first-class forever.

## Run it

    npm install
    npm run build --workspaces
    node apps/service/dist/server.js

It prints a sign-up link on first start:

    Sign up here:  http://localhost:8080/signup?invite=inv-xxxxxxxx

Follow it and you have an account, a booking page, and availability you can
edit. Share the page link and someone can book a time.

**The invite appears only while there are no accounts.** Once anyone has signed
up it stops, even if asked for explicitly — an invite that keeps appearing is a
back door. After that, mint them deliberately:

    node apps/service/dist/cli.js invite        # prints a sign-up link
    node apps/service/dist/cli.js invites       # list, used and unused

`npm run dev` adds a seeded demo page at `/demo` if you would rather not create
one. No database, no container, no configuration for either path.

## Databases

| | When | What you get |
|---|---|---|
| **PGlite** (default) | no `DATABASE_URL` | Genuine PostgreSQL in-process, including `btree_gist`, so the exclusion constraints are really enforced. Nothing survives a restart. |
| **PostgreSQL** | `DATABASE_URL` set | Any reachable instance — local, container, or managed. A pooled connection per transaction. |

The distinction that matters is transactions. A transaction needs a connection
to itself: `BEGIN` and `COMMIT` issued as separate statements onto a shared
session let concurrent callers interleave, so a second `BEGIN` lands inside the
first and neither is request-scoped. The pool hands out a dedicated client;
PGlite, having one connection, serialises instead.

## Deploying

Anywhere that runs a container or Node 22.

    docker compose up          # service + PostgreSQL, locally
    docker build -t pumasi .   # then run it wherever

`railway.json` is present as one convenience among several, not a dependency.
Set `PORT`, and `DATABASE_URL` for anything that must outlive the process.
`PGSSL=require` if your provider needs TLS.

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
terms and residency — the same question as `D-105`.

## What the gates refuse

`PUBLIC_SIGNUP=true` is **refused**, and the account and booking ceilings can be
lowered but not raised, while [`DEBT.md`](https://github.com/pumasi-ai/governance/blob/main/governance/DEBT.md) D-105 is open
— no lawful basis has been established for holding third-party personal data.
Refusals are logged rather than silently ignored.

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

## Health and readiness

`/healthz` means the process is up. `/readyz` means migrations are complete, the
database answers, and reports the commit and tzdata version in use. Route on
`/readyz`.

## What is not built

See [`spec/0002/SPEC.md` §8.1](spec/0002/SPEC.md). The booker's
path is complete; accounts, sessions, the owner application, token expiry and
reschedule-over-HTTP are declared but not implemented.
