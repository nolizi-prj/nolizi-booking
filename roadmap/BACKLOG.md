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

**The highest *build* entry today is item 2 — the service suite's red latch —
and it reached the top by being the only entry on this list whose cost is being
paid by somebody who actually exists.** Item 2 of the previous order, **issue
#32**, is **delivered at `d7bd490`** and is struck into Completed below, on this
seat's own verification of the tree: `service/src/pages.ts:989` carries
`times.appendChild(b)` again, `service/test/booking-slots.test.ts` drives the
real page in a real browser, and the root suite is **19 core + 338 service, 357
of 357 green**, re-run here rather than quoted. **Its user-visible half is not
delivered and is not quietly dropped**: the repair is not on
`booking.pumasi.ai`, the reporter still meets the defect, and that residual sits
with item 1 where every other undeployed thing already sits — measured, not
assumed, and the measurement is in item 1.

**A deployment happened, and this file has never had to say that before.**
Every previous order was written against a production build frozen at
2026-08-30 16:55:37 UTC. Three deployments landed at **2026-09-01
00:38:41.738Z · 00:39:03.300Z · 00:40:44.505Z**, re-measured here by
`npx wrangler deployments list` at **05:15 UTC**, and they carried
`booking.pumasi.ai` to **`2453adc`**. **Five of the six merged builds this file
has ranked behind item 1 for five consecutive evaluations are now serving
users** — checked one at a time with `git merge-base --is-ancestor <sha>
2453adc`, not inferred from the timestamp: `4f56df4` (reporting), `16c3fd4`
(the Zoom PMI leak), `7ea730a` (the OAuth callback), `3f2947c` (the sign-in
doors) and `0a35ddc` (the alarm import) are **all ancestors of the deployed
commit**. The Zoom leak is closed for the people it exposed. Workflows and
webhooks are alive on the deployment for the first time. Item 1 did not become
smaller because anything was re-read; it became smaller because somebody ran a
deploy, and this file measured it rather than carrying its own previous figure.

**What is left behind item 1 is three commits, and only one of them has a person
waiting.** `git log 2453adc..HEAD -- service/src/` returns exactly
`36f286c`, `c000feb` and `d7bd490`. **`d7bd490` is issue #32's repair and its
reporter is still meeting the defect** — re-measured by this seat in headless
Chrome at **2026-09-01 05:12:11 UTC**, after the merge and after the deploy, at
`America/Chicago`: `booking.pumasi.ai/yunyoungmok/abc` → 200, `#slots-data`
carries **24 slots**, day cells **1** and **2** are marked `.has`, and clicking
each gives `#picked-day` *"Tuesday, September 1"* / *"Wednesday, September 2"*
with `#times.children.length` **0** and **0 errors captured**. Item 1 is
therefore no longer a list of six invisible repairs. It is one named user, one
legal register, and one commit nobody reviewed.

**The reorder, before → after, so the change is readable rather than inferred.**

| | Before (`2453adc`, job `0061`) | After (`d7bd490`, this pass) |
|---|---|---|
| 1 | Deploy the reviewed build to `booking.pumasi.ai` (Q-012) · *operator action* | Deploy the reviewed build to `booking.pumasi.ai` (Q-012) · *operator action* — **unchanged in rank, five-sixths emptied by a deploy that happened**, and what remains has a named user in it |
| 2 | A public booking page shows a day that has times and then shows no times — issue #32 | **The service suite latches red** *(was item 4)* · **top build entry** — promoted on a re-verified mechanism and a demonstrated, recurring cost |
| 3 | A half-configured deployment gets an answer it cannot act on | A half-configured deployment gets an answer it cannot act on — *unchanged in severity, displaced by an entry whose sufferers exist* |
| 4 | The service suite latches red | Submit the Google OAuth app for verification *(was 5)* |
| 5 | Submit the Google OAuth app for verification | The reporting intake, and the Workers-path decision *(was 6)* |
| 6 | The reporting intake, and the Workers-path decision | A runtime subprocessor guard for the deployed mail path *(was 7)* |
| 7 | A runtime subprocessor guard for the deployed mail path | `pumasi-report/2` — PR-1's last open clause *(was 8)* |
| 8 | `pumasi-report/2` — PR-1's diagnostics clause | `worker.ts` models its environment as a string bag *(was 9)* |
| 9 | `worker.ts` models its environment as a string bag | O2 — secrets posture, completed *(was 10)* |
| 10 | O2 — secrets posture, completed | — |

**One entry left the order and one moved up two places; everything else moved
because of those two and not because of its own merits.** Issue #32 left because
it was built. The latch moved from 4 to 2 for a reason stated at the entry and
in the commit message. Items 3 and 4 of the old order swapped; items 5 through
10 each moved down one and then up one and are exactly where they were relative
to each other. **Nothing was demoted for getting better or worse.**

**Why the latch outranks the half-configured refusal, since this reverses five
passes of ordering and should not pass as bookkeeping.** This file ranks by
**who meets the defect**, and it has always meant a real person rather than a
possible one. Item 3's own text says, and this seat re-read it rather than
taking it: *"No live user on `booking.pumasi.ai` is affected"* — the operator it
protects is one who configured a Google client id, omitted the secret, and has
never been observed. Item 2's sufferers are named and counted: job `0049` paid
it mid-packet on 45 tests, job `0077` paid it during the very run that produced
this packet, and **this evaluation paid it deliberately to re-verify the
mechanism**. A rule that prefers an unobserved operator to three named jobs is
being applied to the wrong noun. Item 2's remedy is also one line where item 3's
is a two-path user-visible copy change on L-009 ground with a can-hurt review
cycle behind it — so the cheaper fix closes the larger demonstrated cost, and
that is the ordering.
**There is a second reason, and it is about this file rather than about a
user.** The latch corrupts the evidence every other entry rests on. `GATE:
PASS`, the determinism figures in [`STAGE.md`](STAGE.md), and the suite counts
in this file are all measured on a harness that can latch red and has. Fixing it
makes every later measurement in this repository cheaper and more trustworthy.
No other entry has that property.

Every entry below carries one of two labels and none is unlabelled:
**re-verified at `d7bd490`** means this seat re-ran or re-read the thing the
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

**1 · Deploy the reviewed build to `booking.pumasi.ai` — a named user's reported
defect is repaired in `main` and is still on the page they reported it from; the
served subprocessor register still omits a provider the deployed build calls;
and one commit on the deployed path was never reviewed** — source: this
evaluation (2026-09-01, job `0082`), checking the deployment rather than the
merge, for the **seventh** consecutive evaluation.
**Re-verified at `d7bd490`, re-measured rather than carried, and this is the
pass on which carrying would have been badly wrong.**
**The deployment moved, for the first time since this entry was written.** Run
here at **2026-09-01 05:15:44 UTC**, `npx wrangler deployments list` from
`service/` for the `pumasi-booking` worker (`wrangler.jsonc:5`, `name:
"pumasi-booking"`; `:9`, custom domain `booking.pumasi.ai`) returns **three new
deployments** above the `d73c05b5` *Secret Change* that six evaluations found
unmoved: **2026-09-01 00:38:41.738Z** (`aef92528`), **00:39:03.300Z**
(`bf4934bf`) and **00:40:44.505Z** (`b6a2e64b`), all author
`atxapplellc@gmail.com`, `Source: Unknown (deployment)`, no tag and no message.
**Curled by this seat at 2026-09-01 05:11:40 UTC**, and the answers now name
their own build:
`/version` → **200** `{"version":"0.2.0","commit":"2453adc"}`;
`/healthz` → **200** `{"status":"ok","version":"0.2.0","commit":"2453adc","sharded":true}`;
`/readyz` → **200** `{"status":"ready","version":"0.2.0","commit":"2453adc","owners":11}`.
The three surfaces that were `404`, `commit:"unknown"` and version-less at the
last evaluation all answer, and they answer with a commit. **The deployed build
is `2453adc` and it says so itself, without credentials.**
**Five of the six builds this entry has ranked for five passes are delivered,
checked one at a time rather than inferred from a date.** `git merge-base
--is-ancestor <sha> 2453adc` answers **yes** for `4f56df4` (the §5.1 reporting
mechanism), `16c3fd4` (the Zoom PMI fix), `7ea730a` (the OAuth-state fix),
`3f2947c` (the two sign-in doors) and `0a35ddc` (the alarm import), and for
`2453adc` itself. **The Zoom personal-meeting-URL leak is closed for the people
it exposed. Reminders, follow-ups and webhooks are alive on the deployment for
the first time in this product's history.** Both were this entry's sharpest
content for five evaluations and both are struck from it here, on measurement.
*One thing this seat measured and one thing it did not:* the code is deployed,
and **whether the Durable-Object alarm actually re-armed on the hosted build
after the deploy is not established** — answering it means booking against a
real owner's page, which this seat did not do. Shipping fixed code is not the
same as the feature running. That gap is named rather than glossed and is
**carried, not confirmed**.
**What is left behind this entry, counted at this tree rather than carried.**
`git log 2453adc..HEAD -- service/src/` returns exactly **three** commits, and
they are three different kinds of thing:
- **`d7bd490` — issue #32's repair, and the only one with a person waiting.**
  Re-measured by this seat in headless Chrome (`/usr/bin/google-chrome`
  150.0.7871.186) at **2026-09-01 05:12:11 UTC**, timezone `America/Chicago`:
  `GET https://booking.pumasi.ai/yunyoungmok/abc` → **200**; `#slots-data`
  carries **24 slots**, first `2026-09-01T14:00:00Z`, last
  `2026-09-02T21:30:00Z`; day cells **1** and **2** are marked `.has`; clicking
  each gives `#picked-day` *"Tuesday, September 1"* and *"Wednesday, September
  2"* with **`#times.children.length` 0** both times, and **0 errors captured**.
  `git merge-base --is-ancestor d7bd490 2453adc` answers **no**. **The person
  who reported this on 2026-09-01 00:36:56 UTC still meets it**, four and a half
  hours after the deploy that could have carried it and did not.
- **`c000feb` — the served subprocessor register still omits Zoom.**
  Re-measured here at **05:19 UTC**: `curl
  https://booking.pumasi.ai/subprocessors` returns 34663 bytes containing four
  case-insensitive matches for *zoom*, and **all four are CSS and UI strings**
  (`cursor:zoom-in`, `pf-shot-zoom-hint`). No subprocessor row names Zoom. The
  repair is merged and the published register a customer reads is unchanged.
- **`36f286c` — a commit on the deployed path that nothing in the flow
  produced.** Authored **2026-09-01 00:40:51 UTC**, *seven seconds after the
  00:40:44 deploy* and four minutes after issue #32 was filed, by
  `Pumasi <admin@pumasi.ai>`, message *"fix(ui): add prominent Preview Public
  Booking Page CTA to event settings view (addresses #32)"*. It has **no trailer
  block, no spec, no intent, no `DECISIONS.md` entry and no review transcript**,
  and it edits `service/src/pages.ts` — the file every hosted user meets. Read
  at this tree: four inserted lines replacing the event editor's plain link with
  a styled CTA (`pages.ts` `eventTypeEditor`). It does not touch the booking
  page's renderer and it does not address issue #32, whose defect was on the
  public page. **This is not ranked as a defect** — the suite is green at this
  tree and this seat found nothing wrong with the four lines. It is recorded
  here because it will ship on the next deploy, because nobody reviewed it, and
  because a reader counting what a deploy carries should not have to discover it.
  Reviewing or reverting it is not this seat's; it is handed up in this
  evaluation's digest entry.
**PR-1's user-visible clause is met — in the product, not the branch — and this
entry loses it.** [`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
asks that *"a person using the product can find the version without reading
source"*. Measured at **05:20:06 UTC**: `https://booking.pumasi.ai/` serves
`<span class="foot-v">v0.2.0</span>`, and `/version` answers. That clause was
this entry's newest content one pass ago and it is closed by the deploy. **The
`GIT_COMMIT` half is closed too, and it closed the way it always could:** the
live endpoints report `commit: "2453adc"`, which no commit could have set and a
deploy did.
**What could not be confirmed from outside, and is not claimed:** no workflow
was exercised against the live deployment, so the alarm's re-arming is
unestablished as above; and no owner's calendar connection was exercised.
Why here: one named person is waiting on a page that does not work, and this is
the only entry that reaches them. It has been item 1 at six consecutive
evaluations and it stays item 1 — but for the first time the reason is a single
identified user rather than a queue of invisible repairs, and this file says so
rather than reusing last pass's sentence. Note the asymmetry item 2 of the
previous order established and this entry still must not absorb: **deploying is
now the *only* thing that closes issue #32**, because the repair exists and
nothing else stands between it and the reporter.
*Operator action, not a build — see `DECISIONS.md` **Q-012**, which asks whose
duty this is and names the coder as its default. It keeps rank 1 rather than
being demoted for being unbuildable. The next **coder** packet takes item 2;
this entry must not be displaced by it.*
**Recorded against `DECISIONS.md` Q-012 as evidence and nothing more.** This
seat added an evidence row there at this pass and did not touch the date, the
default, or the status. **Nothing here closes, extends, softens or dates that
window, and no deployer is named.** That a deploy happened is reported; who ran
it, and whether that is the answer to Q-012, is not this seat's to say.

**2 · The service suite latches red: one interrupted run leaves a data directory
behind, and every later run of that file fails on it until a human deletes it**
— source: job `0034` handed this on itself and declined to rank it; job `0077`
reproduced it on demand during the issue-#32 build and named the mechanism; **it
is re-verified from scratch here, and this pass establishes one thing the
previous accounts did not.**
**Re-verified at `d7bd490`, by reproducing it deliberately rather than by
reading anyone's report.** `/tmp` held **0** `pumasi-pg-*` directories at the
start of this evaluation.
- **Baseline.** `node --test .build/test/bootstrap.test.js` from a clean `/tmp`:
  **7 tests, 7 pass, 0 fail**, 817 ms.
- **The interruption.** The same command was started and the node process
  `SIGKILL`ed 0.8 s in — the shape of any run that dies mid-suite. `ls -A
  /tmp/pumasi-pg-bootstrap` afterwards: **24 entries** (`PG_VERSION`, `base`,
  `global`, `pg_hba.conf`, …).
- **The latch.** The identical command, re-run: **7 tests, 0 pass, 7 fail**,
  every one of them `Postgres init script failed (code: 1, signal: null). ERROR
  OUTPUT: initdb: error: directory "/tmp/pumasi-pg-bootstrap" exists but is not
  empty`. The directory still held **24 entries** afterwards, so it latches
  rather than self-clearing.
- **The remedy, checked.** `rm -rf /tmp/pumasi-pg-bootstrap`, then the identical
  command: **7 pass, 0 fail**. `/tmp` held **0** `pumasi-pg-*` directories at
  the end of this evaluation, and the root suite ran **357/357** afterwards.
**New here, and it narrows the fix rather than the finding: the leftover
directory alone is sufficient, and an orphaned server process is not part of the
mechanism.** The `SIGKILL` leaves a `postgres -D /tmp/pumasi-pg-bootstrap -p
55436` orphan behind, which is the obvious suspect — a held port would explain
the same symptom. It was killed on its own, **leaving the directory in place**,
and the re-run **still failed 7 of 7 with the same `initdb` message**. So the
cause is the directory and nothing else, and a repair that only reaps stray
processes would not close this. `initialise()` in `embedded-postgres` runs
`initdb` unconditionally — there is no "already initialised" branch to fall
through to (`node_modules/embedded-postgres/dist/index.js:106`ff), which is why
a *complete* leftover cluster is as fatal as a partial one.
**The scope, counted at this tree rather than carried:** `grep -l "databaseDir:
'/tmp/pumasi-pg-" service/test/*.test.ts` returns **19** files, each hard-coding
both its data directory and its port — `analytics`, `automation`, `bootstrap`,
`branding`, `calendar`, `concurrency`, `directory`, `enterprise`, `frontdoor`,
`gate`, `identity`, `legal`, `meetings`, `owner`, `parity`, `questions`,
`recur`, `routing`, `teams`.
*What the entry asks for, and the one thing it must not do.* Give each run its
own data directory and let the OS allocate the port, and remove the directory
when a start fails. **It must not lower `--test-concurrency`.** Every run
recorded above was a single test file, alone, with nothing else in flight —
there was no concurrency to lower, and that knob would make the latch less
likely to be sprung while leaving both fixed resources exactly where they are.
**What is carried, not confirmed, and named so the entry is not read as more
settled than it is.** The **19 consecutive failures out of 40 runs** measured
two evaluations ago, and the **15-of-15 green load sweep** across loads
2.56–10.99 measured at the last one, were not re-run here. Neither is withdrawn;
this pass did not need them, because it reproduced the mechanism directly in
four commands instead of inferring it from a failure rate. What they establish
and this pass does not is that **load is not the cause** — eleven of those
fifteen green runs sat inside the 9.0–12.4 band in which the nineteen failures
occurred.
Why here, and this is the promotion: **it is the highest entry on this list
whose cost is being paid by somebody who exists.** No user can be hurt by it —
it produces false **reds**, never a false green, and a fresh CI runner cannot
carry it between runs, so today's advisory CI is unaffected. But
`pumasi/tools/gate.sh` is run by hand on this shared machine by every agent that
needs to pass it, and after one interrupted run the gate reports failures to
every agent afterwards, on a clean tree, until someone knows to delete a
directory in `/tmp`. Job `0049` paid it on 45 tests. Job `0077` paid it during
the run that produced this packet. **This evaluation paid it on purpose, to
re-verify it.** Item 3 below protects an operator who has never been observed;
this one has three named jobs behind it and a one-line remedy. **And it is the
only entry that corrupts the evidence the rest of this list rests on** —
`GATE: PASS`, the determinism figures in [`STAGE.md`](STAGE.md) and the suite
counts in this file are all taken on a harness that can latch red and has.

**3 · A half-configured deployment gets an answer it cannot act on — both
refusals, on both builds** — source: the job `0023` run recorded both halves as
found-not-fixed (`service/spec/0007/SPEC.md` §5) and handed the ranking here.
**Re-verified at `d7bd490`, and this time the line numbers did NOT move — which
is worth one sentence, because the last two passes had to re-take them and a
reader should be able to tell a stable coordinate from an unchecked one:**
- **(b) `worker.ts:610` opens `/auth/google/start` on `config.googleClientId`
  alone.** `grep -n "if (!states || !config.googleClientId)"
  service/src/worker.ts` → **`610`**, unchanged from `2453adc`. The Node-path
  guard is **`app.ts:992`** (`grep -n "!hub || !config.googleClientId"
  service/src/app.ts`), also unchanged. `d7bd490` and `c000feb` touched
  `pages.ts`, `feedback.ts` and the legal texts, and neither displaced these.
  Since `deps.calendars` exists only when `googleClientId && googleClientSecret
  && tokenKey` are all set (`server.ts:113`–`115`, `worker.ts:243`–`245`), the
  Node path effectively requires the secret and the Workers router does not. A
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
is the test this file ranks by. **Nothing about this entry got better or worse
and it was not demoted** — it is displaced by item 2, whose sufferers are named
and counted where this entry's are hypothetical. **No live user on
`booking.pumasi.ai` is affected**: that deployment holds both Google
credentials, and its own text has said so since it was written. Nothing here is
unguarded — on a deployment with no `googleClientSecret`, Google sign-in cannot
complete on either build, and (b) only decides whether the refusal arrives
before or after a round trip.

**4 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*
*Carried, not confirmed at `d7bd490`:* this seat re-read the entry and did not
re-check the Google console state, which it cannot see. *One thing that did
change and is measured here rather than assumed:* the setup doc waited on a
deployed homepage and a live privacy URL, and both are now not merely deployed
but **current** — `booking.pumasi.ai` serves `2453adc` as of 2026-09-01
00:40:44 UTC, re-measured at 05:11 UTC. Nothing about the submission itself is
this seat's to do or to date.

**5 · The reporting intake, and the Workers-path decision** — source:
[`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md) R5c;
[`DEBT.md` D-107](https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md)
(open half); surfaced by the job-0008 run (ops digest, 2026-08-30). The
mechanism shipped (`4f56df4`) but nothing receives reports — daily sends
fail and are dropped — and R5c forbids the intake to accept held reports
before its deletion path is implemented and tested. The Workers deployment
deliberately sends nothing; that decision is revisited no later than the
`launched` promotion (Q-008 default). ***Corrected from item 1's evidence at this pass, because the previous note is
now false.*** Four passes recorded that `4f56df4` postdates the deployment and
so was not on the live build. **It is on the live build now** — `git merge-base
--is-ancestor 4f56df4 2453adc` answers yes, measured here. That changes nothing
about this entry, for the reason it always gave: the Workers path is configured
to send nothing (R8), so a deployed mechanism that deliberately stays quiet is
the same silence as an undeployed one. The correction is recorded rather than
dropped, because the sentence it replaces was evidence and is not true. *The intake is foundation infrastructure and may land in another
repo — the project manager routes it; it sits here because this product's
`launched` claim waits on it.*
Why here: both halves gate `launched` (STAGE.md), but neither hurts a user
today, so shipped-surface correctness outranks them. **Re-verified at
`d7bd490`:** `reporting.ts` is untouched by `c000feb` and `d7bd490`
(`git log 2453adc..HEAD -- service/src/reporting.ts` is empty), and the Workers
path still sends nothing (R8). **If a coder
packet takes this, it takes item 7 in the same R1b cycle** — same schema, same
review, and two spec reviews on one file weeks apart is pure waste.

**6 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses — which puts a user on the other
end of it, and is why it outranks items 7 and 8 despite all three being
invisible today.
**Re-verified at `d7bd490`, and the "unchanged" label the last pass used would
have been wrong here.** `SUBPROCESSORS.md` **did** change — `c4b1159` added the
Zoom row and `c000feb` rewrote the enforcement language — so this seat re-read
it rather than carrying the label. The finding stands at this tree: the register
still names the deployed Workers mail path's control as *"a weaker control than
the Node path has"* (`SUBPROCESSORS.md:31`–`:36`), and it is named as weaker
rather than dressed up, which is why this is a build and not a correction.
*Carried, not confirmed:* no new measurement of the mail path itself was taken.
*And one thing measured that belongs to item 1 rather than here:* the register a
customer actually reads is still the pre-`c000feb` one — `curl
https://booking.pumasi.ai/subprocessors` at 05:19 UTC names no Zoom row.

**7 · `pumasi-report/2` — PR-1's diagnostics clause in the report payload** —
source: item 2 of the previous order, **ranked here rather than closed with it**;
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
*"In the diagnostics"*; [`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md)
R1b. **Re-verified at `d7bd490` by reading the module, not the commit message.**
`service/src/reporting.ts:20` still declares `REPORT_SCHEMA = 'pumasi-report/1'`,
and neither `HeldReport` (`:59`) nor `PublishedReport` (`:80`) carries a
`version` field; both carry `commit`. All three coordinates are unchanged from
the last pass, checked rather than assumed. The docblock at `:22`–`:31`, added by
`2453adc`, names the gap where the decision lives and states the reason it was
not closed in that commit: by that module's own rule a field not in these
interfaces is a field a report may not carry, so adding one is a **schema
version bump plus a fresh cross-family spec review (R1b)**, not a field. *"A
silent field on a schema a receiver validates is worse than a missing one."*
This file agrees with that reasoning and is recording it as a ranked item rather
than as a comment, because a gap that lives only in a docblock is a gap nobody
schedules.
**Why it is ranked here and not higher, given PR-1 binds always. Re-asked at
this pass rather than carried, because PR-1's other clauses closed underneath
it.** With `booking.pumasi.ai` now serving `2453adc`, PR-1's *one source of
truth*, *the number moves* and *user-visible* clauses are all met **in the
product** — the live footer reads `v0.2.0` and `/version` answers, both measured
here. **This is the last open clause of PR-1**, which raises its salience and
does not change its rank, because the ranking test this file uses is who meets
the defect, and today **nobody reads these payloads at all**. Item 5 records
that nothing receives reports — daily sends fail and are dropped — and that the
Workers deployment, which is the build every real user meets, deliberately sends
none (R8). So a missing `version` on a payload with no receiver and no emitter
in production costs a full R1b spec-review cycle to close and buys no reader
anything today. It ranks below item 6, which has a real booker's mail on the
other end of it. It ranks **above** item 8 because it cites a rule that binds
always and closes the last open clause of a rule this product otherwise now
meets, where item 8 cites a coder's own `priority: medium` handover and no rule.
**How it should be built, which is a different question from where it ranks.**
If a coder packet takes **item 5**, it takes this in the same cycle. Both change
the same schema and both need the same fresh cross-family spec review; two R1b
reviews on one file, weeks apart, is the waste. The rank says what to do first
when they are taken separately; this line says not to take them separately if
the choice is available.
**What moves it up:** a receiver existing (item 5 landing on its own), or a
released report being filed against a build nobody can identify — at which point
the clause acquires the reader it currently lacks.

**8 · `worker.ts` models its environment as a string bag, and the generated
`Env` could type the bindings** — source: job `0049` handed this on itself at
`priority: medium` and deliberately did not do it in that packet. *"Medium" in a
coder's return block is that coder's read; this is the ranking, and it is made
on this seat's own measurement rather than on the handover.*
**Re-verified at `d7bd490`, and this pass every coordinate held still.**
`service/worker-configuration.d.ts` is **588612 bytes**, unchanged and
re-measured here with `wc -c` rather than regenerated, workerd
`1.20260828.1` — whose `__BaseEnv_Env` types `PUMASI` and `DIRECTORY` as
`DurableObjectNamespace<import("./src/worker").PumasiService>` and
`…PumasiDirectory`, and the three `wrangler.jsonc` vars as string *literals*.
*(The previous pass also recorded a hash `03c0fafc…`; this seat could reproduce
neither that prefix with `sha256sum` (`6d2e00a0…`) nor with `git hash-object`
(`25aa0e24…`), and does not know which algorithm produced it. The size is
re-measured and identical, so the file is unchanged; the hash is **carried, not
confirmed**, and is not repeated as if it were.)*
**Every line number in this entry held, and they are re-taken rather than
repeated — the last two passes had to move all of them, so a stable coordinate
is worth distinguishing from an unchecked one.** `worker.ts:80` keeps its own `type WorkerEnv = Record<string, string | undefined> & { PUMASI:
DoNamespace; DIRECTORY: DoNamespace }` over the hand-written `interface
DoNamespace` at `worker.ts:69`, and **three casts are widened through
`unknown`** to bridge them — `worker.ts:120`, `:188`, `:297`, all three
re-measured here with `grep -n "as unknown as WorkerEnv" service/src/worker.ts`
and all three unchanged from `2453adc`. Three further sites pass `env as never` into
`loadConfig` — `worker.ts:122`, `:189`, `:381` — whose parameter is
`NodeJS.ProcessEnv` (`config.ts:82`).
*The scratch-tree compile below is **carried, not confirmed** — it was measured
two passes ago at `0a35ddc` and not re-run here. `worker.ts` has changed since,
so the "0 errors" figure is that pass's and not this one's; what this pass can
say is that `npm test` at `d7bd490` compiles `tsconfig.worker.json` as part of
`build:test` and the root suite is 357/357 green.*
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
though the file in question is the deployed router. It ranks **above** item 9
because the cheap half is one proven line and it hardens the entry point that
just cost this product three days of a dead feature, where item 9 closes a spec
clause with no demonstrated hole. It ranks **below** items 6 and 7: item 6 has a
real booker's mail on the other end of it, and item 7 cites a rule that binds
always where this entry cites a coder's own `priority: medium` handover. **What moves it up:** a demonstrated
*silent* failure mode, or a second binding being added — the risk here is
proportional to how often `wrangler.jsonc`'s binding list changes, and it has
not changed since the shard migration.

**9 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it, and below item 8
because item 8's cheap half is measured and this one's is not. *Carried, not confirmed at `d7bd490`:* re-read only; no new measurement, and
`service/spec/0002/SPEC.md` is untouched since the last pass.


---

**Not ordered here, deliberately, and it is not an omission — and it got better
again, to the best breadth this repository has ever had.** Two evaluations ago
three of the five cross-family reviewers of `0a35ddc` never reached a model,
leaving four transcripts in `reviews/` that look like reviews and are execution
failures. At `2453adc` two of three returned real reviews.
**Re-verified at `d7bd490` by measuring the committed transcripts with `wc -c`
and `grep VERDICT`, rather than by trusting a commit message or a
`DECISIONS.md` row — and the measurement disagrees with the row.** Of
`d7bd490`'s four reviewers, **three returned real, substantive reviews**:
`20260831-223232-spec-gemini.md` (7931 bytes, `VERDICT: APPROVE`),
`20260831-223524-code-kimi.md` (**4457 bytes, `VERDICT: APPROVE`**, and its body
walks B-001…B-006 and S3-001 case by case), and
`20260831-224335-code-glm.md` (7811 bytes, `VERDICT: APPROVE`, and it found two
real defects in the builder's own artefact). One did not:
`20260831-223641-code-qwen.md` is **376 bytes** and records
`curl: (28) Operation timed out after 600000 milliseconds`.
**`pumasi` **Q-038**'s Review row says kimi *"and qwen were both killed, exit
137"* and that *"their transcripts are committed empty"*. At this tree kimi's
transcript is neither empty nor a husk. The tree is the record, and this file
reports the tree; the discrepancy is carried up as evidence on Q-038 rather than
argued here.** Three of five families reviewing, one husk, and no
`Argument list too long` at all — against one of five two merges ago. The four
older husks stay where they are; they are the record of who did not look. The
repair is in `pumasi/tools/review.sh` and `pumasi-ops/tools/recruit.sh`,
neither of which is this product's code, so it is not this file's to rank — it is
recorded as evidence in [`STAGE.md`](STAGE.md), where a claim about how this
product's reviews are obtained belongs, and handed on in this evaluation's digest
entry.

**Also not ordered, and it is a risk this seat went looking for and could not
find — recorded because the alternative is the mistake this pass exists to
correct.** The release note for `d7bd490` and **Q-038** both record glm's
finding that the new browser cases *"pin the timezone but not the clock"*, so
they *"could go red after 2026-09-02"*. That would latch this repository's suite
red on a known date for a reason that is not a regression, which would be a
rankable build with a deadline of tomorrow. **It was probed rather than ranked
around, and there is no mechanism at this tree.** `service/src/pages.ts`'s
booking-page client script contains **no bare clock read**: every `new Date(...)`
in the render path takes an explicit argument, `.has` is assigned purely on
`byDay[key]` existing with no comparison against today (`pages.ts:962`), and
both `Intl.DateTimeFormat` instances are given an explicit `timeZone`.
`service/test/booking-slots.test.ts` contains no `Date.now()` and no `new
Date()` at all. The fixture's `2026-09-01` / `2026-09-02` dates being in the
past therefore has nothing to act on. **This is the exact shape of the error
that cost four evaluations** — item 2 of the previous order ranked reproduction
first *because* "there is no browser on this machine", and a browser and
`puppeteer` were both already installed. An asserted capability and an asserted
risk are the same mistake in opposite directions, and both are cheap to probe.
*Stated as measured rather than as settled:* if the cases do redden after
2026-09-02, this reading is wrong and the entry is owed.


## Completed (2026-09-01)

- **A public booking page shows a day that has times and then shows no times —
  issue [#32](https://github.com/pumasi-ai/pumasi-booking/issues/32)** — item
  **2** of the previous order, **delivered in the half a commit can deliver** at
  **`d7bd490`** by job `0077` in full charter flow: intent and spec
  `service/spec/0008`, frozen acceptance cases
  `service/spec/0008/acceptance/cases.json`, cross-family **spec** review
  `reviews/20260831-223232-spec-gemini.md` (`VERDICT: APPROVE`) and **code**
  reviews `reviews/20260831-223524-code-kimi.md` and
  `…-224335-code-glm.md` (both `VERDICT: APPROVE`), release note
  [`pumasi/releases/2026-09-01-pumasi-booking-a-day-that-shows-times-shows-times.md`](https://github.com/pumasi-ai/pumasi/blob/main/releases/2026-09-01-pumasi-booking-a-day-that-shows-times-shows-times.md),
  veto window **Q-038**, open, closes 2026-09-08.
  **This entry is struck from the order on this seat's own verification of the
  tree at `d7bd490`, and the part that is not delivered is re-ranked into item 1
  rather than carried inside a completed entry.**
  - **The cause, and it is one statement.** `50f911f` deleted
    `times.appendChild(b)` from the `byDay[pickedDay].forEach` while inserting a
    `localStorage` block after it, in a commit about remembering a booker's name
    and email. `git log -S 'times.appendChild' -- service/src/pages.ts` returns
    three commits and no others — `efb392e` added it, `50f911f` removed it,
    `d7bd490` put it back — measured here rather than read off the commit
    message. At this tree it is at **`pages.ts:989`**, inside the loop, with a
    comment naming the issue.
  - **The regression net is the part that matters, and it was run rather than
    trusted.** `service/test/booking-slots.test.ts` serves this tree's own
    `bookingPage()` output over loopback and drives it in headless Chrome
    (`/usr/bin/google-chrome` 150.0.7871.186) pinned to `America/Chicago`, the
    reporter's zone. It is in the **default** suite: root `npm test` at
    `d7bd490`, re-run by this seat, is **19 core + 338 service = 357 of 357
    green**, and `pumasi/tools/gate.sh` re-run here at **2026-09-01 05:16 UTC**
    printed **`GATE: PASS`** with `── 1/4 tests` showing **338 pass, 0 fail**.
    `/tmp` held **0** `pumasi-pg-*` directories before and after. The service
    count rose 331 → 338 with the seven new cases (B-001…B-006, S3-001), which
    are the first cases in this repository that render this product's central
    page in a browser rather than reading it as a string.
  - **The premise this entry was ranked on for four evaluations was false, and
    it is recorded here rather than deleted with the entry.** This entry said
    *"the failure is client-side and there is no browser on this machine"* and
    made reproduction the first step of the packet on that ground. Chrome
    150.0.7871.186 was installed, `puppeteer 25.9.0` was already a
    devDependency of `service/package.json`, and `service/test/browser-live.test.ts`
    had been driving a real browser in the default suite for days — all three
    re-checked by this seat. **Nothing had to be installed.** The cost was four
    evaluations that could have reproduced a live user's defect and did not.
    Job `0077` and Q-038 both propose this is worth a **lesson** —
    *probe an absent capability before ranking around it*. **This seat endorses
    that and does not write it:** `pumasi/lessons/` is the commons' and is not
    in this role's may-write list. It is handed to the steward and the project
    manager in this evaluation's digest entry and return block, with one piece
    of evidence added — the same mistake was made in the other direction inside
    the same work, and is recorded under "Not ordered here" above.
  - **The exposure window in the published record is wrong by an order of
    magnitude, and it is corrected here rather than in the published note.** The
    release note says the line *"had been deleted four weeks earlier"* and that
    *"we cannot say how many people met this in the four weeks it was live"*.
    `50f911f` is dated **2026-08-30 05:38:43 UTC** and issue #32 was filed
    **2026-09-01 00:36:56 UTC** — **42 hours 58 minutes**, and that is a ceiling
    rather than a measurement, since the deployment carrying it landed later.
    This repository's **first commit is `e761f05`, 2026-08-28**: it is four days
    old, so a four-week exposure is impossible on its face. The direction of the
    error matters — it **overstates** harm to users in a document written for
    them. **This seat did not edit the note**: publishing is not in this role,
    and Q-034's rider (a) says a published note is a dated record and is
    corrected in the next one rather than in place. The correction is added as
    **evidence on Q-038** and named in the digest.
  - **What is NOT delivered, and it is the whole reason this file distinguishes
    merged from shipped.** The repair is **not on `booking.pumasi.ai`**.
    `git merge-base --is-ancestor d7bd490 2453adc` answers **no**, and the page
    was re-measured in a browser by this seat at **2026-09-01 05:12:11 UTC** —
    after the merge, after the release note, and after the deploy — still
    showing `#times.children.length` **0** for both available days. That is
    **item 1**, and it is now item 1's sharpest content. **Issue #32 is
    deliberately OPEN.** It was closed as *"completed"* by `pumasiAI` at
    00:59:17 UTC, 23 minutes after a named user filed it and before any repair
    existed; job `0077` reopened it at 03:56 UTC on a post-merge browser
    measurement. This seat did not close it, did not re-close it, and added no
    comment — the state is unchanged since `0077` commented with the current
    facts 80 minutes earlier, and telling a reporter the same thing twice is not
    news. The policy question is `DECISIONS.md` **Q-039**, open, and it is the
    steward's.
  - **A second finding inside the same report was handed up by the last order
    and was *corrected* rather than implemented, which this file records because
    a withdrawn finding is as much a result as a fixed one.** The previous entry
    read the report's **Page URL** naming `/app/event/<id>` while the screenshot
    showed `/yunyoungmok/abc` as a fidelity defect in `feedback.ts` — PR-2's
    reference implementation. Job `0077` established both values were right: the
    widget reports `location.href` faithfully and the image comes from
    `getDisplayMedia`, where the browser lets the person choose the surface. The
    field is renamed **Reported From** (`feedback.ts:123`) and the image carries
    a caveat line (`:153`), verified here by reading the module. **The defect was
    in this file's reading, not in the product**, and it says so.

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
  - **What was NOT delivered when this entry was written, and what happened to
    it since — superseded 2026-09-01 by measurement rather than edited away.**
    At the last evaluation PR-1's *user-visible* clause was met in `main` and
    unmet in the product: `https://booking.pumasi.ai/version` answered **404**
    and the live `/healthz` and `/readyz` carried no `version` key (measured
    2026-09-01 00:27 UTC, and true when written). **The 00:40:44 UTC deploy
    closed it.** Re-measured by this seat at **05:11:40–05:20:06 UTC**:
    `/version` → `{"version":"0.2.0","commit":"2453adc"}`, `/healthz` and
    `/readyz` both carry `version` and `commit`, and
    `https://booking.pumasi.ai/` serves `<span class="foot-v">v0.2.0</span>`.
    **The `GIT_COMMIT` half closed the only way it could** — the live endpoints
    report `commit: "2453adc"`, which no commit could set and a deploy did.
    **So three of PR-1's four clauses are now met in the product**, not merely
    in the branch. What remains is the report payload's `version` field, a
    `pumasi-report/2` schema bump and a fresh R1b review; that is item **7**,
    ranked on its merits. **PR-1 is still not met, and this entry does not say
    it is** — it says three of four clauses are, for the first time.

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
    item 8** rather than letting it disappear into a delivered mark.
  - **The regression net was checked by running it, not by trusting it.**
    `pumasi/tools/gate.sh`, re-run **by this seat** at **2026-08-31 21:59 UTC**
    on `0a35ddc`: `── 1/4 tests` **320 service pass, 0 fail** with the three new
    cases visible in the stream (`ok 318 - the org DO alarm drains a due job`,
    `ok 319 - the org DO alarm re-arms for the next pending job`, `ok 320 - the
    org DO alarm is quiet when nothing is due`), `── 3/4` `gemini approved`,
    and **`GATE: PASS`**. Fifteen further sequential `npm test` runs, recorded
    under item 2, were **339/339 green every time** (19 core + 320 service). The
    service count rose 317 → 320 with those three cases, which are the first
    tests in this repository that execute a line of `src/worker.ts` rather than
    reading it as text.
  - **`0a35ddc` is not the SHA that was reviewed, and that is fine — checked
    rather than waved past.** All five transcripts name the range
    `77efe6b..42198d6`. `git diff --stat 42198d6 0a35ddc` is **exactly the four
    failed transcripts and nothing else** (119 insertions across
    `reviews/20260831-1624*.md` and `…-162058-code-qwen.md`), so the tree gemini
    approved is the tree that merged, plus the record of who could not look.
  **Delivered for the repository when this was written, and now delivered to
  users too — superseded 2026-09-01 by measurement rather than edited away.**
  This entry said `booking.pumasi.ai` had not been deployed since 2026-08-30
  16:55:37 UTC and that every reminder, follow-up and webhook there was
  undelivered. **A deploy landed at 2026-09-01 00:40:44 UTC** and
  `git merge-base --is-ancestor 0a35ddc 2453adc` answers **yes**, checked here.
  The alarm import is on the build `booking.pumasi.ai` serves. It is the first
  time this repository has been able to write that sentence about anything.
  **One thing this seat did not establish and will not imply:** whether the
  alarm actually **re-armed** on the hosted Durable Object after the deploy.
  Answering that means booking against a real owner's page, which was not done.
  Shipping fixed code is not the same as the feature running, and that gap is
  named in item 1 as **carried, not confirmed**.
  **What the delivery did not close, recorded so the mark is not read as more
  than it is.** The last order warned that turning the compiler on "may surface
  further real errors whose repair is product work". **It did, and they were
  repaired in the same commit rather than deferred** — closing the ambient
  sixteen surfaced eleven now-unused suppressions (`TS2578`) and three
  `this.env` casts that now meet a real type. No behaviour moved anywhere; the
  diff to `worker.ts` is 30 lines, of which one is the import and the rest are
  deletions and cast widenings. The one thing left standing from that warning is
  the third of those three, which is item 8.

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
  **Listed as completed for the repository, and for a self-hoster who pulls —
  and, since 2026-09-01, serving on the deployment too.**
  `booking.pumasi.ai` was never affected, because it has Google Calendar
  configured. It is nonetheless now serving this build:
  `git merge-base --is-ancestor 3f2947c 2453adc` answers **yes**, checked here.
  The population this fixes deploys from this repository, so for them merged was
  always the delivery path.
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
  **Listed as completed for the repository, and for a self-hoster who pulls —
  and, since 2026-09-01, serving on the deployment too.**
  `git merge-base --is-ancestor 7ea730a 2453adc` answers **yes**, checked here,
  so this is no longer behind item 1. Unlike the Zoom leak, the population this
  fixes deploys from this repository, so for them merged was always the delivery
  path.
- **The Zoom PMI leak, in the code** — old item 1 parts (b) and (c), delivered
  in full charter flow: intent `8093dc7` (Q-010), frozen acceptance cases
  `40712d9`, build `16c3fd4`, cross-family code review `3d313d2`; release note
  pumasi `a3415ff`, veto window Q-011 closes 2026-09-07. Ten acceptance cases,
  two of them confirmed failing against the pre-fix tree. Part (a) — the
  connect state and `Connected ✓` — was already closed at `e9eb9fe`.
  **Listed as completed for the repository only when this was written, and now
  closed for the people it protects — superseded 2026-09-01 by measurement.**
  `git merge-base --is-ancestor 16c3fd4 2453adc` answers **yes**, and
  `booking.pumasi.ai` serves `2453adc` (`/version`, measured 05:11:40 UTC). A
  connected Zoom owner's personal meeting URL no longer prints to visitors of
  their booking page. **What is still not shipped is the *disclosure*, not the
  leak**: the served `/subprocessors` register names no Zoom row
  (re-measured 05:19 UTC), and `c000feb` — which adds it — is one of the three
  commits behind item 1.

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
