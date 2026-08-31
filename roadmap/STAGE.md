# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed 2026-08-31 at the Zoom-connect evaluation
(stage unchanged). A stage change — up or down — is a commit with its evidence
in the message.

**What this file is a claim about.** The deployment, not the branch. That
distinction did no work until 2026-08-31, when the two came apart: a defect
this file called live was fixed and merged, and `booking.pumasi.ai` went on
serving the build without the fix. Evidence below that describes `main` says
so, and says separately whether it has reached users.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** 290 service tests + 19 engine tests pass and `GATE: PASS` at
  `3d313d2` — re-run at this evaluation rather than quoted from the release
  note, and green (a first run failed 13 of 290 on a leftover
  `/tmp/pumasi-pg-questions` cluster from an interrupted run, which is
  environment, not code; cleared and re-run clean). The sharded end-to-end
  suite was green 2026-08-29. Exclusivity is proven against real
  PostgreSQL with genuinely parallel connections
  ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)).
- **Data survives.** Durable-Object SQLite in the deployment, PostgreSQL when
  configured; deletion is verified by absence, not by claim.
- **Strangers are admitted honestly.** Public sign-up released 2026-08-29 with
  a proven-address rule (no session on an unverified email), rate limits, and
  no account-enumeration oracle
  ([release note](https://github.com/pumasi-ai/governance/blob/main/releases/2026-08-29-pumasi-booking-public-signup.md)).
- **The legal pages tell the truth.** Checked 2026-08-29: `/privacy`,
  `/terms`, `/subprocessors` match the code and the debt register, state the
  missing counsel review plainly, and the notice is enforced by a test against
  the live booking form (`8f77d66`). The README's stale claims (calendar, test
  counts, an uncited competitor line) were corrected the same day
  (`f1355bc`, `0ff54d8`, `0d1674d`, `5630e07`). **Narrowed from "the live
  pages" on 2026-08-31**: one live page does *not* tell the truth — see "why
  not launched" item 5 — and the old wording would have covered it.
- **The deployed build is not `main`, and this file now tracks the gap.**
  `wrangler deployments list` for the `pumasi-booking` worker
  (`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) puts the most
  recent deployment at **2026-08-30 16:55 UTC**. Merges after it —
  `4f56df4` (reporting mechanism, 17:26 UTC) and `16c3fd4` (the Zoom fix,
  2026-08-31 05:27 UTC) — are not serving anyone. This is stated as evidence
  because a maturity label that reads the branch and calls it the product is
  the two-documents-forking failure with extra steps.
- **No open `priority: high` bugs.** Tracker re-checked 2026-08-31: still zero
  open issues, and none new since 2026-08-30 05:35. Fifteen feedback-widget
  reports arrived 2026-08-30 morning; the four still open at intake got
  verdicts (#29 `accepted`, #30 `escalated` to Q-007, #28/#31 `rejected` as
  harness output), and all are closed.

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
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 4).
3. **The evidence is still one machine wide.** The §5.1 reporting mechanism
   now exists on the Node path (spec/0004, `4f56df4`) — but nothing receives
   reports (the intake is not live; sends fail and are dropped) and the
   deployed Workers path deliberately sends nothing. §5.1 binds at this
   promotion (amended 2026-08-30; D-108 closed by that amendment), so
   `launched` waits on the intake with its tested deletion path (spec R5c,
   D-107) and the Workers-path decision ([`BACKLOG.md`](BACKLOG.md) item 5).
4. **No lawyer has reviewed the legal posture, and no SCCs cover the US
   transfer** (D-105, DEGRADING). For a UK/EU user the transfer rests on the
   disclosure alone.
5. **A user-visible defect is still live on the public page — fixed in the
   repository, not yet in the product.** A connected Zoom owner's personal
   meeting URL prints to anyone who loads their booking page, before any
   booking. The fix is merged and reviewed (`16c3fd4`, `3d313d2`, release note
   2026-08-31, Q-011) and was re-verified in the tree at this evaluation, not
   taken on the coder's word. But `booking.pumasi.ai` was last deployed
   2026-08-30 16:55 UTC and the fix is 2026-08-31 05:27 UTC, so the live build
   is the pre-fix one and the stamped room the steward's own end-to-end test
   created on this deployment (`ecdd60b`) is still being served
   ([`BACKLOG.md`](BACKLOG.md) item 1). **This item was a candidate to strike
   at this evaluation and is deliberately not struck**: the merge closed the
   defect in `main`, and this file is about what strangers meet. A `launched`
   product would treat both the defect and the twelve-hour gap between "fixed"
   and "shipped" as release-stoppers.

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
  `package.json` has said `0.1.0` since the first commit and
  `/version` returns 404 (`PRODUCT-RULES.md` PR-1 gap;
  [`BACKLOG.md`](BACKLOG.md) item 3). Consequence found on 2026-08-31: **there
  is no way, from the repository or the running site, to tell which build is
  live.** Establishing it for this evaluation needed Cloudflare API access.
- **Nothing in the flow deploys a merged fix.** The charter flow ends at
  `GATE: PASS` and a published release note; no role in
  `pumasi-ops/roles/` owns carrying the build to `booking.pumasi.ai`, and
  `HUMAN.md` does not reserve it either — so it is agent work nobody is
  assigned. Raised as `DECISIONS.md` **Q-012** with a named default; this gap,
  not the Zoom bug, is why item 5 above is still open.
- Zoom connect cannot complete at all on a deployment with no calendar
  integration configured ([`BACKLOG.md`](BACKLOG.md) item 2). Does not affect
  `booking.pumasi.ai`, which has one; it affects self-hosters, whom
  [`VALUE.md` §1](VALUE.md) explicitly courts.

## What `launched` requires

The Q-009 window passing unvetoed; Google verification cleared so C1 holds
for strangers; the reporting *intake* live with its deletion path
implemented and tested, and the Workers-path reporting decision made (§5.1
binds at this promotion; spec/0004 R5c, D-107 — [`BACKLOG.md`](BACKLOG.md)
item 5); the PMI leak closed **on the deployment**, not only in `main`
(item 1); a route by which a merged fix reaches users at all (`DECISIONS.md`
Q-012); and the D-105 residue either cleared by counsel or explicitly accepted
by the steward as the standing posture.
*Satisfied since the last pass:* the §5.1 mechanism itself and the published
D-107 retention schedule (`4f56df4`, release note 2026-08-30), and the first
full release-note → evaluation cycle (ops `DIGEST.md`, 2026-08-30
evaluation). *Newly required by this pass:* the deploy route — an unstated
assumption in this list until the day it failed. Promotion is a commit citing
each.
