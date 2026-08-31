# What we think you want — Zoom connect tells the truth, and the room stops being public

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-08-31; its veto window is in `DECISIONS.md`. The stage is beta,
so work proceeds now and a veto reverts.

## What we understood

You tested "Connect with Zoom" on 2026-08-30 and it did not do what the page
said it would. Two users said the same thing independently the same day. What
we found is worse than a broken button, so this is the next thing built.

When someone connects their Zoom account, we take their **personal meeting
room** — the one permanent room a Zoom account has, the one they use for
everything — and paste its join link onto their public booking page. Anyone
who opens that page can read it. Nobody has to book anything, or type an
email, or be invited. They can just walk into that person's room.

And the card that offered the connection promises "a unique Zoom meeting room
for every booked session." The code that would create one exists, but it is
skipped for exactly the people who pressed the button, because pasting the
personal room is what tells it to stop. So the promise is false for everyone
it was made to.

## What "working" will mean

- **Connecting stores the connection, and nothing else.** The account's
  permission to create meetings is kept, encrypted, the same way the calendar
  connections already are. Nothing is written onto the booking page.
- **A stranger never sees a room they could join.** Before anyone books, a
  video booking page says where the meeting will be — "Zoom", "Google Meet",
  "Microsoft Teams" — and that the link arrives with the confirmation. The
  link itself goes to the person who booked and to the host, in the
  confirmation mail and the calendar invitation, and nowhere else.
- **Every booking gets its own room.** When a booking is made on a Zoom event
  type, we ask Zoom for a fresh meeting for that booking, using the connection
  the owner gave us. That is what the card promised, and it will now be what
  happens.
- **When we cannot make one, we say so rather than quietly substituting.** If
  Zoom refuses, we fall back — first to a fallback link the owner typed in
  themselves, then to their personal room — and the card says plainly that
  this is the order, so nobody discovers it from a stranger's screen.
- **Connected means connected.** The badge on the integrations page reads from
  the stored connection, so it is true whether or not anything was ever
  pasted anywhere. Disconnecting removes the stored connection.
- **Deleting an account deletes the Zoom connection with it.** No new place
  where a credential outlives the person who granted it.

## What we are deliberately not building

- **Any new provider, or any wider Zoom.** This is one already-shipped surface
  told to behave as it was advertised. Google Meet, Teams and Zoom scope is
  the open question `Q-007` governs, and this does not touch it, does not
  need a new developer account, and does not enlarge any permission we ask
  for.
- **A cleanup that deletes what owners typed.** Personal meeting links already
  pasted onto event types by the old connect flow are indistinguishable from
  fallback links owners typed on purpose, so we do not delete them. We stop
  printing them publicly and we stop letting them suppress a per-booking room,
  which closes the leak for existing rows without destroying anyone's setting.

## What we are unsure about — with the answer we assume on silence

1. **The public page shows no joinable link for any conferencing event type**
   — Zoom, Meet, Teams and Google Chat alike, not only Zoom. It is the same
   defect and the same one-line fix. *Assumed on silence: yes, all four.*
2. **The personal meeting room stays as a last-resort fallback** after a
   per-booking room and an owner-typed link both fail, rather than being
   dropped entirely. A booker with no link at all is a worse outcome, and the
   card will say it. *Assumed on silence: keep it, disclosed.*
3. **We do not migrate away the already-stamped links** (above). *Assumed on
   silence: yes, leave them and neutralise them.*
