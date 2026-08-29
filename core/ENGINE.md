# The availability engine

**Availability computation and booking.** Apache-2.0, embeddable, no server
required.

A pure function: no clock of its own, no I/O, no ambient state. Same inputs,
byte-identical output.

This is `core/`, the engine inside **Pumasi Booking**. It is a workspace rather
than a package on a registry: it has no dependants outside this repository, and
publishing an interface before anyone consumes it is how a wrong interface gets
locked in. If you want it on its own, `git subtree split --prefix=core` gives
you every commit that ever touched it.

```ts
import { computeSlots } from '@pumasi/booking-core';
```

```ts
const { slots, diagnostics } = computeSlots({
  owner_timezone: 'America/New_York',
  availability: [{ weekday: 'MO', start: '09:00', end: '11:00' }],
  duration_minutes: 60,
  granularity_minutes: 60,
  query: { from: '2026-06-01T00:00:00Z', to: '2026-06-02T00:00:00Z' },
  now: '2026-06-01T00:00:00Z',   // required — the clock is injected, never read
});
// [ 13:00–14:00Z, 14:00–15:00Z ]
```

## Why this exists

Scheduling looks small and is subtly wrong almost everywhere. This library is
deliberately hard at the places where that happens:

| Case | What this does | The common mistake |
|---|---|---|
| Window spanning spring-forward | Yields **two** absolute hours | Yields three |
| Local time that never occurs | **Skipped**, with a diagnostic | Silently shifted forward |
| Window containing the repeated fall-back hour | Yields **three** hours, both bookable | Yields two |
| A zone that skips a whole calendar day | Correctly **nonexistent** | Read as an ambiguous hour |
| Daily booking cap | Counts on the **owner's** local date | Counts on UTC's, or the requester's |

These are the cases calendar arithmetic is easiest to get wrong, which is why
each one is a named acceptance case here rather than left to the implementation.

*This sentence used to read "Both category leaders have open bugs in two of these
today." It cited nothing, and it is removed rather than sourced.* The only
competitor defect this repository cites is Cal.com issue #23365, in
[`spec/SPEC.md`](spec/SPEC.md) — it concerns **week-boundary limits**, which is
not one of the cases above, and its own author records it as *evidence that the
boundary is error-prone, not proof of any particular rule*. That citation could
not support the claim it was being used to make, and one of the products is
closed-source, so nobody outside it could check the claim either way. A project
that discards uncited objections in review does not get to make uncited
assertions about other people's software in its own documentation.

**The clock is an argument.** `now` is required. A function that reads the
system clock cannot have deterministic tests, and a non-deterministic test
cannot be the arbiter of correctness.

## What it does not do

No storage, no network, no recurrence expansion (bring an RFC 5545 library), no
timezone arithmetic of its own (it uses Temporal). Booking semantics are
defined here — exclusivity, idempotency, cancel, reschedule — but the guarantees
under real concurrency belong to whatever store you supply, because an
in-process check is a time-of-check-to-time-of-use race.
[`service/`](../service) supplies a PostgreSQL store that keeps them with
database constraints.

## The specification is the truth

[`spec/SPEC.md`](spec/SPEC.md) states what must be true and why each clause
exists — every one of them is a documented way this gets built wrong.
[`spec/acceptance/cases.json`](spec/acceptance/cases.json) is the executable
arbiter: 36 language-neutral cases any implementation can be run against.

```bash
npm test -w @pumasi/booking-core   # 12 unit tests + 36 acceptance cases
```

**On timezone data.** The suite's answers depend on the IANA database, so the
runner asserts the six transitions the expected values actually rely on. A
disagreement halts the run; a version difference alone is reported as a finding.
That is stricter than checking a version string, and looser only where it does
not matter.
