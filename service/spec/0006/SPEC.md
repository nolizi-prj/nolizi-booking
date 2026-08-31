# SPEC-0006 · The OAuth state is the gate, not the calendar hub

**Status:** approved 2026-08-31 (gemini, `reviews/20260831-090554-spec-gemini.md`);
acceptance cases frozen ·
**Intent:** [`INTENT.md`](INTENT.md) (window Q-013, `pumasi/DECISIONS.md`,
closes 2026-09-01) ·
**Source:** `roadmap/BACKLOG.md` item 2 — found by the spec/0005 coder run and
deliberately not fixed under that frozen spec (ops digest job `0010`; the
2026-08-31 release note's "Also found, not fixed here"), confirmed by the
product-manager evaluation at `efce7a4`.
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), **frozen 2026-08-31** at
that approval; the executable runner is `service/test/oauth-state.test.ts`.

**Risk class: can-hurt.** `service/spec/0002/RISK_ZONES.yaml` maps everything
outside `README.md`, `INTENT.md` and `acceptance/` to `can_hurt`, and this
change touches the authentication of the value that says *whose* third-party
connection is arriving. Release goes through a published note and the 7-day
window (CHARTER Part 4).

**Scope.** Correctness of an already-shipped surface. This spec adds **no
provider**, requires **no new developer account or app registration**, and
**enlarges no OAuth scope**. Provider-scope questions belong to Q-007, whose
window closes 2026-09-01; nothing here anticipates its outcome.

---

## 0 · The defect, stated precisely

Four facts about the tree at `efce7a4`, each independently verifiable.

- **D-a · the callback 404s before it reads the state.** `app.ts` ~999:

  ```ts
  if (parts[0] === 'oauth' && parts[2] === 'callback' && req.method === 'GET') {
    const hub = deps.calendars;
    if (!hub) return html(404, errorPage(404, 'Calendar integration is not configured.'));
  ```

  The `zoom_connect` branch is ~200 lines below that line. `deps.calendars` is
  constructed in `server.ts` ~113 and `worker.ts` ~242 only when
  `googleClientId && googleClientSecret && tokenKey` are all set. So an
  operator who configures `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` and
  `TOKEN_KEY` and no Google Calendar credentials has a Zoom connect flow that
  **starts** — `/oauth/zoom/authorize` (~957) and the integrations page's
  connect links (~2021, ~2057) all redirect to Zoom happily — and can never
  **finish**. The error names calendars, which is not what the operator was
  connecting.

- **D-b · three call sites build the state unsigned.** `app.ts` ~966, ~2026
  and ~2061 are the same five lines three times:

  ```ts
  const state = hub ? await hub.sealState({ … })
    : Buffer.from(JSON.stringify({ purpose: 'zoom_connect', owner_id: owner.owner_id,
        tag: deps.orgTag ?? '' })).toString('base64url');
  ```

  The fallback is a plain readable, plain writable string carrying an
  `owner_id`. It is produced on exactly the deployments D-a then 404s.

- **D-c · the fallback is inert today, and D-a is the whole reason.**
  `CalendarHub.openState` (`calendars.ts` ~128) only ever `open`s an AES-GCM
  seal and returns `undefined` on any tamper or key mismatch (`seal.ts`), so a
  base64 state can never be opened. On a deployment with a hub the fallback is
  never built; on one without, the request dies at D-a. **The two defects
  therefore must be fixed in one change.** Removing the 404 alone leaves a
  callback whose only remaining obstacle to accepting an attacker-chosen
  `owner_id` is that nobody has yet "fixed" `openState` to accept the
  fallback its own authorize step emits.

- **D-d · the placement is the cause.** `sealState`/`openState` are methods on
  `CalendarHub`, but they use only `tokenKey` — no provider, no row, no
  network. `worker.ts` ~433 already admits this by constructing
  `new CalendarHub({}, config.tokenKey)` purely as a state sealer, with no
  providers in it at all. The router path is therefore already correct in
  substance; the app path is not, because it reuses the hub built for
  calendars.

**What is not wrong, and is not changed.** `openState` itself is sound.
Sign-in with Google, sign-in with Microsoft, org OIDC, and calendar connect
each check their own credentials inside the callback and are unaffected. No
stored data has the wrong shape; a state lives fifteen minutes and there is
nothing to migrate.

## 1 · The OAuth state becomes its own facility (S1)

**S1a.** A new module `service/src/oauth-state.ts` exports
`class OAuthState`, constructed from the deployment's `TOKEN_KEY` alone, with
exactly two methods:

| Method | Contract |
|---|---|
| `seal(payload: Record<string,string>): Promise<string>` | AES-GCM seal of `{...payload, exp}` under `TOKEN_KEY`, base64url-safe (`+`→`-`, `/`→`_`), `exp = now + 15 min`. |
| `open(state: string): Promise<Record<string,string> \| undefined>` | Reverses the substitution, opens the seal, returns `undefined` on tamper, key mismatch, malformed JSON, missing `exp`, or expiry. |

**S1b. The wire format does not change.** The seal, the base64url
substitution, the fifteen-minute `exp` and the expiry check are moved
verbatim from `CalendarHub`. A state sealed by the code before this change
opens after it, and the reverse. A deployment mid-rollout is not a broken
deployment.

**S1c. One implementation, not two.** `CalendarHub.sealState` and
`CalendarHub.openState` remain, as delegations to an `OAuthState` the hub
holds. They are not reimplemented and not copied — a second copy of a
security-relevant format is L-007, and this spec exists because the first
copy was in the wrong place.

**S1d.** `OAuthState` performs no I/O, holds no row, and knows no provider. It
imports from `seal.ts` and nothing else in this codebase.

## 2 · The state seal is the callback's gate (S2)

**S2a.** `app.ts`'s `/oauth/*/callback` handler gates on the ability to
**open a state**, not on the presence of a calendar hub:

```ts
const states = oauthState(config);
if (!states) return html(404, errorPage(404, <no-token-key message>));
```

`oauthState(config)` returns `new OAuthState(config.tokenKey)` when
`config.tokenKey` is set and `undefined` otherwise — the same shape, and for
the same reason, as the existing `videoConnections(config, now)` helper
(`app.ts` ~153): `TOKEN_KEY` is already the single source of the seal key and
a second wiring path through `AppDeps` is a second thing to drift.

**S2b.** The message on that refusal names `TOKEN_KEY`, not calendars. An
operator who sees it can act on it.

**S2c.** The state is opened with `states.open(...)`. The stale-or-invalid 400
for an unopenable state or a missing `code` is unchanged.

**S2d. The calendar branch keeps its own 404, moved to where it belongs.**
After every `purpose` branch, immediately before `hub.provider(...)`:

```ts
if (!hub) return html(404, errorPage(404, 'Calendar integration is not configured.'));
```

A calendar-provider callback arriving at a deployment with no calendar
integration therefore still answers **404 with the identical message it
answers today**. This clause exists so the fix is a widening for Zoom and a
no-op for calendars, and so that is testable rather than asserted.

**S2e. No other flow gains reachability.** Each remaining branch keeps the
credential check it already has:

| `purpose` | Guard, unchanged |
|---|---|
| `sso` | `config.googleClientId && config.googleClientSecret`, else 404 |
| `sso_ms` | `config.msClientId && config.msClientSecret`, else 404 |
| `oidc` | a matching `org_sso` row, else 404 |
| `zoom_connect` | `config.zoomClientId && config.zoomClientSecret`, else 400 |
| calendar | S2d, then `hub.provider(parts[1])`, else 404 |

Since a hub requires `googleClientId && googleClientSecret && tokenKey`, and
the `sso` branch requires `googleClientId && googleClientSecret`, no
deployment reaches a *completed* `sso` exchange that could not reach one
before. The `sso_ms` and `oidc` branches are unreachable on a hub-less
deployment for a different reason — nothing can seal a state for them, since
their entry points (`/auth/microsoft/start` ~936, `/login/sso/<org>` ~850)
are themselves gated on the hub. **This spec does not change those entry
points** (§5).

## 3 · No unsigned state is built, anywhere (S3)

**S3a.** The `hub ? … : Buffer.from(JSON.stringify(...))` fallback is
**deleted** at all three sites (`app.ts` ~966, ~2026, ~2061). After this
change the string `base64url` does not appear in `app.ts`.

**S3b.** A deployment with no `TOKEN_KEY` **refuses to start** a Zoom connect,
with the reason, rather than starting one it could not store:

> This deployment cannot start a Zoom connection: TOKEN_KEY is not configured.

This is the same decision `spec/0005` Z1c already makes *after* the round
trip — "no `TOKEN_KEY` means no sealed column to put a credential in" — made
earlier and more usefully. Z1c stays exactly where it is: it is the backstop
for a key removed between authorize and callback.

**S3c.** The three Zoom-connect redirects become one helper. They are byte-for
-byte the same redirect today, differing only in their surrounding guard, and
three copies of a security check is how one of them gets fixed and the others
do not. The helper's order is: no `zoomClientId` → `303 /app/integrations?zoom_needed=1`
(today's behaviour, unchanged); no `TOKEN_KEY` → S3b; otherwise seal and
redirect to Zoom.

## 4 · What must not regress (S4)

**S4a.** A deployment **with** a calendar hub behaves identically in every
respect. `spec/0005`'s frozen acceptance cases run unchanged and unedited —
its runner builds `calendars: new CalendarHub({}, KEY, () => NOW)` and must
keep passing untouched.

**S4b.** A state sealed anywhere in the service opens anywhere in the service:
`CalendarHub.sealState` → `OAuthState.open` and `OAuthState.seal` →
`CalendarHub.openState` both round-trip.

**S4c.** A state sealed under a different `TOKEN_KEY`, a tampered state, an
expired state, and a hand-built base64url state of the exact shape the deleted
fallback produced must **all** open as `undefined`. The last of these is the
regression test for D-c: it is the thing that must never become acceptable
now that the 404 is gone.

**S4d.** `worker.ts`'s router-level state handling (~433, ~594, ~612, ~626) is
behaviourally unchanged. Its `hub` is already `config.tokenKey ? new
CalendarHub({}, config.tokenKey) : undefined` — the same condition S2a states
— so its callback gate is already the right one. It is rewired to
`OAuthState` for S1c's single implementation, and its responses do not move.

## 5 · Found, not fixed here

**`/auth/microsoft/start` is gated on a *Google* calendar hub.** `app.ts` ~936
reads `if (!hub || !config.msClientId)`, and `hub` requires Google Calendar
credentials. A deployment configuring Microsoft sign-in and no Google Calendar
gets "Microsoft sign-in is not configured" for a sign-in that is configured —
the same accident of placement as D-d, one surface over. `worker.ts` ~609 has
the same shape. It is **not** fixed here: it is an authentication entry point
rather than a conferencing one, its acceptance surface is different, and
folding it in would make one review cover two unrelated reachability changes.
Recorded for the roadmap owner to rank; this spec's §2 leaves its callback
branch exactly as reachable as it is today.

## 6 · Acceptance

[`acceptance/cases.json`](acceptance/cases.json), **frozen 2026-08-31** at the
spec-review approval, before implementation began. Runner:
`service/test/oauth-state.test.ts`.

| Case | Clause | Must fail before the fix |
|---|---|---|
| S-001 | S1a, S1b, S1d | no |
| S-002 | S2a, S2b, S2c | **yes** — the hub-less Zoom callback 404s today |
| S-003 | S3a, S3b, S3c | **yes** — the hub-less authorize emits base64url today |
| S-004 | S2d, S2e | no |
| S-005 | S4b, S4c | no |
| S-006 | S4a | no |

Two cases must fail against `efce7a4`. For a defect spec the proof is that the
test fails *before* (L-006); a case that passes both sides is testing
something else.
