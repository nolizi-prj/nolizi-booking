# Who else sees data

**Every third party that can see personal data held by this service, what they
see, and why.** An unnamed subprocessor is data shared without disclosure,
whatever the intention.

The published register — the one people are actually pointed at, from the
privacy notice and from every public page — is served by the running service at
**`/subprocessors`**, and its text lives in
[`service/src/legal.ts`](service/src/legal.ts) so that there is exactly one copy
of it. This file explains the part that is *code* — how the list is enforced —
and restates the list below, so that a reader of the repository does not have to
run the service to find out. **The two are meant to say the same thing and, as of
this revision, do not: see the corrections at the foot of the next section.**

---

## Enforced on one path, reviewed on the other — and the difference matters

`SPEC-0002` D6: **on the self-hosted Node build**, the service **refuses to send
mail** through a host that does not appear in `service/src/subprocessors.ts`, and
says so loudly at startup. Adding a provider means editing the register text and
that file **together**, in a change anyone can read.

**The deployed service is not covered by that check**, and the scope is stated
here rather than at the foot of the section, because a reader who stops after the
first paragraph should not come away believing production has a runtime guard it
does not have. Cloudflare Workers cannot open SMTP connections, so the deployment
sends through the Gmail API and never constructs the SMTP transport the check
guards. What controls the deployed path is not a runtime allowlist but which
transport `service/src/worker.ts` constructs — a code change, visible in review
and in history, and disclosed in the table below. That is a weaker control than
the Node path has, and it is named as weaker rather than described in language
that borrows the stronger one's credit.

It does **not** refuse to start. Bookings still work and the pages stay up;
confirmations are queued rather than delivered until the host is disclosed. The
duty this register creates is that nobody's name, address or meeting time reaches
an undisclosed party — stopping the mail discharges that exactly, while taking
the whole service down over an undeclared SMTP host was an outage nobody chose
and no regime requires.

| Permitted mail host | Why |
|---|---|
| `localhost`, `127.0.0.1` | Development only — a local SMTP server or capture tool. |
| `smtp.ethereal.email` | Testing. Ethereal **captures and never delivers**, so nothing reaches a real inbox. |

**That is the whole list**, and it is
[`PERMITTED_MAIL_HOSTS`](service/src/subprocessors.ts) read back into prose. **No
production mail host is on it.** A self-hosted Node deployment that points its
SMTP URL at a provider absent from that constant — Gmail's SMTP endpoint
included — gets the loud startup refusal and the queued confirmations described
above. An earlier version of this table said otherwise; see the correction at the
foot of the next section.

The deployed service does not use SMTP at all — see the scope note above — and
sends through the **Gmail API** (`service/src/mail-gmail.ts`), which is not an
SMTP host and is not what this allowlist checks. It is disclosed as a
subprocessor in the table below instead, which is the only control on that path.

## In use by the deployed service, as of 2026-09-01

Every row below was re-read against the source in this tree on that date, not
carried forward from the previous revision. Which build `booking.pumasi.ai` is
actually serving is answered by `curl https://booking.pumasi.ai/version`, and
this table describes that build's source rather than a claim about the
deployment; the repository is not the deployment, and nothing in this project
carries one to the other automatically.

| Provider | Sees | Why |
|---|---|---|
| **Cloudflare** | Everything stored — accounts, bookings, bookers' names and addresses, encrypted calendar credentials — plus connection data including IP addresses. | It is the platform: compute and database. Each customer organisation sits in its own isolated database. |
| **Google (Gmail API)** | Recipient address, name, meeting time, and the text of any workflow message. | Sending confirmations, sign-in links and reminders. |
| **Google Calendar** | Busy start/end times; with the separate write grant, the events it creates (title carries the booker's name, description their address). | Only when an account holder connects a Google calendar. |
| **Microsoft Graph** | The same, for Microsoft 365 / Outlook. | Only when an account holder connects one. |
| **Zoom** | On a booking for an event type whose location is set to Zoom: the meeting title, which carries the booker's name; the agenda line, which carries the booker's name **and email address**; and the start time, duration and the account holder's timezone. | Minting a fresh meeting room for each booking instead of publishing a standing personal room. Nothing is sent for an event type with any other location. |
| *date.nager.at* | **No personal data** — a country code and a year. | Public-holiday dates, on request. |

**Whose authorisation the Zoom call is made on, and when nothing is sent at
all.** There are two routes and they are not the same disclosure, so both are
named. The first is the **account holder's own connection**: they press "Connect
with Zoom", the grant is exchanged and sealed before it touches a row
([`service/src/video.ts`](service/src/video.ts)), and the meeting is created with
that account holder's token, on their authority, for a booking on their own event
type. The second is a **server-to-server credential belonging to whoever runs the
deployment**. It is tried only after the first route produces nothing, and it
fires **on the operator's authorisation rather than the account holder's** — so
on an event type set to Zoom, a booking can reach Zoom even though that account
holder never connected anything. If neither route has a credential configured, no
request leaves the service: the server-to-server helper returns before it opens a
connection.

At connect time Zoom receives no booker's data. The service asks Zoom for the
connecting account's own profile and stores the address, display name and
personal meeting room it returns; the booker's details go to Zoom only when a
meeting is created, and only in the two fields named in the row above.

> **Superseded:** an earlier version of this file said *"Currently in use: None.
> No deployment holds anyone's data yet."* That stopped being true when the
> service went live on 2026-08-28. It is recorded here rather than quietly
> replaced, because a register that silently rewrites its own past is not
> evidence of anything.

> **Superseded, 2026-09-01 — Zoom was in the deployed build and in neither copy
> of this register.** The table above did not name Zoom until this revision, and
> **the served register at `/subprocessors` still does not.** The commit that
> stores a Zoom connection is an ancestor of the build `booking.pumasi.ai` is
> serving — `curl https://booking.pumasi.ai/version` names that build, and
> `git log` will place the commit against it — so this was a provider in
> production that the published list did not disclose. The served page's text is
> in [`service/src/legal.ts`](service/src/legal.ts), which is application code and
> is not this file's to change; that repair is queued as separate work and has not
> landed. **Until it does, the register a customer is actually pointed at omits a
> provider that this file names, and this file is ahead of the published one
> rather than a record of it.** Recording that is the point: a register that
> silently rewrites its own past is not evidence of anything, and a register that
> corrects only the copy nobody is sent to is not a disclosure.
>
> Two further gaps between the two copies were measured the same day and are
> equally not repairable from here. The served page states that the allowlist is
> enforced by the software without the scope note this file carries — on the
> deployed Cloudflare build nothing checks it, because that path sends through the
> Gmail API and never constructs the SMTP transport the check guards. And the
> served page's "Adding one" section says account holders are told before an
> addition takes effect. Whether that clause was owed for this addition, and what
> is owed now, is the steward's question and this file does not answer it.

> **Superseded, 2026-09-01 — the permitted mail host table listed a host the
> code refuses.** It carried a third row, `smtp.gmail.com`, described as
> *"Production mail for pumasi.ai"*, against a
> [`PERMITTED_MAIL_HOSTS`](service/src/subprocessors.ts) that does not contain it.
> That file's own header says it "is the same list as SUBPROCESSORS.md in
> machine-readable form" and that "the two must be edited together"; they were not
> the same list. The row is struck from this table rather than added to that
> constant, because the enforced list is the behaviour and this table is only the
> description of it — and because a self-hoster who followed the description got
> the startup refusal and the queued mail that this document told them they would
> not get.

## Retention, and how far deletion reaches

Stated in full in the [privacy notice](service/src/legal.ts) served at
`/privacy`. In short: application data is deleted immediately and verified by
absence; abuse counters expire after two hours; **there is no backup system in
this service**, so today there is nothing to expire from one; and **mail already
sent cannot be recalled** — that is stated rather than implied.
