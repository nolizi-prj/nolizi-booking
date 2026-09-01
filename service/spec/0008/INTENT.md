# What we think you want — a day that shows times, shows times

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-09-01; its veto window is in `DECISIONS.md`. The stage is
`beta`, so work proceeds now and a veto reverts.

## What we understood

Someone opened a booking page you published, saw that September 1st and 2nd
were available, tapped one of them, and got nothing. The heading told them
which day they had picked. The space underneath it, where the times go, was
empty. They wrote in and said so: *"in the calendar booking page, i cannot see
specific times."*

That is the whole product not working, on the one page it exists to serve. A
booking page that cannot show a time cannot take a booking.

## What "working" means, in your terms

A person on a public booking page picks a day the calendar shows as available,
and sees that day's times, in their own timezone. They tap one and can book it.

That is it. Nothing else about the page changes.

## What we found

The times were never missing from the page. They were sent with it, they were
correct, and the page's own code built every one of the buttons — and then
threw them away instead of putting them on screen. One line that puts a button
where a person can see it had been deleted, four weeks ago, by a change that
was about remembering your name and email between visits and had no business
touching the calendar at all.

Nothing broke visibly when it happened. No error appeared, in the browser or
anywhere else. The reporter's own diagnostics say **0 errors captured**, and
they are right — nothing went wrong, in the sense a computer can detect. The
page did exactly what it was told and what it was told was incomplete.

## Why nobody caught it

Because nothing we had ever ran that code. The whole calendar — picking a
month, picking a day, seeing times, choosing one — lives in the page itself and
runs in the visitor's browser. Every test we had reads the page as text and
checks that the right words are in it. The words were all there. They still
are. A test that reads the page could not have caught this and cannot catch the
next one either.

So the repair is two things, and the second matters more than the first: put
the line back, and start actually running the page in a real browser so that
the next deletion is caught by a machine on the day it happens instead of by a
person four weeks later.

## What we are deliberately not building

- No redesign of the booking page. One line goes back and the rest is untouched.
- No new dependency. The browser and the driver were already here.
- **No deployment.** This repair is merged, not shipped. Who carries a merged
  build to `booking.pumasi.ai` is an open question you have (`Q-012`), and this
  work does not answer it or route around it. **Until somebody deploys, the
  person who reported this still sees an empty list.**

## What we are unsure about, and what we will assume if you say nothing

1. **Is running a real browser in the ordinary test suite worth the time it
   costs?** It costs **6.8 seconds** on top of an **18 second** suite. *We are
   assuming yes* — the alternative is a check that has to be remembered, and
   this defect is what "remembered" produces. If you would rather it were a
   separate command, that is a one-line change.

2. **Is this a change that can hurt someone?** *We are assuming yes*, and are
   treating it as one — publishing a plain-language release note and waiting
   the seven days before release, even though the change only gives back
   something that was taken away. The reasoning is in the spec. We would rather
   spend one extra week than argue our own change is harmless.

3. **The second thing in the same report.** The reporter's diagnostics named
   one page and their screenshot showed another, which looked like a bug in the
   report. It is not: the widget correctly names the page it ran on, and the
   screenshot is a screen capture, where the browser lets the person choose
   which window to share. Nothing was wrong except that nothing said so. *We
   are assuming* the right fix is to name the field for what it holds and say,
   next to the image, that the two can differ.
