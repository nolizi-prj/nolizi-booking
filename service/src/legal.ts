/**
 * D-105 — the privacy pack.
 *
 * These documents answer the four questions D-105 says must be answered before
 * an account exists that is not the steward's: **what is collected, on what
 * basis, how someone deletes it, and where it lives.**
 *
 * Every factual claim here is checkable against the code, and that is the point
 * — a privacy policy that describes a system nobody built is the most common
 * kind of lie in software. Where the honest answer is "nothing yet" or "we
 * cannot", it says so. Where a decision is the steward's or counsel's to make,
 * it was marked [TO BE COMPLETED] rather than invented. The operator (ATX APPLE
 * LLC, a Texas limited liability company) and the governing law were supplied by
 * the steward on 2026-08-29, and re-confirmed by them on challenge before these
 * pages went out: a second session held its deploy and asked for the provenance
 * of a corporate identity about to be published to a live indexed site. The
 * trace is in governance DEBT.md D-105 rather than only in a transcript, because
 * these three pages assert it publicly. The registered address is deliberately NOT
 * published: the steward asked that nothing be disclosed beyond what is needed,
 * and an email contact discharges the duty to be reachable. What remains
 * genuinely unreviewed by counsel is the transfer position, which the documents
 * now state factually ("processed in the United States") instead of claiming a
 * mechanism nobody has executed.
 *
 * The prose lives here rather than in a Markdown file because both hosts serve
 * it and there must be exactly one copy. Cross-references that must stay true:
 *   src/app.ts          what is stored on booking, and the deletion paths
 *   the migration files the columns that exist at all
 *   SUBPROCESSORS.md    who else sees data (enforced by src/subprocessors.ts)
 */

export const LEGAL_VERSION = '1.0';
export const LEGAL_EFFECTIVE = '2026-08-29';

/** Shown on every legal page: honest about review status, not disclaiming force. */
const STATUS =
  'Status: in force for everyone using this service. Written by the people who ' +
  'built it and not yet reviewed by a lawyer — we would rather say so than ' +
  'imply a review that has not happened. Version ' +
  LEGAL_VERSION + ', effective ' + LEGAL_EFFECTIVE + '.';

export interface LegalDoc {
  slug: string;
  title: string;
  body: string;
}

export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy',
  body: `
## Who holds what, and in which role

Pumasi Booking is scheduling software. Two different relationships run through it,
and they carry different duties.

- **For the people who own booking pages** (an account holder, and the company
  they work for) we are the **controller** of the account itself: the address you
  sign in with, your name, your settings.
- **For the people who book a meeting** — everyone who fills in a booking page —
  we are a **processor** acting for the account holder. They decide to collect
  it; we hold it on their behalf and act on their instructions. If you booked a
  meeting and want your details removed, the fastest route is the link in your
  confirmation email, described below; you may also contact us and we will act.

Operator: **ATX APPLE LLC**, a Texas limited liability company, United States.
Contact us about anything on this page at **admin@pumasi.ai** — that address
reaches the people who run the service, and it is the fastest route.

## What is collected

Nothing about *you* is collected that the meeting does not require. This is the
complete list of what the service stores about a person. The software's own
self-reporting is described at the end of this section, and today it sends
nothing at all.

**If you book a meeting**, the booking page asks for and stores:
- your **name** and **email address**, because the person you are meeting needs
  to know who is coming and how to reach you;
- the **time you chose**, its **end**, and the **timezone your browser reported**,
  so the meeting appears correctly for both of you;
- a **single-use management link** which is emailed to you and to nobody else. It
  is the credential that lets you change or cancel the booking without an account.

That is all. There is no other field on the form, and no hidden one.

**The person you are meeting** may afterwards add, about that booking:
- a **private note** (visible only to them), and a **no-show marker**.
- Your name and address also become a **contact** in their account, so they can
  recognise you next time. They can exclude addresses or whole domains from this
  entirely, and delete any contact.

**If you vote in a meeting poll**, we store your name, your email address, and
which proposed times you accepted, until the poll is deleted.

**If you answer a routing form** — the one-question form that sends you to the
right booking page — your answer is **not stored at all**. It selects a
destination and is gone.

**The software does not currently report anything about itself.** We are saying
so because the governing document (**REPORTING.md**) describes a self-reporting
mechanism, and a reader who found it would reasonably assume this service uses
it. It does not: no such data leaves this deployment today, and there is no code
here that sends any.

When it is built, it will send how the software behaved — which features were
used, what was slow, what crashed, and the shape of the operator's configuration
— so that defects can be found and fixed. It will carry **no name, no email
address, no meeting time, no note contents**, and nothing a booker typed; it will
not be published; it will be kept to a stated retention period and be deletable
on request; and the operator will be able to turn it off in one step. The basis
for it is our legitimate interest in operating and improving software we give
away.

This paragraph changes when the mechanism ships, and not before.

**If you hold an account**, we store your email address, display name, timezone,
your public link name, an optional welcome message and accent colour, your
availability and event settings, your team memberships, and a record of
**sign-ins and administrative changes** to your account (an audit trail).
Sessions are cookies; sign-in is by emailed link or by your Google or Microsoft
identity — **we never hold a password, because the service has none.** API keys
and SCIM tokens are stored only as irreversible digests: we cannot read them back
to you, only check one you present.

**If you connect a calendar** (optional), we store the account's email address
and the access credentials, **encrypted at rest** with AES-256-GCM under a key
held in deployment secrets and not in the database. By default the permission we
request is **free/busy only**: we receive the start and end of the periods you
are busy, and **not the titles, attendees, locations or contents of your
events**. Writing your bookings into your calendar is a **separate permission you
grant deliberately**, and only then.

**Technical data.** To stop abuse we record, for at most **two hours**, a
short-lived counter derived from the requesting IP address. It is deleted
automatically after that. Our hosting provider processes connection data
(including IP addresses) to deliver the request, as any host must.

**We run no analytics, no advertising, no tracking pixels, and no third-party
scripts.** The only cookies are two strictly necessary ones: your session, and a
marker recording which organisation's workspace to route you to. There is no
consent banner because there is nothing to consent to.

## On what basis

- For **account holders**: performing the contract you have with us, and our
  legitimate interest in operating and securing the service (the audit trail,
  the abuse counters).
- For **bookers and poll voters**: the account holder's **legitimate interest**
  in arranging a meeting you asked to arrange, with us processing on their
  instructions as their processor. In practice you provide the data yourself, to
  meet someone you chose to meet, and you can remove it yourself at any time.
- We do **not** rely on consent for cookies, because we set none that would
  require it, and we do **not** sell, rent, or share personal data for anyone
  else's marketing. There is no profiling and no automated decision-making with
  legal effects.

## Where it lives, and who else sees it

The service runs on **Cloudflare**, which provides the compute and the database;
each customer organisation's data sits in **its own isolated database**.
Confirmation and reminder email is sent through **Google (Gmail API)**. If you
connect a calendar, the relevant parts of a booking reach **Google Calendar** or
**Microsoft 365** because that is what connecting a calendar means.

Every third party that can see personal data is named, with what they see and
why, in our [subprocessor register](/subprocessors). That register is enforced by
the software, not merely written down: the service **will not send mail** through
a provider that is not listed. Bookings still work; the confirmation waits.

**The service is operated from the United States and your data is processed
there.** If you are outside the United States, using it means your details are
transferred there. We say that plainly rather than name a transfer mechanism we
have not put in place.

## How long it is kept, and how to delete it

- **A booking** is kept until it is deleted. Its management link works until the
  meeting ends plus seven days.
- **Your details as a booker**: use the link in your confirmation email and tick
  the confirmation box. This cancels the booking and deletes your name, address,
  timezone, the private note about you, the contact entry created from your
  booking, and any not-yet-sent email that contained your details. What remains
  is an anonymous record that a slot was booked and cancelled.
- **An account**: deleting it removes the account, its booking pages, every
  booking on them including the bookers' details, contacts, calendar credentials,
  availability, team memberships and sharing links — in a single transaction, and
  verified by absence rather than by a flag.
- **Poll votes** are deleted with the poll.
- **Abuse counters** are deleted automatically after two hours.
- **The audit trail** of account sign-ins and administrative changes is retained
  while the account exists and is deleted with it.

**What deletion cannot reach, stated plainly:** an email already sent is in the
recipient's mailbox and in the sending provider's logs, and we cannot recall it.
An event already written into someone's calendar is removed when the booking is
cancelled, but copies may persist in that provider's own history. This service
currently operates **no backups of its own**; if that changes, this section will
say how long they are kept and the change will be visible in the repository's
history.

## Your rights

You may ask us for a copy of what we hold about you, to correct it, to delete it,
to restrict or object to processing, or to receive it in a portable form. Write
to **admin@pumasi.ai**. We will respond within one month. If you booked a meeting
through someone's page, we may need to refer the request to them as the
controller, and we will tell you when we do.

If you are in the UK or the EU, you may complain to your own national
data-protection authority. We would rather you wrote to us first, but that right
does not depend on us.

## Security

Traffic is encrypted in transit. Calendar credentials are encrypted at rest. API
keys and SCIM tokens are stored as digests and shown once. There are no
passwords to steal because the service has none. Each customer organisation is
isolated in its own database rather than sharing one. Access to production is
limited to the steward.

We are a small operation and we do not claim a certification we do not hold. What
we claim is that the design decisions above are real and checkable in the
published source.

## Changes

Material changes will be announced to account holders before they take effect.
Every version of this document is in public version control, so what changed and
when is inspectable rather than asserted.
`,
};

export const TERMS: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  body: `
## What this is

Pumasi Booking is a scheduling service: you publish booking pages, other people
choose a time, and the service arranges the meeting and, if you connect one, your
calendar. These terms govern its use by account holders. Bookers who simply use
someone's page are covered by the [privacy notice](/privacy) rather than these
terms.

Operator: **ATX APPLE LLC**, a Texas limited liability company, United States.
Governing law: **the laws of the State of Texas**, excluding its conflict-of-law
rules. Disputes go to the state and federal courts sitting in Texas.

## The account

Accounts are currently **invite-only**, and the service enforces a hard ceiling on
how many may exist. You are responsible for what happens under your account and
for the accuracy of the address you sign in with. Do not share sign-in links;
they are credentials.

You must not use the service to send unsolicited bulk email, to harass anyone, to
collect data you have no basis to collect, or to break the law of any place that
applies to you. We may suspend an account that does, and will say why.

## Your data, and your bookers' data

Content you create remains yours. For the personal data of people who book with
you, **you are the controller and we are your processor**: we hold it on your
instructions, and the [data processing terms](/dpa) form part of this agreement.
You are responsible for having a lawful basis for the meetings you arrange and
for answering your bookers' requests about their data, with our help.

## Availability, and what we do not promise

There is no uptime guarantee at this stage, and no paid support. The service is
run carefully, deployed from a public repository, and tested before release, but
it is early software operated by a very small team. Do not use it where a missed
meeting would cause serious harm without your own fallback.

We keep no backups of your data today. If that changes it will be stated in the
privacy notice.

## Price

The service is currently provided at no charge to the invited circle. If charging
begins, existing account holders will be told before it applies to them.

## Ending it

You may delete your account at any time from the dashboard; deletion is immediate
and removes your data as described in the privacy notice. We may end an account
for the reasons above, or on reasonable notice if we stop operating the service —
in which case we will give you time and a means to export what you have.

## Liability

To the maximum extent the law allows, the service is provided "as is", and we are
not liable for indirect or consequential loss, lost profits, or lost
opportunities arising from missed, duplicated or mis-timed meetings. Nothing here
excludes liability that cannot lawfully be excluded. Because the service is
provided free of charge, our total liability to you is limited to the amount you
have paid to use it. Today that amount is zero, and we would rather say so than
imply a cap that sounds larger than it is.

## The software itself

Pumasi Booking is open source under the Apache License 2.0. You may run your own
copy, and the licence rather than these terms governs that. These terms cover the
service we operate at this domain.

## Changes

We will announce material changes to account holders before they take effect.
Every version is in public version control.
`,
};

export const DPA: LegalDoc = {
  slug: 'dpa',
  title: 'Data Processing Terms',
  body: `
These terms apply where we process personal data on your behalf — that is, the
details of the people who book meetings through your pages. They form part of the
[Terms of Service](/terms). Where you require a signed agreement on your own
paper, write to **admin@pumasi.ai**.

These terms take effect when you use the service; no signature is required for
them to bind us. The operator is **ATX APPLE LLC** (Texas, United States), and
processing takes place in the United States — see **Transfers** below.

## Roles

You are the **controller**. We are the **processor**. We process personal data
only on your documented instructions, which consist of these terms, the
[Terms of Service](/terms), and your use of the service's features.

## Subject matter, duration, nature and purpose

The subject matter is the operation of scheduling software for you. It lasts as
long as your account. Its nature and purpose is arranging meetings: offering
times, recording a booking, notifying both parties, and — where you connect one —
reflecting the booking in your calendar.

## Types of personal data

Bookers' names, email addresses, the timezone their browser reported, the times
they booked, any private note you record about a booking, and — where you use
those features — poll voters' names, addresses and selections, and contact
records derived from bookings.

## Categories of data subjects

The people who book meetings with you, the people who vote in your meeting polls,
and the members of your own team who hold accounts.

## Our obligations

1. **Instructions.** We process only on your instructions, and will tell you if
   we believe an instruction breaks applicable data-protection law.
2. **Confidentiality.** Everyone with access is bound to confidentiality.
3. **Security.** We maintain the measures described in the
   [privacy notice](/privacy): encryption in transit, encryption at rest for
   calendar credentials, digest-only storage of API credentials, per-customer
   database isolation, and no password store at all.
4. **Subprocessors.** You give general authorisation for the subprocessors listed
   in the [register](/subprocessors). We will announce additions to account
   holders before they take effect, and you may object; if you object and we
   cannot offer an alternative, you may terminate.
5. **Assistance.** We will help you respond to data subjects' requests, and with
   your obligations on security, breach notification, and assessments — taking
   account of the nature of processing and what is available to us.
6. **Breach.** We will notify you without undue delay after becoming aware of a
   personal data breach affecting your data, with what we know and what we are
   doing.
7. **Deletion and return.** On termination, or on your request, we delete the
   personal data. Deletion is immediate and verified by absence. We keep no
   backups of our own today; if we introduce them, the retention period will be
   published before they hold anything.
8. **Audit.** We will make available the information needed to demonstrate
   compliance with these terms. Because the software is open source, the code
   handling your data can be inspected directly rather than taken on trust.

## Transfers

The service is operated from the United States and personal data you entrust to
it is processed there. If your own obligations require standard contractual
clauses or an equivalent mechanism, write to **admin@pumasi.ai** before you rely
on this service for that data — we would rather have that conversation than let
you assume a safeguard is in place.

## Your obligations

You warrant that you have a lawful basis for the personal data you collect
through the service, that you have given the people concerned the information
they are owed, and that your instructions do not require us to break the law.
`,
};

export const SUBPROCESSORS: LegalDoc = {
  slug: 'subprocessors',
  title: 'Who else sees data',
  body: `
Every third party that can see personal data held by this service, what they see,
and why. An unnamed subprocessor is data shared without disclosure, whatever the
intention — so this list is published, and it is **enforced by the software**:
the service **will not send mail** through a provider that is not on it. The
service keeps running and the booking still completes; only the message waits.

## In use now

- **Cloudflare, Inc.** — hosting, compute and the database. Sees **everything the
  service stores**, because it runs the machine and the storage: accounts,
  bookings, bookers' names and addresses, and the encrypted calendar
  credentials. It also processes connection data, including IP addresses, to
  deliver each request. Why: it is the platform the service runs on. Where: its
  global network; each customer organisation's data sits in its own isolated
  database.
- **Google LLC (Gmail API)** — sends every message the service sends:
  confirmations, sign-in links, reminders, cancellations. Sees the **recipient's
  address, their name, the meeting time**, and the text of any workflow message
  you write, because those are in the message. Why: there is no way to send a
  confirmation without the sender of it seeing the confirmation.
- **Google LLC (Google Calendar)** — **only if an account holder connects a
  Google calendar.** Reads the start and end of busy periods; with the separate
  write permission, receives the bookings it creates, whose title carries the
  booker's name and whose description carries their address. Why: to stop the
  service offering times you are not free, and to put the meeting where you
  already look.
- **Microsoft Corporation (Microsoft Graph)** — the same, for an account holder
  who connects Microsoft 365 or Outlook instead.

## Contacted, but sent no personal data

- **date.nager.at** — public-holiday dates, requested only when an account holder
  presses "block holidays". It receives a **country code and a year**, and
  nothing about any person.

## What a hosting provider necessarily sees

Whoever runs the machine can read the database on it. That is true of every
hosted service and is not special to this one; it is stated because a
subprocessor list that omits the host is not a list of who sees the data.
Self-hosting removes it entirely, which is why the project keeps self-hosting
first-class: the software is open source and you may run your own copy.

## Adding one

A provider is added by editing the published register and the code that enforces
it **together**, in a change anyone can read. Account holders are told before an
addition takes effect, and may object under the
[data processing terms](/dpa).
`,
};

export const LEGAL_DOCS: LegalDoc[] = [PRIVACY, TERMS, DPA, SUBPROCESSORS];

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

/**
 * A deliberately small renderer: headings, paragraphs, bullets, bold, and
 * links. Escaping happens first, so the markup below is the only markup that
 * can reach the page.
 */
export function renderLegalBody(body: string): string {
  const inline = (t: string): string =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blocks are separated by blank lines; a block is a heading, a list, or a
  // paragraph whose source line-wrapping is irrelevant.
  return body
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      if (lines[0]!.startsWith('## ')) return `<h2>${inline(lines[0]!.slice(3))}</h2>`;
      if (lines[0]!.startsWith('- ')) {
        // A wrapped bullet continues until the next one begins.
        const items: string[] = [];
        for (const line of lines) {
          if (line.startsWith('- ')) items.push(line.slice(2));
          else if (items.length) items[items.length - 1] += ` ${line}`;
        }
        return `<ul>${items.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`;
      }
      return `<p>${inline(lines.join(' '))}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

export const LEGAL_STATUS_LINE = STATUS;
