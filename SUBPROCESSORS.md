# Who else sees data

**Every third party that can see personal data held by this service, what they
see, and why.** Published before any of them receives anything, which is the
point — an unnamed subprocessor is data shared without disclosure, whatever the
intention.

This list is **enforced, not descriptive**: the service refuses to start if
configured to send mail through a host that does not appear here
(`SPEC-0002` D6). Adding a provider means editing this file and
`apps/service/src/subprocessors.ts` together, in a change anyone can read.

---

## Currently in use

**None.** No deployment holds anyone's data yet, and no mail has been sent to a
real recipient.

## Permitted, when configured

| Provider | Sees | Why | Where |
|---|---|---|---|
| `localhost`, `127.0.0.1` | Everything in a message | Development only — a local SMTP server or a capture tool. | Your own machine |
| `smtp.ethereal.email` | Message contents, recipient addresses | Testing. Ethereal **captures and never delivers**, so nothing reaches a real inbox. | Ethereal, EU |

Anything else must be added here first, with an honest answer in each column.

## What a mail provider necessarily sees

The recipient's **email address**, their **name**, and the **date and time of
their meeting** — because those are in the message. There is no way to send a
confirmation without the sender of it seeing the confirmation.

That is the reason choosing a provider is not a small decision: it is choosing
who else holds your bookers' details. It should be made on data-processing terms
and residency, at the same time as the question in `DEBT.md` D-105.

## What a hosting provider necessarily sees

Whoever runs the machine can read the database on it. That is true of every
hosted service and is not specific to this one; it is stated because a
subprocessor list that omits the host is not a list of who sees the data.

Self-hosting removes this entirely, which is why
[the commercialization foundations](./pumasi-commercialization-foundations.md)
make self-hosting first-class forever.

## Retention — how far deletion actually reaches

`SPEC-0002` D7 requires this be stated rather than implied.

| | |
|---|---|
| **Application data** | Deleted immediately, and verified by absence rather than by a flag. A booker deleting their details, or an owner deleting their account, removes the rows. |
| **Database backups** | **Whatever the operator configures. There is no backup system in this service**, so today the answer is "none, because there are none". An operator who adds backups inherits the duty to say how long they keep them. |
| **Mail already sent** | **Cannot be recalled.** A confirmation containing a name and a meeting time is in the recipient's mailbox and in the provider's logs. Deletion here does not reach it, and no promise is made that it does. |
| **Public reports** | Contain no owner or booker data at all (`SPEC-0002` D5), so there is nothing to delete. |

The honest summary: deletion removes what we hold. It does not un-send mail, and
it cannot reach copies other people have made.
