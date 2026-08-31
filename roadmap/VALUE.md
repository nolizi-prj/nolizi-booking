# VALUE — who this is for, and why they would choose it

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 2).
First pass 2026-08-29, steward-directed. Kept current with releases — a value
proposition that lags the product is the drift this project keeps paying for
([L-007](https://github.com/pumasi-ai/governance/blob/main/lessons/L-007-restating-a-rule-forks-it.md)).

**Every claim here carries what would falsify it.** A claim without a falsifier
is marketing; this file is evidence.

---

## 1 · Who it is for

**The person who sends a link.** Anyone whose week fills by email ping-pong —
"does Tuesday work? no? Thursday?" — and who wants a page a stranger can open,
see real free times, and book. Today they use Calendly or Cal.com, or they use
nothing and pay in email.

**The team that resents per-seat pricing.** Round-robin, routing forms, and SSO
are $12–28 per user per month or an enterprise contract everywhere else in the
category ([`MARKET.md` §1–2](MARKET.md)). A ten-person team pays a four-figure
annual bill for scheduling. Here those features are in the one free tier, and
the commercialization foundations forbid ever moving them out of it.

**The builder who needs a permissive licence.** Someone embedding scheduling in
their own product, redistributing it commercially, or composing it into a
larger agent-built system. Every maintained alternative is AGPL/GPL or
proprietary ([`core/spec/DUPLICATION.md` §3](../core/spec/DUPLICATION.md)); for
this person the incumbents are not expensive, they are *unavailable*. This is
the narrow gap the duplication finding authorized the build on.

**The operator who wants to run it themselves.** A port, and optionally a
PostgreSQL URL. No provider is load-bearing; self-hosting is first-class
forever, by permanent commitment, not by current pricing.

## 2 · The pain

Scheduling software is bought again and again because the good open answer is
copyleft, the polished answers meter by the seat, and the features that make it
work for a team are exactly the ones held behind the paywall. And it is
software whose failures land on people who never chose it: the booker whose
2:00 slot was double-sold, whose details went somewhere undisclosed, whose
meeting fell into a daylight-saving hole.

## 3 · The claims, and what would falsify each

**C1 — A stranger can book a real time, unattended, and the time is really
free.** Sign-up, availability, a public page, confirmation mail to both
parties, cancel and reschedule from links in that mail. Connected Google or
Microsoft 365 calendars are read for busy times before a slot is offered *and
again at the moment of booking*, and the page **fails closed** — while a
connected calendar is unreachable it refuses to offer times rather than book
over the owner ([`service/spec/0003/INTENT.md`](../service/spec/0003/INTENT.md);
README, "The one thing to know").
*Today's honest limit:* the Google OAuth app has not been submitted for
verification, so strangers cannot yet connect a Google calendar — only
nominated test accounts can ([`service/spec/0003/GOOGLE-SETUP.md`](../service/spec/0003/GOOGLE-SETUP.md)).
Until that clears, this claim holds in full only for test users.
*Falsified by:* one production double-booking against a connected calendar; a
booking confirmed while the connection was down; the verification limit still
standing when this file next claims "for strangers."

**C2 — Correct at the boundaries this category gets wrong.** Exclusivity is
held by database exclusion constraints, not application code, proven against
real PostgreSQL with genuinely parallel connections — 90 contended rounds where
exactly one caller may win ([`service/spec/0002/SPEC.md` §4.2, §8.1](../service/spec/0002/SPEC.md)).
The engine treats the clock as an argument, so identical inputs give
byte-identical output, including across spring-forward windows, nonexistent
local times, and zones that skip a calendar day
([`core/ENGINE.md`](../core/ENGINE.md); 36 language-neutral acceptance cases).
*Falsified by:* an acceptance case failing on a second environment; any
confirmed booking outside a fresh engine computation.

**C3 — The incumbents' paid tiers are our free tier, and that can never be
reversed.** Teams and round-robin, routing forms, meeting polls, workflows,
webhooks and a public API, per-org OIDC SSO with SCIM and audit, recurrence,
booking limits, custom questions, branding, analytics — built, tested, and in
the single free self-hostable product (commit series `e688e8b`…`b0cb050`,
`4fe29ac`, `2373f66`, `3bfcac7`, `e55b5ba`; 248 service + 19 engine tests and
the sharded E2E suite green on 2026-08-29). The commercialization foundations
(§7) forbid open-core, dual licensing, licence switches, and hosted-exclusive
features — in writing, in advance.
*The limit this file carried on 2026-08-31 is closed in `main`, and is recorded
as closed rather than deleted.* Until `6b597dd`, on a self-hosted copy, **per-org
OIDC SSO was unreachable without Google Calendar credentials** —
`/login/sso/<orgId>` answered "SSO is not configured on this deployment."
because it was gated on the calendar hub, on **both** the Node and the Workers
path; Microsoft sign-in had the same gate on the Node path. Both doors now gate
on being able to seal a sign-in ticket, which needs `TOKEN_KEY` and nothing else
(`service/src/app.ts:922`, `app.ts:1017`; spec/0007, Q-023), each keeping its
own credential check. Verified against the tree at this evaluation, not read off
the release note. **For the operator this file courts, the merge is the
delivery, once they pull** — and it has not reached `booking.pumasi.ai`, which
was never affected because that deployment has Google Calendar configured
([`BACKLOG.md`](BACKLOG.md) item 1).
*A second limit, found 2026-08-31 (job `0044`), **repaired in `main` the same
day, and still live in production at this evaluation.** Recorded as moved
rather than rewritten, because both halves of that sentence are the claim.*
Two of the features listed above — **workflows and webhooks** — have never been
delivered on `booking.pumasi.ai`. `service/src/worker.ts:303` called
`processDueJobs` without importing it, so the Durable Object alarm that drains
due jobs threw `ReferenceError` on the hosted build and died before it re-armed:
timed workflow mail (reminders, follow-ups) and every webhook were silently
never delivered there, from `de4abbe` (2026-08-28) onward.
**Repaired at `0a35ddc`** in full charter flow (gemini `VERDICT: APPROVE`,
`GATE: PASS`, release note `pumasi` `0f574f6`, **Q-029** open to 2026-09-07),
and verified by this seat rather than read off the release note: the import is
at `worker.ts:44`, the call at `:303`, `npm run typecheck` covers `src/worker.ts`
for the first time and exits 0, and three cases in
`service/test/worker-alarm.test.ts` execute `alarm()` and assert that a due job
drains, a not-yet-due job is left alone, and the next alarm is armed.
**And it has not reached anyone.** `booking.pumasi.ai` was last deployed
2026-08-30 16:55:37 UTC, re-measured by this seat at 2026-08-31 21:58 UTC. A
stranger who sets a reminder there today still gets silence, exactly as they did
before the repair existed. It is **not** a limit of the free tier, of the
licence, or of the design: both features are built, tested, and work on the Node
path a self-hoster runs. It is one unimported symbol in the file nothing
type-checked, now fixed, in the sixth merged build waiting on
`DECISIONS.md` **Q-012** ([`BACKLOG.md`](BACKLOG.md) item 1).
*Falsified by:* any listed feature failing its E2E path for a real user; any
feature appearing in a paid or hosted-only tier, ever. **The second clause has
not fired and will not — nothing here is behind a tier.**
**On the first clause, asked again this pass rather than inherited, because the
repair changes what the question is.** Still **not counted as fired**, and the
reasoning is deliberately *unchanged* by `0a35ddc` — which is the honest answer
and not the comfortable one. The falsifier turns on a **real user**, and no real
user is known to have hit either limit: both were found by reading, the tracker
has held zero open issues for more than 31 hours with the feedback widget live,
and no workflow run against the live deployment has been reported or observed.
That was true before the repair and it is true after it.
**What the repair explicitly does *not* do is un-fire it.** Merging changes
`main`; the falsifier is about a user's E2E path, and that path still runs on a
build from 2026-08-30. If this claim were counted as repaired because the fix is
merged, this file would be asserting about the branch what it promises about the
product — which is precisely the drift it exists to prevent. So the limit stays
listed, in the present tense, until a deploy moves it.
The distinction is the point: the workflow defect is real on the deployment
today whether or not anyone has met it, and "nobody has noticed" is a statement
about observers, not about the product. **If a user reports either, this claim
is rewritten, not softened.**

**C4 — The privacy posture is enforced, not asserted.** The notice, terms and
DPA are served by the running service, state operator, basis, deletion reach
and subprocessors, and are **tested against the product**: a test extracts
every field the live booking form posts and fails unless the notice discloses
it (`8f77d66`). *Scope of that word, tightened 2026-08-31 and re-measured at
each evaluation since:* the test binds the code in `main`, and `main` is not
automatically what `booking.pumasi.ai` is serving — the deployment has now been
found unmoved at **2026-08-30 16:55:37 UTC** by five consecutive evaluations —
**29 h 03 m** and **six** merged builds behind, re-measured by this seat at
2026-08-31 21:58 UTC rather than carried ([`STAGE.md`](STAGE.md), "the deployed
build is not `main`"). *The second limit on that word, named 2026-08-31 and
narrowed the same evening:* that test is now re-run automatically on every push
and pull request by advisory CI (`d5a02bb`, Q-026), in public, so "tested
against the product" no longer means "tested by whichever agent last chose to
run the suite". What it still means is *against the branch* — CI checks `main`,
and `main` is not what the deployment serves. *Strengthened this pass in one
respect worth recording inside the Q-026 window:* since `0a35ddc` that
workflow's `npm run typecheck` step reaches `src/worker.ts`, the deployed entry
point, for the first time — without `.github/workflows/` being edited, because
the check derives its work from the tree. The
enforcement is real; "against the product" means against the branch the
product is built from, until a merged build reliably reaches users. Mail through an undisclosed host is refused on the Node path;
the deployed Workers path has a weaker, disclosed control
([`SUBPROCESSORS.md`](../SUBPROCESSORS.md)). Deletion is verified by absence
across every table.
*Falsified by:* personal data reaching a party not on `/subprocessors`; a form
field the notice does not cover; a deletion that leaves identity behind.

**C5 — It runs anywhere, and no host is load-bearing.** A port, optionally a
PostgreSQL URL; or Cloudflare Workers on Durable-Object SQLite, which is what
serves booking.pumasi.ai. Nothing in the code knows about a particular
provider — `P12`, plus the self-hosting-first-class commitment.
*Moved by the 2026-08-31 OAuth-callback release, in the right direction:* until
`4f6ddf0`, connecting **Zoom** required **Google Calendar** credentials to be
configured — the OAuth callback 404'd on the absent calendar hub before it read
what kind of connection was arriving. One provider was load-bearing for an
unrelated one. That is fixed in `main`: the gate is now the ability to open a
sealed state, which needs `TOKEN_KEY` and nothing else
(`service/src/oauth-state.ts`; spec/0006, Q-015). For self-hosters — the people
the claim is about — the merge is the delivery, once they pull.
*Moved again, and further, by the 2026-08-31 sign-in release (`6b597dd`,
spec/0007, Q-023):* the last two gates of this shape are gone. Microsoft
sign-in (Node path) and per-org OIDC SSO (**both** paths) no longer require
Google Calendar credentials. Three provider-on-provider gates have now been
found and closed in two days — Zoom connect, then these two — which is the count
going down, and this file says so instead of implying it was always clean.
*What remains, stated rather than allowed to accumulate quietly:* the divergence
now points the other way, and only on one build. `worker.ts:596` opens
`/auth/google/start` on `googleClientId` **without** `googleClientSecret`, where
the Node path effectively requires both (`app.ts:984`–`986`, via the hub), so a
Workers deployment with an id and no secret is sent to Google and refused on the
way back rather than at the button. No provider is required that was not
required before, and nothing is unguarded — it is a late refusal, not a lost
feature. [`BACKLOG.md`](BACKLOG.md) item 3 — both line references
re-verified against the tree at `0a35ddc` by this evaluation, since that commit
touched `worker.ts`: `worker.ts:596` is unchanged and the Node-path guard is at
`app.ts:985`.
*Falsified by:* a change that makes any single provider required to run or to
leave. **Not fired:** nothing here was introduced by a change, no provider is
required to *run* the product or to leave it, and the two releases of
2026-08-31 took the count of these gates from three to zero. What is left is
listed above rather than allowed to accumulate quietly, and it is a different
defect — a refusal that arrives late, not a provider that is load-bearing.

**C6 — It is the only maintained permissively-licensed product in the
category.** Apache-2.0, inbound equals outbound; no CLA grants anyone
relicensing power ([`DUPLICATION.md` §3](../core/spec/DUPLICATION.md), surveyed
2026-07-28).
*Falsified by:* a maintained Apache/MIT/BSD scheduler appearing — in which case
[`DUPLICATION.md` §5.4](../core/spec/DUPLICATION.md) makes this product a
deprecation candidate, and this file must say so rather than compete with it.

## 4 · What we do not claim

- **That most individuals should switch.** For anyone who does not need a
  permissive licence, Cal.com remains the better choice today
  ([`core/spec/ALTERNATIVES.md`](../core/spec/ALTERNATIVES.md)) — more mature,
  mobile apps, 100+ integrations, payments, compliance certifications
  ([`MARKET.md` §1](MARKET.md)).
- **Payments and AI scheduling** — off the roadmap by steward decision,
  2026-08-01, recorded in [`roadmap/0004-feature-parity.md` §3](0004-feature-parity.md);
  not to return by accretion.
- **A reviewed legal posture.** The lawful basis is written and in force; no
  lawyer has reviewed it, and no standard contractual clauses cover the
  US transfer ([`DEBT.md` D-105](https://github.com/pumasi-ai/governance/blob/main/governance/DEBT.md)).
- **Evidence beyond one machine — and, named 2026-08-31, beyond one
  *observer*.** The conformance-reporting *mechanism* now exists (spec/0004,
  released 2026-08-30: signed opt-in conformance reports, one-step
  `PUMASI_REPORTING=false` opt-out) — but nothing receives reports yet, and the
  deployed Workers path deliberately sends nothing. The test matrix is still one
  machine wide, and this file says so rather than implying a fleet. (D-108
  closed 2026-08-30 by the §5.1 amendment; the works-for-strangers claim still
  cannot be made on one machine.) **The re-run half is now a system rather than
  a check:** advisory CI runs the suites and the type-check on every push and
  pull request in public (`d5a02bb`, Q-026, verified at this evaluation). This
  seat also re-ran the gate by hand at `0a35ddc` (**320 service + 19 engine, 0
  failures, `GATE: PASS`** at 2026-08-31 21:59 UTC), plus 15 further sequential
  `npm test` runs, all green. *Closed since the last pass:* what neither covered
  was the deployed entry point, whose types nothing checked and which no test
  executed — a gap that held a live defect for three days. `npm run typecheck`
  now reaches `src/worker.ts` and three tests execute its alarm (`0a35ddc`,
  verified here). *Named in its place, and it is smaller:* the router's bindings
  are still untyped, bridged by three casts widened through `unknown`
  ([`BACKLOG.md`](BACKLOG.md) item 8).
- **Review breadth, named 2026-08-31 (evening).** This product's most recent
  merge was reviewed by **one** cross-family reviewer, which meets CHARTER §4's
  bar and is less breadth than the five that were driven: three failed in their
  driver before any model saw the diff (an argv size limit) and one returned
  HTTP 402. The transcripts are committed and named in
  [`STAGE.md`](STAGE.md). This file does not claim breadth it did not get.

## 5 · Keeping this honest

Each release evaluation (duty 4) checks whether the release moved a claim
here. A claim whose falsifier has fired is removed or rewritten in the same
commit that records the firing — never softened in place.
