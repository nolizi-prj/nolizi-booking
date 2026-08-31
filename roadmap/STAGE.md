# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed 2026-08-31 at the OAuth-callback evaluation
(stage unchanged — the second refresh today, and the reason is below). A stage
change — up or down — is a commit with its evidence in the message.

**What this file is a claim about.** The deployment, not the branch. That
distinction did no work until 2026-08-31, when the two came apart; it is now
doing real work twice over. **Three merged builds** are ahead of what
`booking.pumasi.ai` serves — the §5.1 reporting mechanism (`4f56df4`), the Zoom
PMI fix (`16c3fd4`) and the OAuth-callback fix (`4f6ddf0`) — two of them
reviewed, gate-passed releases with published notes and open veto windows.
Evidence below that describes `main` says so, and says separately whether it
has reached users.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** **305 service tests + 19 engine tests pass and `GATE: PASS` at
  `4f6ddf0`** — `tools/gate.sh` and `npm test` re-run by this evaluation rather
  than quoted from the release note (L-006: a number is only as good as what it
  covers, so the suite was run, not counted). The 15-case
  `service/test/oauth-state.test.ts` runner added by spec/0006 is inside that
  total. The sharded end-to-end suite was green 2026-08-29. Exclusivity is
  proven against real PostgreSQL with genuinely parallel connections
  ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)). Step 4/4
  of the gate still prints `tools/families.sh missing — breadth UNVERIFIED`,
  which is the known cosmetic defect in the script's path handling, not a
  finding about this tree.
- **Data survives.** Durable-Object SQLite in the deployment, PostgreSQL when
  configured; deletion is verified by absence, not by claim.
- **Strangers are admitted honestly.** Public sign-up released 2026-08-29 with
  a proven-address rule (no session on an unverified email), rate limits, and
  no account-enumeration oracle
  ([release note](https://github.com/pumasi-ai/governance/blob/main/releases/2026-08-29-pumasi-booking-public-signup.md)).
- **`PRODUCT-RULES.md` PR-2 — the rule that binds *at this stage* — is met.**
  In-app feedback exists and is this commons' reference implementation
  (`service/src/feedback.ts`); the widget is on the live pages, three kinds,
  optional contact, reports landing as public GitHub issues where intake gives
  each a cited verdict. The one reported defect against it (#29, feedback
  button dead on `/app`) was accepted and fixed 2026-08-30. **PR-1 is not met**
  and binds always, not at a promotion — it is [`BACKLOG.md`](BACKLOG.md)
  item 3 and a listed gap below.
- **The legal pages tell the truth.** Checked 2026-08-29: `/privacy`,
  `/terms`, `/subprocessors` match the code and the debt register, state the
  missing counsel review plainly, and the notice is enforced by a test against
  the live booking form (`8f77d66`). The README's stale claims (calendar, test
  counts, an uncited competitor line) were corrected the same day
  (`f1355bc`, `0ff54d8`, `0d1674d`, `5630e07`). **Narrowed from "the live
  pages" on 2026-08-31**: one live page does *not* tell the truth — see "why
  not launched" item 5 — and the old wording would have covered it.
- **The deployed build is not `main`, it has not moved, and this file tracks
  the gap.** `npx wrangler deployments list` for the `pumasi-booking` worker
  (`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) still puts the
  latest deployment at **2026-08-30 16:55:37 UTC** — a *Secret Change*; the
  last upload of code is **16:22:12 UTC** the same day. Re-run at this
  evaluation, and unchanged since the previous one, which is the point: a full
  charter cycle has completed on top of a deployment that has not moved in
  ~23 hours. This is stated as evidence because a maturity label that reads the
  branch and calls it the product is the two-documents-forking failure with
  extra steps.
- **No open `priority: high` bugs.** Tracker re-checked 2026-08-31 at this
  evaluation: **zero open issues**, and no new issue since 2026-08-30 06:07.
  The fifteen feedback-widget reports of 2026-08-30 all carry verdicts and are
  closed.

## Why not `launched`

`launched` requires the [`VALUE.md`](VALUE.md) promises to hold, feedback to be
answered, and regressions to be release-stoppers. Today:

1. **Two can-hurt releases are inside their veto windows** — Q-009 (reporting
   path) until 2026-09-06, Q-011 (Zoom connect) until 2026-09-07, and now
   **Q-015** (OAuth callback) until 2026-09-07. Pre-`launched` the work
   proceeds on the defaults, but a release that can still be reversed by veto
   is not a launch.
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
   repository, not yet in the product, for a second consecutive day.** A
   connected Zoom owner's personal meeting URL prints to anyone who loads their
   booking page, before any booking. The fix is merged and reviewed (`16c3fd4`,
   `3d313d2`, release note 2026-08-31, Q-011); this evaluation re-checked that
   deploying it closes the defect even for rows the old flow already stamped —
   `locationText(schedule, …, 'public')` short-circuits to
   "link arrives with the confirmation" for every conferencing kind before it
   consults `location_value` (`schedules.ts:371`). But the deployment has not
   moved, so the live build is still the pre-fix one
   ([`BACKLOG.md`](BACKLOG.md) item 1). **Deliberately not struck, for the
   second evaluation running**: this file is about what strangers meet. A
   `launched` product would treat both the defect and the now day-long gap
   between "fixed" and "shipped" as release-stoppers.

## Why not `alpha`

Demotions must be earned too, so the case against is recorded, and it was
re-asked this evaluation rather than inherited: alpha says "works for people
who talk to the builders; data may not survive." Data survives and is
deletion-tested; strangers already sign up and book through a proven-address
gate; the suites and the concurrency proofs are real and green at `4f6ddf0`;
the tracker holds zero open bugs. The honest case *for* demotion is that a
reviewed fix to a live defect has now failed to reach users for a full day and
the flow has no one assigned to carry it (Q-012) — but that is a delivery gap
this file is required to *list*, and beta's own definition asks that gaps be
listed, not absent. Demoting on it would understate deletion-tested data and
real stranger traffic, and would substitute a label for the sentence that
actually informs anyone: the fix is merged, it is not deployed, and here is
who has to decide that.

## Known gaps, so nobody discovers them the hard way

- **Three merged builds are not serving anyone**, two of them reviewed
  can-hurt releases with published notes: `4f56df4`, `16c3fd4`, `4f6ddf0`. The
  deployment has not moved since 2026-08-30 16:55 UTC.
- **Nothing in the flow deploys a merged fix.** The charter flow ends at
  `GATE: PASS` and a published release note; no role in
  `pumasi-ops/roles/` owns carrying the build to `booking.pumasi.ai`, and
  `HUMAN.md` does not reserve it either — so it is agent work nobody is
  assigned. Raised as `DECISIONS.md` **Q-012** with a named default and still
  open; this gap, not the Zoom bug, is why item 5 above is still open.
- **Nothing tells you which build is live — including the endpoint built to.**
  `https://booking.pumasi.ai/healthz` answers
  `{"status":"ok","commit":"unknown","sharded":true}`: `worker.ts:443` serves
  `env['GIT_COMMIT'] ?? 'unknown'` and the deploy that would have set it did
  not. `package.json` has said `0.1.0` since the first commit and `/version`
  returns 404. Establishing what is deployed needed Cloudflare API access at
  this evaluation, as it did at the last one (`PRODUCT-RULES.md` PR-1 gap,
  binds always; [`BACKLOG.md`](BACKLOG.md) item 3).
- **Microsoft sign-in and per-org OIDC SSO are gated on Google Calendar
  credentials.** `/auth/microsoft/start` on the Node path (`app.ts:998`) and
  `/login/sso/<orgId>` on **both** paths (`app.ts:912`, reached on Workers via
  the Durable Object at `worker.ts:805`) reach for `deps.calendars`, which
  exists only when Google Calendar is configured. A self-hoster with Microsoft
  credentials and no Google Calendar sees a sign-in button that answers "not
  configured"; an operator with an OIDC provider gets "SSO is not configured on
  this deployment." Does not affect `booking.pumasi.ai`, which has Google
  Calendar configured. Found by this evaluation reading the tree behind a
  partial handover; [`BACKLOG.md`](BACKLOG.md) item 2.
- Deletion cannot recall mail already sent — by nature, and disclosed in the
  notice.
- The deployed (Workers/Gmail) mail path's subprocessor control is code review,
  not the Node path's runtime refusal ([`SUBPROCESSORS.md`](../SUBPROCESSORS.md)).
- Deployment defaults are 5 accounts / 200 bookings until an operator raises
  them deliberately.
- No mobile apps, no integrations ecosystem, no payments (the last by
  decision) — see [`VALUE.md` §4](VALUE.md).
- *Closed since the last refresh:* Zoom connect could not complete at all on a
  deployment with no calendar integration. Fixed in `main` at `4f6ddf0`
  (spec/0006, Q-015) and verified here against the tree. It never affected
  `booking.pumasi.ai`, and the people it did affect self-host from this
  repository — so for them the merge is the delivery, once they pull. Recorded
  as closed rather than deleted, because "closed in `main`" and "closed for a
  user" are the distinction this file exists to keep.

## What `launched` requires

The Q-009, Q-011 and Q-015 windows passing unvetoed; Google verification
cleared so C1 holds for strangers; the reporting *intake* live with its
deletion path implemented and tested, and the Workers-path reporting decision
made (§5.1 binds at this promotion; spec/0004 R5c, D-107 —
[`BACKLOG.md`](BACKLOG.md) item 5); the PMI leak closed **on the deployment**,
not only in `main` (item 1); a route by which a merged fix reaches users at all
(`DECISIONS.md` Q-012); PR-1 met, since it binds always and this stage has been
carrying the gap for three evaluations (item 3); and the D-105 residue either
cleared by counsel or explicitly accepted by the steward as the standing
posture.
*Satisfied since the last pass:* nothing new — the OAuth-callback release
removed a defect rather than clearing a gate, and that is said plainly instead
of counted as progress. *Newly named by this pass:* PR-1, promoted from a
listed gap to a promotion requirement, because a `launched` product whose
evaluator cannot determine its running version has no way to make a regression
a release-stopper. Promotion is a commit citing each.
