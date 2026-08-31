# SPEC-0007 · Two sign-in doors gate on the state seal, not on the calendar hub

**Status:** approved 2026-08-31 (gemini, `reviews/20260831-110333-spec-gemini.md`);
acceptance cases frozen ·
**Intent:** [`INTENT.md`](INTENT.md) (veto window in `pumasi/DECISIONS.md`) ·
**Source:** `roadmap/BACKLOG.md` item 2, ranked there by the product-manager
evaluation of 2026-08-31 (`1a01b1c`) against its own reading of the tree at
`4f6ddf0`. Half of it was recorded by the spec/0006 coder run as found-not-fixed
([`../0006/SPEC.md` §5](../0006/SPEC.md)); the other half — `/login/sso/<orgId>` —
was recorded nowhere before that evaluation.
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), **frozen 2026-08-31** at that
approval, before implementation. Runner: `service/test/auth-reachability.test.ts`.

**Risk class: can-hurt.** `service/spec/0002/RISK_ZONES.yaml` maps everything
outside `README.md`, `INTENT.md` and `acceptance/` to `can_hurt`, and this is a
reachability change on **authentication** surface. Release goes through a
published note and the 7-day veto window (CHARTER Part 4).

**Scope.** Correctness of an already-shipped surface. This spec adds **no
provider**, requires **no new developer account or app registration**, and
**enlarges no OAuth scope** — which is why it does not run ahead of `Q-007`.

---

## 0 · The defect, stated precisely

Three facts about the tree at `0036c74`, each independently verifiable.

- **D-a · `/auth/microsoft/start` is gated on a *Google* calendar hub, on the
  Node path.** `app.ts:997`:

  ```ts
  const hub = deps.calendars;
  if (!hub || !config.msClientId) {
    return html(404, errorPage(404, 'Microsoft sign-in is not configured.'));
  }
  const state = await hub.sealState({ purpose: 'sso_ms', … });
  ```

  `deps.calendars` is constructed only when
  `googleClientId && googleClientSecret && tokenKey` are all set
  (`server.ts:114`, `worker.ts:244`). The login page offers the button on
  `Boolean(config.msClientId)` alone (`app.ts:947` for `/login`, `app.ts:850` for `/signup`), so an
  operator holding Microsoft credentials and no Google Calendar is shown a
  button whose own answer is that it is not configured. Microsoft sign-in
  needs `msClientId`, `msClientSecret` and a key to seal the state with; it
  has never needed Google Calendar.

- **D-b · `/login/sso/<orgId>` is gated on the same hub, on *both* paths, and
  it refuses before it reads the organisation's own row.** `app.ts:911`:

  ```ts
  const hub = deps.calendars;
  if (!hub) return html(404, errorPage(404, 'SSO is not configured on this deployment.'));
  ```

  The Workers router does not handle this route: it forwards it into the
  Durable Object (`worker.ts:805`), which runs the same `handle()` with the
  same Google-gated `deps.calendars` (`worker.ts:244`, wired at `worker.ts:266`).
  Per-org OIDC SSO — the enterprise identity [`VALUE.md`](../../../roadmap/VALUE.md)
  C3 lists in the free tier — therefore requires Google Calendar credentials on
  **every** deployment shape. This is the wider blast radius of the two.

- **D-c · the placement is the cause, and it is the one spec/0006 already
  diagnosed.** `sealState`/`openState` are `CalendarHub` methods that use only
  `tokenKey` — no provider, no row, no network (`calendars.ts:132`–`147`,
  delegating to `oauth-state.ts`). Spec/0006 moved the facility out and fixed
  the callback that receives all of these flows; it left the two entry points
  that *start* two of them, in the open, in its §5 and in the ranking that
  followed. Both entry points ask "is there a calendar?" and use the answer as
  if it were "can I seal a state?".

**What is NOT wrong, and is not changed.**

- **`worker.ts:614` — the router's own `/auth/microsoft/start` — was never
  broken and is now explicitly right.** At `efce7a4` it read
  `if (!hub || !config.msClientId)` over a *provider-less* hub
  (`config.tokenKey ? new CalendarHub({}, config.tokenKey) : undefined`) — i.e.
  gated on `TOKEN_KEY` and never on Google. Since `4f6ddf0` it reads
  `if (!states || !config.msClientId)` (the route at `worker.ts:613`, the guard at `worker.ts:614`) over an `OAuthState`.
  Spec/0006 §5's claim that it "has the same shape" was shape-true and
  effect-false. **A change that edits it and calls this item done has closed
  nothing**, and S4d below is the test that says so.
- **`/auth/google/start` (`app.ts:973`) keeps its gate exactly.** Google
  sign-in needs `googleClientId`, `googleClientSecret` and a seal key — which
  is precisely the hub's own construction condition, so `!hub` is here the
  right test and not an accident. Changing it would alter reachability in a
  spec whose whole claim is that it does not.
- **`/app/calendar/<provider>/…` (`app.ts:2661`) keeps its gate.** It is a
  calendar route; `deps.calendars` is what it actually needs.
- **The callback (`app.ts:1041`) is already correct** — `hub?.state ?? oauthState(config)`,
  with the calendar 404 kept verbatim below every purpose branch (spec/0006 S2d).
  Nothing here moves it.

## 1 · One sealer, read from one place (S1)

**S1a.** Both entry points obtain their state facility by the expression
spec/0006 established and a cross-family review already passed
(`app.ts:191`, `app.ts:1051`):

```ts
const states = deps.calendars?.state ?? oauthState(config);
```

**S1b.** The hub's own sealer is preferred when a hub exists. A `CalendarHub`
may hold a key that did not come from `config.tokenKey` — `test/enterprise.test.ts`
builds exactly that deployment — and a state must open under the key that
sealed it. `oauthState(config)` alone would regress it, and S4a is the case
that catches that.

**S1c.** The gate is not restated. Neither call site reimplements
"is TOKEN_KEY set", constructs an `OAuthState` directly, or copies the
`videoConnections`/`oauthState` shape; there is one helper and it is
`oauthState` (`app.ts:170`). Restating a rule forks it (L-007), and this spec
exists because a facility in the wrong place forked a gate three times over.

## 2 · Microsoft sign-in gates on the seal and its own credentials (S2)

**S2a.** `app.ts`'s `/auth/microsoft/start` reads:

```ts
const states = deps.calendars?.state ?? oauthState(config);
if (!states || !config.msClientId) {
  return html(404, errorPage(404, 'Microsoft sign-in is not configured.'));
}
const state = await states.seal({ purpose: 'sso_ms', invite: …, timezone: … });
```

**S2b. The refusal message does not change, and the guard shape matches the
router's byte for byte.** `worker.ts:614` already answers
`'Microsoft sign-in is not configured.'` under exactly `!states || !config.msClientId`.
Two builds answering the same question differently is L-009; after this change
the Node path and the Workers path hold the identical condition and the
identical sentence.

**S2c. `msClientSecret` is not added to the guard.** The router does not check
it either, and the callback branch already refuses `sso_ms` without it
(spec/0006 S2e). Adding a check on one path only would be the divergence S2b
exists to remove; adding it on both is a separate change to a separate
surface's behaviour and is not this spec's.

**S2d. The redirect, the scopes and the payload are unchanged** — same
`microsoftSsoUrl`, same `purpose: 'sso_ms'`, same `invite` and `timezone`
fields, same 303.

## 3 · Org SSO gates on the seal, then on the organisation (S3)

**S3a.** `app.ts`'s `/login/sso/<orgId>` reads:

```ts
const states = deps.calendars?.state ?? oauthState(config);
if (!states) return html(404, errorPage(404, 'SSO is not configured on this deployment.'));
```

and the state is sealed with `states.seal({ purpose: 'oidc', org: ssoOrgId, tag: … })`.

**S3b. The order is unchanged: the deployment check stays above the
`org_sso` lookup.** With no seal key nothing can be started whatever the
lookup finds, so the query would be wasted; and the two refusals stay
distinguishable exactly as they are today —
`'SSO is not configured on this deployment.'` for the deployment,
`'This organization has no SSO configured.'` for the organisation. *This is a
decision, not an omission: the alternative (look up first) tells an
unauthenticated caller which org ids exist on a deployment that cannot serve
any of them, and changes two user-visible answers for no reachability gain.*

**S3c. The message does not change.** After this change the only condition
that reaches it is a missing `TOKEN_KEY`, for which
"SSO is not configured on this deployment" is accurate — unlike the
"Calendar integration is not configured" that spec/0006 S2b had to replace,
which named the wrong subsystem entirely. Naming `TOKEN_KEY` would serve the
operator better and is recorded in §5 rather than folded in; a reachability
spec that also rewrites user-visible copy makes its own acceptance surface
"did the words change" instead of "did reachability change".

**S3d. The `'main'` tenant alias, the discovery call, the 502 on a
non-answering IdP, and the redirect are unchanged.**

## 4 · What must not regress (S4)

**S4a. A deployment *with* a hub behaves identically in every respect**,
including one whose hub key differs from `config.tokenKey`. Every existing
frozen suite runs unchanged and unedited — `test/frontdoor.test.ts`,
`test/enterprise.test.ts`, spec/0005's and spec/0006's runners — and
`test/enterprise.test.ts` is the case in S1b, since it builds
`CalendarHub({}, KEY)` with no `TOKEN_KEY` in its config at all.

**S4b. No flow gains reachability that is not this spec's subject.** Each
guard below is asserted after the change, on a hub-less deployment:

| Entry point | Guard after this change | Refusal |
|---|---|---|
| `/auth/microsoft/start` | `states` **and** `config.msClientId` | 404 `Microsoft sign-in is not configured.` |
| `/login/sso/<orgId>` | `states`, **then** a matching `org_sso` row | 404 `SSO is not configured on this deployment.` / `This organization has no SSO configured.` |
| `/auth/google/start` | `deps.calendars` **and** `config.googleClientId` — *unchanged* | 404 `Google sign-in is not configured.` |
| `/app/calendar/<p>/connect` | `deps.calendars`, in the route's own condition (`app.ts:2661`) — *unchanged* | does not match; falls through to the `/app` view, **200** |
| `/oauth/<p>/callback`, calendar purpose | `deps.calendars` — *unchanged* (spec/0006 S2d) | 404 `Calendar integration is not configured.` |

**S4c. No unsigned state is emitted by either entry point, ever.** The state
each produces is opaque: it does not decode as plain base64 or base64url JSON,
it opens under the sealing deployment's key, and it does **not** open under a
different key. `Buffer.from(JSON.stringify(` remains absent from `app.ts`
(spec/0006 S3a).

**S4d. `worker.ts` is not modified by this change.** Its
`/auth/microsoft/start` still reads `if (!states || !config.msClientId)` and
its `/auth/google/start` still reads `if (!states || !config.googleClientId)`.
This clause is a regression guard against the specific failure mode
`BACKLOG.md` item 2 warns about: editing the Workers half — which was never
broken — and calling the item delivered.

**S4e. Both paths are fixed by this one change, and that is asserted rather
than assumed.** The Workers build reaches `/login/sso/<orgId>` by forwarding
into the Durable Object (`worker.ts:805`), which runs this same `handle()`;
there is no second copy of the route to fix. `/auth/microsoft/start` on the
Workers build is answered by the router and was already correct (S4d). So
after this change: Microsoft sign-in is correct on both paths for different
reasons, and org SSO is correct on both paths for the same reason.

## 5 · Found, not fixed here

- **A missing `TOKEN_KEY` is not named in either refusal.** An operator who
  configures Microsoft or an IdP and forgets `TOKEN_KEY` is told the feature is
  not configured, which is true and unactionable. Fixing it well means changing
  the message on both the Node path and the Workers router together (L-009),
  and it is user-visible copy rather than reachability. Recorded for the
  roadmap owner to rank; §3c and §2b say why it is not folded in.
- **`worker.ts:596` gates `/auth/google/start` on `googleClientId` without
  `googleClientSecret`, while `app.ts:973` effectively requires both** (via the
  hub). On the Workers build a deployment with an id and no secret redirects to
  Google and then 404s at the callback instead of refusing at the button. It
  predates this spec, is a divergence between the two paths in the opposite
  direction from D-a, and is not touched here because touching `worker.ts` is
  what S4d forbids. Recorded for the roadmap owner.

## 6 · Acceptance

[`acceptance/cases.json`](acceptance/cases.json), **frozen 2026-08-31** at the
spec-review approval, before implementation. Runner:
`service/test/auth-reachability.test.ts`.

| Case | Clause | Must fail before the fix |
|---|---|---|
| A-001 | S2a, S2d, S4c | **yes** — the hub-less Microsoft start 404s today |
| A-002 | S3a, S3d, S4c, S4e | **yes** — the hub-less org SSO start 404s today |
| A-003 | S2a, S3a, S3b, S4b | **yes** — on a hub-less deployment the calendar gate answers before every org-level refusal, so those refusals are unobservable until it is gone |
| A-004 | S4b | no |
| A-005 | S1b, S4a | no |
| A-006 | S4d | no |

Three cases must fail against `0036c74`; for a defect spec the proof is that
the test fails *before* (L-006). A-003's redness is of a different kind from
A-001's and A-002's, and the difference is stated on the case rather than
smoothed over: nothing is unguarded today, but on a hub-less deployment the
calendar gate answers first, so the guards underneath it cannot be observed at
all until it is gone. A-003 is the assertion that removing the gate did not
remove them with it.

The three that pass on both sides are the ones that say the fix did not widen
anything, and a case that cannot fail is decoration — so each names, in
`cases.json`, the deliberate breakage that turns it red, and the implementation
report records those mutations being run.
