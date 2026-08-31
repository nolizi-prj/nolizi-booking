# What we think you want — a machine that checks, so the checking is not a favour

**One page. For the steward. No jargon, no clause numbers, no test IDs.**
Published 2026-08-31; its veto window is in `pumasi/DECISIONS.md`. The stage is
`beta`, so work proceeds now and a veto reverts.

## What we understood

Every quality claim this product makes about itself is a claim an agent made
about a script it chose to run on its own computer.

Four release notes say `GATE: PASS`. `roadmap/STAGE.md` publishes test counts.
Six frozen acceptance suites are recorded as green. Every one of those numbers
was produced by the same agent that wrote the change, on a machine nobody else
can look at, and then typed into a file. Nothing re-ran any of it. There is no
record anyone can open. If the number had been wrong — mistyped, measured
before the last edit, taken on a tree with uncommitted changes — nothing in the
project would have noticed.

`beta` means a stranger may rely on this product. A stranger cannot re-run a
script that ran on our machine last Tuesday.

**This is not a suspicion that anyone lied.** We re-ran the suite while writing
this and it is green. The point is that "we re-ran it and it is green" is again
a sentence, produced the same way as the last one, and the next one depends on
the next person choosing to look.

**And it is not theoretical.** A sister product recorded a stage gate as met off
twelve local runs; a later re-measurement at forty found the same suite failing
one time in thirteen. Nobody was careless. The number was simply never taken by
anything but a person who happened to check.

## What "working" will mean

- **Every push and every pull request is checked by a machine**, in public,
  with a page anyone can open — including someone who does not trust us and has
  no account here.
- **The machine runs the tests and the type-checker**, and says out loud, in
  the same output, what it did **not** run and why. A green tick over a
  narrower check than the words imply would be worse than no tick at all,
  because a tick is read as an answer.
- **It blocks nothing.** Nobody is stopped from merging by a machine. The rule
  about what may merge does not change, in this product or any other. That
  question is open elsewhere, with a default that keeps the rule exactly as it
  is, and this work does not lean on the answer.
- **It costs nothing.** The repository is public, so the minutes are free. No
  account, no card, no key, no request of you.

## What we found while looking, and are fixing inside this

Two of these are the reason the work is worth more than "switch CI on".

- **The type-check command we would have run checks a third of the product.**
  `npm run typecheck` at the top of the repository says "check every
  workspace, if it has a check" — and the workspace holding every line that
  touches the web, the database, mail and sign-in **has no check**, so it is
  skipped in silence and the command reports success. A machine running that
  and reporting "type-check green" would be publishing a badge over a fraction.
  We add the missing check (it passes as-is) and make the command refuse to
  skip a workspace rather than pass over it.

- **One test in the suite drives the live public website.** It opens a real
  browser, loads `booking.pumasi.ai`, and presses the sign-in buttons. It is a
  good test and we are not touching it, but on a shared machine it would make
  the result depend on a third party's uptime and on a deployment that is four
  builds behind the code being tested — so it would go red for reasons that
  have nothing to do with the change. It is **left out of the machine's run,
  and the run says so, by name, every time.**

## What we are deliberately not building

- **No blocking check, and no request that you turn one on.** No branch
  protection, no required status check, nothing that stops a merge.
- **No deployment.** Who carries a merged build to `booking.pumasi.ai` is a
  question already open and already waiting; this changes nothing about it.
- **No test deleted, skipped or edited.** Not one, including the live-website
  one.
- **No product code changed.** This adds a checking machine, a script that says
  what it checks, and one missing type-check command. Nothing a user meets
  moves.

## What we are unsure about — with the answer we assume on silence

1. **The part of the product that actually serves `booking.pumasi.ai` is
   type-checked by nothing at all** — it is excluded from both of the
   workspace's type-check configurations, so neither the build nor the tests
   compile it. Only the deployment tool sees it, at deploy time. We can make
   the machine *build* it on every push for free, which catches a missing file
   or a broken import, and we do. We cannot make the machine *type-check* it
   without adding a dependency and a new configuration, and that may surface
   real errors whose repair is product work this change may not do.
   *Assumed on silence: build-check it now, say plainly in the output that a
   build is not a type-check, and hand the type-check to the roadmap as its
   own ranked item.*

2. **The suite is sensitive to how loaded the machine is.** Nineteen of its
   files each start a real database server, and when we ran the suite on a
   busy machine this afternoon it failed between 13 and 32 of its 311 checks —
   never on an assertion, always on a database refusing to start. On a quiet
   machine it is 311 of 311. This is a property of the suite, not of any
   change, and the honest thing is to let the machine report what it finds
   rather than tune it until it is quiet.
   *Assumed on silence: run the suite as the product's own command runs it,
   print the machine's size in the log so a red run is diagnosable, and hand
   the flakiness to the roadmap as its own ranked item rather than papering
   over it here.*

3. **The machine's own run is one more thing that could be believed without
   being read.** Its value is that anyone can open it — so it prints what it
   ran, what it skipped, and why, rather than a tick.
   *Assumed on silence: verbose and checkable beats short and reassuring.*
