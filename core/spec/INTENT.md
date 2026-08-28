# What we think you want — scheduling core

**One page. For the steward. No jargon, no clause numbers, no test IDs.** Confirm it or correct it. Everything downstream is built against this page, and if this page is wrong, nothing further can catch it — every agent reviewing the work will be checking against the same mistaken idea.


## What we understood

You want the piece of software that works out **when a person is free**, and **books a meeting into one of those free times.**

Not a product. A component, meant to be embedded in other people's software.

It exists because the best existing option, Cal.com, is more complete than anything we will build — but its licence stops anyone from putting it inside commercial software. This commons is committed to a licence that allows exactly that. **We are not building it because we think we can do it better. We are** **building it because that one is legally unavailable to the people who need it.** That is stated in `ALTERNATIVES.md` so nobody has to discover it later.

We will not copy Cal.com, but we will review them carefully and implement all the features and UX if needed in a similar or same way. In addition, we will implement even some features which are not included in the free tier.

**How we do that without breaking the licence promise.** Features and behaviour are not copyrightable — we can match them freely, and intend to. Implementation is. So the agent that reads Cal.com's code is never the agent that writes ours: one studies it and writes down *what it does*, another builds from that description alone, having never seen the original. That separation is recorded on every change, because the commitment to a permissive licence is the one promise here that cannot be amended or apologised for afterwards.

Two specifics worth knowing. Cal.com's paid tier is **not** open source — it is proprietary and more restricted than the free part, so we study its *behaviour* only and never its code. And the enterprise features you would want from it, single sign-on and the like, are built on public standards, so we implement them from the standards directly and never need to look.

**This first piece is the engine, not the whole product.** The parity ambition is real and is written down as [`GAP-0004`](https://github.com/pumasi-ai/pumasi/blob/main/gap/0004-feature-parity.md), sequenced item by item. The list below is what is out of scope *for this piece*, not what we will never build. 

## What "working" will mean

If these are all true, it works:

- You say "I'm free Mondays, 9 to 11, my time." Someone on the other side of the world asks what's available and gets **the right actual moments**, not times that are an hour off.

- **Two people can never end up with the same slot** — not even if they book at the same instant.

- On the two days a year the clocks change, the answers are still right. *This is* *where most scheduling software quietly breaks*, and where the market leader has an open bug today.

- If someone cancels, that time **genuinely becomes free again** for anyone else.

- If someone moves a meeting, they never end up holding **two** slots, and never end up holding **none** — even if someone else grabs the new time at the same moment.

- Asked the same question twice, it gives **exactly the same answer**. No hidden dependence on what time it happens to be when you ask.

## Not in this first piece

- Any screen or user interface

- Connections to Google Calendar, Outlook, or anything else

- Emails, reminders, notifications

- Payments

- Team scheduling, round-robin assignment, or meetings with several attendees sharing one slot

- Limits like *"no more than five meetings a week"* — only per-day limits exist

Each is written down with a reason, so its absence is a decision on the record rather than something forgotten. **Every one of them is on the parity roadmap** — sequenced after the engine, not abandoned. Building the engine first is what makes the rest cheap: every feature above depends on "when is this person free, and can this slot be claimed" being correct.

**And we have checked that adding them later will not mean starting over.** We went through the roadmap and found the two places where a later feature would have forced us to *contradict* something written now, and reworded those two — nothing else, and no behaviour changed. Building the rest of it early would be the mistake we already made once with the governance rules.

Two things are **not** on the roadmap at all, by your decision: payments, and AI making scheduling suggestions. Payments bring handling other people's money and the compliance that comes with it. AI suggestions would put a component that can give different answers to the same question inside a system whose main promise is that it never does.

## What we were unsure about — all three answered

**Answered by the steward, 2026-08-01.** Nothing on this page is open.

**1. Should times come out in the requester's timezone, or in a neutral one?**
→ **Neutral.** Everything comes out in one format and whoever displays it converts for the reader.

This is the answer we recommended, and it settles a real inconsistency: the duplication finding had listed cross-timezone display among the things this piece would build, while the spec said it would not. The finding has been corrected to match. Converting timezones is the single largest source of bugs in scheduling software, and keeping it out means a mistake shows up immediately at the edge, in one place, rather than silently inside the engine. Adding a display layer later stays easy — the engine is unchanged by it.

**2. Are per-day booking limits enough for a first version?**
→ **Yes.** Weekly, monthly and total-hours limits move to the roadmap, where they sit as the next item after this one.

The reason to hold them is not doubt about wanting them — it is that a weekly limit forces a decision about *when a week begins*, which differs by country and is currently a live bug in the market leader. Better decided against a working engine than guessed at now.

**3. Is a component the right shape for this piece?**
→ **Yes, a library.** Something runnable is where this ends up, but as the next piece rather than this one.

A runnable service needs storage, an interface others call over a network, and a way to know who is asking — three things that each bring their own way of harming someone, and none of which make the timezone arithmetic more correct. Build the part everything stands on, prove it, then wrap it.


## What happens after you confirm

Agents write the detailed specification and its tests. A different AI model reviews that specification. The tests are frozen before any code is written, so the standard is fixed before anyone knows whether the code will meet it. Then it gets built, reviewed by different models again, and you see one more page — a plain-language note — before anything is released.

You will not be asked to read the specification or the tests.


|  |  |
| - | - |
| **Steward** | *pending signature* |
| **This deserves to exist** | *pending* |
| **This page is correct** | *pending* — the three questions above are answered, so nothing is left open on it |
| **May touch a can-hurt surface** | *pending* — booking on a real person's behalf |


*The steward is also the sponsor of this item. That conflict is recorded in the* *debt register rather than hidden; the control against it is that the tests are* *frozen before implementation, and that the reviews come from models that did not* *write the work.*

