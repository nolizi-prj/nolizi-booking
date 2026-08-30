# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29, on the evidence below. A stage change — up or down — is a
commit with its evidence in the message.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** 248 service + 19 engine tests pass and the sharded end-to-end
  suite is green, run 2026-08-29 on `main` (post-merge of the public-signup
  range), exit 0 across the board. Exclusivity is proven against real
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
- **No open `priority: high` bugs.** Tracker as of this pass: three `accepted`
  issues at priority normal (#3, #5, #6), one `escalated` (#4).

## Why not `launched`

`launched` requires the [`VALUE.md`](VALUE.md) promises to hold, feedback to be
answered, and regressions to be release-stoppers. Today:

1. **The sign-up release is inside its can-hurt veto window until 2026-09-05**
   — default on silence is proceed, but a release that can still be reversed by
   veto is not a launch.
2. **The central promise is gated for strangers.** Calendar connection works
   only for nominated Google test accounts until the OAuth app passes
   verification, which has not been submitted
   ([`GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md); VALUE C1's
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 2).
3. **The evidence is one machine wide.** No reporting path exists (`DEBT.md`
   D-108); nothing tells us the service works anywhere it wasn't built, and
   the D-108 exception expires with the next release.
4. **No lawyer has reviewed the legal posture, and no SCCs cover the US
   transfer** (D-105, DEGRADING). For a UK/EU user the transfer rests on the
   disclosure alone.
5. **The feedback loop is one day old.** First triage verdicts landed
   2026-08-30 UTC; no release evaluation cycle (duty 4) has run yet.

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

## What `launched` requires

The veto window passing unvetoed; Google verification cleared so C1 holds for
strangers; the §5.1 reporting path built and the retention schedule published
(D-108, D-107 — [`BACKLOG.md`](BACKLOG.md) item 1); at least one full
release-note → evaluation cycle in `DIGEST.md`; and the D-105 residue either
cleared by counsel or explicitly accepted by the steward as the standing
posture. Promotion is a commit citing each.
