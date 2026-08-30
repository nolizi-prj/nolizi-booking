# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed 2026-08-30 at the reporting-path
evaluation (stage unchanged). A stage change — up or down — is a commit with
its evidence in the message.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** 271 service tests + the engine suite pass, `GATE: PASS` on
  2026-08-30 at `4f56df4` (the reporting-path merge); the sharded end-to-end
  suite was green 2026-08-29. Exclusivity is proven against real
  PostgreSQL with genuinely parallel connections
  ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)).
- **Data survives.** Durable-Object SQLite in the deployment, PostgreSQL when
  configured; deletion is verified by absence, not by claim.
- **Strangers are admitted honestly.** Public sign-up released 2026-08-29 with
  a proven-address rule (no session on an unverified email), rate limits, and
  no account-enumeration oracle
  ([release note](https://github.com/pumasi-ai/governance/blob/main/releases/2026-08-29-pumasi-booking-public-signup.md)).
- **The live pages tell the truth.** Checked 2026-08-29: `/privacy`, `/terms`,
  `/subprocessors` match the code and the debt register, state the missing
  counsel review plainly, and the notice is enforced by a test against the
  live booking form (`8f77d66`). The README's stale claims (calendar, test
  counts, an uncited competitor line) were corrected the same day
  (`f1355bc`, `0ff54d8`, `0d1674d`, `5630e07`).
- **No open `priority: high` bugs.** Tracker as of 2026-08-30: zero open
  issues. Fifteen feedback-widget reports arrived 2026-08-30 morning; the
  four still open at intake got verdicts (#29 `accepted`, #30 `escalated` to
  Q-007, #28/#31 `rejected` as harness output), and all are closed.

## Why not `launched`

`launched` requires the [`VALUE.md`](VALUE.md) promises to hold, feedback to be
answered, and regressions to be release-stoppers. Today:

1. **The reporting-path release is inside its can-hurt veto window until
   2026-09-06** (Q-009; the sign-up window Q-005 closed 2026-08-29, approved
   by the steward). Pre-`launched` the work proceeds on the default, but a
   release that can still be reversed by veto is not a launch.
2. **The central promise is gated for strangers.** Calendar connection works
   only for nominated Google test accounts until the OAuth app passes
   verification, which has not been submitted
   ([`GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md); VALUE C1's
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 3).
3. **The evidence is still one machine wide.** The §5.1 reporting mechanism
   now exists on the Node path (spec/0004, `4f56df4`) — but nothing receives
   reports (the intake is not live; sends fail and are dropped) and the
   deployed Workers path deliberately sends nothing. §5.1 binds at this
   promotion (amended 2026-08-30; D-108 closed by that amendment), so
   `launched` waits on the intake with its tested deletion path (spec R5c,
   D-107) and the Workers-path decision ([`BACKLOG.md`](BACKLOG.md) item 4).
4. **No lawyer has reviewed the legal posture, and no SCCs cover the US
   transfer** (D-105, DEGRADING). For a UK/EU user the transfer rests on the
   disclosure alone.
5. **A user-visible defect is live on the public page**: a connected Zoom
   owner's personal meeting URL prints to anyone who loads their booking
   page, before any booking ([`BACKLOG.md`](BACKLOG.md) item 1). A `launched`
   product would treat this as a release-stopper.

## Why not `alpha`

Demotions must be earned too, so the case against is recorded: alpha says
"works for people who talk to the builders; data may not survive." Data
survives and is deletion-tested; strangers already sign up and book through a
proven-address gate; the suites and the concurrency proofs are real and green.
Holding this at alpha would understate the evidence exactly the way this file
exists to prevent overstating it.

## Known gaps, so nobody discovers them the hard way

- Deletion cannot recall mail already sent — by nature, and disclosed in the
  notice.
- The deployed (Workers/Gmail) mail path's subprocessor control is code review,
  not the Node path's runtime refusal ([`SUBPROCESSORS.md`](../SUBPROCESSORS.md)).
- Deployment defaults are 5 accounts / 200 bookings until an operator raises
  them deliberately.
- No mobile apps, no integrations ecosystem, no payments (the last by
  decision) — see [`VALUE.md` §4](VALUE.md).
- No version number is user-visible or carried in feedback and reports —
  `package.json` has said `0.1.0` since the first commit (`PRODUCT-RULES.md`
  PR-1 gap; [`BACKLOG.md`](BACKLOG.md) item 2).

## What `launched` requires

The Q-009 window passing unvetoed; Google verification cleared so C1 holds
for strangers; the reporting *intake* live with its deletion path
implemented and tested, and the Workers-path reporting decision made (§5.1
binds at this promotion; spec/0004 R5c, D-107 — [`BACKLOG.md`](BACKLOG.md)
item 4); the PMI leak closed (item 1); and the D-105 residue either cleared
by counsel or explicitly accepted by the steward as the standing posture.
*Satisfied since the last pass:* the §5.1 mechanism itself and the published
D-107 retention schedule (`4f56df4`, release note 2026-08-30), and the first
full release-note → evaluation cycle (ops `DIGEST.md`, 2026-08-30
evaluation). Promotion is a commit citing each.
