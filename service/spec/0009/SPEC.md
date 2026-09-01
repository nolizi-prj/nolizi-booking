# SPEC-0009 — a half-configured deployment is told what is missing, at the button, on both builds

**Status:** for cross-family spec review · **Intent:** [`INTENT.md`](INTENT.md)
(veto window: `pumasi/DECISIONS.md` Q-040) ·
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), frozen at
spec-review approval, before implementation ·
**Runner:** `service/test/auth-refusals.test.ts` (R-001..R-007)
**Source:** `roadmap/BACKLOG.md` item 2 at `7c511a4`; the two bullets of
[`../0007/SPEC.md` §5](../0007/SPEC.md) *Found, not fixed here*, recorded by
job `0023` and ranked by the product manager since 2026-09-01.
**Written at:** `7c511a4`. Job `0104`.

**Risk class: can-hurt.** `service/spec/0002/RISK_ZONES.yaml` maps everything
outside `README.md`, `INTENT.md` and `acceptance/` to `can_hurt`; this is
user-visible copy on the authentication surface, on the Node path and the
Workers router at once (L-009). Release goes through a published note and the
7-day window (CHARTER Part 4), opened at the start of the run.

**Scope.** Wording and timing of refusals that already exist. No provider is
added, no OAuth scope is enlarged, no check is relaxed, and a fully configured
deployment behaves byte-for-byte as it does today.

---

## 0 · The defect, at line numbers

Both coordinates re-taken at `7c511a4` by this job; neither moved since the
product manager last took them at `7e41d36`:

- **(a)** `app.ts:1025` (`/auth/microsoft/start`), `app.ts:930`
  (`/login/sso/<orgId>`) and `worker.ts:628` (`/auth/microsoft/start`) refuse
  with *"Microsoft sign-in is not configured."* / *"SSO is not configured on
  this deployment."* whether the Microsoft app is missing **or** `TOKEN_KEY`
  is. An operator who set the app and forgot the key cannot act on the
  answer. `worker.ts:645`'s callback refusal for the same missing key is the
  two-word *"Not configured."*, where `app.ts:1083` names `TOKEN_KEY`.
- **(b)** `worker.ts:610` — `if (!states || !config.googleClientId)` — opens
  `/auth/google/start` on the client id alone. `app.ts:992` —
  `if (!hub || !config.googleClientId)` — effectively requires the secret too,
  because `deps.calendars` is built only when id, secret and `TOKEN_KEY` are
  all set (`server.ts:113`–`115`, `worker.ts:245`). A Workers deployment
  holding an id and no secret is redirected to Google and refused at
  `worker.ts:651` on the way back. The Microsoft door has the same shape on
  **both** builds (`app.ts:1025`, `worker.ts:628`: id alone; the secret is
  first required at `app.ts:1153` / `worker.ts:735`).

Nothing is unguarded either way. On a deployment with no secret, sign-in
cannot complete on either build; (b) decides whether the refusal arrives
before or after a round trip. **No live user is affected:** `booking.pumasi.ai`
holds both Google credentials and a `TOKEN_KEY`, and at `2453adc` (the
deployed build, `curl https://booking.pumasi.ai/version` at this job) it
renders none of the sentences this spec changes.

## 1 · One sentence, one implementation, both builds (S1)

**S1a.** A new exported function in `service/src/config.ts`:

```ts
export type SignInDoor = 'google' | 'microsoft';
export function signInRefusal(config: Config, door: SignInDoor, canSeal: boolean): string | undefined;
export function sealRefusal(what: string): string;
```

`signInRefusal` returns the sentence the person at the button reads, or
`undefined` when the door may open. `canSeal` is passed rather than read from
`config.tokenKey` because on the Node path a `CalendarHub` may seal under a key
that never came from the environment (SPEC-0007 S1b); the caller knows whether
it holds a sealer, the helper does not.

**S1b. The sentences, exhaustively:**

| Deployment | Sentence |
|---|---|
| no client id for the door | `Google sign-in is not configured.` / `Microsoft sign-in is not configured.` — **unchanged** |
| client id present, secret missing | `Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET is not configured.` (Microsoft: `MS_OAUTH_CLIENT_SECRET`) |
| client id and secret present, cannot seal | `Google sign-in cannot start on this deployment: TOKEN_KEY is not configured.` |
| client id present, secret missing, cannot seal | `Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET and TOKEN_KEY are not configured.` |
| everything present | `undefined` — the redirect happens |

`sealRefusal('SSO')` is `SSO cannot start on this deployment: TOKEN_KEY is
not configured.` — the org-SSO door has no credentials of its own at the
deployment level (they live on the `org_sso` row), so `TOKEN_KEY` is the only
thing it can lack.

**S1c. The order of the variables is the order the deployment needs them** —
the secret before the key — and the missing ones are named together in one
sentence rather than one per attempt, so an operator missing two is not sent
back twice.

**S1d. A sentence names variables and never values.** The helper receives
`config` and returns a string that contains none of `config.googleClientId`,
`config.googleClientSecret`, `config.msClientId`, `config.msClientSecret` or
`config.tokenKey`; every refusal case asserts that the rendered page body
contains none of the deployment's configured values.

**S1e. The "not configured" sentence is kept for the door with no client id
at all** because that is a door the login page does not show (`app.ts:857`,
`worker.ts:440` show a button on the client id alone), so it is reached only
by a hand-built request, and naming the id variable there would answer a
stranger's probe with the name of a secret's sibling for no operator's
benefit.

## 2 · Both doors, both builds, refuse at the button (S2)

**S2a. `app.ts` `/auth/google/start`:** the guard becomes
`const states = deps.calendars?.state ?? oauthState(config)` followed by
`signInRefusal(config, 'google', Boolean(states))`, and the state is sealed
with `states.seal(...)` — the hub's own sealer where there is one, exactly as
the Microsoft door already does (SPEC-0007 S1b, S2b). Reachability when fully
configured is identical: a hub exists precisely when all three are set.

**S2b. `worker.ts` `/auth/google/start`:** the same helper with
`Boolean(states)`. A deployment with an id and no secret is now refused at the
button with the secret named, instead of being sent to Google. **This edits
the line SPEC-0007 S4d froze** — see §5.

**S2c. `/auth/microsoft/start` on both builds:** the same helper. The
Microsoft door now also requires `MS_OAUTH_CLIENT_SECRET` at the button
(INTENT question 2): the secret was already required at the callback
(`app.ts:1153`, `worker.ts:735`), so no deployment that could complete a
sign-in is refused that was not refused before; the refusal moves from after
the round trip to before it.

**S2d. `app.ts` `/login/sso/<orgId>`:** the deployment check keeps its place
above the org lookup (SPEC-0007 S3b) and says `sealRefusal('SSO')`. The
Workers build reaches this route by forwarding into the Durable Object
(`worker.ts:819`), so one edit serves both.

**S2e. `worker.ts` `/oauth/*/callback` with no sealer** answers
`This deployment cannot complete an OAuth connection: TOKEN_KEY is not
configured.` — `app.ts:1083`'s sentence, verbatim, in place of `Not
configured.`. Same condition, same wire format, same sentence.

**S2f. The redirect targets, scopes, state payloads and sealing key are not
touched.** `googleSsoUrl`, `microsoftSsoUrl` and the `purpose` fields are
called exactly as today.

## 3 · Parity is asserted by execution, not by reading source (S3)

**S3a.** The runner drives **both** entry points: `handle()` from `app.ts` with
`AppDeps` built by `loadConfig()`, and the Workers router's `default.fetch`
loaded through `test/support/worker-runtime.mjs` with the directory and
Durable-Object bindings stubbed, the way `version.test.ts` already does. A
refusal that exists in `worker.ts` and not in the bundle is the defect class
`worker-alarm.test.ts` exists for.

**S3b.** For every deployment shape in `cases.json`, the Node answer and the
Workers answer to the same request are compared **byte-for-byte on the error
sentence** — not merely each checked against the table. That is the L-009
property: it is parity that is asserted, so a fifth sentence on one build
fails.

## 4 · What must not regress (S4)

**S4a.** Fully configured doors redirect on both builds to the same hosts
with the same scopes as today (`accounts.google.com`;
`login.microsoftonline.com` with `openid email profile` and nothing with
`Calendars`).

**S4b.** Every refusal is a 404 with no `Location` header and no state in the
body: with no sealer nothing unsigned is produced as a fallback (SPEC-0007
S3b, S4c).

**S4c.** The calendar routes are untouched: `/app/calendar/google/connect`
still gates on `deps.calendars`, and the calendar callback's *"Calendar
integration is not configured."* keeps its message and placement (SPEC-0006
S2d; SPEC-0007 A-004 c1, c2, which remain frozen and unamended).

**S4d.** The login page's decision to show a button is unchanged: a button
appears on the client id alone (`app.ts:857`, `worker.ts:440`). This spec
changes what the button answers, not whether it is drawn; drawing it only when
complete would hide the very sentence that tells the operator what to fix.

## 5 · What this does to SPEC-0007's frozen cases, and under what rule

Three of SPEC-0007's six frozen cases pin what this spec changes, and the
runner `auth-reachability.test.ts` is red against the built tree without an
amendment: **A-003** (steps r5 and r6 assert the old sentences under
`NO_KEY`), **A-004** (step g1 asserts the old sentence under
`GOOGLE_ID_ONLY`, and its `turns_red_if` names the very guard this spec
installs), and **A-006** (S4d: two exact-string assertions on `worker.ts`'s
guards and one that the diff touches `worker.ts` zero times).

**Taken under `pumasi/DECISIONS.md` Q-030's stated default**, which is open:
requirement 2's remedy is available to the builder, on a numbered amendment in
the open, never a silent edit, with a fresh cross-family spec review before
building. This is the fleet's fifth use and this repository's first.

**Rider (a): claimed as an ASSERTION change, all three, and said so.** These
are not fixtures. A-003 and A-004 assert sentences and the sentences change;
A-006 asserts that a specific diff did not touch a file, which was true of the
diff it described and cannot be true of this one. The amendment changes the
standard those cases enforce, and the spec reviewer is asked to weigh it as
one. The amendment is **Amendment 2** in [`../0007/SPEC.md`](../0007/SPEC.md)
and `cases.json` v1.2.0 there; what each step said and now says is written
there, in full. A-001, A-002 and A-005, and A-004's steps g2, g3, c1 and c2,
are not touched.

**What A-006 becomes.** Its two source assertions on the guards, and its
diff-touches-nothing step, are replaced by one: **neither `app.ts` nor
`worker.ts` contains a literal refusal sentence for either door; both import
`signInRefusal` from `config.ts`.** That is the property S4d was guarding
against — one build edited without the other — restated in a form that
survives this change and the next (L-007: one implementation, not two that
agree today). Its steps about the router holding no `CalendarHub` and
forwarding `/login/sso/<tag>` into the Durable Object stand as they were.

**Rider (b):** the family that reviews this spec and that amendment must not
be the family that reviews the code. `tools/families.sh` reported **6 of 6**
at this job, so requirement 1's breadth rule binds and the two are recorded in
the commit trailers.

**Order.** The amendment and this spec are committed together **with no
implementation in them**, reviewed, and only then built against.

## 6 · Acceptance

[`acceptance/cases.json`](acceptance/cases.json), frozen at spec-review
approval. Runner: `service/test/auth-refusals.test.ts`.

| Case | Clause | Must fail before |
|---|---|---|
| R-001 | S1b, S1d, S2c, S2d, S4b | **yes** — Node: `NO_KEY` says "not configured", names nothing |
| R-002 | S1b, S1c, S1d, S2a, S4b | **yes** — Node: `GOOGLE_ID_ONLY` says "not configured" |
| R-003 | S1b, S1d, S2b, S2c, S4b | **yes** — Workers: `GOOGLE_ID_ONLY` redirects to Google; `NO_KEY` says "not configured" |
| R-004 | S2e | **yes** — Workers callback says "Not configured." |
| R-005 | S3b | **yes** — the two builds differ on `GOOGLE_ID_ONLY` (303 against 404) |
| R-006 | S4a, S4c, S4d, S1e | no — mutation: drop the client-id term from either guard, or reword the calendar 404 |
| R-007 | S1b, S2c | **yes** — Microsoft id without secret redirects on both builds |

Five must fail against `7c511a4`; for a defect spec the proof is that the test
fails *before* (L-006). R-006 passes on both sides on purpose and names the
mutation that reddens it; the implementation report records that mutation
being run.

## 7 · Found, not fixed here

Nothing yet. This section exists so that the next seat has a place to write.
