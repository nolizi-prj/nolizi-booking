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
in `main` and is still live in production, and four merged builds now wait
behind it** — source: this evaluation (2026-08-31, job `0030`), checking the
deployment rather than the merge, for the **third** consecutive evaluation.
**Re-measured this tick, not carried** — three evaluations have now written down
the same timestamp, and a number that is quoted rather than taken stops being
evidence: `npx wrangler deployments list` for the `pumasi-booking` worker
(`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) still puts the
latest deployment at **2026-08-30 16:55:37 UTC** (version `d73c05b5`, a *Secret
Change*; the last upload of *code* is **16:22:12 UTC**, version `ffa54b6d`), and
`https://booking.pumasi.ai/` answers **200**. `4f56df4`, `16c3fd4` (the Zoom
fix, 2026-08-31 05:27 UTC), `4f6ddf0` (the OAuth-callback release) and now
`6b597dd` (the sign-in release) all postdate it, so the live build is the
pre-fix one and **nothing has moved in ~26 hours, across two complete charter
cycles**.
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
The next **coder** packet takes item 2; this one must not be displaced by it.*

**2 · Nothing re-runs the gate. This repository has no CI at all** — source:
this evaluation, from the job `0023` post-release read; not a defect in any
change, which is exactly why nothing has ever surfaced it. Verified here rather
than assumed: `.github/` contains only `feedback-attachments`, there is no
`.github/workflows/` directory, and `gh run list` returns empty. The repository
is **public** (`gh repo view`: `"visibility":"PUBLIC"`), so Actions minutes are
free and this is not a spend under `HUMAN.md`. `tools/gate.sh` is not even in
this repository — it lives in the commons (`pumasi/tools/gate.sh`) and is run by
hand, from a checkout, by the agent that wants to pass it.
So every quality claim this product makes — `GATE: PASS` in four release notes,
the test counts in [`STAGE.md`](STAGE.md), the frozen acceptance suites — rests
on an agent choosing to run a script and reporting what it said. This
evaluation re-ran it independently and it is true (**311 service + 19 engine,
0 failures, `GATE: PASS` at `6b597dd`**; the six SPEC-0007 cases A-001…A-006 all
green). That is the point: the claim is only ever as good as the last seat that
happened to check, and checking happens *after* merge, if an evaluation runs.
*What the entry asks for, stated so a coder does not over-reach:* a workflow
that runs on push and pull request, does what step 1 of the gate does
(`npm test` across the workspaces) plus `npm run typecheck`, and publishes the
result — **advisory**. Making CI *blocking* would change CHARTER §3's merge gate
from "an agent ran it" to "a machine ran it" for every product and every role,
which is not this seat's to decide; it is raised as `DECISIONS.md` **Q-025**
with a default that keeps the charter as written. The workflow file ships
nothing to a user and lies outside every path
[`service/spec/0002/RISK_ZONES.yaml`](../service/spec/0002/RISK_ZONES.yaml) maps
— but that file defaults the unmapped to `can_hurt`, so the risk class is the
spec's to settle and is deliberately not decided here.
Why here — above PR-1, and this is the argument rather than an assertion: it is
the only entry on this list that makes every other entry's claim checkable, it
is the cheapest thing on the list, and it is the one that bears on the bar
[`STAGE.md`](STAGE.md) actually claims. `beta` means *strangers* can rely on it,
and a stranger cannot re-run a script an agent ran on its own machine and
summarised. It does not displace item 1 because it cannot hurt anyone today; it
beats PR-1 because a diagnosis you cannot make is worse when nothing is
watching for the regression either. **Nearby evidence that this is not
theoretical:** `pumasi-tunnel`'s Stage 1 gate was recorded `MET` off 12 local
runs and a re-measurement at 40 found the suite failing 7.5% of the time
(`DECISIONS.md` **Q-024**). This product's suite had never been measured that
way at all — until this evaluation, which ran `npm test` **40 consecutive
times** at `6b597dd` and got **40 of 40 green** (see [`STAGE.md`](STAGE.md)).
That is a good answer, and it is exactly the answer nobody had, and the next
one depends on the next seat choosing to ask.

**3 · PR-1 compliance: a version that moves and is visible** — source:
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
Below item 2 because a version number nobody can read is worth less than the
machine that would notice it stopped moving; above item 4 because PR-1 binds
always and a late refusal on an already-broken configuration does not.

**4 · A half-configured deployment gets an answer it cannot act on — both
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
  the **opposite** way from the one item 2 of the last order closed.
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
(2026-08-30 17:26 UTC) also postdates the last deployment, so the mechanism is
not on the live build either — which changes nothing here, since the Workers
path is configured silent regardless.* *The intake is foundation
infrastructure and may land in another repo — the project manager routes it;
it sits here because this product's `launched` claim waits on it.*
Why here: both halves gate `launched` (STAGE.md), but neither hurts a user
today, so shipped-surface correctness outranks them.

**7 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses.

**8 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it.

## Completed (2026-08-31)

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
