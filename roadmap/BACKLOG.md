# BACKLOG — what gets built next, in order

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 5).
First pass 2026-08-29, steward-directed.

One list, features and bugs together — a priority that cannot compare them is
not a priority. Every entry points at its source and carries one line of
why-here. **The top of this file is what the project manager's next coder
packet builds** — except where an entry says in its own text that it is
operator action rather than a build, as item 1 does today; the packet then
takes the highest entry that *is* a build, and the operator item keeps its
rank rather than being demoted for being unbuildable. Reordering is a commit
with the reasoning in the message; the steward vetoes by reverting.

**The highest *build* entry today is item 2** — the deployed Worker's alarm
handler calling a function it never imports. Item 1 outranks it and is operator
action blocked on `DECISIONS.md` **Q-012**, so it is item 2 that the next coder
packet takes, together with item 3, which is the check that found it. Stated
here in as many words because the previous order left it to be inferred, and
this file should not need reading twice to answer the one question it exists to
answer.

Context the ordering assumes: the feature-parity sequence in
[`0004-feature-parity.md` §3](0004-feature-parity.md) is substantially
**delivered** — engine, service, calendar truth (Google + Microsoft), limits,
recurrence, teams/round-robin, routing, polls, workflows/API, enterprise
identity, branding ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md);
commit series `46abaf3`…`b0cb050`). What remains is mostly evidence, access,
and polish, and the list reflects that.

---

## The order

**1 · Deploy the reviewed build to `booking.pumasi.ai` — the Zoom leak is closed
in `main` and is still live in production, and five merged builds now wait
behind it** — source: this evaluation (2026-08-31, job `0044`), checking the
deployment rather than the merge, for the **fourth** consecutive evaluation.
**Re-measured this tick, not carried** — four evaluations have now written down
the same timestamp, and a number that is quoted rather than taken stops being
evidence: `npx wrangler deployments list` for the `pumasi-booking` worker
(`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) still puts the
latest deployment at **2026-08-30 16:55:37 UTC** (version `d73c05b5`, a *Secret
Change*), and `https://booking.pumasi.ai/` answers **200** — both re-run here at
2026-08-31 15:28 CDT. `4f56df4`, `16c3fd4` (the Zoom fix, 2026-08-31 05:27 UTC),
`4f6ddf0` (the OAuth-callback release), `6b597dd` (the sign-in release) and now
`d5a02bb` (advisory CI, **Q-026**) all postdate it, so the live build is the
pre-fix one and **nothing has moved in ~27.5 hours**.
*New this tick, and it makes the wait cost more than it did:* item 2 below is a
live defect on that same unmoved deployment. Its fix will queue behind this
entry exactly as the other five have, which is evidence for **Q-012** and is
recorded there rather than argued here.
Deploying does close it even for rows the old flow already stamped, which was
checked rather than assumed: `locationText(schedule, …, 'public')` returns
`"<venue> — link arrives with the confirmation"` for every conferencing kind
*before* it ever consults `schedule.location_value` (`schedules.ts:371`), so a
stale PMI in the column stops printing the moment the new build serves.
**What could not be confirmed from outside, and is not claimed:** no public
booking-page slug for the affected owner is recorded anywhere in these
repositories, and this seat will not guess at one, so the leak's liveness rests
on the deployment evidence plus the record that the steward's own 2026-08-30
16:13 UTC Zoom connect (`ecdd60b`) ran against this same build — not on a page
this evaluation loaded.
Why here: nothing else on this list can hurt a user today and this still can.
It is the same defect that topped the list at the last three evaluations;
merging closed it in the repository and not in the product, and this file ranks
what users meet, not what `main` contains. *Operator action, not a build — see
`DECISIONS.md` **Q-012**, which asks whose duty this is and names the coder as
its default. It keeps rank 1 rather than being demoted for being unbuildable.
The next **coder** packet takes item 2 — the alarm defect — and should take
item 3 with it; this entry must not be displaced by either.*

**2 · The deployed Worker's alarm handler calls a function it never imports —
every workflow email and every webhook on `booking.pumasi.ai` has been dead
since the feature shipped** — source: this evaluation (2026-08-31, job `0044`),
found by running the type-check that item 3 below says nobody runs. **This is
the highest *build* entry on this list, and it is what the next coder packet
takes.**
Measured here, three ways, because a claim this size should not rest on one:
- **The call has no import.** `service/src/worker.ts:303`, inside
  `PumasiService.alarm()` — commented *"P7 · the alarm drains due jobs and
  re-arms for the next one"* — calls `processDueJobs(deps.sql, deps.mail,
  deps.now())`. That function is exported from `service/src/automation.ts:151`
  and imported by `service/src/server.ts:20`. **`worker.ts` never imports it**:
  its import block is `worker.ts:25`–`40`, and `grep -n automation
  service/src/worker.ts` returns only the `008_automation.sql` migration text.
- **The compiler says so, and this is one of the 17.**
  `src/worker.ts(303,24): error TS2304: Cannot find name 'processDueJobs'`.
  Job `0034` probed the same 17 errors and reported them as **all** missing
  Cloudflare runtime types and **none** a defect. Re-measured here: sixteen are,
  and one is not. This is why the packet's own rule — re-measure before you rank,
  a build report is not evidence — earns its place, and it is not a criticism of
  `0034`, which handed the finding on rather than folding it away.
- **It ships, and the new CI cannot see it.** `npx wrangler deploy --dry-run`
  succeeds: esbuild strips types and compiles an unresolved identifier into a
  free global. The emitted bundle contains the call and **no definition of
  `processDueJobs` anywhere in it**. So the advisory workflow delivered today
  bundles this exact file on every push and reports success — which is what its
  own release note means by "**It is not a type-check**", now demonstrated.
**The alarm really fires.** `pump()` (`worker.ts:273`–`279`) sets it whenever a
pending job exists, and `app.ts` calls `deps.pump?.()` at five sites
(`app.ts:437`, `653`, `680`, `2198`, `3597`) — booking, cancel, reschedule. The
two job kinds are `workflow_mail` and `webhook` (`automation.ts:52`). On the
hosted deployment the alarm therefore fires, `alarm()` throws `ReferenceError`,
nothing is drained, and the handler dies on the line *before* it re-arms.
Introduced at `de4abbe` (2026-08-28, *"P7: workflows, webhooks, and the public
API"*): the feature has never once worked on the Workers path.
**The honest limits, stated here rather than left for the next seat to find.**
Nothing leaks and nothing is mis-served: a booking still confirms, and its
confirmation mail goes out on the request path rather than through the queue.
What is lost is everything *timed* — reminders, follow-ups, every webhook. No
user has reported it, the tracker holds zero open issues, and this evaluation
did **not** exercise a workflow against the live deployment, which would mean
booking against a real owner's page; the finding rests on the source, the
emitted bundle and the arming path, each checked here. Merging the fix does not
ship it either — it queues behind the same **Q-012** as everything else.
Why here: it is the only *buildable* entry on this list that is broken for real
users of the hosted product right now, which is the same test that holds item 1
at rank 1. It ranks below item 1 only because item 1 is operator action and this
file's rule keeps that entry in place rather than demoting it for being
unbuildable. It is above item 4 because a rule about a version number is worth
less than a feature this product sells being dead in production, and above
item 3 by exactly one place — see item 3, which is the check that found it and
should travel with it.

**3 · Nothing type-checks the Worker that serves every hosted user** — source:
job `0034` handed this on itself at `priority: high` and explicitly declined to
rank it; **re-measured here, and it is now ranked on what the re-measurement
found rather than on the handover.** *"High" in a coder's return block is that
coder's read; this is the ranking.*
- `service/wrangler.jsonc:6` names `src/worker.ts` as the deployed entry point.
  `service/tsconfig.json` and `service/tsconfig.test.json` **both** carry
  `"exclude": ["src/worker.ts"]`, so `npm run build`, `npm test`, and the
  `npm run typecheck` that CI gained today all skip it.
- **No test executes it.** Eight test files mention `worker.ts`; every one
  either names it in a comment or `readFileSync`s it and asserts on its *source
  text* (`reporting.test.ts:212`, `video.test.ts:549`). So 854 lines — a
  hand-written `SqlClient` over Durable-Object storage, two Durable Object
  classes, and a ~480-line router — are held up by human reading and string
  matching, and by nothing else.
- Re-measured, not taken on trust: **17 errors** under the service's existing
  options, the same count `0034` reported. **The categories are not what its
  summary said:** 6 × `TS2307` (`cloudflare:workers` plus five `.sql` modules),
  8 × `TS2339` and 3 × `TS4112` cascading from `DurableObject` being
  unresolvable — and **1 × `TS2304`, which is item 2 above**.
- Cost, so a coder does not meet it mid-packet: `@cloudflare/workers-types`, a
  third `tsconfig` that includes `src/worker.ts`, and `.sql` module
  declarations. It **may surface further real errors whose repair is product
  work** — `0034` said so and this seat will not pretend otherwise. That is an
  argument for scheduling it, not for deferring it: sixteen errors of ambient
  noise are precisely what kept the seventeenth invisible for three days.
- The same shape as `DECISIONS.md` **Q-018** on `pumasi-sign`, from the other
  side. There the open question is which implementation *is* the product; here
  that is already settled — the Worker is what every hosted user meets — and it
  is the copy nothing checks.
Why here, and why not higher: a live broken feature outranks the net that
catches it, so it sits under item 2. But **item 2's repair is untestable without
it** — nothing executes this file, so for `worker.ts` the type-check *is* the
test, and a coder who fixes one import has no way to show there is not a second.
**Take items 2 and 3 as one packet.** Above item 4 for the reason item 2 is: PR-1
binds always, but a version number nobody can read is worth less than the only
compiler that will ever look at the deployed entry point. It is **not** claimed
that type-checking would have caught the other worker defects on this list —
item 5's `worker.ts:596` divergence is a logic difference between two builds and
no compiler would have said a word about it. This entry earns its rank on the
one error it did catch, not on the ones it would not.

**4 · PR-1 compliance: a version that moves and is visible** — source:
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
(v1.0, 2026-08-30; binds always — read fresh this evaluation, and still only on
the unmerged `worktree-product-rules` branch, `0115758`; now raised as
`DECISIONS.md` **Q-017**). Re-checked this tick, and *the rule was read fresh
from the branch, not from a memory of it*: the root, `core/` and `service/`
`package.json` all still say `0.1.0` and have never moved; there is no footer,
about view or `/version` route, and `https://booking.pumasi.ai/version` returns
**404** live.
**New this pass, and it is the sharpest form the gap has taken yet.** The
2026-08-31 sign-in release note now carries a *"Which build this is"* section
saying in as many words that **PR-1's version clause cannot be met by this
product** and giving the commit `6b597dd` instead (`pumasi` `29f0853`). That is
correct conduct by the release — naming a clause it cannot satisfy rather than
omitting it — and it is precisely the shape duty 4 says becomes a backlog entry
citing the rule. This is that entry, and it is now the *fourth* consecutive
evaluation to carry it.
Why here: the one endpoint that exists to answer *which build is live* answers
nothing — `https://booking.pumasi.ai/healthz` returns
`{"status":"ok","commit":"unknown","sharded":true}`; `worker.ts:443` serves
`env['GIT_COMMIT'] ?? 'unknown'` and the deploy that would have set it
(`npx wrangler deploy --var GIT_COMMIT:…`) did not. Establishing item 1 needed
Cloudflare credentials and a `wrangler` call for the third day running. A
product that cannot tell its own evaluator what it is running is the failure
PR-1's "user-visible" and "in the diagnostics" clauses describe.
Below items 2 and 3 because a version number nobody can read is worth less than
a feature that is dead in production and the one compiler that would have seen
it; above item 5 because PR-1 binds always and a late refusal on an
already-broken configuration does not. *Re-checked this tick and unchanged:
`/version` still 404, `/healthz` still `"commit":"unknown"`, all three
`package.json` still `0.1.0` — and the machine that now re-runs the checks
(delivered item 2 of the last order) still cannot say which build is live,
because that is a deployment fact and CI does not deploy.*

**5 · A half-configured deployment gets an answer it cannot act on — both
refusals, on both builds** — source: the job `0023` run recorded both halves as
found-not-fixed (`service/spec/0007/SPEC.md` §5) and handed the ranking here.
**Ranked on this evaluation's own reading of the tree at `6b597dd`, and one of
the two line references in the handover is stale — the finding is right and the
number is not:**
- **(b) `worker.ts:596` opens `/auth/google/start` on `config.googleClientId`
  alone.** *Confirmed exactly*: `grep -n "if (!states || !config.googleClientId)"
  service/src/worker.ts` → `596`. **The `app.ts:973` the handover cites could
  not be confirmed and is stale**; the guard is at **`app.ts:984`–`986`**
  (`const hub = deps.calendars; if (!hub || !config.googleClientId)`), and since
  `deps.calendars` exists only when `googleClientId && googleClientSecret &&
  tokenKey` are all set (`server.ts:113`–`115`, `worker.ts:243`–`245`), the Node
  path effectively requires the secret and the Workers router does not. A
  Workers deployment holding an id and no secret is sent out to Google and
  refused on the way back (`worker.ts` ~638, *"Google sign-in is not
  configured."*) instead of refusing at the button. It is a divergence pointing
  the **opposite** way from the one the sign-in-reachability item closed at
  `6b597dd` (listed under Completed below).
- **(a) Neither sign-in refusal names a missing `TOKEN_KEY`.** Confirmed
  against `service/spec/0007/SPEC.md` §5 and the code: an operator who
  configures Microsoft or an IdP and forgets `TOKEN_KEY` is told the feature is
  not configured — true, and unactionable for the person who meets it. Fixing it
  well means changing user-visible copy on the Node path and the Workers router
  **at once**, which is L-009 ground.
*One item, not two, and that is a ranking decision:* both are the same defect
class — a deployment that is missing a credential is told something that does
not name the credential — both span the same two builds, and splitting them
into two `can_hurt` cycles buys nothing but a second review round on the same
files. A coder packet takes both or neither.
Why here, below PR-1, and why the last order's rule does **not** carry: that
rule was *"a broken sign-in beats a hard diagnosis"*, and it was written for a
defect that shut a **working** configuration out. Neither of these does. On a
deployment with no `googleClientSecret`, Google sign-in cannot complete on
either build; (b) only decides whether the refusal arrives before or after a
round trip. Nothing is unguarded — the Workers callback still refuses — so no
reachability is gained by anyone. That is a materially worse error path, not a
denied feature, and it ranks under a rule that binds always and has now been
carried for four evaluations. **No live user on `booking.pumasi.ai` is
affected**: that deployment holds both Google credentials.

**6 · The service suite latches red: one contention failure leaves a data
directory behind, and every later run of that file fails on it** — source: job
`0034` handed this on itself at `priority: high` and declined to rank it;
**re-measured here, and the mechanism is not the one the handover names.**
Measured at `d5a02bb` by this evaluation, `npm test` run **40 consecutive
times**, strictly sequentially, on this 16-core machine, recording the
one-minute load average before each run:
- Runs **1–21: green**, 336/336 each (317 service + 19 engine), while the load
  average climbed **1.38 → 12.06** — driven by the suite itself, not by anything
  else on the machine. The regime job `0034` describes was reached without
  synthesising any load, and no synthetic load was applied: other agents hold
  locks on this machine, and a load spike would have corrupted their runs.
- Run **22 failed**: 5 tests, all in `service/test/enterprise.test.ts`,
  `failureType: 'hookFailed'`, with PostgreSQL reporting `WARNING: could not
  create listen socket for "localhost"` and `FATAL: could not create any TCP/IP
  sockets`. **That is a fixed-port bind failure, not a hook timeout** — the
  previous run's PostgreSQL for that one file had not released its port before
  the next run's `before` hook tried to bind it. The 20 files that start
  PostgreSQL hold 20 *distinct* hard-coded ports, so this is never a collision
  between files; it is a collision between consecutive runs of the same file.
- Runs **23–40: eighteen more failures, every one identical** — the same 5
  tests, now failing on `initdb: error: directory "/tmp/pumasi-pg-enterprise"
  exists but is not empty`. **19 of 40 runs failed, and the final 19 were
  consecutive.** They failed at load averages of **9.0–12.4**, *including loads
  lower than runs 17–21, which were green at 9.7–12.1*. Once it latches, load
  stops mattering entirely.
- Decisive check, run here: `rm -rf /tmp/pumasi-pg-enterprise`, then three more
  runs at load **8.79 / 9.36 / 9.84** — **336/336, all three green**. One
  directory was the whole difference between a suite that fails every time and
  one that passes every time.
**The mechanism, in one line:** each of the 19 PostgreSQL files hard-codes both
its port and its data directory (`databaseDir: '/tmp/pumasi-pg-<name>'`,
`persistent: false`), so a start that fails leaves that directory non-empty, and
every subsequent run of that file fails deterministically until a human deletes
it.
*What the entry asks for, and the one thing it must not do.* Give each run its
own data directory and let the OS allocate the port, and remove the directory
when a start fails. **It must not lower `--test-concurrency`.** Job `0034` named
that as the mitigation and warned in the same breath against letting a CI item
tune it — *"that is tuning the thermometer"*. The warning was right, and the
measurement now says the mitigation would not even work: these 40 runs were
strictly sequential, one `npm test` at a time, so there was no test concurrency
to lower. Turning that knob would make the latch less likely to be sprung and
would leave both fixed resources exactly where they are.
Why here: **no user can be hurt by this**, which is why it sits below every
entry above it, including item 5's error-message defect — this file ranks what
users meet. It is above item 7 and everything below because of what it costs
*this project* today. `pumasi/tools/gate.sh` is run by hand, on this shared
machine, by every agent that needs to pass it; after one contention event the
gate reports five failing enterprise-identity tests to **every agent
afterwards**, on a clean tree, until someone knows to delete a directory in
`/tmp`. This evaluation watched exactly that happen 19 times in a row. The
failure is loud and it is a false **red**, never a false green — a poisoned
`before` hook cannot pass a test that would otherwise fail — so it cannot talk
the merge gate into accepting a defect. But a false red on the five tests
covering OIDC SSO, SCIM and audit is an excellent way to spend a cycle
diagnosing a feature that is fine, or to conclude a stage claim has broken when
it has not. Today's advisory CI is **unaffected**: a GitHub runner is a fresh
container, so the latch cannot survive into a second run there — which is worth
saying plainly, because it means CI's greenness and this finding are both true
and are not in tension.

**7 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*

**8 · The reporting intake, and the Workers-path decision** — source:
[`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md) R5c;
[`DEBT.md` D-107](https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md)
(open half); surfaced by the job-0008 run (ops digest, 2026-08-30). The
mechanism shipped (`4f56df4`) but nothing receives reports — daily sends
fail and are dropped — and R5c forbids the intake to accept held reports
before its deletion path is implemented and tested. The Workers deployment
deliberately sends nothing; that decision is revisited no later than the
`launched` promotion (Q-008 default). *Note, from item 1's evidence: `4f56df4`
(2026-08-30 17:26 UTC) also postdates the last deployment, so the mechanism is
not on the live build either — which changes nothing here, since the Workers
path is configured silent regardless.* *The intake is foundation
infrastructure and may land in another repo — the project manager routes it;
it sits here because this product's `launched` claim waits on it.*
Why here: both halves gate `launched` (STAGE.md), but neither hurts a user
today, so shipped-surface correctness outranks them.

**9 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses.

**10 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it.

## Completed (2026-08-31)

- **Advisory CI — nothing re-ran the gate, and now a machine does** — item 2 of
  the previous order, **delivered at `49c8493`** in full charter flow by job
  `0034`: spec and frozen acceptance cases (`e8f8914`, amended in the open at
  `829f5fc` because case A-004 forbade its own vocabulary), spec review
  transcripts `13b29da`, the workflow itself `49c8493`, cross-family spec and
  code review `d5a02bb` returning **`VERDICT: APPROVE`**; release note
  [`pumasi/releases/2026-08-31-pumasi-booking-advisory-ci.md`](https://github.com/pumasi-ai/pumasi/blob/main/releases/2026-08-31-pumasi-booking-advisory-ci.md),
  veto window **Q-026**, open, closes 2026-09-07.
  **Verified at this evaluation against GitHub and the tree, not read off the
  release note:**
  - `gh run list` — run
    [`33428541886`](https://github.com/pumasi-ai/pumasi-booking/actions/runs/33428541886),
    **success**, event `push`, head `d5a02bb`. The repository is public, so the
    run page is readable by a stranger with no account, which is the whole point
    of the entry.
  - **It can go red**, checked rather than believed: the two demonstration runs
    on throwaway branches are both still readable and both `failure`
    (`33428582211` at `427348f`, a broken assertion; `33428597457` at `ae4794e`,
    the `--if-present` typecheck hole restored).
  - **It blocks nothing**, checked rather than believed:
    `gh api …/branches/main/protection` → **404 Branch not protected**, and
    `gh api …/rulesets` → **`[]`**. CHARTER §3's gate is untouched and
    `GATE: PASS` still means an agent ran it — which is what Q-026 says it
    shipped, and it is true.
  - The checks live in `tools/ci.sh`, runnable by hand as `npm ci && tools/ci.sh`,
    and the run prints its own exclusions — `service/test/browser-live.test.ts`,
    excluded from that run only, still run by `npm test` and by the gate.
  **What it did not close, recorded so the mark is not read as more than it is.**
  The workflow bundles `src/worker.ts` credential-free on every push, but
  bundling is not type-checking — **item 3** — and this evaluation used that gap
  to find **item 2**, a live defect the green tick cannot see. The entry is
  delivered as written; it did not claim to type-check the worker, and it says
  so on every run.

- **Two sign-in doors gate on the state seal, not on the calendar hub** — item
  2 of the previous order, delivered in full charter flow by job `0023`: intent
  `3854f7e`-window **Q-022** (`service/spec/0007/INTENT.md`), frozen acceptance
  cases and spec review `78aeb72`, build `3f2947c`, **an amendment taken in the
  open** after a cited code-review objection (`27d9133`) with a fresh
  cross-family spec review (`04f8dd1`), cross-family code review `6b597dd`;
  release note `pumasi` `3854f7e` + `29f0853`, veto window **Q-023**.
  **Re-verified against the tree at this evaluation, not read off the commit
  subjects** — which is how the same check caught a half-done item on
  `pumasi-tunnel` this morning:
  - `/login/sso/<orgId>` now reads `const states = deps.calendars?.state ??
    oauthState(config); if (!states) …` (`app.ts:922`–`923`) and seals with
    `states.seal(…)` (`app.ts:937`), with the deployment gate still **above**
    the `org_sso` lookup and *"This organization has no SSO configured."* still
    answered from the row (`app.ts:928`, `app.ts:934`).
  - `/auth/microsoft/start` likewise (`app.ts:1017`–`1019`), refusal wording
    unchanged.
  - **`service/src/worker.ts` is untouched by the whole range**
    (`git diff --name-only 0036c74..6b597dd -- service/src/worker.ts` is
    empty), so the half that was already right (`worker.ts:613`–`614`) was not
    "fixed"; the trap the last evaluation set for this item held.
  - The diff is 32 lines of `app.ts` and nothing else executable
    (`git diff --stat 0036c74..6b597dd`): spec, cases, runner, reviews.
  - Suite re-run here, not quoted: **311 service + 19 engine tests, 0
    failures**, `tools/gate.sh` → **`GATE: PASS`**, and acceptance cases
    **A-001…A-006 all green**.
  **Both halves are delivered, including the wider one.** Per-org OIDC SSO — the
  enterprise-identity feature [`VALUE.md`](VALUE.md) C3 sells as free-tier — was
  broken on the Workers path too, because the router forwards `/login/sso/…`
  into the Durable Object that runs this same `handle()` (`worker.ts:805`); the
  `app.ts` fix therefore closes it on both shapes.
  **Listed as completed for the repository, and for a self-hoster who pulls.**
  `booking.pumasi.ai` was never affected — it has Google Calendar configured —
  and it is still not serving this build; that is item 1. The population this
  fixes deploys from this repository, so for them merged is the delivery path.
  *This entry is the one job `0023` deliberately did not write: its packet
  forbade it to reorder a file written hours earlier, and that was right.*

- **`/oauth/*/callback` gates on the state, not the calendar hub** — item 2 of
  the previous order, delivered in full charter flow: intent `7958d41` (Q-013),
  frozen acceptance cases `a5ab8d0`, spec review `9bbfd0d`, spec amendment in
  the open `38f8efb`, build `7ea730a`, cross-family code review `4f6ddf0`;
  release note pumasi `9b45a30`, veto window Q-015 closes 2026-09-07.
  **Re-verified against the tree at this evaluation rather than taken from the
  release note**: the callback's gate is `const states = hub?.state ??
  oauthState(config)` and a failure to open the state, with the calendar 404
  kept verbatim and moved below every purpose branch (`app.ts:1051`, `app.ts:1053`; the calendar 404 at `app.ts:1297`);
  `sealState`/`openState` have exactly one implementation, in
  `service/src/oauth-state.ts`, to which `CalendarHub` delegates
  (`calendars.ts:142`); `grep -rn base64url service/src` returns only
  `newToken()`, `newSecret()`, `bootstrap.ts` invite codes and two comments —
  no state construction; and `startZoomConnect` refuses **before** the redirect
  with *"This deployment cannot start a Zoom connection: TOKEN_KEY is not
  configured."* (`app.ts:191`–`199`). Suite re-run here, not quoted:
  **305 service + 19 engine tests, 0 failures**.
  **Listed as completed for the repository, and for a self-hoster who pulls.**
  `booking.pumasi.ai` is not serving it — that is item 1 — but unlike the Zoom
  leak, the population this fixes deploys from this repository, so for them
  merged is the delivery path.
- **The Zoom PMI leak, in the code** — old item 1 parts (b) and (c), delivered
  in full charter flow: intent `8093dc7` (Q-010), frozen acceptance cases
  `40712d9`, build `16c3fd4`, cross-family code review `3d313d2`; release note
  pumasi `a3415ff`, veto window Q-011 closes 2026-09-07. Ten acceptance cases,
  two of them confirmed failing against the pre-fix tree. Part (a) — the
  connect state and `Connected ✓` — was already closed at `e9eb9fe`.
  **Listed as completed for the repository only.** Shipping it to the people
  it protects is item 1 above, and this entry is not evidence that the defect
  is closed for a user.

## Completed (2026-08-30)

- **CHARTER §5.1 reporting path and opt-out** — BACKLOG item 1, delivered in
  full charter flow: intent `a556c89` (Q-008), frozen spec `d06caf8`, review
  `58a496e`, build `4f56df4`; release note pumasi `9a8b3c7`, veto window
  Q-009 closes 2026-09-06. The D-107 retention schedule is published; D-108
  closed 2026-08-30 by the §5.1 amendment (binds at `launched`).
- **Microsoft sign-in at the front door** — was item 2 of this order *and*
  already listed below as completed; the contradiction is resolved on the
  evidence: "Continue with Microsoft" is live at the front door
  (`pages.ts`, `sso-microsoft.ts`; closed via `66c93e9`). Removed from the
  order.

## Completed (2026-08-29)

- **Microsoft sign-in at the front door** — [issue #5](https://github.com/pumasi-ai/pumasi-booking/issues/5) (closed via commit `66c93e9`).
- **Video chat integration (Meet, Teams, Zoom)** — [issue #4](https://github.com/pumasi-ai/pumasi-booking/issues/4) (closed via commit `66c93e9`).
- **Favicon not visible in the browser tab** — [issue #3](https://github.com/pumasi-ai/pumasi-booking/issues/3) (closed via commit `bb1825c`).
- **The first page needs to look better** — [issue #6](https://github.com/pumasi-ai/pumasi-booking/issues/6) (closed via commit `bb1825c` / `8fe4fce`).

## Held, not ordered

- **Counsel review and the transfer position** —
  [`DEBT.md` D-105](https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md):
  a `HUMAN.md` item; agents have drafted everything around it. Gates
  `launched` in [`STAGE.md`](STAGE.md), not any build below.
- **Payments; AI scheduling suggestions** — excluded by steward decision
  2026-08-01 ([`0004-feature-parity.md` §3](0004-feature-parity.md)); listed so
  their absence reads as a decision, not an omission.
