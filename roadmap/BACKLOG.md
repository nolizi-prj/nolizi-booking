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

**The highest *build* entry today is item 2** — PR-1 compliance: a version that
moves and is visible. Items 2 and 3 of the previous order (the alarm's missing
import, and the tsconfig that makes the deployed entry point checkable) were
**delivered at `0a35ddc`** and are struck from the order into Completed below,
verified at this evaluation rather than read off the commit. Item 1 still
outranks everything and is still operator action blocked on `DECISIONS.md`
**Q-012**, so **the next coder packet takes item 2**. Stated here in as many
words, as the previous order stated it, because this file should not need
reading twice to answer the one question it exists to answer.

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
in `main` and still dead in production, and six merged builds now wait behind
it** — source: this evaluation (2026-08-31, job `0052`), checking the deployment
rather than the merge, for the **fifth** consecutive evaluation.
**Re-measured this tick by this seat, not carried, and the packet was right to
insist:** four evaluations had written down the same timestamp, and a number
that is quoted rather than taken stops being evidence. Run here at **2026-08-31
21:58 UTC**, `npx wrangler deployments list` for the `pumasi-booking` worker
(`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) puts the newest
deployment at **2026-08-30 16:55:37.479 UTC** — version
`d73c05b5-81b6-41a4-933a-4a94acbaa45a`, `Source: Secret Change`, author
`atxapplellc@gmail.com`, no tag and no message. Curled at the same minute:
`https://booking.pumasi.ai/` → **200**, `/healthz` →
`{"status":"ok","commit":"unknown","sharded":true}`, `/version` → **404**.
`4f56df4`, `16c3fd4` (the Zoom fix), `4f6ddf0`, `6b597dd`, `d5a02bb` and now
**`0a35ddc`** all postdate it, so the live build is the pre-fix one and
**nothing has moved in 29 h 03 m**.
**What changed about this entry's cost, and it is a change in kind rather than
in count.** Job `0049`'s handover put it in words this seat re-measured and
agrees with: *"Every previous entry behind Q-012 was a defect that merging at
least stopped making worse. This one is a delivery that does not happen, and it
will not start happening until someone runs a deploy."* Every earlier build
queued here was either a leak that merging stopped growing (Zoom) or a fix whose
affected population self-hosts and gets the merge as its delivery (the OAuth
callback, the two sign-in doors). `0a35ddc` is neither. Reminders, follow-ups
and every webhook on `booking.pumasi.ai` have been undelivered since `de4abbe`
(2026-08-28); the repair is merged, gate-passed, released and reviewed, and not
one of those things sends a single reminder. The wait is no longer a delay in
closing a defect — it *is* the defect, for as long as it lasts.
**Recorded against `DECISIONS.md` Q-012 as evidence and nothing more.** Job
`0049` added an evidence row there and did not touch the date or the default;
this seat adds nothing to that file — `pumasi` had a live writer throughout this
pass (`.lock_pumasi` BUSY, verified with `./dispatch.sh --locks`) and this
packet confined this seat's writes to this repository and the ops digest. The
measurement above is the evidence, it is recorded here and in
[`STAGE.md`](STAGE.md), and the digest entry names Q-012 so the steward can find
it. **Nothing here closes, extends, softens or dates that window.**
Deploying does close the Zoom half even for rows the old flow already stamped,
which was checked rather than assumed and re-checked here:
`locationText(schedule, …, 'public')` returns
`"<venue> — link arrives with the confirmation"` for every conferencing kind
*before* it ever consults `schedule.location_value` (`schedules.ts:371`), so a
stale PMI in the column stops printing the moment the new build serves.
**What could not be confirmed from outside, and is not claimed:** no public
booking-page slug for the affected owner is recorded anywhere in these
repositories, and this seat will not guess at one; and no workflow was exercised
against the live deployment, which would mean booking against a real owner's
page. The liveness of both defects rests on the deployment measurement, the
source and the emitted bundle — not on a page this evaluation loaded.
Why here: nothing else on this list can hurt a user today and two things on the
deployment still can. It is the same entry that topped the list at the last four
evaluations; merging closed both defects in the repository and neither in the
product, and this file ranks what users meet, not what `main` contains.
*Operator action, not a build — see `DECISIONS.md` **Q-012**, which asks whose
duty this is and names the coder as its default. It keeps rank 1 rather than
being demoted for being unbuildable. The next **coder** packet takes item 2;
this entry must not be displaced by it.*

**2 · PR-1 compliance: a version that moves and is visible — the highest
*build* entry on this list, and what the next coder packet takes** — source:
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
(v1.0, 2026-08-30; binds always). **Read fresh this evaluation and still only on
the unmerged `worktree-product-rules` branch** (`0115758`): `pumasi` was at
**`133d337`** while this pass ran, and `git ls-tree -r --name-only main | grep
PRODUCT-RULES` is empty there, as it is on every remote branch but that one.
That is the **fifth** consecutive evaluation to find it so, it is
`DECISIONS.md` **Q-017**, open, and **its absence from `main` is not
compliance** — the rule is read and ranked against, from the branch, exactly as
the role file requires.
Re-checked this tick, by running the checks rather than repeating them: the
root, `core/` and `service/` `package.json` all still say **`0.1.0`** and have
never moved; there is no footer, about view or `/version` route, and
`https://booking.pumasi.ai/version` returns **404** live (21:58 UTC).
`https://booking.pumasi.ai/healthz` returns
`{"status":"ok","commit":"unknown","sharded":true}` — `worker.ts:443` serves
`env['GIT_COMMIT'] ?? 'unknown'` and the deploy that would have set it
(`npx wrangler deploy --var GIT_COMMIT:…`) did not.
**New this pass, and it is why this entry is now the one a coder takes.** The
2026-08-31 alarm release note repeats the shape the sign-in note introduced: a
section headed *"Which build this is"* that says outright PR-1's version clause
cannot be met by this product and gives the commit `0a35ddc` instead (`pumasi`
`0f574f6`). Two consecutive release notes have now had to name a rule they
cannot satisfy. That is correct conduct by the releases and it is precisely the
shape duty 4 says becomes a backlog entry citing the rule.
**The measured, recurring cost, stated once so it is not re-derived a sixth
time.** Establishing which build is live has now required Cloudflare API
credentials and a `wrangler` call at **five consecutive evaluations**. A product
that cannot tell its own evaluator what it is running is the failure PR-1's
"user-visible" and "in the diagnostics" clauses describe, and it is the reason
item 1 needs an API round trip to be answered at all.
**Split honestly, because half of it is not buildable.** The buildable half is
a single version source of truth that moves with releases, surfaced where a user
can see it and in `/healthz`; the `GIT_COMMIT` half cannot be closed by any
commit, because that value is set *at deploy time* and this product has not been
deployed since 2026-08-30. A coder packet closes the first half and leaves the
second recorded against item 1, rather than reporting PR-1 met when the endpoint
still says `unknown`.
Why here: it is the highest entry on this list that a coder can actually build,
it binds always rather than at a promotion, and it has been carried for five
evaluations. Above item 3 because a rule that binds always outranks a late
refusal on an already-broken configuration; below item 1 for the reason item 1
is item 1.

**3 · A half-configured deployment gets an answer it cannot act on — both
refusals, on both builds** — source: the job `0023` run recorded both halves as
found-not-fixed (`service/spec/0007/SPEC.md` §5) and handed the ranking here.
**Line references re-verified against the tree at `0a35ddc` this pass, because
`0a35ddc` touched `worker.ts` and a stale number is how a finding stops being
evidence:**
- **(b) `worker.ts:596` opens `/auth/google/start` on `config.googleClientId`
  alone.** *Still exactly 596*: `grep -n "if (!states || !config.googleClientId)"
  service/src/worker.ts` → `596`. The Node-path guard is at **`app.ts:985`**
  (`grep -n "!hub || !config.googleClientId" service/src/app.ts`), inside the
  `984`–`986` block this file has cited since the last pass, and since
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
both Google credentials. Below PR-1 because nothing here is unguarded — on a
deployment with no `googleClientSecret`, Google sign-in cannot complete on
either build, and (b) only decides whether the refusal arrives before or after a
round trip.

**4 · The service suite latches red: one contention failure leaves a data
directory behind, and every later run of that file fails on it** — source: job
`0034` handed this on itself and declined to rank it; the mechanism was
established by measurement at the last evaluation and is **re-tested here at a
load regime that pins down what does *not* cause it.**
Measured at `0a35ddc` by this evaluation: `/tmp` was clean at the start of the
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

**5 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*

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
today, so shipped-surface correctness outranks them.

**7 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses — which puts a user on the other
end of it, and is why it outranks item 8 despite both being invisible today.

**8 · `worker.ts` models its environment as a string bag, and the generated
`Env` could type the bindings** — source: job `0049` handed this on itself at
`priority: medium` and deliberately did not do it in that packet. *"Medium" in a
coder's return block is that coder's read; this is the ranking, and it is made
on this seat's own measurement rather than on the handover.*
**What is actually there, re-measured at `0a35ddc`.**
`npx wrangler types` now generates `service/worker-configuration.d.ts` (588612
bytes, tracked, hash `03c0fafc…`, workerd `1.20260828.1`), whose
`__BaseEnv_Env` types `PUMASI` and `DIRECTORY` as
`DurableObjectNamespace<import("./src/worker").PumasiService>` and
`…PumasiDirectory`, and the three `wrangler.jsonc` vars as string *literals*.
`worker.ts:79` keeps its own `type WorkerEnv = Record<string, string |
undefined> & { PUMASI: DoNamespace; DIRECTORY: DoNamespace }` over the
hand-written `interface DoNamespace` at `worker.ts:68`, and **three casts are
widened through `unknown`** to bridge them — `worker.ts:119`, `:187`, `:296`
(`grep -n "as unknown as WorkerEnv" service/src/worker.ts`). Three further
sites pass `env as never` into `loadConfig`, whose parameter is
`NodeJS.ProcessEnv` (`config.ts:82`).
**The cost was measured, not estimated, and it is in two halves that are very
different sizes.** This seat copied `service/` to a scratch tree outside the
repository (no product code was written here), replaced the declaration with
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
**Why it ranks here, at 8 of 9, and what would move it.** No live user
consequence was found, and this seat looked for one rather than assuming its
absence: every failure mode the missing typing permits — a renamed binding, a
new non-string binding read as a string, a typo'd name — fails **loudly and on
the first request**, because both bindings are on the org-routing path that
every request crosses. That is the opposite of the defect this net was built
for: item 2 of the previous order was silent for three days precisely because
nothing throws when a timer dies. This file's rule is that a finding with no
live user consequence does not belong near the top, and it holds here even
though the file in question is the deployed router. It ranks **above** item 9
because the cheap half is one proven line and it hardens the entry point that
just cost this product three days of a dead feature, where item 9 closes a spec
clause with no demonstrated hole. It ranks **below** item 7 because item 7 has a
real booker's mail on the other end of it. **What moves it up:** a demonstrated
*silent* failure mode, or a second binding being added — the risk here is
proportional to how often `wrangler.jsonc`'s binding list changes, and it has
not changed since the shard migration.

**9 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it, and below item 8
because item 8's cheap half is measured and this one's is not.

---

**Not ordered here, deliberately, and it is not an omission.** Three of the five
cross-family reviewers of `0a35ddc` never reached a model, and this repository
now holds four transcripts that look like reviews and are execution failures
(`reviews/20260831-1624*.md`, plus `…-code-qwen.md`). The repair is in
`pumasi/tools/review.sh` and `pumasi-ops/tools/recruit.sh`, neither of which is
this product's code, so it is not this file's to rank — it is recorded as
evidence in [`STAGE.md`](STAGE.md), where a claim about how this product's
reviews are obtained belongs, and handed on in this evaluation's digest entry.

## Completed (2026-08-31)

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
    under item 4, were **339/339 green every time** (19 core + 320 service). The
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
