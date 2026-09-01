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

**The highest *build* entry today is item 2 — and it did not exist when this
packet was written.** Issue **#32** was filed on the live product at 2026-09-01
00:36:56 UTC, **21 minutes into this evaluation**: a public booking page showing
a day that has times and then showing no times. It was triaged `accepted` ·
`priority: high` at this pass's duty-1 intake and it goes straight to the top of
the buildable list, because it is the only entry here with a named user who met
it today and — checked, not assumed — the only one near the top that a commit
can close. Item 2 of the previous order (**PR-1 compliance: a version that moves
and is visible**) is delivered in the half a commit can deliver, at
**`2453adc`**, and is struck from the order into Completed below — verified at
this evaluation against the tree, not read off the commit message.
**Its residuals did not vanish with it and are not quietly dropped.** PR-1's
*user-visible* clause is now met in `main` and **still unmet in the product**,
because `booking.pumasi.ai` serves a build that predates it; that half is
recorded against **item 1**, where every other undeployed thing already sits,
and it does not get a rank of its own because it has no separate remedy. The
`GIT_COMMIT` half was never closable by a commit and is recorded in the same
place. The report payload's missing `version` field is a **`pumasi-report/2`**
schema bump plus a fresh cross-family spec review, which is a build, and it is
ranked on its own merits as **item 8**. Item 1 still outranks everything and is
still operator action blocked on `DECISIONS.md` **Q-012**, so **the next coder
packet takes item 2**. Stated here in as many words, as the previous two orders
stated it, because this file should not need reading twice to answer the one
question it exists to answer.

**The reorder, before → after, so the change is readable rather than inferred.**

| | Before (`0a35ddc`, job `0052`) | After (`2453adc`, this pass) |
|---|---|---|
| 1 | Deploy the reviewed build to `booking.pumasi.ai` (Q-012) · *operator action* | Deploy the reviewed build to `booking.pumasi.ai` (Q-012) · *operator action* — **unchanged in rank, widened in content**: PR-1's user-visible clause now waits here too |
| 2 | PR-1 compliance: a version that moves and is visible | **A public booking page shows a day that has times and then shows no times — issue #32** *(new, filed during this pass)* · **top build entry** |
| 3 | A half-configured deployment gets an answer it cannot act on | A half-configured deployment gets an answer it cannot act on — both refusals, on both builds |
| 4 | The service suite latches red | The service suite latches red |
| 5 | Submit the Google OAuth app for verification | Submit the Google OAuth app for verification |
| 6 | The reporting intake, and the Workers-path decision | The reporting intake, and the Workers-path decision |
| 7 | A runtime subprocessor guard for the deployed mail path | A runtime subprocessor guard for the deployed mail path |
| 8 | `worker.ts` models its environment as a string bag | **`pumasi-report/2` — PR-1's diagnostics clause in the report payload** *(new, from item 2's residual)* |
| 9 | O2 — secrets posture, completed | `worker.ts` models its environment as a string bag |
| 10 | — | O2 — secrets posture, completed |

Two entries entered the order this pass and one left it. **Nothing was demoted
for getting better or worse** — item 3 and everything below it moved down one
place because a new entry was ranked above them, and the entry that was item 2
left because it was delivered; the file says so at each entry rather than
letting a change of position read as a change of severity.

Every entry below carries one of two labels and none is unlabelled:
**re-verified at `2453adc`** means this seat re-ran or re-read the thing the
entry rests on at this tree; **carried, not confirmed** means it did not, and
says why. The label is `0055`'s, adopted here because an unlabelled entry is
indistinguishable from a re-measured one.

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
in `main` and is still live in production, workflows and webhooks are repaired
in `main` and still dead in production, PR-1's version is now visible in `main`
and invisible in production, and six merged changes to the deployed source now
wait behind it** — source: this evaluation (2026-09-01, job `0061`), checking the
deployment rather than the merge, for the **sixth** consecutive evaluation.
**Re-verified at `2453adc`, re-measured rather than carried, for the second
consecutive pass.** Run here at **2026-09-01 00:27:49 UTC**, `npx wrangler
deployments list` from `service/` for the `pumasi-booking` worker
(`wrangler.jsonc:5`, `name: "pumasi-booking"`; `:9`, custom domain
`booking.pumasi.ai`) puts the newest deployment at **2026-08-30 16:55:37.479
UTC** — version `d73c05b5-81b6-41a4-933a-4a94acbaa45a`, `Source: Secret Change`,
author `atxapplellc@gmail.com`, no tag and no message. That is the same
deployment the last two evaluations found, taken again rather than repeated:
**nothing has been deployed in 31 h 32 m.**
**Curled by this seat at 2026-09-01 00:27:29–30 UTC**, and the answers now
carry their own proof of age:
`https://booking.pumasi.ai/` → **200**;
`/healthz` → `{"status":"ok","commit":"unknown","sharded":true}`;
`/version` → **404**;
`/readyz` → `{"status":"ready","owners":11}`.
**Read those against `2453adc` and they date themselves.** At this tree
`worker.ts:448` answers `/healthz` with a `version` field, `:452` answers
`/version` at all, and `:461` adds `version` to `/readyz`. The live `/healthz`
has no `version` key, the live `/readyz` has no `version` key, and `/version`
is a 404 page. The deployment is not merely older than the merge — it is
observably older, from outside, without credentials. That is the first time
this entry has been able to say so, and it is a side effect of item 2 of the
previous order landing.
**What is behind it, counted precisely, because the previous count was loose.**
Earlier passes said "six merged builds" and reached that number by counting
commits on `main` — which included review-transcript and roadmap commits that
change nothing a worker would serve. Counted at this tree instead as *commits
that change `service/src/`*, the set is **six**: `4f56df4` (the §5.1 reporting
mechanism), `16c3fd4` (the Zoom PMI fix), `7ea730a` (the OAuth-state fix),
`3f2947c` (the two sign-in doors), `0a35ddc` (the alarm import) and now
**`2453adc`** (the version). Thirty-six commits in total sit on `main` behind
the deployment. The corrected basis is not a smaller problem, it is a countable
one; the previous figure is not withdrawn as wrong about the product, only as
imprecise about what it was counting.
**What changed about this entry's cost, and it is a change in kind rather than
in count.** Job `0049`'s handover put it in words two evaluations have now
re-measured and agreed with: *"Every previous entry behind Q-012 was a defect
that merging at least stopped making worse. This one is a delivery that does not
happen, and it will not start happening until someone runs a deploy."*
Reminders, follow-ups and every webhook on `booking.pumasi.ai` have been
undelivered since `de4abbe` (2026-08-28); the repair is merged, gate-passed,
released and reviewed, and delivers nothing. **The wait is no longer a delay in
closing a defect — it is the defect, for as long as it lasts.**
**New at this pass, and it is why this entry's title grew a clause.** `2453adc`
closed three of PR-1's four clauses in code, and one of the three — *"a person
using the product can find the version without reading source"* — is a claim
about the **product**, not the branch. A footer, a `/version` route and a
diagnostics row that exist only where no user goes do not satisfy a clause
written about users. So PR-1's user-visible clause is now in exactly the
position the Zoom fix and the alarm import are already in: complete, reviewed,
merged, and unreachable. It has no remedy of its own — the only thing that
closes it is this entry — which is why it is recorded here and is not given a
rank of its own. The `GIT_COMMIT` half sits here for the older reason: that
value is set by `npx wrangler deploy --var GIT_COMMIT:…` and no commit can set
it. `config.ts:96` reads `RAILWAY_GIT_COMMIT_SHA ?? GIT_COMMIT ?? 'unknown'`,
and `'unknown'` is what the live endpoint says.
**Recorded against `DECISIONS.md` Q-012 as evidence and nothing more.** This
seat added an evidence row there at this pass and did not touch the date, the
default, or the status. **Nothing here closes, extends, softens or dates that
window.**
Deploying does close the Zoom half even for rows the old flow already stamped,
which was checked rather than assumed by two earlier passes and is **carried,
not confirmed** here: `locationText(schedule, …, 'public')` returns
`"<venue> — link arrives with the confirmation"` for every conferencing kind
*before* it ever consults `schedule.location_value` (`schedules.ts:371`), so a
stale PMI in the column stops printing the moment the new build serves. This
seat did not re-run that reading; it is unchanged by `2453adc`, which touched
neither file.
**What could not be confirmed from outside, and is not claimed:** no public
booking-page slug for the affected owner is recorded anywhere in these
repositories, and this seat will not guess at one; and no workflow was exercised
against the live deployment, which would mean booking against a real owner's
page. The liveness of both defects rests on the deployment measurement, the
source, and now on the shape of the live endpoints' own JSON — not on a page
this evaluation loaded.
Why here: three things on the deployment can hurt a user today — the Zoom leak,
the dead workflows, and now issue #32 at item 2 — and this is the only entry
that closes two of them at once. *(The previous four passes wrote "nothing else
on this list can hurt a user today"; that sentence stopped being true at
2026-09-01 00:36 UTC when issue #32 was filed, and it is corrected here rather
than carried.)* It is the same entry that topped the list at the last five
evaluations; merging closed three defects in the repository and none in the
product, and this file ranks what users meet, not what `main` contains. Note the
asymmetry that item 2 establishes and this entry must not absorb: **deploying
does not fix issue #32**, whose renderer is byte-identical on both sides. This
entry is not a superset of the list below it.
*Operator action, not a build — see `DECISIONS.md` **Q-012**, which asks whose
duty this is and names the coder as its default. It keeps rank 1 rather than
being demoted for being unbuildable. The next **coder** packet takes item 2;
this entry must not be displaced by it.*

**2 · A public booking page shows a day that has times and then shows no times —
issue #32, filed by a real user on the live product during this evaluation, and
it is *not* one of the undeployed fixes** — source:
[issue #32](https://github.com/pumasi-ai/pumasi-booking/issues/32),
`accepted` · `priority: high` at this evaluation's duty-1 intake, 2026-09-01
00:36:56 UTC — **21 minutes after this packet began**. **Measured at
`2453adc`, and against the live deployment, by this seat.**
**The report.** *"in the calendar booking page, i cannot see specific times."*
A screenshot is attached. It shows `booking.pumasi.ai/yunyoungmok/abc` — a
public booking page, not an owner's view — with **September 2026** displayed,
the 1st and 2nd rendered as available (`.has`), the **2nd selected**
(`aria-pressed=true`), the heading **"Wednesday, September 2"** present, and the
times list beneath it **empty**. Client diagnostics: `America/Chicago`,
1920×945, Chrome 151, network online, **`0 error(s) captured`**.
**What this seat measured, rather than took from the report.** At **2026-09-01
00:37:43 UTC**, `GET https://booking.pumasi.ai/yunyoungmok/abc` → **200**, and
the page's server-rendered `<script type="application/json" id="slots-data">`
carries **25 slots — 12 dated 2026-09-01 and 13 dated 2026-09-02** (UTC), first
`2026-09-01T14:00:00Z`, last `2026-09-02T21:30:00Z`. In `America/Chicago` the
13 slots for the 2nd fall at 09:00–17:00 local. **The data for the day the user
picked was on the page the user was looking at.** The slot list is built
entirely client-side, by the single `render()` in that page, from exactly that
JSON.
**Why this outranks the entry it displaces, which is the ranking judgement and
not a severity claim.** This file's test is who meets the defect. The entry that
was item 2 before this pass — the two sign-in refusals — records in its own text
that **no live user on `booking.pumasi.ai` is affected**, because that
deployment holds both Google credentials; it is an operator meeting a wrong
answer on a configuration nobody is running. Here a booker met an empty slot
list on the product's central surface, on the live deployment, today. On the
rule this list has applied at every evaluation, that outranks it.
**Why it is a build and not another instance of item 1 — checked rather than
assumed, and this is the load-bearing measurement.** Almost everything else near
the top of this list is a repair that exists in `main` and not in production.
This is not. The booking page's slot renderer was extracted from the live HTML
and from `service/src/pages.ts` at `2453adc` and diffed: **byte-identical, 5151
characters, zero differences.** Deploying would not close this. A coder packet
would.
**What is NOT established, stated rather than glossed, because an accepted
report is not a diagnosis.** This seat did **not** reproduce the empty list: the
failure is client-side and there is no browser on this machine. So the
precondition is confirmed and the mechanism is unknown. Reading the renderer
narrows it without settling it — `#picked-day` and `#times` are siblings inside
a visible `#cal` (`pages.ts:854`–`:855`), `times.textContent=''` is followed
immediately by a `forEach` over `byDay[pickedDay]`, and nothing between them can
throw on a non-empty array — so a partial render is hard to construct from the
source alone. Two loose threads for whoever takes it: the report's `0 error(s)
captured` makes a thrown exception *less* likely, though it is not established
what that widget captures from before it loads; and the screenshot's own layout
is anomalous (the card sits right-of-centre in a 1303 px capture), which may be
an artefact of client-side screenshot capture rather than of the page — in which
case the *capture* is unreliable and the user's sentence is still the evidence.
**The first step of the packet is reproduction, not a patch.**
**A second, smaller finding inside the same report, handed up rather than
ranked.** The report's **Page URL** diagnostic reads
`https://booking.pumasi.ai/app/event/06f1bfbc-46f0-407f-ba64-47bca20f0dba`
while its screenshot's address bar reads `booking.pumasi.ai/yunyoungmok/abc` —
an owner's event editor and a public booking page, and the defect is on the
second. A reader who trusts the field goes to the wrong page. `feedback.ts` is
`PRODUCT-RULES.md` PR-2's **reference implementation**, so a fidelity defect
there is one other products copy. Not ranked separately at this pass because it
was found inside another entry and this file does not pad; it is named in the
digest and belongs with whoever takes this item.
Why here: below item 1 for the reason item 1 is item 1 — nothing here has been
undelivered to every user of this product for four days. Above everything else
because it is the only entry on this list with a named user who met it today,
and the only one at the top that a commit can actually close.

**3 · A half-configured deployment gets an answer it cannot act on — both
refusals, on both builds** — source: the job `0023` run recorded both halves as
found-not-fixed (`service/spec/0007/SPEC.md` §5) and handed the ranking here.
**Re-verified at `2453adc`, and every line number in this entry MOVED — which is
exactly why they are re-taken rather than repeated. `2453adc` touched
`worker.ts` and `app.ts` again, and a stale number is how a finding stops being
evidence:**
- **(b) `worker.ts:610` opens `/auth/google/start` on `config.googleClientId`
  alone.** *It was `596` at `0a35ddc` and it is `610` now*:
  `grep -n "if (!states || !config.googleClientId)" service/src/worker.ts` →
  **`610`**. The Node-path guard was `app.ts:985` and is **`app.ts:992`**
  (`grep -n "!hub || !config.googleClientId" service/src/app.ts`) — the same
  guard, displaced by the three `/healthz`, `/version` and `/readyz` surfaces
  `2453adc` inserted above it on each build. The finding is unchanged; only its
  coordinates moved. Since
  `deps.calendars` exists only when `googleClientId && googleClientSecret &&
  tokenKey` are all set (`server.ts:113`–`115`, `worker.ts:243`–`245`), the Node
  path effectively requires the secret and the Workers router does not. A
  Workers deployment holding an id and no secret is sent out to Google and
  refused on the way back instead of refusing at the button.
- **(a) Neither sign-in refusal names a missing `TOKEN_KEY`.** An operator who
  configures Microsoft or an IdP and forgets `TOKEN_KEY` is told the feature is
  not configured — true, and unactionable for the person who meets it. Fixing it
  well means changing user-visible copy on the Node path and the Workers router
  **at once**, which is L-009 ground.
*One item, not two, and that is a ranking decision:* both are the same defect
class, both span the same two builds, and splitting them into two `can_hurt`
cycles buys nothing but a second review round on the same files. A coder packet
takes both or neither.
Why here: an operator who meets a wrong answer is a user meeting a defect, which
is the test this file ranks by, and no entry below it has a user on the other
end. **No live user on `booking.pumasi.ai` is affected**: that deployment holds
both Google credentials — **and that sentence is why it is no longer the top
build entry.** It rose to the head of the buildable list when PR-1's version
half was delivered at `2453adc`, and it was displaced within the same pass by
issue #32, which has a live user where this has none. Nothing about this entry
got better or worse; it is ranked by who meets it, as everything here is.
Nothing here is unguarded — on a
deployment with no `googleClientSecret`, Google sign-in cannot complete on
either build, and (b) only decides whether the refusal arrives before or after a
round trip.

**4 · The service suite latches red: one contention failure leaves a data
directory behind, and every later run of that file fails on it** — source: job
`0034` handed this on itself and declined to rank it; the mechanism was
established by measurement at the last evaluation and is **re-tested here at a
load regime that pins down what does *not* cause it.**
**Re-verified at `2453adc`, at a regime the previous pass did not try.**
Measured at `0a35ddc` by the previous evaluation: `/tmp` was clean at the start of the
pass (`ls -d /tmp/pumasi-pg-* | wc -l` → **0**), and `npm test` was then run
**15 consecutive times**, strictly sequentially, recording the one-minute load
average before each. **15 of 15 green, 339/339 every time** (19 core + 320
service), at loads of **2.56, 4.04, 6.45, 7.73, 9.81, 9.82, 9.60, 7.65, 9.02,
8.59, 8.10, 9.08, 9.98, 10.99, 9.70**. `/tmp` held **0** `pumasi-pg-*`
directories afterwards.
**What that adds, and what it deliberately does not.** It does not reproduce the
latch, and 15 runs is not 40 — the last pass's 19 consecutive failures are not
withdrawn and are not re-run here, for a stated reason: three other repositories
had live writers on this machine during this pass, and deliberately poisoning
`/tmp` for them to re-demonstrate a mechanism already demonstrated would be
paid for by seats that did not choose it. What it *does* add is the load
control the finding was missing. **Eleven of these fifteen green runs sit inside
the 9.0–12.4 band in which the previous pass recorded nineteen consecutive
failures.** So load is not the cause and was never the cause; the leftover data
directory is, and once it exists load stops mattering in the other direction
too. That is the same conclusion the `rm -rf` check reached from the opposite
side, now reached without breaking anything.
**The mechanism, unchanged:** each of the 19 PostgreSQL files hard-codes both
its port and its data directory (`databaseDir: '/tmp/pumasi-pg-<name>'`,
`persistent: false`), so a start that fails leaves that directory non-empty, and
every subsequent run of that file fails deterministically until a human deletes
it. Job `0049` hit exactly this mid-packet — its commit records deleting
leftover `/tmp/pumasi-pg-*` directories that had failed 45 tests — which is the
first time this entry's cost has been paid by a job other than an evaluation.
*What the entry asks for, and the one thing it must not do.* Give each run its
own data directory and let the OS allocate the port, and remove the directory
when a start fails. **It must not lower `--test-concurrency`.** These runs, like
the last pass's, were strictly sequential — one `npm test` at a time — so there
was no test concurrency to lower; that knob would make the latch less likely to
be sprung and leave both fixed resources exactly where they are.
Why here: **no user can be hurt by this**, which is why it sits below every
entry above it. It is above item 5 and everything below because of what it costs
*this project* today — `pumasi/tools/gate.sh` is run by hand, on this shared
machine, by every agent that needs to pass it, and after one contention event
the gate reports five failing enterprise-identity tests to every agent
afterwards, on a clean tree, until someone knows to delete a directory in
`/tmp`. Today's advisory CI is unaffected: a GitHub runner is a fresh container,
so the latch cannot survive into a second run there.
**What this pass adds, and it is small and honest about being small.**
`/tmp` held **0** `pumasi-pg-*` directories at the start of this evaluation and
**0** at the end. `npm test` was run at the repository root **4 times
sequentially, 4 of 4 green, 347/347 each** (19 core + 328 service), plus one
service-only run and one `pumasi/tools/gate.sh` run — six suite executions, zero
failures. **One of those overlapped another by accident**, the gate's `npm test`
running while a background root run was still going, and that is the first time
two `npm test` invocations have been in flight at once on this pod: a snapshot
taken mid-overlap found **8** `pumasi-pg-*` directories present, and both runs
passed and both cleaned up after themselves. So a single concurrency event did
**not** spring the latch. That is one trial, not a result — it is recorded
because concurrency is the mechanism this entry names and nobody had tried it,
and it is explicitly not offered as evidence that the latch needs more than
one overlap. The previous pass's 19 consecutive failures stand and are not
withdrawn. **The 15-run load sweep and the 19-failure observation are carried,
not confirmed**; they were not re-run here, for the reason the previous pass
gave and this one inherits — three other repositories had live writers on this
machine during this pass.

**5 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*
*Carried, not confirmed:* this seat re-read the entry and did not re-check the
Google console state, which it cannot see.

**6 · The reporting intake, and the Workers-path decision** — source:
[`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md) R5c;
[`DEBT.md` D-107](https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md)
(open half); surfaced by the job-0008 run (ops digest, 2026-08-30). The
mechanism shipped (`4f56df4`) but nothing receives reports — daily sends
fail and are dropped — and R5c forbids the intake to accept held reports
before its deletion path is implemented and tested. The Workers deployment
deliberately sends nothing; that decision is revisited no later than the
`launched` promotion (Q-008 default). *Note, from item 1's evidence: `4f56df4`
also postdates the last deployment, so the mechanism is not on the live build
either — which changes nothing here, since the Workers path is configured silent
regardless.* *The intake is foundation infrastructure and may land in another
repo — the project manager routes it; it sits here because this product's
`launched` claim waits on it.*
Why here: both halves gate `launched` (STAGE.md), but neither hurts a user
today, so shipped-surface correctness outranks them. **Re-verified at
`2453adc`:** `reporting.ts` is unchanged by the version work except for the
docblock it gained, and the Workers path still sends nothing (R8). **If a coder
packet takes this, it takes item 8 in the same R1b cycle** — same schema, same
review, and two spec reviews on one file weeks apart is pure waste.

**7 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses — which puts a user on the other
end of it, and is why it outranks items 8 and 9 despite all three being
invisible today.
*Carried, not confirmed:* `SUBPROCESSORS.md` was re-read and is unchanged at
`2453adc`; no new measurement of the mail path was taken.

**8 · `pumasi-report/2` — PR-1's diagnostics clause in the report payload** —
source: item 2 of the previous order, **ranked here rather than closed with it**;
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
*"In the diagnostics"*; [`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md)
R1b. **Re-verified at `2453adc` by reading the module, not the commit message.**
`service/src/reporting.ts:20` still declares `REPORT_SCHEMA = 'pumasi-report/1'`,
and neither `HeldReport` (`:59`–`:78`) nor `PublishedReport` (`:80`ff) carries a
`version` field; both carry `commit`. The docblock at `:22`–`:31`, added by
`2453adc`, names the gap where the decision lives and states the reason it was
not closed in that commit: by that module's own rule a field not in these
interfaces is a field a report may not carry, so adding one is a **schema
version bump plus a fresh cross-family spec review (R1b)**, not a field. *"A
silent field on a schema a receiver validates is worse than a missing one."*
This file agrees with that reasoning and is recording it as a ranked item rather
than as a comment, because a gap that lives only in a docblock is a gap nobody
schedules.
**Why it is ranked here and not higher, given PR-1 binds always.** The clause is
real and the entry cites it, but the ranking test this file uses is who meets
the defect, and today **nobody reads these payloads at all**. Item 5 records
that nothing receives reports — daily sends fail and are dropped — and that the
Workers deployment, which is the build every real user meets, deliberately sends
none (R8). So a missing `version` on a payload with no receiver and no emitter
in production costs a full R1b spec-review cycle to close and buys no reader
anything today. It ranks below item 7, which has a real booker's mail on the
other end of it. It ranks **above** item 9 because it cites a rule that binds
always and closes the last open clause of a rule this product otherwise now
meets, where item 9 cites a coder's own `priority: medium` handover and no rule.
**How it should be built, which is a different question from where it ranks.**
If a coder packet takes **item 6**, it takes this in the same cycle. Both change
the same schema and both need the same fresh cross-family spec review; two R1b
reviews on one file, weeks apart, is the waste. The rank says what to do first
when they are taken separately; this line says not to take them separately if
the choice is available.
**What moves it up:** a receiver existing (item 6 landing on its own), or a
released report being filed against a build nobody can identify — at which point
the clause acquires the reader it currently lacks.

**9 · `worker.ts` models its environment as a string bag, and the generated
`Env` could type the bindings** — source: job `0049` handed this on itself at
`priority: medium` and deliberately did not do it in that packet. *"Medium" in a
coder's return block is that coder's read; this is the ranking, and it is made
on this seat's own measurement rather than on the handover.*
**Re-verified at `2453adc`, and the three cast sites moved with the file.**
`npx wrangler types` still generates `service/worker-configuration.d.ts` —
**588612 bytes, byte-identical to the previous pass's measurement**, workerd
`1.20260828.1` — whose `__BaseEnv_Env` types `PUMASI` and `DIRECTORY` as
`DurableObjectNamespace<import("./src/worker").PumasiService>` and
`…PumasiDirectory`, and the three `wrangler.jsonc` vars as string *literals*.
*(The previous pass also recorded a hash `03c0fafc…`; this seat could reproduce
neither that prefix with `sha256sum` (`6d2e00a0…`) nor with `git hash-object`
(`25aa0e24…`), and does not know which algorithm produced it. The size is
re-measured and identical, so the file is unchanged; the hash is **carried, not
confirmed**, and is not repeated as if it were.)*
**Every line number in this entry moved too.** `worker.ts:80` — was `79` —
keeps its own `type WorkerEnv = Record<string, string | undefined> & { PUMASI:
DoNamespace; DIRECTORY: DoNamespace }` over the hand-written `interface
DoNamespace` at `worker.ts:69` (was `68`), and **three casts are widened through
`unknown`** to bridge them — `worker.ts:120`, `:188`, `:297`, which were `119`,
`:187`, `:296` at `0a35ddc` (`grep -n "as unknown as WorkerEnv"
service/src/worker.ts`). Three further sites pass `env as never` into
`loadConfig` — `worker.ts:122`, `:189`, `:381` — whose parameter is
`NodeJS.ProcessEnv` (`config.ts:82`).
*The scratch-tree compile below is **carried, not confirmed** — it was measured
by the previous pass at `0a35ddc` and not re-run here; `worker.ts` has changed
since, so the "0 errors" figure is that pass's, not this one's.*
**The cost was measured, not estimated, and it is in two halves that are very
different sizes.** The **previous** seat copied `service/` to a scratch tree
outside the repository (no product code was written there either), replaced the
declaration with
`type WorkerEnv = Env & Record<string, string | undefined>` and dropped the
three `unknown` widenings to plain `as WorkerEnv` casts. **`tsc -p
tsconfig.worker.json --noEmit` reports 0 errors.** So the *stated* deliverable —
stop discarding the generated binding types, stop widening through `unknown` —
is **one line and already proven to compile**. The scratch tree was deleted.
**What that one line does not buy, which is the honest half of this entry.** The
index signature survives in the intersection, so `env['PUMSAI']` still resolves
to `string | undefined` with no error: a *mistyped* binding name stays a runtime
surprise. Making it a compile error means removing the index signature, which
means declaring every key the code reads — 4 read directly in `worker.ts`
(`GMAIL_SA_KEY`, `GMAIL_IMPERSONATE`, `BOOTSTRAP_INVITE`, `GIT_COMMIT`) plus the
**29** `loadConfig` reads at `config.ts:82`ff, nearly all of them set by
`wrangler secret put` and therefore absent from `wrangler.jsonc` and from `Env`
by construction. That is the decision job `0049` named and declined: *where do
secrets get declared*, for a type shared by the Node entry point and the Workers
router, which is L-009 ground and touches the file every hosted user meets.
Also unchecked either way: the default export is `{ async fetch(request:
Request, env: WorkerEnv) }` (`worker.ts:376`) rather than `ExportedHandler<Env>`,
so nothing checks the handler's shape against the runtime's contract.
**Why it ranks here, at 9 of 10, and what would move it.** No live user
consequence was found, and the previous seat looked for one rather than assuming
its absence: every failure mode the missing typing permits — a renamed binding, a
new non-string binding read as a string, a typo'd name — fails **loudly and on
the first request**, because both bindings are on the org-routing path that
every request crosses. That is the opposite of the defect this net was built
for: the alarm's missing import — item 2 of the order before the last one,
delivered at `0a35ddc` — was silent for three days precisely because nothing
throws when a timer dies. This file's rule is that a finding with no
live user consequence does not belong near the top, and it holds here even
though the file in question is the deployed router. It ranks **above** item 10
because the cheap half is one proven line and it hardens the entry point that
just cost this product three days of a dead feature, where item 10 closes a spec
clause with no demonstrated hole. It ranks **below** items 7 and 8: item 7 has a
real booker's mail on the other end of it, and item 8 cites a rule that binds
always where this entry cites a coder's own `priority: medium` handover. **What moves it up:** a demonstrated
*silent* failure mode, or a second binding being added — the risk here is
proportional to how often `wrangler.jsonc`'s binding list changes, and it has
not changed since the shard migration.

**10 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it, and below item 9
because item 9's cheap half is measured and this one's is not. *Carried, not
confirmed:* re-read only; no new measurement.


---

**Not ordered here, deliberately, and it is not an omission — and it got better
since the last pass.** The previous evaluation recorded that three of the five
cross-family reviewers of `0a35ddc` never reached a model, leaving four
transcripts in `reviews/` that look like reviews and are execution failures.
**Re-verified at `2453adc`, by measuring the transcripts rather than trusting
the commit:** of `2453adc`'s three reviewers, **two returned real reviews** —
`20260831-175149-code-gemini.md` (3967 bytes, `VERDICT: APPROVE`) and
`20260831-180355-code-kimi.md` (4206 bytes, `VERDICT: APPROVE`) — and one did
not: `20260831-175149-code-qwen.md` is **372 bytes** and records a curl timeout,
not an objection. Against the four ≤544-byte husks from `0a35ddc`, that is one
failure instead of three, and the commit message attributes the improvement to a
context bundle that fits (40161 bytes on stdin against 630964 previously). The
four older husks are left where they are; they are the record of who did not
look. The repair is in `pumasi/tools/review.sh` and `pumasi-ops/tools/recruit.sh`,
neither of which is this product's code, so it is not this file's to rank — it is
recorded as evidence in [`STAGE.md`](STAGE.md), where a claim about how this
product's reviews are obtained belongs, and handed on in this evaluation's digest
entry.


## Completed (2026-08-31)

- **PR-1 compliance: one version, generated from the root manifest, on both
  builds** — item **2** of the previous order, **delivered in the half a commit
  can deliver** at **`2453adc`** by job `0056`, with cross-family code review
  `reviews/20260831-175149-code-gemini.md` and
  `reviews/20260831-180355-code-kimi.md` (both **`VERDICT: APPROVE`**).
  **This entry is struck from the order on this seat's own verification of the
  tree at `2453adc`, and the parts that are not delivered are re-ranked above
  rather than being carried inside a completed entry.** No release note for
  `2453adc` exists in `pumasi/releases/` — checked at this evaluation — which is
  recorded below and raised as a question rather than written here.
  - **One source of truth, re-verified.** `node -p` on all three manifests
    returns **`0.2.0`**; `package-lock.json`'s root, `core` and `service`
    package entries all read `0.2.0`; `service/src/version.ts` is a generated
    module exporting `VERSION = '0.2.0'` with a docblock forbidding hand edits.
    `0.1.0 → 0.2.0` — the first time this repository's version has ever moved.
  - **Both entry points, from the same constant (L-009), re-verified by grep
    rather than by report.** `import { VERSION } from './version.ts'` appears in
    `worker.ts:44`, `app.ts:44`, `pages.ts:13` and `feedback.ts:9` — the Workers
    router and the Node app named separately, which is what L-009 asks. The
    Workers build answers `version` at `worker.ts:448` (`/healthz`), `:452`
    (`/version`) and `:461` (`/readyz`); the Node build at `app.ts:338`, `:343`
    and `:344`. `pages.ts:41` renders `v${VERSION}` in the D-105 footer;
    `feedback.ts:122` emits a **Product Version** row, first in the diagnostic
    table.
  - **Guarded against becoming the fourth stale copy.** Root `pretest` runs
    `node tools/sync-version.mjs --check`; this seat watched it print
    `sync-version: 0.2.0 — manifests, lockfile and version.ts agree` on **four
    consecutive `npm test` runs** at this tree. `service/test/version.test.ts`
    executes both entry points rather than reading their source.
  - **What is NOT delivered, and it is two different kinds of not.** PR-1's
    *user-visible* clause is met in `main` and **unmet in the product** —
    `https://booking.pumasi.ai/version` still answers **404** and the live
    `/healthz` and `/readyz` carry no `version` key at all (measured
    2026-09-01 00:27 UTC). That is item **1**. The `GIT_COMMIT` half is set at
    deploy time and no commit closes it; also item **1**. The report payload's
    `version` field is a `pumasi-report/2` schema bump and a fresh R1b review;
    that is item **8**, ranked on its merits. **PR-1 is not met, and this entry
    does not say it is** — it says the code half of three clauses is done.

- **The Worker's alarm imports the function it calls, and a third tsconfig
  makes that checkable** — items **2 and 3** of the previous order, taken as one
  packet exactly as that order said they should be, **Delivered at `0a35ddc`**
  by job `0049` in full charter flow: build `0a35ddc`, cross-family code review
  `reviews/20260831-162058-code-gemini.md` (**`VERDICT: APPROVE`**), release note
  [`pumasi/releases/2026-08-31-pumasi-booking-alarm-import.md`](https://github.com/pumasi-ai/pumasi/blob/main/releases/2026-08-31-pumasi-booking-alarm-import.md)
  landed at `pumasi` `0f574f6`, veto window **Q-029**, open, closes 2026-09-07.
  **Every figure below was measured by this seat at this evaluation. Job
  `0049`'s numbers are its report, not this file's evidence, and they are not
  reproduced here as if they were.**
  - **Item 2 — the import exists and is the one that was missing.**
    `grep -n "processDueJobs" service/src/worker.ts` → **two** lines:
    `44:import { processDueJobs } from './automation.ts';` and the call it was
    always missing, `303:    const next = await processDueJobs(deps.sql,
    deps.mail, deps.now());`. `grep -n automation service/src/worker.ts` now
    returns the import as well as the `008_automation.sql` migration text it
    used to return alone.
  - **Item 2 — the `TS2304` is gone, and so is everything else.**
    `npm run typecheck` in `service/` (3.6 s) runs `tsc -p tsconfig.json
    --noEmit && tsc -p tsconfig.worker.json --noEmit` and **exits 0 with no
    output**. That is the first time in this repository's history that the
    second half of that command existed. The 17 errors the last two evaluations
    measured are 0.
  - **Item 3 — the deployed entry point is genuinely in the chain, checked by
    reading the chain rather than the claim.** `service/wrangler.jsonc:6` still
    names `src/worker.ts` as `main`. `service/tsconfig.worker.json` exists,
    extends `tsconfig.json`, sets `"exclude": []` and
    `"include": ["src/worker.ts", "types/sql-modules.d.ts",
    "worker-configuration.d.ts"]`. `service/package.json:11` reads
    `"typecheck": "tsc -p tsconfig.json --noEmit && npm run typecheck:worker"`
    and `:12` `"typecheck:worker": "tsc -p tsconfig.worker.json --noEmit"`, and
    `:14` chains `tsconfig.worker.json` into `build:test` as well, so `npm test`
    compiles it too. `service/tsconfig.json` still carries `"exclude":
    ["src/worker.ts"]`, which is correct and is why the third config exists.
  - **Nothing was silenced to reach zero — this was checked directly, because it
    is the one way a green type-check can be worth less than no type-check.**
    `grep -rn "@ts-expect-error\|@ts-ignore\|eslint-disable" service/src/` returns
    **nothing at all**. The eleven `@ts-expect-error` directives that sat on the
    `.sql` imports before this commit are **deleted**, not moved: they were
    suppressions no configuration ever evaluated, and five of the sixteen `.sql`
    imports never carried one, so the suppression was not even uniform. They are
    replaced by one honest `declare module '*.sql'` in
    `service/types/sql-modules.d.ts`. **The suppression count in this
    repository's service source went from eleven to zero in the commit that
    turned the compiler on.** The Cloudflare globals come from a generated
    `worker-configuration.d.ts` rather than a dependency on
    `@cloudflare/workers-types`, and the reason is recorded in the tree
    (`types/sql-modules.d.ts`) rather than in a commit message: that package's
    stable entrypoint ships `declare const Buffer: any`, which would suppress
    `@types/node`'s global `Buffer` and create two standing false errors in
    correct, tested code.
  - **What *was* widened, said plainly rather than filed under "nothing was
    silenced":** three casts of `this.env` now go through `unknown`
    (`worker.ts:119`, `:187`, `:296`) because the generated `Env` describes only
    what `wrangler.jsonc` declares and cannot describe secrets set with
    `wrangler secret put`. That is a real discarding of type information, it is
    documented at the declaration it bridges, and this seat has **ranked it as
    item 9** rather than letting it disappear into a delivered mark.
  - **The regression net was checked by running it, not by trusting it.**
    `pumasi/tools/gate.sh`, re-run **by this seat** at **2026-08-31 21:59 UTC**
    on `0a35ddc`: `── 1/4 tests` **320 service pass, 0 fail** with the three new
    cases visible in the stream (`ok 318 - the org DO alarm drains a due job`,
    `ok 319 - the org DO alarm re-arms for the next pending job`, `ok 320 - the
    org DO alarm is quiet when nothing is due`), `── 3/4` `gemini approved`,
    and **`GATE: PASS`**. Fifteen further sequential `npm test` runs, recorded
    under item 5, were **339/339 green every time** (19 core + 320 service). The
    service count rose 317 → 320 with those three cases, which are the first
    tests in this repository that execute a line of `src/worker.ts` rather than
    reading it as text.
  - **`0a35ddc` is not the SHA that was reviewed, and that is fine — checked
    rather than waved past.** All five transcripts name the range
    `77efe6b..42198d6`. `git diff --stat 42198d6 0a35ddc` is **exactly the four
    failed transcripts and nothing else** (119 insertions across
    `reviews/20260831-1624*.md` and `…-162058-code-qwen.md`), so the tree gemini
    approved is the tree that merged, plus the record of who could not look.
  **Delivered for the repository. Not delivered for a user, and this mark does
  not say otherwise.** `booking.pumasi.ai` has not been deployed since
  2026-08-30 16:55:37 UTC, re-measured by this seat at 21:58 UTC; every reminder,
  follow-up and webhook there is still undelivered and will be until somebody
  runs a deploy. That is item 1, it is `DECISIONS.md` **Q-012**, and job `0049`'s
  own release note and commit both say so in those words rather than in a
  present tense that describes the branch.
  **What the delivery did not close, recorded so the mark is not read as more
  than it is.** The last order warned that turning the compiler on "may surface
  further real errors whose repair is product work". **It did, and they were
  repaired in the same commit rather than deferred** — closing the ambient
  sixteen surfaced eleven now-unused suppressions (`TS2578`) and three
  `this.env` casts that now meet a real type. No behaviour moved anywhere; the
  diff to `worker.ts` is 30 lines, of which one is the import and the rest are
  deletions and cast widenings. The one thing left standing from that warning is
  the third of those three, which is item 9.

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
