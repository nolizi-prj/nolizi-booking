# SPEC-0008 — the public booking page shows the times it has

**Status:** implemented · **Intent:** [`INTENT.md`](INTENT.md) ·
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json) ·
**Runner:** `service/test/booking-slots.test.ts` (B-001..B-006),
`service/test/feedback.test.ts` (S3)
**Source:** `roadmap/BACKLOG.md` item 2 · [issue #32](https://github.com/pumasi-ai/pumasi-booking/issues/32)
**Written at:** `c000feb`

---

## S1 · The defect, at a line number

**`service/src/pages.ts:985` at `c000feb`** — the `forEach` over
`byDay[pickedDay]` (`:974`–`:985`) in the public booking page's client-side
`render()` built each time button, wired its `onclick`, and never appended it,
so a day rendered as available showed an empty times list. The missing
`times.appendChild(b)` belongs between `:984` and the loop's closing `:985`;
after the repair it is **`:989`**.

The line `times.appendChild(b);` was deleted by **`50f911f`** ("Add smart form
defaults, duration chips, quick preset toolbars, and booker memory across
availability, event editor, and workflows"), which inserted a `try` block
reading `localStorage` immediately after the `forEach` and removed the
`appendChild` in the same hunk. Nothing in that commit's subject or scope
concerns the slot list. `git log -L 970,990:service/src/pages.ts` shows the
deletion as a lone `-` line inside an otherwise additive hunk.

## S2 · Why every existing check was green

The consequence is confined to the DOM the page builds at runtime:

- The server's payload is unaffected. `#slots-data` carries every slot, dated
  correctly. Job `0061` measured 25 of them on the live page.
- The page *string* is unaffected. The renderer extracted from the live HTML
  and from this tree was **byte-identical, 5151 characters** — which is why
  `BACKLOG.md` item 2 correctly concluded that deploying does not close this.
- Nothing throws. `pd.textContent` at `:972` is assigned from
  `byDay[pickedDay][0].start` and succeeds, so the heading is right; two lines
  later the loop runs to completion over a non-empty array and appends nothing.
  The reporter's `0 error(s) captured` is accurate, not a widget failure.

**The suite had 331 service assertions and not one of them executed this
code.** Every check on the booking page reads the rendered HTML as a string.
The bug is in what that string *does*, not in what it *says*, and a string
assertion is structurally incapable of seeing it. `browser-live.test.ts` drives
a real browser but only against the live deployment's front door, login and
feedback widget — never a booking page's calendar.

That gap, not the deleted line, is what let this live for four weeks.

## S3 · The second finding, and a correction to how it was described

`BACKLOG.md` item 2 hands up a second finding: the report's **Page URL**
diagnostic read `/app/event/06f1bfbc-…` while the screenshot showed
`/yunyoungmok/abc`, described as a fidelity defect in `feedback.ts`.

**Measured rather than inherited, that description is wrong, and the correction
matters because the proposed remedy would have been wrong too.** Neither value
is inaccurate:

- `pages.ts:631` and `:724` set `url: location.href`. That is the page the
  widget ran on, reported faithfully.
- The image comes from `captureDisplayMedia` (`pages.ts:545`), which calls
  `navigator.mediaDevices.getDisplayMedia`. The browser — not the page — asks
  the person which tab, window or screen to share. `preferCurrentTab: true` is
  a **hint**; it does not constrain the choice.

Two corroborating observations: the screenshot contains a **browser address
bar**, which neither `html2canvas` nor `drawFallbackCanvas` (`pages.ts:522`)
can draw because both render DOM only; and its 1303 px width does not match the
reported 1920 px viewport, as a DOM render would.

So there was no wrong value to fix. The defect is that the report puts a field
named **Page URL** next to an image that may be of a different surface, with
nothing saying they can disagree — and a reader who trusts the pairing goes to
the wrong page, which is exactly what item 2 reports happening.

**The change:** rename the field to **Reported From**, and print one line under
the image saying it may show a different tab or window. `feedback.ts` only;
no capture behaviour is altered. Asserted in `feedback.test.ts`.

**Not done, and why:** constraining the capture to the current tab is not
available — `getDisplayMedia` has no such option, by design, because the
picker is a browser security surface a page may not bypass.

## S4 · The change

1. `service/src/pages.ts` — restore `times.appendChild(b);` inside the
   `byDay[pickedDay].forEach` of the booking page's `render()`, with a comment
   naming issue #32 so a future edit in that hunk sees why it is load-bearing.
2. `service/test/booking-slots.test.ts` — **new.** Serves this tree's own
   `bookingPage()` output over loopback and drives it in Chrome, in
   `America/Chicago`, the reporter's zone.
3. `service/src/feedback.ts`, `service/test/feedback.test.ts` — S3.

4. `service/spec/0008/acceptance/cases.json` was **amended to v1.0.1 after the
   code review**, in the open: the environment gloss claimed the fixture
   *mirrored* the live payload when it is modelled on its shape and differs in
   count (25 against the live 24), and the runner's own comments misdescribed
   the second day as ending 21:30Z when the loop ends at 20:00Z. **No case,
   clause, step or assertion changed** — only prose that overstated its own
   provenance. Both were found by `reviews/20260831-224335-code-glm.md` §3.1
   and §3.2, and both are corrected rather than argued past.

**Nothing else changes.** No frozen acceptance case under
`service/spec/*/acceptance/` is amended, so **Q-030 is not reached** in either
direction and no evidence is added to it.

### S4a · Why the artefact runs a browser rather than parsing the renderer

The alternative was a DOM-level unit test over the renderer extracted from the
page string. **It would have passed at `c000feb`.** The extracted renderer was
byte-identical on both sides of the deployment — job `0061` measured exactly
that — so any assertion over the extracted text is an assertion about a string
that did not change. Only *running* it distinguishes the two states.

The page under test is `bookingPage()`'s own output, not a fixture copied from
it, so the artefact cannot drift from the shipped page: if the page stops being
served, the test stops running.

**The cost, measured rather than asserted, since the packet asks for the
measurement if it is too slow:** 6.821 s wall for six cases including browser
launch, against 18.24 s for the whole root suite before this change. It is
**not** too slow and is **not** put behind a separate script. It runs in the
default suite, where the packet's standard — *"a repair for a client-side
defect that no assertion can redden"* — requires it to be.

Flakiness: the server is loopback with a fixed body, the slot data is a
hard-coded constant, the timezone is pinned with `emulateTimezone`, and there
is no network. Measured at **10 consecutive runs, 60/60 cases, 0 failures**
(§S6).

**One thing that is pinned and one that is not, so a future reddening is not
misdiagnosed.** The timezone is pinned; the *clock* is not. The live
reproduction at 03:21:28 UTC was 22:21 on 31 August in the reporter's zone and
still showed September with 1 and 2 marked, which is evidence the grid and the
default day are slot-driven rather than wall-clock-driven — but all 60 green
runs come from one evening. If some client path does consult `Date.now()`,
these cases could redden once 2026-09-02 is past. That would be a runner
robustness repair — dated fixture generation or virtual time — and **not** a
case change or a regression in `pages.ts`. Raised by the code review
(`reviews/20260831-224335-code-glm.md` §3.3).

### S4b · Why the in-page code is passed as strings

This workspace compiles with `lib: ["ES2022"]` and no `dom`, which is what
stops server code from referencing browser globals and typechecking clean.
Widening it to describe the page under test would weaken the guard the test is
standing next to. The in-page expressions are therefore strings handed to
`page.evaluate`, outside the type system — which is where they live at runtime
anyway. `tsconfig.json` is unmodified.

## S5 · The cases

`acceptance/cases.json` is the truth; the runner is its executable form.

**B-001..B-004 must fail against `c000feb` and pass after** — for a defect spec
the proof is that the test fails *before* ([L-006](https://github.com/pumasi-ai/pumasi/blob/main/lessons/L-006-a-defect-spec-proves-itself-by-failing-first.md)).
Measured: at `c000feb`, `# pass 2 · # fail 4`, B-001 `expected 12, actual 0`
and B-002 `expected 13, actual 0` — the live symptom exactly, with no thrown
error, matching the reporter's `0 error(s) captured`.

**B-005 and B-006 are green on both sides on purpose.** They are the claim that
nothing else moved, and a claim that cannot fail is decoration, so each names
the deliberate mutation that reddens it and §S6 records that mutation being run.

## S6 · Verification

| | Before (`c000feb`) | After |
|---|---|---|
| `booking-slots.test.ts` | **2/6** — B-001..B-004 red | **6/6** |
| `core` unit | 19/19 | 19/19 |
| `core` frozen acceptance | 36/36 | 36/36 |
| `service` | 331/331 | **338/338** (+6 B-cases, +1 S3 case) |

Three consecutive runs each side; `npm run typecheck` clean across both
workspaces and the worker config. Full figures in the return record.

**Against the live deployment**, `booking.pumasi.ai/yunyoungmok/abc`, headless
Chrome 150.0.7871.186, `emulateTimezone('America/Chicago')`:

- **2026-09-01 03:21:28 UTC** — 200, 24 slots parsed, day cells `.has` = `1`,`2`,
  `#picked-day` = `Tuesday, September 1`, `#times.children.length` = **0**,
  `#times.innerHTML` empty, **no `pageerror`, no console error**.
- **After the merge — unchanged, and that is the point.** The live worker is
  built from a commit that predates this repair and **`booking.pumasi.ai` still
  shows the reporter an empty times list**. Deploying is `DECISIONS.md`
  **Q-012**, open and explicitly outside CHARTER Part 0's proceed-on-default
  rule; this seat did not deploy, did not propose a deployer and set no date.
  **Issue #32 is therefore not closed by this merge.**

## S7 · Risk

**Can-hurt**, and the classification is reasoned rather than defaulted.

`RISK_ZONES.yaml` does not map `service/src/pages.ts` — the repository's only
copies are `core/spec/RISK_ZONES.yaml` and `service/spec/0002/RISK_ZONES.yaml`,
and neither has an entry for it. **CHARTER Part 4 defaults an unmapped path to
can-hurt**, so that alone settles it.

It does not rest on the default alone. Part 4's own words: *"anything that
books … on a real person's behalf."* This is the code path a booker uses to
choose a meeting time, and `render()` writes the `start` and `end` a booking is
made from — the F2 invariant B-004 asserts. It handles the decision, and under
Part 4's inheritance rule that is what can-hurt means.

A release note and its **7-day window** are therefore owed, in the shape of
`Q-035` and `Q-037`, and are filed with this work.
