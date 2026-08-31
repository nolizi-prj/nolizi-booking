# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed 2026-08-31 at the advisory-CI post-release
evaluation (job `0044`; **stage unchanged — `beta`** — the fourth refresh today,
and the reason is below, including the one new finding that was weighed as a
demotion ground and did not become one). A stage change — up or down — is a commit with its evidence in
the message. **Nothing here reads a `STAGE_PLAYBOOK.md` exit gate as `MET`**, so
its trigger-matrix **Event 3** — which fires a public marketing packet off that
one word — does not fire from this pass. That coupling is `DECISIONS.md`
**Q-024**, raised by the `pumasi-tunnel` seat on 2026-08-31; it is named here so
the absence is a decision rather than an oversight.

**What this file is a claim about.** The deployment, not the branch. That
distinction did no work until 2026-08-31, when the two came apart; it is now
doing real work five times over. **Five merged builds** are ahead of what
`booking.pumasi.ai` serves — the §5.1 reporting mechanism (`4f56df4`), the Zoom
PMI fix (`16c3fd4`), the OAuth-callback fix (`4f6ddf0`), the sign-in
reachability fix (`6b597dd`) and advisory CI (`d5a02bb`) — every one of them a
published release note, four of them reviewed can-hurt releases inside open veto
windows. Evidence below that describes `main` says so, and says separately
whether it has reached users. **This pass the distinction stopped being
bookkeeping and produced a defect:** the deployed Worker has a live broken
feature that no evidence about `main` would ever have shown, because the tests
and the type-check both describe a file the deployment does not run
([`BACKLOG.md`](BACKLOG.md) items 2 and 3).

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** **317 service tests + 19 engine tests pass, and `GATE: PASS`, at
  `d5a02bb`.** Per `DECISIONS.md` **Q-025 rider (a)**, this file does not cite
  `GATE: PASS` without saying who re-ran it and when: `pumasi/tools/gate.sh` was
  run by **this evaluation — the product-manager seat, job `0044`, on
  2026-08-31 at 15:28 CDT** — not quoted from a release note and not inherited
  from the job that merged (L-006: a number is only as good as what it covers,
  so the suite was run, not counted). The service count rose 311 → 317 with the
  six frozen SPEC-0008 acceptance cases. The six SPEC-0007 cases
  **A-001…A-006 are all green** inside that total, as is the 15-case
  `service/test/oauth-state.test.ts` runner from spec/0006. The sharded
  end-to-end suite was green 2026-08-29. Exclusivity is proven against real
  PostgreSQL with genuinely parallel connections
  ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)). Step 4/4
  of the gate still prints `tools/families.sh missing — breadth UNVERIFIED`,
  which is the known cosmetic defect in the script's path handling, not a
  finding about this tree.
  **Determinism — the figure this file carried was too clean, and is corrected
  here.** The previous refresh (job `0030`) ran `npm test` 40 consecutive times
  at `6b597dd` and recorded **40 of 40 green**. That run **did not record the
  machine load it was taken under**, so it cannot be read as evidence that the
  suite is load-independent, and this file should not have implied it was.
  Per **Q-025 rider (b)** — an evaluation measures determinism rather than
  inheriting a green run — it was re-measured here at `d5a02bb`, 40 consecutive
  sequential runs, recording the one-minute load average before each:
  **21 of 40 green, then 19 consecutive failures — 19 of 40 runs failed.**
  Runs 1–21 were 336/336 while the load average climbed **1.38 → 12.06**, driven
  by the suite itself. Run 22 failed 5 tests, all in
  `service/test/enterprise.test.ts`, in a `before` hook, on `FATAL: could not
  create any TCP/IP sockets` — the previous run's PostgreSQL for that file had
  not released its hard-coded port. Runs 23–40 then failed **identically**, on
  `initdb: … directory "/tmp/pumasi-pg-enterprise" exists but is not empty`, at
  load averages *including ones lower than green runs 17–21*. `rm -rf` on that
  one directory, then three more runs at load 8.79/9.36/9.84: **336/336, green,
  all three.**
  **So the honest statement of this product's determinism is not a bare
  number.** The suite passes 336/336 whenever it is given a clean `/tmp`; a
  single contention event latches it red until a human deletes a directory,
  because the 19 PostgreSQL files hard-code both their port and their data
  directory. That is a property of the harness, not of the product's behaviour,
  and it produces false **reds**, never a false green — a poisoned `before` hook
  cannot pass a test that would otherwise fail. It is
  [`BACKLOG.md`](BACKLOG.md) item 6, and the repair named there is unique
  directories and OS-allocated ports, **not** lowering test concurrency: these
  40 runs were strictly sequential, so there was no concurrency to lower.
  **What the numbers above now do and do not rest on.** Since `d5a02bb` they are
  no longer only an agent's report of its own run: advisory CI re-runs the core
  suite, the service suite, and `npm run typecheck` on every push and pull
  request, in public, where a stranger can read the result without an account
  (run [`33428541886`](https://github.com/pumasi-ai/pumasi-booking/actions/runs/33428541886),
  success at `d5a02bb`; verified at this evaluation, along with two deliberate
  red runs proving it can fail). That was `BACKLOG.md` item 2 of the last order
  and it is **delivered**. What it still does not cover is named in the gaps
  below, and one of those gaps hid a live defect — now item 2 of this order.
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
  item 4 and a listed gap below, and the 2026-08-31 sign-in release note now
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
  *Secret Change*. The host answers **200**. Re-measured at this evaluation
  (15:28 CDT) and unchanged across **four** consecutive evaluations, which is
  the point: three complete charter cycles have now finished on top of a
  deployment that has not moved in **~27.5 hours**. This is stated as evidence
  because a maturity label that reads the branch and calls it the product is the
  two-documents-forking failure with extra steps — and this pass that failure
  became concrete rather than theoretical (see item 7 under "why not
  `launched`").
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
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 7).
3. **The evidence is still one machine wide.** The §5.1 reporting mechanism
   now exists on the Node path (spec/0004, `4f56df4`) — but nothing receives
   reports (the intake is not live; sends fail and are dropped) and the
   deployed Workers path deliberately sends nothing. §5.1 binds at this
   promotion (amended 2026-08-30; D-108 closed by that amendment), so
   `launched` waits on the intake with its tested deletion path (spec R5c,
   D-107) and the Workers-path decision ([`BACKLOG.md`](BACKLOG.md) item 8).
   *Narrowed 2026-08-31 (evening):* the "one observer wide" half of this is
   **closed** — advisory CI re-runs the suites on every push and pull request in
   public (`d5a02bb`, Q-026). The reporting half stands unchanged.
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
   fourth evaluation running**: this file is about what strangers meet. A
   `launched` product would treat both the defect and the now ~27.5-hour gap
   between "fixed" and "shipped" as release-stoppers.
6. **A machine now re-runs the checks, and `GATE: PASS` still means an agent
   ran it.** This was "nothing but an agent's own report stands behind any
   quality claim", and the first half is **closed**: advisory CI runs on every
   push and pull request (`d5a02bb`, Q-026 open to 2026-09-07), in public,
   verified at this evaluation rather than read off the release note — run
   `33428541886` success at `d5a02bb`, two demonstration runs red, and
   `gh api …/branches/main/protection` → **404 Branch not protected** with
   `…/rulesets` → **`[]`**, so it blocks nothing. That last fact is why the
   entry stays open: `launched` means "regressions are release-stoppers", and an
   advisory check stops nothing. Whether the charter's gate should become
   machine-enforced commons-wide is `DECISIONS.md` **Q-025**, still open on that
   half by its own terms, and it is the steward's rather than this seat's.
7. **A feature this product sells has never worked on the deployment, and was
   found this evaluation.** `service/src/worker.ts:303` calls `processDueJobs`
   without importing it, so the Durable Object alarm that drains due jobs throws
   `ReferenceError` on the hosted build: **every workflow email and every
   webhook on `booking.pumasi.ai` is dead**, and has been since `de4abbe`
   (2026-08-28). Confirmed three ways here — the missing import, the compiler
   (`error TS2304`), and the emitted `wrangler` bundle, which contains the call
   and no definition of it. Core booking is unaffected: a booking still confirms
   and its confirmation mail goes out on the request path. This is
   [`BACKLOG.md`](BACKLOG.md) item 2, it is the highest **build** entry, and its
   repair queues behind **Q-012** like the five builds already waiting.

## Why not `alpha`

Demotions must be earned too, so the case against is recorded, and it was
re-asked this evaluation rather than inherited: alpha says "works for people
who talk to the builders; data may not survive." Data survives and is
deletion-tested; strangers already sign up and book through a proven-address
gate; the suites and the concurrency proofs are real and green at `d5a02bb`,
re-run by this seat and now re-run by a machine on every push; the tracker holds
zero open bugs. **Three candidate grounds for demotion were weighed this pass.**
*(i)* A reviewed fix to a live defect has now failed to reach users for ~27.5
hours and the flow still has no one assigned to carry it (Q-012). *(ii)* Carried
from the last pass and now **weaker**: the test evidence was an agent's report
of its own run — advisory CI has since closed that half. *(iii)* **New, and the
strongest of the three**: workflows and webhooks have never worked on the
deployed build (why-not-`launched` item 7). None is taken.
On *(i)*, that is a delivery gap this file is required to *list*, and beta's own
definition asks that gaps be listed, not absent. On *(ii)*, the evidence is
re-derived independently at every evaluation by a seat that did not write the
code, was re-derived again here (317 + 19, zero failures, `GATE: PASS` at
15:28 CDT), and is now additionally re-run by a machine on every push; that
ground is weaker than it was, not stronger.
On *(iii)* — the one that deserved the most thought, because "strangers can rely
on it" is exactly what `beta` asserts and a stranger who sets a reminder on
`booking.pumasi.ai` gets silence. It is not taken, for three stated reasons and
not by preference. **First**, what is broken is bounded and it is not the
central promise: a stranger can still open a booking page, see real free times,
book, and receive a confirmation — that path does not touch the queue.
**Second**, `beta`'s definition asks that known gaps be *listed*, and this file
lists it within hours of its discovery, in the same pass that found it.
**Third** — and this is the honest counterweight rather than a comfort — the
same argument was already accepted for the Zoom leak, which is a *worse* defect
by every measure and has been listed here for four evaluations without a
demotion; taking (iii) while (i) stands would be inconsistent. What would change
this answer is a stranger reporting it, or a second such defect in `worker.ts`
once item 3 makes them visible. Demoting today would understate deletion-tested
data, real stranger traffic and a suite that passes when it is run, and would
substitute a label for the sentences that actually inform anyone: the fix is
merged and not deployed, the deployed entry point is the one file nothing
checks, and here is who has to decide each.

## Known gaps, so nobody discovers them the hard way

- **Five merged builds are not serving anyone**, every one with a published
  release note and four of them reviewed can-hurt releases inside open
  windows: `4f56df4`, `16c3fd4`, `4f6ddf0`, `6b597dd`, `d5a02bb`. The deployment
  has not moved since 2026-08-30 16:55:37 UTC, re-measured here at 15:28 CDT.
- **Every workflow email and every webhook is dead on the deployment, and has
  been since the feature shipped.** `service/src/worker.ts:303` calls
  `processDueJobs` without importing it (it is exported from
  `automation.ts:151` and imported only by `server.ts:20`), so
  `PumasiService.alarm()` — the Durable Object alarm that drains due jobs and
  re-arms — throws `ReferenceError` on the hosted build, drains nothing, and
  dies before the re-arm. The alarm is really armed: `app.ts` calls
  `deps.pump?.()` at five sites on booking, cancel and reschedule. Introduced
  `de4abbe`, 2026-08-28. Found at this evaluation by type-checking the file that
  nothing type-checks, confirmed in the emitted `wrangler` bundle, and not yet
  fixed in `main`: [`BACKLOG.md`](BACKLOG.md) item 2.
- **Nothing type-checks the deployed entry point, and no test executes it.**
  `service/wrangler.jsonc:6` names `src/worker.ts`; both service `tsconfig`s
  exclude it, so `npm run build`, `npm test` and the new CI `typecheck` all skip
  it, and the eight test files that mention it read it as *text*. 17 errors sit
  under it uncompiled — sixteen are missing Cloudflare ambient types and one was
  the live defect above. [`BACKLOG.md`](BACKLOG.md) item 3.
- **A machine re-runs the checks now, and it blocks nothing.** Advisory CI runs
  the core suite, the service suite (minus `browser-live.test.ts`, named on
  every run), `npm run typecheck` across both workspaces, and a credential-free
  `wrangler deploy --dry-run`, on every push and pull request, in public
  (`d5a02bb`; Q-026 open to 2026-09-07). Verified here, not quoted: run
  `33428541886` green at `d5a02bb`, two demonstration runs red, no branch
  protection (404) and no rulesets (`[]`). So `GATE: PASS` still means an agent
  ran `pumasi/tools/gate.sh` by hand and signed the record — `DECISIONS.md`
  **Q-025** for the half that is the steward's. And **bundling is not
  type-checking**: the green tick above coexisted with the dead-workflow defect,
  which is the gap the run prints about itself on every execution.
- **The suite latches red on a shared machine.** The 19 service test files that
  start PostgreSQL hard-code both their port and their data directory, so one
  contention failure leaves `/tmp/pumasi-pg-<name>` behind and **every later run
  of that file fails on it** until a human deletes it. Measured here: 40
  sequential `npm test` runs gave 21 green, then **19 consecutive identical
  failures**; removing one directory restored 336/336 at the same load. It is a
  false red, never a false green, and a fresh CI runner cannot carry it between
  runs. [`BACKLOG.md`](BACKLOG.md) item 6.
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
  this evaluation, as it did at the three before it (`PRODUCT-RULES.md` PR-1
  gap, binds always; [`BACKLOG.md`](BACKLOG.md) item 4). The 2026-08-31 sign-in
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
  here; [`BACKLOG.md`](BACKLOG.md) item 5.
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

The Q-009, Q-011, Q-015, Q-023 and **Q-026** windows passing unvetoed; Google
verification cleared so C1 holds for strangers; the reporting *intake* live with
its deletion path implemented and tested, and the Workers-path reporting
decision made (§5.1 binds at this promotion; spec/0004 R5c, D-107 —
[`BACKLOG.md`](BACKLOG.md) item 8); the PMI leak closed **on the deployment**,
not only in `main` (item 1); **workflows and webhooks actually working on the
deployment** (item 2), with the deployed entry point brought under a compiler so
that can be checked rather than asserted (item 3); a route by which a merged fix
reaches users at all (`DECISIONS.md` Q-012); PR-1 met, since it binds always and
this stage has been carrying the gap for five evaluations (item 4); and the
D-105 residue either cleared by counsel or explicitly accepted by the steward as
the standing posture.
*Satisfied since the last pass, and this is the first pass in a while that can
say so:* the CI requirement named last pass is **met in the half that was a
promotion requirement** — something other than the merging agent now re-runs the
suite on every change — and is struck from this list. Its other half is not a
requirement but a steward question (Q-025): an advisory check stops no release.
*Newly named by this pass:* workflows and webhooks working on the deployment,
and the file that serves them being type-checked. Neither is a new standard.
`launched` means the [`VALUE.md`](VALUE.md) promises hold, and C3 lists
workflows and webhooks by name; a promise that has never once worked in
production is not a gap in the evidence, it is the thing the evidence was
supposed to be about. Promotion is a commit citing each.
