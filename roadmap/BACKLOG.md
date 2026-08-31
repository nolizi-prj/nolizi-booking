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
in `main` and is still live in production, and two releases now wait behind it**
— source: this evaluation (2026-08-31, 15:30 tick), checking the deployment
rather than the merge, for the second consecutive evaluation. Re-verified this
tick, not inherited: `npx wrangler deployments list` for the `pumasi-booking`
worker (`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) still puts
the latest deployment at **2026-08-30 16:55:37 UTC** (a *Secret Change*; the
last upload of code is **16:22:12 UTC**), and `https://booking.pumasi.ai/`
answers **200**. Both `16c3fd4` (the Zoom fix, 2026-08-31 05:27 UTC) and
`4f6ddf0` (the OAuth-callback release) postdate it, so the live build is the
pre-fix one and **nothing has moved since the last evaluation said so**.
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
It is the same defect that topped the list at the last two evaluations; merging
closed it in the repository and not in the product, and this file ranks what
users meet, not what `main` contains. *Operator action, not a build — see
`DECISIONS.md` **Q-012**, which asks whose duty this is and names the coder as
its default. The next **coder** packet takes item 2; this one must not be
displaced by it.*

**2 · Two authentication entry points are gated on a *Google calendar hub*,
and one of them is gated on both paths** — source: the spec/0006 coder run
recorded one of these as "found, not fixed" (`service/spec/0006/SPEC.md` §5;
ops digest job `0012`; the release note's "Also found, not fixed here") and
handed the ranking here. **Ranked on this evaluation's own reading of the tree
at `4f6ddf0`, which found the handover half wrong and half incomplete:**
- **`/auth/microsoft/start` — Node path only.** `app.ts:998` reads
  `const hub = deps.calendars; if (!hub || !config.msClientId)` and answers
  *"Microsoft sign-in is not configured."*, while `deps.calendars` is built
  only when `googleClientId && googleClientSecret && tokenKey` are all set
  (`server.ts:114`, `worker.ts:244`). The login page shows the button on
  `Boolean(config.msClientId)` alone, so an operator with Microsoft
  credentials and no Google Calendar gets a visible button that denies its own
  configuration.
- **The handover's claim that `worker.ts` ~609 "has the same shape" is
  shape-true and effect-false, and correcting it matters.** At `efce7a4` that
  line read `if (!hub || !config.msClientId)` where `hub` was
  `config.tokenKey ? new CalendarHub({}, config.tokenKey) : undefined` — a
  *provider-less* hub, i.e. gated on `TOKEN_KEY` and never on Google Calendar.
  Since `4f6ddf0` it reads `if (!states || !config.msClientId)` (`worker.ts:613`).
  The Workers half was never broken and is now explicitly right; a coder taking
  this item must not "fix" it and call the item done.
- **`/login/sso/<orgId>` — both paths, and not previously recorded anywhere.**
  `app.ts:912` reads `if (!hub) return html(404, … 'SSO is not configured on
  this deployment.')` before reading the `org_sso` row. The Workers router does
  **not** handle this route: it forwards it into the Durable Object
  (`worker.ts:805`), which runs `handle()` with the same Google-gated
  `deps.calendars` (`worker.ts:244`, wired at `worker.ts:266`). So per-org OIDC SSO — the enterprise
  identity feature [`VALUE.md`](VALUE.md) C3 lists in the free tier — requires
  Google Calendar credentials on **every** deployment shape. This is the wider
  blast radius of the two and is the reason this item is ranked here rather
  than below PR-1.
The fix is the shape spec/0006 already established and reviewed:
`deps.calendars?.state ?? oauthState(config)`, because sealing a state needs
`TOKEN_KEY` and nothing else (`service/src/oauth-state.ts`). It is a
reachability change on authentication surface, so it is `can_hurt` and takes
the full charter flow — and its acceptance cases must assert that Google
sign-in, org OIDC and calendar connect each keep exactly the reachability they
have today, each still behind its own credential check.
Why here: it is correctness of already-shipped surface, like the item it
succeeds, but one class up — an authentication entry point rather than a
conferencing one. **No live user on `booking.pumasi.ai` is affected** (that
deployment has Google Calendar configured), which is why it does not displace
item 1; it costs exactly the self-hoster [`VALUE.md`](VALUE.md) §1 courts, and
it is a live counter-example to C5's "no host is load-bearing". Like item 1 it
adds no provider and no scope, so it does not run ahead of Q-007.

**3 · PR-1 compliance: a version that moves and is visible** — source:
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
(v1.0, 2026-08-30; binds always — read fresh this evaluation, and still only on
the unmerged `worktree-product-rules` branch, `0115758`; now raised as
`DECISIONS.md` **Q-017**). Re-checked this tick: the root, `core/` and
`service/` `package.json` all still say `0.1.0` and have never moved; there is
no footer, about view or `/version` route, and `https://booking.pumasi.ai/version`
returns **404** live; the release notes state no version.
Why here: it earned weight again, and in a sharper way than last time. The one
endpoint that exists to answer *which build is live* answers nothing:
`https://booking.pumasi.ai/healthz` returns
`{"status":"ok","commit":"unknown","sharded":true}` — `worker.ts:443` serves
`env['GIT_COMMIT'] ?? 'unknown'` and the deploy that would have set it
(`npx wrangler deploy --var GIT_COMMIT:…`) did not. Establishing item 1 again
required Cloudflare credentials and a `wrangler` call, exactly as it did
yesterday. A product that cannot tell its own evaluator what it is running is
the failure PR-1's "user-visible" and "in the diagnostics" clauses describe.
Below item 2 because a broken sign-in beats a hard diagnosis.

**4 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*

**5 · The reporting intake, and the Workers-path decision** — source:
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

**6 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses.

**7 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it.

## Completed (2026-08-31)

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
