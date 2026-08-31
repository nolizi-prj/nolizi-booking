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

**1 · Deploy the reviewed Zoom fix to `booking.pumasi.ai` — the leak is closed
in `main` and is still live in production** — source: this evaluation
(2026-08-31), checking the deployment rather than the merge. The code half of
the old item 1 is genuinely done and was re-verified here against the tree, not
taken on the coder's word: the connect callback stores a sealed connection and
writes nothing to `schedules` (`app.ts` ~1195), `locationText(schedule, …,
'public')` returns "link arrives with the confirmation" for every conferencing
kind (`schedules.ts` §Z2a), the `!schedule.location_value` suppressor is gone
from the booking path, and the only remaining `UPDATE schedules SET
location_value` writes are disconnect (to `NULL`) and a link the owner typed
themselves. 290 service + 19 engine tests and `GATE: PASS` re-run at `3d313d2`.
**But `wrangler deployments list` for the `pumasi-booking` worker
(`service/wrangler.jsonc`, custom domain `booking.pumasi.ai`) shows its most
recent deployment at 2026-08-30 16:55 UTC, and the fix commit `16c3fd4` is
2026-08-31 05:27 UTC.** The live build is the pre-fix one, so a personal
meeting room stamped by the old flow — the steward's own 2026-08-30 end-to-end
test connected Zoom against this deployment (`ecdd60b`, 16:13 UTC) — is still
being printed to anyone who loads that owner's booking page. Fix: deploy the
reviewed build, then re-check a real public page.
Why here: nothing else on this list can hurt a user today and this still can.
It is the same defect that topped the list yesterday; merging closed it in the
repository and not in the product, and this file ranks what users meet, not
what `main` contains. *Operator action, not a build — see `DECISIONS.md`
**Q-012**, which asks whose duty this is and names the coder as its default.
The next **coder** packet takes item 2; this one must not be displaced by it.*

**2 · `/oauth/*/callback` 404s without a calendar hub, and the dead branch it
creates builds an unsigned state** — source: found by the spec/0005 coder run
and deliberately not fixed under a frozen spec (ops digest job `0010`; release
note "Also found, not fixed here"). Confirmed here: the callback is gated by
`if (!hub) return html(404, …)` (`app.ts` ~999) *before* the `zoom` branch, so
on a deployment with no calendar integration configured the Zoom connect flow
can never complete — while `/oauth/zoom/authorize` and the integrations POST
happily start it. The same absent hub makes the connect handler fall back to
`Buffer.from(JSON.stringify({purpose, owner_id, tag})).toString('base64url')`
instead of `hub.sealState(…)`. That state is unreachable today, which is the
whole of its safety: **the two halves must be fixed together**, because
removing the 404 on its own would leave a callback that accepts an
attacker-chosen `owner_id` in an unsigned string.
Why here: [`VALUE.md` §1](VALUE.md) sells this to "the operator who wants to
run it themselves", and for the operator who wants conferencing without
surrendering a calendar it is a shipped button that cannot work at all. No live
user is hurt today (this deployment has a hub), which is why it sits below
item 1 — and it is correctness of already-shipped surface, so like item 1 it
does not run ahead of Q-007.

**3 · PR-1 compliance: a version that moves and is visible** — source:
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
(v1.0, 2026-08-30; binds always — read fresh this evaluation, and still only on
the unmerged `worktree-product-rules` branch, `0115758`). Re-checked: the root,
`core/` and `service/` `package.json` all still say `0.1.0` and have never
moved; there is no footer, about view or `/version` route in the code, and
`https://booking.pumasi.ai/version` returns 404 live; the release notes state
no version.
Why here: it earned weight this evaluation. Establishing item 1 — *which build
is actually serving users* — was not possible from the repository, the live
site, or the release note, and took Cloudflare API credentials to answer. A
product whose own evaluation cannot tell what is deployed without querying its
host is exactly the failure PR-1's "user-visible" and "in the diagnostics"
clauses describe. Below item 2 because a broken button beats a hard diagnosis.

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
