# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed 2026-08-31 at the sign-in-reachability
evaluation (job `0030`; stage unchanged — the third refresh today, and the
reason is below). A stage change — up or down — is a commit with its evidence in
the message. **Nothing here reads a `STAGE_PLAYBOOK.md` exit gate as `MET`**, so
its trigger-matrix **Event 3** — which fires a public marketing packet off that
one word — does not fire from this pass. That coupling is `DECISIONS.md`
**Q-024**, raised by the `pumasi-tunnel` seat on 2026-08-31; it is named here so
the absence is a decision rather than an oversight.

**What this file is a claim about.** The deployment, not the branch. That
distinction did no work until 2026-08-31, when the two came apart; it is now
doing real work four times over. **Four merged builds** are ahead of what
`booking.pumasi.ai` serves — the §5.1 reporting mechanism (`4f56df4`), the Zoom
PMI fix (`16c3fd4`), the OAuth-callback fix (`4f6ddf0`) and the sign-in
reachability fix (`6b597dd`) — every one of them a published release note, three
of them reviewed can-hurt releases inside open veto windows. Evidence below that
describes `main` says so, and says separately whether it has reached users.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** **311 service tests + 19 engine tests pass and `GATE: PASS` at
  `6b597dd`** — `pumasi/tools/gate.sh` and `npm test` re-run by this evaluation
  rather than quoted from the release note (L-006: a number is only as good as
  what it covers, so the suite was run, not counted). The six frozen SPEC-0007
  acceptance cases **A-001…A-006 are all green** inside that total, as is the
  15-case `service/test/oauth-state.test.ts` runner from spec/0006. The sharded
  end-to-end suite was green 2026-08-29. Exclusivity is proven against real
  PostgreSQL with genuinely parallel connections
  ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)). Step 4/4
  of the gate still prints `tools/families.sh missing — breadth UNVERIFIED`,
  which is the known cosmetic defect in the script's path handling, not a
  finding about this tree.
  **Determinism, measured here for the first time rather than assumed.**
  `pumasi-tunnel`'s Stage 1 gate was recorded `MET` off 12 local runs and a
  re-measurement at 40 found its suite failing **7.5%** of the time
  (`DECISIONS.md` **Q-024**); this product's suite had never been run more than
  once per evaluation. Re-run here **40 consecutive times** at `6b597dd`:
  **40 of 40 green, 0 failures**, no run differing from any other, and no
  failure artefact to keep. A single green run is not evidence of a
  deterministic suite; this file will keep the figure current rather than
  inherit it.
  **What no number here can carry, and it is named rather than left implied:**
  nothing re-runs any of this automatically. `.github/` holds no workflows and
  `gh run list` is empty, so every one of these figures — here and in four
  release notes — is a report of a script an agent chose to run on its own
  checkout. This evaluation is that check for today, and a check is not a
  system ([`BACKLOG.md`](BACKLOG.md) item 2).
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
  button dead on `/app`) was accepted and fixed 2026-08-30. Read fresh from
  `worktree-product-rules` at this evaluation, not from a cached copy (L-007);
  its absence from `pumasi` `main` is **Q-017**, not compliance. **PR-1 is not
  met** and binds always, not at a promotion — it is [`BACKLOG.md`](BACKLOG.md)
  item 3 and a listed gap below, and the 2026-08-31 sign-in release note now
  says so in its own text (`pumasi` `29f0853`, *"Which build this is"*: the
  version clause cannot be met, so the commit is given instead).
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
  latest deployment at **2026-08-30 16:55:37 UTC** (version `d73c05b5`) — a
  *Secret Change*; the last upload of *code* is **16:22:12 UTC** the same day
  (version `ffa54b6d`). The host answers **200**. Re-measured at this
  evaluation, and unchanged across three consecutive evaluations, which is the
  point: **two** complete charter cycles have now finished on top of a
  deployment that has not moved in ~26 hours. This is stated as evidence because
  a maturity label that reads the branch and calls it the product is the
  two-documents-forking failure with extra steps.
- **No open `priority: high` bugs.** Tracker re-checked 2026-08-31 at this
  evaluation (`gh issue list --state open` → empty): **zero open issues**, and
  no new issue since 2026-08-30 14:54 despite the feedback widget being live on
  the public pages. The fifteen feedback-widget reports of 2026-08-30 all carry
  verdicts and are closed. An empty tracker is recorded as a finding, not read
  as an endorsement: it is also consistent with nobody using the product.

## Why not `launched`

`launched` requires the [`VALUE.md`](VALUE.md) promises to hold, feedback to be
answered, and regressions to be release-stoppers. Today:

1. **Four can-hurt releases are inside their veto windows** — Q-009 (reporting
   path), Q-011 (Zoom connect), Q-015 (OAuth callback) and now **Q-023**
   (sign-in reachability, published 2026-08-31, with **Q-022** as its intent
   window). Pre-`launched` the work proceeds on the defaults, but a release that
   can still be reversed by veto is not a launch. *Dates are the steward's to
   set and are deliberately not restated here.*
2. **The central promise is gated for strangers.** Calendar connection works
   only for nominated Google test accounts until the OAuth app passes
   verification, which has not been submitted
   ([`GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md); VALUE C1's
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 5).
3. **The evidence is still one machine wide.** The §5.1 reporting mechanism
   now exists on the Node path (spec/0004, `4f56df4`) — but nothing receives
   reports (the intake is not live; sends fail and are dropped) and the
   deployed Workers path deliberately sends nothing. §5.1 binds at this
   promotion (amended 2026-08-30; D-108 closed by that amendment), so
   `launched` waits on the intake with its tested deletion path (spec R5c,
   D-107) and the Workers-path decision ([`BACKLOG.md`](BACKLOG.md) item 6).
   *Sharpened 2026-08-31:* the evidence is not only one machine wide, it is one
   *observer* wide — no CI re-runs any suite on any change
   ([`BACKLOG.md`](BACKLOG.md) item 2).
4. **No lawyer has reviewed the legal posture, and no SCCs cover the US
   transfer** (D-105, DEGRADING). For a UK/EU user the transfer rests on the
   disclosure alone.
5. **A user-visible defect is still live on the public page — fixed in the
   repository, not yet in the product, for a second consecutive day and a third
   consecutive evaluation.** A
   connected Zoom owner's personal meeting URL prints to anyone who loads their
   booking page, before any booking. The fix is merged and reviewed (`16c3fd4`,
   `3d313d2`, release note 2026-08-31, Q-011); this evaluation re-checked that
   deploying it closes the defect even for rows the old flow already stamped —
   `locationText(schedule, …, 'public')` short-circuits to
   "link arrives with the confirmation" for every conferencing kind before it
   consults `location_value` (`schedules.ts:371`). But the deployment has not
   moved, so the live build is still the pre-fix one
   ([`BACKLOG.md`](BACKLOG.md) item 1). **Deliberately not struck, for the
   third evaluation running**: this file is about what strangers meet. A
   `launched` product would treat both the defect and the now ~26-hour gap
   between "fixed" and "shipped" as release-stoppers.
6. **Nothing but an agent's own report stands behind any quality claim.** There
   is no CI in this repository at all (`.github/` holds only
   `feedback-attachments`; `gh run list` is empty), so `launched`'s
   "regressions are release-stoppers" has nothing to stop a release *with*.
   This is not a defect in any change, which is why it took a post-release read
   to surface it, and it is the one open gap that bears directly on the word
   `beta` above — a stranger cannot re-run a script an agent ran on its own
   machine. [`BACKLOG.md`](BACKLOG.md) item 2; the question of whether the
   charter's gate should become machine-enforced commons-wide is `DECISIONS.md`
   **Q-025**, which is the steward's and not this seat's.

## Why not `alpha`

Demotions must be earned too, so the case against is recorded, and it was
re-asked this evaluation rather than inherited: alpha says "works for people
who talk to the builders; data may not survive." Data survives and is
deletion-tested; strangers already sign up and book through a proven-address
gate; the suites and the concurrency proofs are real and green at `6b597dd`,
40 runs deep; the tracker holds zero open bugs. **Two candidate grounds
for demotion were weighed this pass, not one.** *(i)* A reviewed fix to a live
defect has now failed to reach users for ~26 hours and the flow has no one
assigned to carry it (Q-012). *(ii)* Newly named: no CI re-runs anything, so the
test evidence above is an agent's report of its own run. Neither is taken.
On *(i)*, that is a delivery gap this file is required to *list*, and beta's own
definition asks that gaps be listed, not absent. On *(ii)* — the closer call,
because it goes to whether a **stranger** can rely on this — the answer is that
the evidence is re-derived independently at every evaluation by a seat that did
not write the code, was re-derived again here, and held: 311 + 19, zero
failures, 40 runs. That is weaker than CI and it is written down as
weaker. It is not "the tests are unverified." Demoting on either would
understate deletion-tested data, real stranger traffic and a suite that passes
when it is run, and would substitute a label for the sentences that actually
inform anyone: the fix is merged and not deployed, nothing watches the suite
but the agents who run it, and here is who has to decide each.

## Known gaps, so nobody discovers them the hard way

- **Four merged builds are not serving anyone**, every one with a published
  release note and three of them reviewed can-hurt releases inside open
  windows: `4f56df4`, `16c3fd4`, `4f6ddf0`, `6b597dd`. The deployment has not
  moved since 2026-08-30 16:55:37 UTC.
- **Nothing re-runs the merge gate, or anything else.** This repository has no
  CI: `.github/` contains only `feedback-attachments`, there is no
  `.github/workflows/`, and `gh run list` is empty. `pumasi/tools/gate.sh` is
  not even in this repository — it is run by hand from a checkout by the agent
  that wants to pass it. Every `GATE: PASS` and every test count, here and in
  four release notes, is that agent's report. The repository is public so
  Actions minutes are free and this is not a spend; it is simply work nobody has
  done. [`BACKLOG.md`](BACKLOG.md) item 2; `DECISIONS.md` **Q-025** for the part
  that is the steward's.
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
  this evaluation, as it did at the two before it (`PRODUCT-RULES.md` PR-1 gap,
  binds always; [`BACKLOG.md`](BACKLOG.md) item 3). The 2026-08-31 sign-in
  release note states outright that PR-1's version clause cannot be met by this
  product and gives the commit instead (`pumasi` `29f0853`).
- **A half-configured deployment is refused in a way it cannot act on, and one
  of the two builds refuses too late.** *(a)* Neither sign-in refusal names a
  missing `TOKEN_KEY`, so an operator who set up Microsoft or an IdP and forgot
  the key is told the feature is "not configured" — true and unactionable.
  *(b)* `worker.ts:596` opens `/auth/google/start` on `googleClientId` alone,
  where the Node path effectively requires the secret too (`app.ts:984`–`986`,
  via the hub), so a Workers deployment holding an id and no secret is sent out
  to Google and refused on the way back instead of at the button. Nothing is
  unguarded either way and no live user is affected — `booking.pumasi.ai` holds
  both credentials. Recorded by the spec/0007 run as found-not-fixed and ranked
  here; [`BACKLOG.md`](BACKLOG.md) item 4.
- Deletion cannot recall mail already sent — by nature, and disclosed in the
  notice.
- The deployed (Workers/Gmail) mail path's subprocessor control is code review,
  not the Node path's runtime refusal ([`SUBPROCESSORS.md`](../SUBPROCESSORS.md)).
- Deployment defaults are 5 accounts / 200 bookings until an operator raises
  them deliberately.
- No mobile apps, no integrations ecosystem, no payments (the last by
  decision) — see [`VALUE.md` §4](VALUE.md).
- *Closed since the last refresh:* **Microsoft sign-in and per-org OIDC SSO
  were gated on Google Calendar credentials** — `/auth/microsoft/start` on the
  Node path, `/login/sso/<orgId>` on **both** paths (the Workers router forwards
  it into the Durable Object that runs the same `handle()`). Both doors now gate
  on being able to seal a sign-in ticket (`app.ts:922`, `app.ts:1017`;
  spec/0007, Q-023, merged `6b597dd`), verified here against the tree rather
  than read off the release note, with `service/src/worker.ts` untouched by the
  whole range so the half that was already right was not "fixed".
- *Closed at the refresh before this one:* Zoom connect could not complete at
  all on a deployment with no calendar integration. Fixed in `main` at `4f6ddf0`
  (spec/0006, Q-015) and verified against the tree. Neither of these ever
  affected `booking.pumasi.ai`, and the people they did affect self-host from
  this repository — so for them the merge is the delivery, once they pull.
  Recorded as closed rather than deleted, because "closed in `main`" and "closed
  for a user" are the distinction this file exists to keep.

## What `launched` requires

The Q-009, Q-011, Q-015 and Q-023 windows passing unvetoed; Google verification
cleared so C1 holds for strangers; the reporting *intake* live with its
deletion path implemented and tested, and the Workers-path reporting decision
made (§5.1 binds at this promotion; spec/0004 R5c, D-107 —
[`BACKLOG.md`](BACKLOG.md) item 6); the PMI leak closed **on the deployment**,
not only in `main` (item 1); a route by which a merged fix reaches users at all
(`DECISIONS.md` Q-012); PR-1 met, since it binds always and this stage has been
carrying the gap for four evaluations (item 3); **something other than the
merging agent re-running the suite on every change** (item 2); and the D-105
residue either cleared by counsel or explicitly accepted by the steward as the
standing posture.
*Satisfied since the last pass:* nothing new — the sign-in release removed a
defect rather than clearing a gate, and that is said plainly instead of counted
as progress. *Newly named by this pass:* CI, promoted straight from "not
noticed by anyone" to a promotion requirement, on the same reasoning that
promoted PR-1 last pass — `launched` means "regressions are release-stoppers",
and a regression cannot stop a release that nothing is watching. Promotion is a
commit citing each.
