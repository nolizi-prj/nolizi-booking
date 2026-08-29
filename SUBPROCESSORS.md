# Who else sees data

**Every third party that can see personal data held by this service, what they
see, and why.** An unnamed subprocessor is data shared without disclosure,
whatever the intention.

The published register — the one people are actually pointed at, from the
privacy notice and from every public page — is served by the running service at
**`/subprocessors`**, and its text lives in
[`service/src/legal.ts`](service/src/legal.ts) so that there is exactly one copy
of it. This file explains the part that is *code*: how the list is enforced.

---

## Enforced, not merely written down

`SPEC-0002` D6: the service **refuses to start** if configured to send mail
through a host that does not appear in `service/src/subprocessors.ts`. Adding a
provider means editing the register text and that file **together**, in a change
anyone can read.

| Permitted mail host | Why |
|---|---|
| `localhost`, `127.0.0.1` | Development only — a local SMTP server or capture tool. |
| `smtp.ethereal.email` | Testing. Ethereal **captures and never delivers**, so nothing reaches a real inbox. |
| `smtp.gmail.com` | Production mail for pumasi.ai. |

The deployed service does not use SMTP at all: it sends through the **Gmail API**
(`service/src/mail-gmail.ts`), because Cloudflare Workers cannot open SMTP
connections. The check above governs the SMTP path that the self-hosted Node
build uses.

## In use by the deployed service, as of 2026-08-29

Stated here as well as in the served register, because a reader of the
repository should not have to run the service to find out.

| Provider | Sees | Why |
|---|---|---|
| **Cloudflare** | Everything stored — accounts, bookings, bookers' names and addresses, encrypted calendar credentials — plus connection data including IP addresses. | It is the platform: compute and database. Each customer organisation sits in its own isolated database. |
| **Google (Gmail API)** | Recipient address, name, meeting time, and the text of any workflow message. | Sending confirmations, sign-in links and reminders. |
| **Google Calendar** | Busy start/end times; with the separate write grant, the events it creates (title carries the booker's name, description their address). | Only when an account holder connects a Google calendar. |
| **Microsoft Graph** | The same, for Microsoft 365 / Outlook. | Only when an account holder connects one. |
| *date.nager.at* | **No personal data** — a country code and a year. | Public-holiday dates, on request. |

> **Superseded:** an earlier version of this file said *"Currently in use: None.
> No deployment holds anyone's data yet."* That stopped being true when the
> service went live on 2026-08-28. It is recorded here rather than quietly
> replaced, because a register that silently rewrites its own past is not
> evidence of anything.

## Retention, and how far deletion reaches

Stated in full in the [privacy notice](service/src/legal.ts) served at
`/privacy`. In short: application data is deleted immediately and verified by
absence; abuse counters expire after two hours; **there is no backup system in
this service**, so today there is nothing to expire from one; and **mail already
sent cannot be recalled** — that is stated rather than implied.
