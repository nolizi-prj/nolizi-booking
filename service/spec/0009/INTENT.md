# What we think you want — a refusal that says what is missing

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-09-01; its veto window is in `DECISIONS.md` (Q-040). The stage
is `beta`, so work proceeds now and a veto reverts.

## What we understood

Somebody sets up their own copy of Pumasi Booking. They enter the details for
"Sign in with Microsoft", or for their company's own single sign-on, and they
forget one setting: the key the service uses to seal the ticket it hands to
Microsoft and checks when the person comes back. They press the button and
are told: *"Microsoft sign-in is not configured."*

That sentence is true. It is also useless. They *did* configure it, as far as
they can see, and nothing tells them which of the six or seven settings is the
one that is missing. The same happens with Google: on the hosted build, an
operator who entered the Google client id but not its secret is not refused at
the button at all — they are sent to Google, sign in there, and are refused on
the way back, which is a worse place to learn it. The other build refuses at
the button, so the two builds of the same product answer the same mistake
differently.

Nobody has reported meeting this. The people it would hurt are operators
setting up a fresh copy, and that is still a hypothetical audience. It is being
done now because everything ranked above it has been built, not because
anybody is waiting on it.

## What "working" means, in your terms

An operator who has set up sign-in and missed one thing is told, at the
button, **which setting is missing, by its name** — the name they would search
for in their own configuration. Never its value. And both builds of the product
say the same thing in the same place.

Somebody who has not set up a sign-in method at all still sees what they see
today: the button is not shown, and the address behind it says the method is
not configured.

## What we are deliberately not building

- **No new setting, no new provider, no change to what sign-in does when it is
  fully configured.** A correctly configured copy behaves exactly as before.
- **No change to who can sign in**, and no relaxation of any check. Every
  refusal that exists today still refuses; the change is what the refusal
  says, and on one build, *when* it says it (at the button instead of after a
  round trip to Google).
- **No deployment.** This is merged, not shipped. Who carries a merged build
  to `booking.pumasi.ai` is an open question you have (`Q-012`), and this work
  does not answer it. `booking.pumasi.ai` is fully configured and would not
  show any of these sentences today anyway.

## What we are unsure about, and what we will assume if you say nothing

1. **Is it acceptable that the refusal page names a setting to whoever pressed
   the button — not only the operator?** The page is public. It names the
   setting's *name* (for example `TOKEN_KEY`), never its value, and the product
   already does exactly this on two other pages. Knowing that a copy lacks a
   sealing key tells a stranger that no sign-in works there, which they would
   learn by trying. *We are assuming yes.*

2. **Should the Microsoft door also refuse at the button when only the
   Microsoft secret is missing?** That is the same mistake as the Google one
   and today it is refused after the round trip on both builds. *We are
   assuming yes, and doing it in the same change*, so the two providers do not
   end up answering the same mistake differently.

3. **Is this a change that can hurt someone?** *We are assuming yes.* It is
   wording that every hosted user could meet on the sign-in path, and it
   changes both builds at once. We are publishing a plain-language note and
   opening the seven-day window rather than arguing that a sentence is
   harmless.

4. **This changes what three earlier acceptance tests demand.** A previous
   piece of work froze the exact sentences these pages say, and one test also
   froze the line of code this change must edit. We are amending those tests
   in the open, with the reasoning written down and a fresh review by a
   different model family before building, under the rule you have open as
   `Q-030`. *We are assuming that rule's stated default applies.* If it does
   not, the whole change reverts cleanly.
