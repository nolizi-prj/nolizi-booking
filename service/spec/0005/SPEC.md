# SPEC-0005 · Zoom connect tells the truth, and the room stops being public

**Status:** draft, for cross-family spec review · **Intent:**
[`INTENT.md`](INTENT.md) (window Q-010, `pumasi/DECISIONS.md`) ·
**Source:** `roadmap/BACKLOG.md` item 1 (parts (b) and (c); part (a) fixed at
`e9eb9fe`), the steward's Zoom E2E test 2026-08-30 (`ecdd60b`),
[issue #26](https://github.com/pumasi-ai/pumasi-booking/issues/26),
[issue #30](https://github.com/pumasi-ai/pumasi-booking/issues/30).
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), frozen when
the spec review completes; the executable runner is `service/test/video.test.ts`.

**Risk class: can-hurt.** `service/spec/0002/RISK_ZONES.yaml` maps everything
outside `README.md`, `INTENT.md` and `acceptance/` to `can_hurt`, and this item
handles a third-party OAuth credential and changes what an anonymous visitor is
shown. Release therefore goes through a published note and the 7-day window
(CHARTER Part 4).

**Scope.** Correctness of an already-shipped surface. This spec adds **no
provider**, requires **no new developer account or app registration**, and
**enlarges no OAuth scope**. Provider-scope questions are Q-007's, whose window
closes 2026-09-01; nothing here anticipates its outcome.

---

## 0 · The defect, stated precisely

Three facts about the tree at `5ca3b91`, each independently verifiable:

- **D-b1.** `app.ts` `zoom_connect` OAuth callback runs
  `UPDATE schedules SET location_value = <personal meeting URL> WHERE owner_id = $1
  AND location_kind = 'zoom'`. The owner never typed that value and is never
  shown that it happened.
- **D-b2.** `pages.ts` `bookPage` renders `locationText(schedule)` with no
  `meetUrl`, and `schedules.ts` `locationText` returns
  `Zoom — <location_value>` for `location_kind = 'zoom'` whenever
  `location_value` is set. The public booking page is unauthenticated. So an
  anonymous visitor is shown a permanently joinable room belonging to a real
  person, before booking anything.
- **D-c1.** `app.ts` booking path guards per-booking creation with
  `if (schedule.location_kind === 'zoom' && !meetUrl && !schedule.location_value)`.
  Because D-b1 always sets `location_value`, `createZoomMeeting` never runs for
  an owner who used the connect button — the exact population the integrations
  card's "unique Zoom meeting rooms for every booked session" was promised to.
- **D-c2.** `createZoomMeeting` authenticates only with Server-to-Server
  credentials (`zoomAccountId` + `zoomClientId` + `zoomClientSecret`). The
  tokens obtained by the connect flow are discarded at the end of the callback
  and stored nowhere, so even with D-c1 fixed a connected owner could mint
  nothing.

## 1 · The connection is stored, never stamped (Z1)

**Z1a.** The `zoom_connect` callback **must not write to `schedules`.** It
stores the connection instead.

**Z1b.** A `video_connections` table holds one row per (owner, provider,
account email):

| Column | Meaning |
|---|---|
| `connection_id` | primary key |
| `owner_id`, `provider` (`'zoom'`), `account_email` | unique together |
| `refresh_token` | AES-GCM sealed (`seal.ts`), **NOT NULL** |
| `access_token`, `access_expires_at` | sealed / ISO-8601 UTC text |
| `fallback_url` | the account's personal meeting URL, as captured at connect |
| `display_name`, `status` (`active`/`error`), `error_reason`, `created_at` | |

**Z1c.** `refresh_token` and `access_token` are sealed with the same
`TOKEN_KEY` mechanism the calendar connections use. A copy of the database
alone reveals no Zoom credential. `fallback_url` is **not** sealed: it is not a
credential, and Z2 makes it non-public by other means.

**Z1d.** Reconnecting the same account updates the existing row rather than
creating a second. `status` returns to `active` and `error_reason` clears.

**Z1e.** If the profile fetch yields no personal meeting URL, the connection is
still stored — the credential is the point, the fallback is not. The existing
`console.warn` stays.

## 2 · A stranger never sees a joinable room (Z2)

**Z2a.** `locationText` gains an **audience**. For the conferencing kinds —
`meet`, `teams`, `zoom`, `google_chat` — the *public* rendering never includes
`location_value` and never includes a minted URL. It states the venue and that
the link arrives with the confirmation:

| kind | public rendering |
|---|---|
| `zoom` | `Zoom — link arrives with the confirmation` |
| `meet` | `Google Meet — link arrives with the confirmation` |
| `teams` | `Microsoft Teams — link arrives with the confirmation` |
| `google_chat` | `Google Chat — link arrives with the confirmation` |

**Z2b.** The non-conferencing kinds are unchanged in both audiences.
`phone`, `in_person` and `custom` carry what the owner typed into a field
labelled as shown on the page; changing them is not this defect and would
silently degrade working event types.

**Z2c.** The **confirmed** audience — confirmation mail to booker and hosts,
the `.ics`, and the calendar event body — is unchanged: it carries the minted
URL when there is one, otherwise the fallback chain of Z3d. Someone who has
booked is not a stranger.

**Z2d.** `bookPage` (public), and the pre-booking verification mail sent before
a booking exists, use the public audience. The verification mail is addressed
to an unproven address and describes a booking that has not happened, so it is
pre-booking by definition.

**Z2e.** This clause is about what is *rendered*, not about what is stored.
Already-stamped `location_value` rows keep their value and stop being printed.

## 3 · Every booking gets its own room (Z3)

**Z3a.** For `location_kind = 'zoom'`, per-booking creation is attempted
**whenever no calendar-minted `meetUrl` exists** — the `!schedule.location_value`
half of the D-c1 guard is deleted. A stored fallback link is a fallback, not a
suppressor.

**Z3b.** Creation uses, in order: the owner's stored `video_connections` row for
`zoom` (Z1) with its access token, refreshed via the Zoom refresh grant when
`access_expires_at` has passed or the API answers 401; failing that, the
Server-to-Server credentials, when all three are configured.

**Z3c.** Zoom rotates refresh tokens: the refreshed pair is written back to the
row before use. A refresh that fails sets `status = 'error'` with a reason and
returns no meeting — it never throws into the booking path.

**Z3d.** The whole chain, once, in order, for the **confirmed** audience:

1. the calendar-minted conferencing URL, if the calendar write-back produced one;
2. a per-booking Zoom meeting from the stored connection;
3. a per-booking Zoom meeting from Server-to-Server credentials;
4. `schedules.location_value` — a link the owner typed, or the residue of the
   old connect flow;
5. the connection's `fallback_url` — the personal meeting room;
6. `Zoom — link arrives with the confirmation`, unchanged from the public line,
   when there is nothing at all.

**Z3e.** **A booking never fails because Zoom did.** Every step above is
best-effort; an exception or a non-2xx is logged once and the chain continues.
This restates the existing behaviour of `createZoomMeeting` and binds the new
steps to it.

**Z3f.** The owner's Zoom access token is used only to create a meeting for a
booking on that owner's own event type. No other call is made with it.

## 4 · The card says what it does (Z4)

**Z4a.** The integrations card's promise is replaced by what Z3d actually does,
naming the fallback order in plain words. A card that promises a unique room
must be true for the person reading it, or say what happens when it cannot be.

**Z4b.** `zoomConnected` is computed from the stored `video_connections` row,
or from complete Server-to-Server credentials — **not** from
`schedules.location_value`. After Z1a nothing writes that column on connect, so
the old derivation would report "Not Connected" for a genuinely connected
owner: part (a) of the backlog entry regresses unless this moves with it.

**Z4c.** The card shows the connected account's email or display name when the
row has one, so "Connected ✓" is checkable rather than asserted.

**Z4d.** The static-link field keeps its place and its meaning — an
owner-typed fallback — and its help text says it is used only when a
per-booking room cannot be created, and that it is never shown before a
booking.

## 5 · Disconnect, and deletion (Z5)

**Z5a.** `POST /app/integrations/zoom/disconnect` deletes the owner's `zoom`
`video_connections` row. It **also** clears `schedules.location_value` for that
owner's `zoom` event types, as it does today: disconnecting is the one moment
the owner has said "remove my Zoom", and it is the only route by which an
already-stamped personal room leaves the database at all.

**Z5b.** Local deletion is the guarantee. Remote token revocation is courtesy
and its failure is not an error — the same rule `calendars.ts` already follows
for D3.

**Z5c.** Account deletion (`app.ts`, the owner-erasure transaction) deletes
`video_connections` for that owner, inside the same transaction as the rest.
A new table holding a third party's credential must not outlive the person who
granted it. Deletion is verified by absence.

## 6 · Migrations (Z6)

**Z6a.** One migration per dialect, mirroring each other:
`migrations/020_video_connections.sql` and
`migrations-sqlite/016_video_connections.sql`, both `CREATE TABLE IF NOT
EXISTS`, both re-runnable.

**Z6b.** `worker.ts` imports and registers the new SQLite migration in its
pre-loaded `files:` list. A migration the Workers deployment cannot see is a
migration that does not exist there (L-009: a claim about a two-path system is
over-scoped by default — this one is stated per path and is true on both).

**Z6c.** **No data migration.** Existing `location_value` values are not
deleted: a stamped personal room and a deliberately typed fallback link are
indistinguishable in the schema, and deleting both would destroy working
settings to fix a rendering bug that Z2 fixes at the rendering. Z2 stops them
being public and Z3a stops them suppressing a per-booking room, which is the
whole of the harm.

## 7 · What this does not change

- No new OAuth scope is requested from Zoom; the authorize URL is unchanged.
- No provider is added, and Google Meet, Teams and Google Chat behaviour
  changes only by Z2a's public rendering, which removes information rather
  than adding an integration.
- No reporting field is added; SPEC-0004 R1b's rule that a new field means a
  new schema version is untouched, because there is no new field.
- The published subprocessor list is unchanged: Zoom already appears there as
  the connect flow already contacted it.

## 8 · Acceptance

[`acceptance/cases.json`](acceptance/cases.json), frozen at spec-review
approval. Ten cases, each naming the clause it exercises. Two of them (Z-002,
Z-005) are written specifically to fail against the tree at `5ca3b91` — a case
that cannot fail is not a case (L-006), and for a defect spec the proof is that
it fails *before*.
