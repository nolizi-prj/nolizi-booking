# SPEC-0004 · Reporting path and opt-out

**Status:** for cross-family spec review · **Intent:** [`INTENT.md`](INTENT.md)
(window Q-008, `pumasi/DECISIONS.md`) · **Source:** CHARTER §5.1/§5.2,
`DEBT.md` D-107/D-108, SPEC-0002 clause D5 and frozen case D-005.
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), frozen when
this review completes; the executable runner is `service/test/reporting.test.ts`.

This item implements the reporting mechanism CHARTER §5.1 requires before the
product may declare itself `launched`, and publishes the held-tier retention
schedule whose absence is D-107. It adds no collection about the people the
service holds data for — the reports are about the software, never its users.

---

## 1 · The two tiers (R1)

Exactly two report kinds exist, matching CHARTER §5.2's split. Their entire
contents are the schema in §6 — a field not listed there is a field the report
may not carry.

| Tier | Carries | Never carries |
|---|---|---|
| **published** (conformance) | Environment facts, acceptance-suite result counts, the sender's signature (agent, model, sponsor). | Anything about owners or bookers, including counts derived from them. Any configuration **value**. |
| **held** (operating) | Environment facts, configuration **shape** (booleans and enums only), uptime, error count. | Names, email addresses, meeting times, anything a booker or owner typed, counts derived from owners or bookers, secrets, URLs containing credentials. |

**R1a.** Neither tier carries owner or booker data, nor counts derived from
them. This is stricter than SPEC-0002 D5's table, which would allow aggregate
counts in the held tier; frozen case D-005 asserts their absence from the
emitted report, and the frozen case wins. Aggregates stay out until a future
schema version is taken through a fresh cross-family spec review.

**R1b.** Adding any field or category means a new `schema` version string and
a fresh cross-family spec review — never a quiet field.

## 2 · One-step opt-out (R2)

**R2a.** `PUMASI_REPORTING=false` (the existing config switch, default `true`)
disables both tiers in one step. With it set, the software performs **no
network call attributable to reporting** — asserted by observation of the
transport, not by reading the code.

**R2b.** Behaviour parity: with reporting on or off, every other observable
behaviour is identical. The acceptance runner exercises representative
surfaces both ways and compares.

**R2c.** No opt-out signal is transmitted anywhere. The choice lives only in
the deployment's own configuration.

## 3 · Inspectable before it leaves (R3)

**R3a.** The documented commands

    node service/dist/cli.js report held
    node service/dist/cli.js report published

print, to stdout, the exact JSON payload that would be sent — and nothing
else on stdout.

**R3b.** The sent HTTP body is **byte-identical** to that printed form
(canonical `JSON.stringify(payload, null, 2)`).

## 4 · First-run notice (R4)

**R4a.** On every start of the Node service, before serving, a notice is
printed stating that reporting is **on** and naming the one-step opt-out
verbatim: `PUMASI_REPORTING=false`. ("Every start" includes the first run;
repeating it costs a log line and removes the notion of hidden state.)

**R4b.** When reporting is off, the start-up line instead states that
reporting is off and nothing is sent.

## 5 · Egress (R5, R6)

**R5a.** A report is sent as `POST` `application/json` to
`PUMASI_REPORT_URL`, default `https://report.pumasi.ai/v1/reports`. **The
default intake is documented as not yet live.** A failed send is logged once
per attempt and the report is dropped — no spool, no queue, no retry beyond
the next scheduled attempt. The service never degrades because reporting
failed.

**R5b.** Automatic sending: the **Node path** (`server.ts`) sends one held
report shortly after start and one per 24 hours thereafter, only while
`PUMASI_REPORTING` is on. The held tier is never sent by any other trigger;
the published tier is **never sent automatically**.

**R5c.** The intake, when it is built, must implement the §7 retention
schedule and a tested deletion path **before** it accepts held reports —
that is D-107's own clearing condition, restated here so the client-side spec
carries it.

**R6.** A published report is signed or it is not sent.
`report published --send` refuses (exit non-zero, nothing transmitted) unless
`PUMASI_REPORT_SPONSOR` is set; `PUMASI_REPORT_AGENT` and
`PUMASI_REPORT_MODEL` default to `operator` and `none` for a human-run
environment. Printing without sending needs no signature. Conformance counts
come from `.build/conformance.json`, written by `npm run conformance` in
`service/` (the acceptance suite run through a summary reporter); if that file
is absent the published report cannot be produced, and the error says how to
produce it.

## 6 · Schema — `pumasi-report/1`

Common envelope, both tiers:

```json
{
  "schema": "pumasi-report/1",
  "tier": "held | published",
  "item": "pumasi-booking",
  "commit": "<git sha or 'unknown'>",
  "produced_at": "<ISO-8601 UTC>",
  "platform": {
    "runtime": "node",
    "node": "<process.version>",
    "os": "<platform>", "arch": "<arch>",
    "tzdata_pinned": "<pinned>", "tzdata_host": "<host or null>",
    "db": "postgres | sqlite | pglite"
  }
}
```

`tier: "held"` adds:

```json
{
  "config_shape": {
    "public_signup": false, "mail": "smtp | file | none",
    "calendar_google": false, "calendar_microsoft": false, "zoom": false,
    "ceilings_raised": false
  },
  "health": { "uptime_seconds": 0, "errors_total": 0 }
}
```

`tier: "published"` adds:

```json
{
  "conformance": { "suite": "<name>", "passed": 0, "failed": 0, "skipped": 0, "run_at": "<ISO>" },
  "signature": { "agent": "<...>", "model": "<...>", "sponsor": "<...>" }
}
```

`config_shape` values are booleans and closed enums only — never a
configuration value, never a URL, never a hostname. `ceilings_raised` is a
fact about configuration (either ceiling differs from its default), not a
count of anything.

## 7 · Retention schedule — publishing D-107's promise (R7)

Published alongside this mechanism, as CHARTER §5.2 requires ("a stated
retention period and a deletion that actually reaches"):

- **Held (operating) reports:** retained **12 months** from receipt, then
  deleted. Deleted earlier on request to **admin@pumasi.ai**, and deletion
  reaches backups within **30 days** of the request.
- **Published (conformance) reports:** part of the public, mirrorable record
  — permanent by design (P3), which is exactly why the published tier stays
  narrow and is sent only by an explicit, signed act.
- **Today:** no intake exists, so nothing is retained anywhere; a send fails
  and is dropped. The intake may not begin accepting held reports before the
  deletion path above is implemented and tested (R5c, D-107).

**R7a.** The live privacy page states this schedule in its own words, in the
paragraph that today says the mechanism does not exist.

## 8 · Path honesty (R8 — lessons/L-009)

Every claim in this spec names its execution path.

- **Node path** (`server.ts`, self-hosted): automatic held-tier reporting per
  R5b, the notice per R4, the CLI per R3.
- **Workers path** (`worker.ts`, the live booking.pumasi.ai): **sends
  nothing.** The sharded one-DO-per-org design makes "one deployment, one
  report" a real design question (which world reports? the router holds no
  config shape; each org DO would multiply reports). It is deferred with this
  reason, and the live privacy page continues to say, truthfully, that this
  deployment sends nothing. Revisit **no later than the `launched`
  promotion**, where §5.1's five checks run against the artifact actually
  shipped.

## 9 · What this item does not do

No new personal-data category (SPEC-0002 D5 unbroken). No change to mail,
booking, identity, or calendar behaviour. No foundation intake service. No
Workers-path egress. No aggregate usage counts (R1a).
