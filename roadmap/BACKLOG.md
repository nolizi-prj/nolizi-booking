# BACKLOG — what gets built next, in order

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 5).
First pass 2026-08-29, steward-directed.

One list, features and bugs together — a priority that cannot compare them is
not a priority. Every entry points at its source and carries one line of
why-here. **The top of this file is what the project manager's next coder
packet builds.** Reordering is a commit with the reasoning in the message; the
steward vetoes by reverting.

Context the ordering assumes: the feature-parity sequence in
[`0004-feature-parity.md` §3](0004-feature-parity.md) is substantially
**delivered** — engine, service, calendar truth (Google + Microsoft), limits,
recurrence, teams/round-robin, routing, polls, workflows/API, enterprise
identity, branding ([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md);
commit series `46abaf3`…`b0cb050`). What remains is mostly evidence, access,
and polish, and the list reflects that.

---

## The order

**1 · Zoom connect tells the truth, and the PMI stops leaking** — source:
steward's Zoom E2E test 2026-08-30 (`ecdd60b`), plus independent user
evidence the same day: [issue #26](https://github.com/pumasi-ai/pumasi-booking/issues/26)
(connect error) and [issue #30](https://github.com/pumasi-ai/pumasi-booking/issues/30)
(expected a Zoom login screen — appended to Q-007 as evidence). Re-verified
against the tree at `4f56df4`, 2026-08-30: (a) of the original entry is
mostly **fixed** — the integrations page now stores connect state and shows
`Connected ✓` with a disconnect button (`e9eb9fe`). Still live: **(b)** the
OAuth connect flow stamps the owner's *personal meeting URL* into every Zoom
schedule (`app.ts` zoom_connect handler), and the public booking page prints
it before anyone books — anyone who loads the page can join the PMI. **(c)**
the card promises "unique Zoom meeting rooms for every booked session," and
per-booking creation now exists (`createZoomMeeting` at booking time) but is
*bypassed whenever `location_value` is set* — which the connect flow always
sets. Fix: stop stamping the PMI (store the connection, mint per booking),
or say what it does; never print a joinable room to strangers pre-booking.
Why here: a persistent personal meeting room printed to anyone who loads a
public page is the only live defect that can hurt a user today, and it is
correctness of *shipped* surface — no new provider scope, so it does not run
ahead of Q-007's open window (closes 2026-09-01).

**2 · PR-1 compliance: a version that moves and is visible** — source:
[`PRODUCT-RULES.md` PR-1](https://github.com/pumasi-ai/pumasi/blob/worktree-product-rules/PRODUCT-RULES.md)
(v1.0, 2026-08-30; binds always). Checked at this evaluation, per that
file's own mechanism: the root `package.json` says `0.1.0` and has never
moved since the first service commit (`b8ee0ba`) — through public sign-up,
calendar sync, and the reporting path. No footer, about view, or `/version`
endpoint exposes it; feedback issues and release notes state no version; the
held report carries a commit hash but not the version. Fix: bump on release,
expose it (footer or `/version`), and carry it in feedback diagnostics,
reports, and release notes.
Why here: small, binds now not at a stage, and every bug report filed until
it lands is a request to guess.

**3 · Submit the Google OAuth app for verification** — source:
[`0002-calendar-integration.md` §4](0002-calendar-integration.md);
[`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)
("Not yet — deliberately").
Why here: calendar truth is the product's central promise and today only
nominated test accounts can connect; the blockers the setup doc waited on — a
deployed homepage and a live privacy URL — now exist. *Mostly operator/steward
action, not code; queue it in parallel, since it is calendar time, not work.*

**4 · The reporting intake, and the Workers-path decision** — source:
[`service/spec/0004/SPEC.md`](../service/spec/0004/SPEC.md) R5c;
[`DEBT.md` D-107](https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md)
(open half); surfaced by the job-0008 run (ops digest, 2026-08-30). The
mechanism shipped (`4f56df4`) but nothing receives reports — daily sends
fail and are dropped — and R5c forbids the intake to accept held reports
before its deletion path is implemented and tested. The Workers deployment
deliberately sends nothing; that decision is revisited no later than the
`launched` promotion (Q-008 default). *The intake is foundation
infrastructure and may land in another repo — the project manager routes it;
it sits here because this product's `launched` claim waits on it.*
Why here: both halves gate `launched` (STAGE.md), but neither hurts a user
today, so shipped-surface correctness outranks them.

**5 · A runtime subprocessor guard for the deployed mail path, or a recorded
why-not** — source: [`SUBPROCESSORS.md`](../SUBPROCESSORS.md), which names the
Workers path's control as weaker than the Node path's.
Why here: [`VALUE.md`](VALUE.md) C4 claims enforcement, and the deployed path
is the one real bookers' mail actually crosses.

**6 · O2 — secrets posture, completed** — source:
[`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md), the last
clause declared but not implemented.
Why here: small, and it closes the spec's only admitted gap; below the
user-facing items because no user can currently be hurt by it.

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
