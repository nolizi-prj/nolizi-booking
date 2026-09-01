# STAGE — beta

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 6).
Set 2026-08-29; evidence refreshed **2026-09-01** at the version post-release
evaluation (job `0061`, at `2453adc`; **stage unchanged — `beta`** — the sixth
refresh, and the reason is below). **The stage did not move and the reason is
not that nothing happened.** Two things happened. PR-1's version clause was
closed in `main`, which is evidence about the *branch* and is not promotion
ground under this file's own rule. And **issue #32** was filed on the live
product at 2026-09-01 00:36:56 UTC — a booker who selected a day that has times
and was shown none, on a public booking page — which is evidence about the
*product*, and is the first such report this file has had to weigh. It is
`accepted` · `priority: high`, it is [`BACKLOG.md`](BACKLOG.md) item 2, and it
is **not** taken as demotion ground at this pass: it is one report, this seat
could not reproduce it, and the page it names was measured serving 25 correct
slots at 00:37 UTC. What it *does* do is withdraw a beta-evidence bullet this
file has carried since 2026-08-29 — see "no open `priority: high` bugs" below,
which is now false — and name, in advance, what would move the label. **What
would demote this product to `alpha`: issue #32 reproduced as a general failure
of the booking page rather than a single-session one.** Written down now so that
a future demotion is a measurement and not a re-reading.
A stage change — up or down — is a commit with its evidence in the message.
**Nothing here reads a `STAGE_PLAYBOOK.md` exit gate as
`MET`**, so its trigger-matrix **Event 3** — which fires a public marketing
packet off that one word — does not fire from this pass. That coupling is
`DECISIONS.md` **Q-024**, raised by the `pumasi-tunnel` seat on 2026-08-31; it
is named here so the absence is a decision rather than an oversight. **Q-025**
is equally relevant to everything below it and is named for the same reason: the
gate figure this file cites is still an agent's own report of a script it ran by
hand, and this pass is one more instance of exactly that.
**The Stage 2 exit gate is quoted rather than paraphrased, because this pass it
decides something:** *"Real end-to-end users can execute complete workflows
without manual engineer intervention."* It is **not `MET`**, and at this pass it
is not met on **three** clauses rather than two, on this seat's own measurement.
On *real end-to-end users*: one such user filed issue #32 twenty-one minutes
into this evaluation, having been unable to pick a time on a public booking
page. A gate about users executing complete workflows cannot read `MET` in the
same hour a user reported being unable to start one. The two clauses this file
has read as unmet since 2026-08-31 are unchanged and follow.
On *complete workflows*: the product's
**workflows** feature — reminders and follow-ups — and its webhooks have never
been delivered on `booking.pumasi.ai`, and the repair merged today has not
reached it, and `2453adc` has widened that gap rather than narrowing it.
On *without manual engineer intervention*: nothing in the flow
carries a merged build to users at all (`DECISIONS.md` **Q-012**, open), so a
fix reaching a real end-to-end user requires exactly that intervention, by
definition. A gate that names workflows by name cannot read `MET` while this
product's workflows are dead in production.

**What this file is a claim about.** The deployment, not the branch. That
distinction did no work until 2026-08-31, when the two came apart; it is now
doing real work six times over.
**Six merged changes to the deployed source** are ahead of what
`booking.pumasi.ai` serves, counted at this pass as *commits that touch
`service/src/`* rather than as commits on `main`, because the looser basis the
last four passes used silently included review transcripts and roadmap edits:
the §5.1 reporting mechanism (`4f56df4`), the Zoom PMI fix (`16c3fd4`), the
OAuth-state fix (`7ea730a`), the two sign-in doors (`3f2947c`), the alarm import
(`0a35ddc`) and now the version (`2453adc`). Thirty-six commits sit on `main`
behind the deployment in total. Every one of these carries a published release
note except `2453adc`, which has none — see "no release note for `2453adc`"
under the gaps below. Evidence below that
describes `main` says so, and says separately whether it has reached users.
**The distinction stopped being bookkeeping at the last refresh and this one
shows what it costs:** the last pass found a live broken feature on the
deployment that no evidence about `main` would ever have shown; a full charter
cycle has since closed it in `main` — build, review, gate, release note — and
**the deployment is byte-for-byte where it was**. Every reminder and every
webhook there is still undelivered. A repair that is complete in every sense
except reaching anyone is the sharpest statement this file can make of what it
is a claim about.

**Beta means:** strangers can rely on it; the known gaps are listed here; data
survives. **It does not mean launched**, and public sign-up being live is not
what decides that — the evidence is.

---

## Evidence for beta

- **Tests.** **328 service tests + 19 engine tests pass, and `GATE: PASS`, at
  `2453adc`.** Per `DECISIONS.md` **Q-025 rider (a)**, this file does not cite
  `GATE: PASS` without saying who re-ran it and when: `pumasi/tools/gate.sh
  2453adc` was run by **this evaluation — the product-manager seat, job `0061`,
  on 2026-09-01 at 00:30 UTC (2026-08-31 19:30 CDT)**, printing `GATE: PASS`
  with `── 1/4 tests` showing **328 pass, 0 fail** — not quoted from a release
  note and not inherited from the job that merged (L-006: a number is only as
  good as what it covers, so the suite was run, not counted). **And this is
  still exactly the self-report Q-025 is about**: one seat, one machine, one
  script it chose to run. The service count rose 320 → 328 at `2453adc`, the
  eight new cases being `service/test/version.test.ts`, which — like the three
  alarm cases before them — **execute** both entry points rather than reading
  their source, loading the Workers build through
  `test/support/worker-runtime.mjs` and calling its `fetch()`. Root `pretest`
  additionally ran `node tools/sync-version.mjs --check` before every one of
  those runs and printed `sync-version: 0.2.0 — manifests, lockfile and
  version.ts agree`. The
  six SPEC-0007 cases A-001…A-006 and the six frozen SPEC-0008 cases are all
  green inside that total, as is the 15-case `service/test/oauth-state.test.ts`
  runner from spec/0006. `npm run typecheck` was run separately here and **exits
  0** — for the first time in this repository's history that command reaches
  `src/worker.ts`, via `service/tsconfig.worker.json`. The sharded end-to-end
  suite was green 2026-08-29. Exclusivity is proven against real PostgreSQL with
  genuinely parallel connections ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md)).
  Step 4/4 of the gate still prints `tools/families.sh missing — breadth
  UNVERIFIED`, which is the known cosmetic defect in the script's path handling,
  not a finding about this tree — and see the reviewer-breadth entry below,
  which is a finding about this tree.
  **Determinism — per Q-025 rider (b), and this pass adds fewer runs than the
  last one and says so rather than implying otherwise.** The refresh two before
  this ran `npm test` 40 consecutive times at `d5a02bb` and recorded **19 of 40
  failing** — 21 green, then 19 consecutive identical failures on a leftover
  PostgreSQL data directory. The refresh before this ran **15 of 15 green** at
  `0a35ddc` across loads 2.56 → 10.99 and established that **load is not the
  cause**. Both findings stand, neither is withdrawn, and **both are carried,
  not confirmed** — this pass re-ran neither, for the reason both gave and this
  one inherits: three other repositories had live writers on this machine
  throughout, and poisoning `/tmp` to re-demonstrate a demonstrated mechanism
  would be paid for by seats that did not choose it.
  **What this pass ran, with its own count.** At `2453adc`: `npm test` at the
  repository root **4 consecutive sequential runs, 4 of 4 green, 347/347 each**
  (19 core + 328 service), plus one service-only run (328/328) and one
  `tools/gate.sh` run (328/328, `GATE: PASS`) — **six suite executions, zero
  failures**. `/tmp` held **0** `pumasi-pg-*` directories before the first and
  **0** after the last.
  **One accidental concurrency trial, recorded because nobody had run one.** The
  gate's `npm test` overlapped a background root run, putting two `npm test`
  invocations in flight at once for the first time on this pod. A snapshot taken
  mid-overlap found **8** `pumasi-pg-*` directories present; **both runs passed
  and both cleaned up after themselves.** That is one trial, not a result. It is
  recorded because concurrency is the mechanism the latch entry names and it had
  never been tried, and it is explicitly **not** offered as evidence that a
  single overlap is safe.
  **What the 15 runs do settle, which 40 clean runs would not have.** *Eleven of
  them sit inside the 9.0–12.4 load band in which the previous pass recorded
  nineteen consecutive failures*, and all eleven were green. So **load is not the
  cause and never was** — the leftover directory is, exactly as the previous
  pass's `rm -rf` check concluded from the other direction. The honest statement
  of this product's determinism is therefore still not a bare number: the suite
  passes 347/347 whenever it is given a clean `/tmp`, at any load this machine
  has been observed under, and a single contention event latches it red until a
  human deletes a directory. That is a property of the harness, not of the
  product, and it produces false **reds**, never a false green. It is
  [`BACKLOG.md`](BACKLOG.md) item 5, and the repair named there is unique
  directories and OS-allocated ports, **not** lowering test concurrency: these
  runs, like the last set, were strictly sequential, so there was no concurrency
  to lower.
  **What the numbers above do and do not rest on.** Since `d5a02bb` they are no
  longer only an agent's report of its own run: advisory CI re-runs the core
  suite, the service suite, and `npm run typecheck` on every push and pull
  request, in public, where a stranger can read the result without an account
  (`d5a02bb`, **Q-026** open to 2026-09-07; run
  [`33428541886`](https://github.com/pumasi-ai/pumasi-booking/actions/runs/33428541886)
  verified green at the last evaluation along with two deliberate red runs).
  **New evidence for Q-026 from this pass, and it strengthens the entry rather
  than the reverse:** that workflow's `npm run typecheck` step now covers the
  deployed entry point, because `0a35ddc` chained `typecheck:worker` into
  `typecheck` in `service/package.json:11` without touching
  `.github/workflows/`. The advisory check therefore got materially stronger
  from a commit that never edited it — which is the property a workflow deriving
  its work from the tree is supposed to have, and it is worth recording inside
  the window rather than after it. **What has not changed:** it still blocks
  nothing, so `GATE: PASS` still means an agent ran the gate by hand, which is
  the half of **Q-025** that stays open and is the steward's.

- **Reviewer breadth degraded silently at `0a35ddc`, and it recovered at
  `2453adc` — both measured in this repository, and the second is why the first
  is left standing rather than deleted.**
  **What this pass measured, at `2453adc`.** Three reviewers were driven and
  **two returned real reviews**: `reviews/20260831-175149-code-gemini.md` (3967
  bytes, `VERDICT: APPROVE`, and it re-ran the suite itself) and
  `reviews/20260831-180355-code-kimi.md` (4206 bytes, `VERDICT: APPROVE`). One
  did not: `reviews/20260831-175149-code-qwen.md` is **372 bytes** and records a
  curl timeout at its 600 s ceiling — not an objection, and not a review. So the
  ratio moved from **one of five reviewing** to **two of three**, and the number
  of ≤544-byte husks produced went from four to one. The merging commit
  attributes the change to a context bundle that fits — 40161 bytes on stdin
  against the 630964 that caused the `Argument list too long` failures — which
  this seat can corroborate from the transcript headers but did not itself
  cause or configure. **The mechanism below is therefore not withdrawn; it is
  recorded as having been the diagnosis that held.**
  **What was measured at `0a35ddc`, kept because the four artefacts are still
  in the repository and still read as reviews.** This is
  recorded as evidence because a claim about how this product's reviews are
  obtained belongs in the file that cites them, and because **Q-025** asks
  exactly what a gate result means.
  **The merge gate held, and this is not a claim that `0a35ddc` merged
  illegally.** CHARTER §4 asks a can-hurt change for one approving review from a
  family other than the builder's (reduced from two by the steward on
  2026-08-29), the builder was Claude, and
  `reviews/20260831-162058-code-gemini.md` ends `VERDICT: APPROVE` after
  re-running the suite and `tools/ci.sh` itself. `tools/gate.sh` step 3/4
  re-run here printed `gemini approved`. The bar was met.
  **What did not happen.** Five reviewers were driven; **one reviewed.** Four
  returned no verdict line, and they did not fail the same way, which matters
  because only one of the two failures is silent:
  - `…-162058-code-qwen.md`, `…-162414-code-glm.md`, `…-162439-code-kimi.md` —
    **350, 348 and 350 bytes**, each stating `Context supplied: 630964 bytes
    inlined (this reviewer has no tools)` and each containing, as its entire
    body, `/home/m/dev/pumasi/tools/review.sh: line 271:
    /home/m/.local/bin/recruit: Argument list too long`. Linux caps a single
    argv element at `MAX_ARG_STRLEN`; the bundle was 630964 bytes, most of it
    the generated `worker-configuration.d.ts` that this very commit added. **No
    model saw the diff.**
  - `…-162417-code-grok.md` — 544 bytes, `HTTP 402 Payment Required, Grok Build
    usage balance exhausted`. A different failure with a different fix, and it
    is named separately rather than folded into the count.
  **Why this is a stage-evidence finding and not a tooling anecdote.** Breadth
  degraded **past a size threshold**, so it degrades exactly when a change is
  large — and the artefact left behind is, at a glance, indistinguishable from a
  review that ran and found nothing. A file in `reviews/` with a header, a date,
  a family and a "Context supplied" line reads as breadth. Three of them are the
  absence of it. That is the D-104 pattern arriving somewhere new: not a family
  switched off, but a family that answers a liveness probe and cannot review.
  **Still not this seat's to fix, and still deliberately not fixed** — and note
  that nothing in this repository changed to produce the recovery above, which
  is the point: the fix is in tooling this product does not own, so this file
  can only report the outcome. `tools/review.sh`
  lives in `pumasi` and `tools/recruit.sh` in `pumasi-ops`; neither is this
  product's code, and this packet confined this seat's writes to this repository
  and the ops digest. `.lock_pumasi-ops` was **BUSY** throughout
  (`./dispatch.sh --locks`). *`.lock_pumasi` read **BUSY** at 22:05 UTC and
  **free** at 22:18; the first reading was an artefact of a prefix-match defect
  in the lock census, repaired by job `0054` mid-pass. Corrected here rather
  than left standing, because a lock state is exactly the kind of measurement
  this file asks other seats not to quote without taking.*
  **Read at whatever state they were in, and reported rather than relied on:**
  at `pumasi` **`133d337`** (2026-08-31 16:45 CDT, job `0048`) `review.sh` now
  hands the bundle to `recruit` on **stdin**, and `pumasi-ops/tools/recruit.sh`
  carries an **uncommitted working-tree** change passing it on to `openrouter`
  with `-p -` rather than in argv. So the repair appears to be complete end to
  end and **half of it is not committed**, and `review.sh:245`–`257` still
  prints a warning naming `recruit.sh:86` as re-passing the payload in argv,
  which its own working tree no longer does. None of that is measured by this
  seat beyond reading it, none of it is claimed as fixed, and the four
  transcripts in this repository stay exactly as they are: they are the record
  of who did not look at `0a35ddc`, and deleting them would delete the finding.

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
  `worktree-product-rules` at this evaluation, not from a cached copy (L-007):
  `pumasi` was at **`3bc1822`** while this pass ran and
  `git ls-tree -r --name-only main | grep PRODUCT-RULES` is **empty** there, as
  it is on every remote branch except `worktree-product-rules` (`0115758`). That
  is the **sixth** consecutive evaluation to find it so; its absence from `main`
  is **Q-017**, open, and it is **not compliance**.
  **PR-1 has four clauses and this pass is the first that can say something
  different about each.** *One source of truth* — **met in `main`** at
  `2453adc`: the root `package.json` is the only hand-written version, and
  `tools/sync-version.mjs` writes `core/package.json`, `service/package.json`,
  three `package-lock.json` workspace entries and a generated
  `service/src/version.ts` from it; all four read `0.2.0`, verified here.
  *The number moves* — **met**, `0.1.0 → 0.2.0`, the first movement in this
  repository's history. *User-visible* — **met in `main` and NOT met in the
  product**: `pages.ts:41` renders `v${VERSION}` in the D-105 footer and
  `worker.ts:452` / `app.ts:343` answer `/version`, and
  `https://booking.pumasi.ai/version` still returns **404**. A clause written
  about what *a person using the product* can find is not satisfied by a branch.
  *In the diagnostics* — **partly met**: `feedback.ts:122` emits a **Product
  Version** row, in `main`; the report payload in `reporting.ts` still carries
  none, deliberately, because adding it is a `pumasi-report/2` bump and a fresh
  R1b spec review ([`BACKLOG.md`](BACKLOG.md) item 8); and release notes, which
  live in `pumasi`, are not this repository's to edit.
  **So: PR-1 is still not met**, and it binds always, not at a promotion. What
  changed is *which* half is missing — it is now a deployment away rather than a
  build away, and that half is [`BACKLOG.md`](BACKLOG.md) item 1.
  **The clause has a live cost that was paid during this evaluation.** Issue #32
  was filed at 00:36:56 UTC, after `2453adc` merged, and it carries **no product
  version** — because the row exists in `main` and not in the build its reporter
  used. PR-1's own words: *"A defect report without a version is a request to
  guess."* That is the first observed instance of the rule's stated cost, and it
  arrived inside the same hour the fix for it merged and failed to ship.
  **Two** release notes have had to name the clause they cannot satisfy — the
  sign-in note (`pumasi` `29f0853`) and the alarm note (`pumasi` `0f574f6`),
  each headed *"Which build this is"*. **`2453adc` has no release note at all**,
  which is a separate gap and is listed below.
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
  newest deployment at **2026-08-30 16:55:37.479 UTC** — version
  `d73c05b5-81b6-41a4-933a-4a94acbaa45a`, `Source: Secret Change`, author
  `atxapplellc@gmail.com`, no tag and no message. `https://booking.pumasi.ai/`
  answers **200**, `/healthz` `{"status":"ok","commit":"unknown","sharded":true}`,
  `/version` **404**, `/readyz` `{"status":"ready","owners":11}`. All five
  re-measured **by this seat at 2026-09-01 00:27:29–49 UTC**, and unchanged
  across **six** consecutive evaluations, which is the point: **five** complete
  charter cycles have now finished on top of a deployment that has not moved in
  **31 h 32 m**.
  **New at this pass, and it removes the need to take anyone's word for it.**
  The live answers now date themselves from outside, without credentials. At
  `2453adc` the Workers build answers `/healthz` with a `version` key
  (`worker.ts:448`), answers `/version` at all (`:452`), and puts `version` in
  `/readyz` (`:461`). The live `/healthz` has no `version` key, the live
  `/readyz` has no `version` key, and `/version` is a 404 page. Until this pass
  the gap between branch and deployment could only be shown with a Cloudflare
  API round trip; it can now be shown with `curl`. It is re-measured rather than
  carried because four evaluations had written down the same timestamp, and a
  number that is quoted rather than taken stops being evidence. This is stated
  as evidence because a maturity label that reads the branch and calls it the
  product is the two-documents-forking failure with extra steps — and the last
  two passes made that concrete rather than theoretical (see item 7 under "why
  not `launched`").
- **~~No open `priority: high` bugs.~~ WITHDRAWN at this pass — there is one.**
  This bullet has been evidence for `beta` since 2026-08-29 and it stopped being
  true at **2026-09-01 00:36:56 UTC**, twenty-one minutes into this evaluation,
  when [issue #32](https://github.com/pumasi-ai/pumasi-booking/issues/32) was
  filed from the live product: a booker on a public booking page selected a day
  the page showed as available and was shown no times. Triaged at this pass's
  duty-1 intake as **`accepted` · `priority: high`**, with the ground cited in
  the thread, and ranked as [`BACKLOG.md`](BACKLOG.md) **item 2**, this
  product's highest *build* entry.
  **What was measured, so the label rests on more than the report.** At
  2026-09-01 00:37:43 UTC, `GET https://booking.pumasi.ai/yunyoungmok/abc` → 200,
  and the page's server-rendered `#slots-data` carries **25 slots — 12 for
  2026-09-01 and 13 for 2026-09-02**; in the reporter's `America/Chicago` the
  13 fall at 09:00–17:00 local on the day they picked. The data was on the page
  and the list was empty. **And it is not another undeployed fix**: the booking
  page's client-side slot renderer was extracted from the live HTML and from
  `service/src/pages.ts` at `2453adc` and diffed — **byte-identical, 5151
  characters**. Deploying would not close it.
  **What is not established, and it is why the stage did not move on this.**
  This seat did not reproduce the empty list; there is no browser on this
  machine, and the failure is entirely client-side. One report with a confirmed
  precondition and an unknown mechanism is a `priority: high` backlog entry and
  a withdrawn evidence bullet. It is not yet a demotion. **What would make it
  one is named in the header of this file** rather than left to a later seat's
  judgement.
  *For the record on the rest of the tracker:* the previous fifteen
  feedback-widget reports of 2026-08-30 all carry verdicts and are closed, and
  #32 is the only open issue.

## Why not `launched`

`launched` requires the [`VALUE.md`](VALUE.md) promises to hold, feedback to be
answered, and regressions to be release-stoppers. Today:

1. **Six can-hurt releases are inside their veto windows** — Q-009 (reporting
   path), Q-011 (Zoom connect), Q-015 (OAuth callback), Q-023 (sign-in
   reachability, with **Q-022** as its intent window), **Q-026** (advisory CI)
   and now **Q-029** (the alarm import, published 2026-08-31, `pumasi`
   `0f574f6`, window closing 2026-09-07). Pre-`launched` the work proceeds on
   the defaults, but a release that can still be reversed by veto is not a
   launch. *Dates are the steward's to set and are deliberately not restated
   here; this seat neither set, moved, extended nor closed any of them.*
2. **The central promise is gated for strangers.** Calendar connection works
   only for nominated Google test accounts until the OAuth app passes
   verification, which has not been submitted
   ([`GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md); VALUE C1's
   stated limit; [`BACKLOG.md`](BACKLOG.md) item 6).
3. **The evidence is still one machine wide.** The §5.1 reporting mechanism
   now exists on the Node path (spec/0004, `4f56df4`) — but nothing receives
   reports (the intake is not live; sends fail and are dropped) and the
   deployed Workers path deliberately sends nothing. §5.1 binds at this
   promotion (amended 2026-08-30; D-108 closed by that amendment), so
   `launched` waits on the intake with its tested deletion path (spec R5c,
   D-107) and the Workers-path decision ([`BACKLOG.md`](BACKLOG.md) item 7).
   *Narrowed 2026-08-31 (evening):* the "one observer wide" half of this is
   **closed** — advisory CI re-runs the suites on every push and pull request in
   public (`d5a02bb`, Q-026). The reporting half stands unchanged.
4. **No lawyer has reviewed the legal posture, and no SCCs cover the US
   transfer** (D-105, DEGRADING). For a UK/EU user the transfer rests on the
   disclosure alone.
5. **A user-visible defect is still live on the public page — fixed in the
   repository, not yet in the product, for a second consecutive day and a
   fourth consecutive evaluation.** A
   connected Zoom owner's personal meeting URL prints to anyone who loads their
   booking page, before any booking. The fix is merged and reviewed (`16c3fd4`,
   `3d313d2`, release note 2026-08-31, Q-011); this evaluation re-checked that
   deploying it closes the defect even for rows the old flow already stamped —
   `locationText(schedule, …, 'public')` short-circuits to
   "link arrives with the confirmation" for every conferencing kind before it
   consults `location_value` (`schedules.ts:371`). But the deployment has not
   moved, so the live build is still the pre-fix one
   ([`BACKLOG.md`](BACKLOG.md) item 1). **Deliberately not struck, for the
   fifth evaluation running**: this file is about what strangers meet. A
   `launched` product would treat both the defect and the now **29-hour** gap
   between "fixed" and "shipped" as release-stoppers.
6. **A machine now re-runs the checks, and `GATE: PASS` still means an agent
   ran it.** This was "nothing but an agent's own report stands behind any
   quality claim", and the first half is **closed**: advisory CI runs on every
   push and pull request (`d5a02bb`, Q-026 open to 2026-09-07), in public,
   verified at the last evaluation rather than read off the release note — run
   `33428541886` success at `d5a02bb`, two demonstration runs red, and
   `gh api …/branches/main/protection` → **404 Branch not protected** with
   `…/rulesets` → **`[]`**, so it blocks nothing. That last fact is why the
   entry stays open: `launched` means "regressions are release-stoppers", and an
   advisory check stops nothing. Whether the charter's gate should become
   machine-enforced commons-wide is `DECISIONS.md` **Q-025**, still open on that
   half by its own terms, and it is the steward's rather than this seat's.
   *Narrowed this pass, and it narrows the right way:* the workflow's
   `npm run typecheck` step now reaches the deployed entry point, because
   `0a35ddc` chained `typecheck:worker` into `typecheck` without editing
   `.github/workflows/` — the advisory check got stronger from a commit that
   never touched it. *Not narrowed, and this pass supplies the sharpest case
   for why:* what a self-reported result is worth turns on **who actually
   looked**, and on this very merge four of five cross-family reviewers returned
   no verdict while leaving artefacts that read like reviews. See the reviewer-
   breadth entry under "Evidence for beta". That is Q-025's question arriving
   from the review side rather than the CI side, and it is recorded, not
   answered.
7. **A feature this product sells has never worked on the deployment, it is
   repaired in `main`, and it is still dead in production.** The defect —
   `service/src/worker.ts:303` calling `processDueJobs` without importing it, so
   the Durable Object alarm that drains due jobs throws `ReferenceError` and
   dies before it re-arms — was found at the last evaluation and **closed in
   `main` at `0a35ddc`** in full charter flow: build, `VERDICT: APPROVE` from
   gemini, `GATE: PASS` re-run by this seat, release note and **Q-029**.
   Verified here rather than read off the commit: the import is at
   `worker.ts:44`, the call at `:303`, `npm run typecheck` exits 0 including
   `src/worker.ts` for the first time, and three new tests execute `alarm()`
   itself.
   **The entry does not close, and the reason is the whole point of this
   file.** `booking.pumasi.ai` has not been deployed since 2026-08-30
   16:55:37 UTC, re-measured by this seat at 21:58 UTC. **Every reminder,
   follow-up and webhook there is still undelivered**, exactly as it was before
   the fix existed. Core booking is unaffected: a booking still confirms and its
   confirmation mail goes out on the request path. This is now
   [`BACKLOG.md`](BACKLOG.md) item 1's sharpest content rather than its own
   entry, and the repair queues behind **Q-012** as the **sixth** merged build
   waiting. It is also why the Stage 2 exit gate quoted at the top of this file
   cannot read `MET`: that gate names complete workflows, and these are the
   workflows.

## Why not `alpha`

Demotions must be earned too, so the case against is recorded, and it was
re-asked this evaluation rather than inherited: alpha says "works for people
who talk to the builders; data may not survive." Data survives and is
deletion-tested; strangers already sign up and book through a proven-address
gate; the suites and the concurrency proofs are real and green at `0a35ddc`,
re-run by this seat and by a machine on every push. **The tracker no longer
holds zero open bugs, and that is the material change at this pass** — see the
withdrawn bullet above. **Five candidate grounds for demotion were weighed this
pass, one of them new.**
*(0)* **New, and the strongest yet considered:** issue #32, a `priority: high`
report from a real user that the product's central surface — a public booking
page — showed no times for a day it offered. Weighed and **not taken**, for
reasons stated rather than assumed: one report, no reproduction by this seat,
and a live measurement showing that page serving 25 correct slots at the same
minute. `beta` requires that known gaps be *listed here*, and this one now is.
The condition that would convert it into a demotion is written in this file's
header, so that a later seat measures rather than re-reads.
*(i)* A reviewed fix to a live defect has now failed to reach users for **31
hours** and the flow still has no one assigned to carry it (Q-012). *(ii)*
Carried and now **weaker still**: the test evidence was an agent's report of its
own run — advisory CI closed that half, and this pass its type-check step
silently gained the deployed entry point. *(iii)* Workflows and webhooks have
never worked on the deployed build — **carried from the last pass and changed in
character**: it is now repaired in `main` and still dead in production.
*(iv)* **New this pass**: four of the five cross-family reviewers of this
product's most recent merge returned no verdict, and three of them never reached
a model, so the breadth behind `0a35ddc` was one family. **None is taken, and
(iii) and (iv) both deserved more thought than the count suggests.**
On *(i)*, that is a delivery gap this file is required to *list*, and beta's own
definition asks that gaps be listed, not absent.
On *(ii)*, the evidence is re-derived independently at every evaluation by a
seat that did not write the code, was re-derived again here (320 + 19, zero
failures, `GATE: PASS` at 21:59 UTC, plus 15 further green runs), and is re-run
by a machine on every push; that ground is weaker than it was, not stronger.
On *(iii)* — where "strangers can rely on it" is exactly what `beta` asserts,
and a stranger who sets a reminder on `booking.pumasi.ai` gets silence. Not
taken, for three stated reasons and not by preference. **First**, what is broken
is bounded and it is not the central promise: a stranger can still open a
booking page, see real free times, book, and receive a confirmation — that path
does not touch the queue. **Second**, `beta`'s definition asks that known gaps
be *listed*, and this file listed it within hours of its discovery and has now
carried it through its repair. **Third** — the honest counterweight rather than
a comfort — the same argument was already accepted for the Zoom leak, a *worse*
defect by every measure, listed here for five evaluations without a demotion;
taking (iii) while (i) stands would be inconsistent. **What changed this pass,
and it changed in the direction of not demoting**: the ground under (iii) was
"nothing checks the file this happened in", and now something does — the type
check reaches `src/worker.ts`, a test executes its alarm, and the trap the last
pass set (that turning the compiler on might surface further real defects) was
sprung and caught five more findings, none of them behaviour. A second such
defect in `worker.ts` would now be visible rather than latent, which is the
condition the last pass named as what would change this answer. It has been met
in the direction that argues against demotion.
On *(iv)* — the new one, and the one that argues most directly about what this
file's own evidence is worth. Not taken, for reasons that are narrower than they
look. The merge gate's bar was met and was re-run here: one approving non-builder
family is what CHARTER §4 asks of a can-hurt change, gemini gave it, and gemini
re-ran the suite and `tools/ci.sh` itself rather than reading a diff. A stage is
set by evidence about the *product*, and no evidence about this product changed
because three drivers hit an argv limit. What the finding does bear on is how
much weight the *review* line of this file's evidence can carry, and the honest
answer — recorded above rather than absorbed — is: one family, on this merge,
with the artefacts of the other three sitting in `reviews/` looking like
something they are not. Demoting a product for a defect in the commons' review
tooling would put the label on the wrong object; recording it where a reader of
this file will meet it puts it on the right one.
Demoting today would understate deletion-tested data, real stranger traffic and
a suite that passes 339/339 whenever it is given a clean `/tmp`, and would
substitute a label for the sentences that actually inform anyone: the fix is
merged and not deployed, the deployed entry point is now checked and executed
for the first time, three reviewers never looked, and here is who has to decide
each.

## Known gaps, so nobody discovers them the hard way

- **A public booking page can show a day that has times and then show no
  times** — [issue #32](https://github.com/pumasi-ai/pumasi-booking/issues/32),
  filed on the live product 2026-09-01 00:36:56 UTC, `accepted` ·
  `priority: high`, [`BACKLOG.md`](BACKLOG.md) **item 2**. Unlike almost
  everything else in this list it is **not** waiting on a deploy: the renderer is
  byte-identical on the live build and in `main`. Not reproduced by this seat;
  the precondition (25 slots served, 13 on the day picked) was measured at
  00:37:43 UTC. Listed first among the gaps because a booker is the person on
  the other end of it.
- **Six merged changes to the deployed source are not serving anyone**, five of
  them with a published release note and four of those reviewed can-hurt
  releases inside open windows: `4f56df4`, `16c3fd4`, `7ea730a`, `3f2947c`,
  `0a35ddc`, `2453adc`. The deployment has not moved since 2026-08-30
  16:55:37.479 UTC (version `d73c05b5`, a *Secret Change*), re-measured **by
  this seat** at 2026-09-01 00:27:49 UTC — **31 h 32 m**.
- **`2453adc` has no release note.** Checked at this evaluation:
  `pumasi/releases/` holds notes for the reporting path, Zoom connect, the OAuth
  callback, sign-in, advisory CI and the alarm import, and none naming `2453adc`
  or the version work. The coder that merged it left the note deliberately and
  correctly — release notes live in `pumasi` and are not that repository's to
  edit. **Whether one is owed, and by whom, is not this seat's to decide
  either**, and it is not written here as a defect against anyone; it is raised
  as `DECISIONS.md` **Q-034** with a named default, and recorded in this list so
  that the absence is visible rather than inferred.
- **Every workflow email and every webhook is still dead on the deployment,
  and the repair is merged.** `PumasiService.alarm()` — the Durable Object alarm
  that drains due jobs and re-arms — called `processDueJobs` without importing
  it from `de4abbe` (2026-08-28), so on the hosted build it threw
  `ReferenceError`, drained nothing, and died before the re-arm. The alarm is
  really armed: `app.ts` calls `deps.pump?.()` at five sites on booking, cancel
  and reschedule. **Closed in `main` at `0a35ddc`** (Q-029) and **verified by
  this seat**, not read off the commit: the import is at `worker.ts:44`, the
  call at `:303`, and three cases in `service/test/worker-alarm.test.ts`
  execute `alarm()` and assert the queue drains and re-arms. **It is listed here
  as a live gap anyway**, because this file is about the deployment and the
  deployment has not moved: a stranger who sets a reminder on
  `booking.pumasi.ai` today still gets silence. [`BACKLOG.md`](BACKLOG.md)
  item 1.
- **Now closed, and recorded rather than deleted: nothing type-checked the
  deployed entry point and no test executed it.** `service/wrangler.jsonc:6`
  names `src/worker.ts` as `main`, and both existing service `tsconfig`s
  `exclude` it, so `npm run build`, `npm test` and CI's `typecheck` all skipped
  it while the eight test files that mention it read it as *text* — which is how
  a missing import survived three days, a green gate, four product evaluations
  and a release note. `service/tsconfig.worker.json` (`0a35ddc`) includes it and
  `service/package.json:11` chains `typecheck:worker` into `typecheck`;
  **`npm run typecheck` was run by this seat at `0a35ddc` and exits 0**, and
  `:14` chains the same config into `build:test` so `npm test` compiles it too.
  The 17 errors this file recorded are 0. **Nothing was silenced to get there,
  checked directly:** `grep -rn "@ts-expect-error\|@ts-ignore\|eslint-disable"
  service/src/` returns **nothing** — the eleven suppressions that sat on the
  `.sql` imports are deleted, not moved, replaced by one `declare module
  '*.sql'`. **What the closure did not buy:** three casts of `this.env` are now
  widened through `unknown` because the generated `Env` cannot describe secrets
  set with `wrangler secret put`, so the deployed router's *bindings* are still
  untyped. That is ranked as [`BACKLOG.md`](BACKLOG.md) item 9, with no live
  user consequence found and the reason stated there.
- **A machine re-runs the checks now, and it blocks nothing.** Advisory CI runs
  the core suite, the service suite (minus `browser-live.test.ts`, named on
  every run), `npm run typecheck` across both workspaces, and a credential-free
  `wrangler deploy --dry-run`, on every push and pull request, in public
  (`d5a02bb`; Q-026 open to 2026-09-07). Verified here, not quoted: run
  `33428541886` green at `d5a02bb`, two demonstration runs red, no branch
  protection (404) and no rulesets (`[]`). So `GATE: PASS` still means an agent
  ran `pumasi/tools/gate.sh` by hand and signed the record — `DECISIONS.md`
  **Q-025** for the half that is the steward's. **Bundling is not
  type-checking**, and that gap is now closed from the other side: the green
  tick at `d5a02bb` coexisted with the dead-workflow defect, and since `0a35ddc`
  the same workflow's `typecheck` step reaches `src/worker.ts`, without
  `.github/workflows/` being edited. Recorded as evidence inside the **Q-026**
  window rather than after it.
- **Three reviewers of the most recent merge never reached a model, and the
  transcripts they left look like reviews.** `reviews/20260831-162058-code-qwen.md`,
  `…-162414-code-glm.md` and `…-162439-code-kimi.md` are 350, 348 and 350 bytes,
  each declaring `Context supplied: 630964 bytes inlined` and each containing
  only `recruit: Argument list too long`; `…-162417-code-grok.md` is a separate
  failure, `HTTP 402` (balance exhausted). One family reviewed `0a35ddc` —
  gemini, `VERDICT: APPROVE`, having re-run the suite and `tools/ci.sh` itself —
  which **meets** CHARTER §4's bar for a can-hurt change and was re-run by this
  seat at step 3/4 of the gate. The finding is not that the gate failed; it is
  that **breadth degrades past an argv size limit, silently, exactly when a
  change is large**, and that the artefact is at a glance indistinguishable from
  a review that ran and said nothing. Bears directly on **Q-025**. The repair is
  in `pumasi/tools/review.sh` and `pumasi-ops/tools/recruit.sh` — not this
  product's code, both under live writers during this pass — and is reported,
  not attempted, in this evaluation's digest entry.
- **The suite latches red on a shared machine.** The 19 service test files that
  start PostgreSQL hard-code both their port and their data directory, so one
  contention failure leaves `/tmp/pumasi-pg-<name>` behind and **every later run
  of that file fails on it** until a human deletes it. Measured at the last
  evaluation: 40 sequential `npm test` runs gave 21 green, then **19 consecutive
  identical failures**; removing one directory restored 336/336 at the same
  load. Measured again here from a clean `/tmp`: **15 of 15 green, 339/339
  each**, at loads 2.56–10.99 — *eleven of them inside the same 9.0–12.4 band in
  which the 19 failures occurred*, which settles that load is not the cause. Job
  `0049` paid this cost mid-packet, deleting leftover directories that had
  failed 45 tests. It is a false red, never a false green, and a fresh CI runner
  cannot carry it between runs. [`BACKLOG.md`](BACKLOG.md) item 5.
- **Nothing in the flow deploys a merged fix.** The charter flow ends at
  `GATE: PASS` and a published release note; no role in
  `pumasi-ops/roles/` owns carrying the build to `booking.pumasi.ai`, and
  `HUMAN.md` does not reserve it either — so it is agent work nobody is
  assigned. Raised as `DECISIONS.md` **Q-012** with a named default and still
  open; this gap, not the Zoom bug, is why item 5 above is still open, and it
  is now what stands between a merged, reviewed, gate-passed workflow repair and
  a single reminder being sent.
- **Nothing tells you which build is live — including the endpoint built to.**
  `https://booking.pumasi.ai/healthz` answers
  `{"status":"ok","commit":"unknown","sharded":true}`: at `2453adc`
  `worker.ts:448` serves `version: VERSION` beside
  `env['GIT_COMMIT'] ?? 'unknown'`, and the live answer has neither the version
  key nor a commit, because the deploy that would have set `GIT_COMMIT` did not
  happen and the build that would have carried `VERSION` is not there.
  `package.json` now says **`0.2.0`** — it said `0.1.0` from the first commit
  until `2453adc` — and `/version` still returns 404; all re-curled by this seat
  at 00:27 UTC. **The half of this gap that a commit could close is closed**
  (`PRODUCT-RULES.md` PR-1, binds always); the half that remains is a deployment
  and is [`BACKLOG.md`](BACKLOG.md) **item 1**. Establishing what is deployed
  needed Cloudflare API access at this evaluation as at the five before it —
  though for the first time the live JSON's *shape* also answers it.
  **Two** release notes now state outright that PR-1's version clause cannot be
  met by this product and give the commit instead (`pumasi` `29f0853` and
  `0f574f6`).
- **A half-configured deployment is refused in a way it cannot act on, and one
  of the two builds refuses too late.** *(a)* Neither sign-in refusal names a
  missing `TOKEN_KEY`, so an operator who set up Microsoft or an IdP and forgot
  the key is told the feature is "not configured" — true and unactionable.
  *(b)* `worker.ts:610` opens `/auth/google/start` on `googleClientId` alone,
  where the Node path effectively requires the secret too (`app.ts:992`,
  via the hub), so a Workers deployment holding an id and no secret is sent out
  to Google and refused on the way back instead of at the button. Nothing is
  unguarded either way and no live user is affected — `booking.pumasi.ai` holds
  both credentials. Recorded by the spec/0007 run as found-not-fixed and ranked
  here — both line references re-verified against the tree at `2453adc`, since
  that commit touched `worker.ts` and `app.ts` again, and **both moved**:
  `worker.ts:596` → **`610`**, and the Node guard `app.ts:985` → **`992`**,
  displaced by the three version surfaces inserted above them on each build. The
  finding is unchanged; only its coordinates are.
  [`BACKLOG.md`](BACKLOG.md) item 3.
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

The Q-009, Q-011, Q-015, Q-023, Q-026 and **Q-029** windows passing unvetoed;
Google verification cleared so C1 holds for strangers; the reporting *intake*
live with its deletion path implemented and tested, and the Workers-path
reporting decision made (§5.1 binds at this promotion; spec/0004 R5c, D-107 —
[`BACKLOG.md`](BACKLOG.md) item 7); the PMI leak closed **on the deployment**,
not only in `main`, and **workflows and webhooks actually working on the
deployment** — both now the same requirement and both item 1; a route by which
a merged fix reaches users at all (`DECISIONS.md` Q-012); **issue #32 closed**,
since a booking page that shows no times is a `VALUE.md` C2 promise failing at
the surface a stranger meets (item 2); PR-1 met, which after `2453adc` means
only its user-visible clause reaching production (item 1) and its diagnostics
clause reaching the report payload (item 8) — the version half is done and this
list no longer asks for it; and the D-105 residue either cleared by counsel or
explicitly accepted by the steward as the standing posture.
*Satisfied since the last pass, and struck from this list:* **the deployed entry
point being brought under a compiler so that the workflow claim can be checked
rather than asserted.** It was named as a requirement one pass ago and it is
met — `service/tsconfig.worker.json` puts `src/worker.ts` under `npm run
typecheck`, `service/test/worker-alarm.test.ts` executes its alarm, and both
were verified by this seat at `0a35ddc` rather than read off the release note.
It is struck as a *requirement*, not forgotten: the remaining piece of it —
that the router's bindings are still untyped through three `unknown` widenings —
is ranked as item 9 and is deliberately **not** a promotion requirement, because
no live user consequence was found for it.
*Newly satisfied in part, and struck as a whole requirement only where it is
whole:* **PR-1's version clause**, which this list has carried for five
evaluations, is met in `main` at `2453adc` — one source of truth, a number that
moved, and both entry points reporting it from the same generated constant. It
is **not** struck from this list, because two of its four clauses are still
open; what is struck is the framing that made it a build. It is now an instance
of the requirement below rather than a requirement beside it.
*Not satisfied, and it is the one that has moved least:* nothing carries a
merged build to users. Six changes to the deployed source now wait. `launched` means the
[`VALUE.md`](VALUE.md) promises hold, and C3 lists workflows and webhooks by
name; a promise that has been repaired in the repository and has still never
once worked in production is not a gap in the evidence, it is the thing the
evidence was supposed to be about. Promotion is a commit citing each.
