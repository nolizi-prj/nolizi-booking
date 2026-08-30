# MARKET — who else is in this category, and where we actually win

**Owned by the product-manager role** ([`pumasi-ops/roles/product-manager.md`](https://github.com/pumasi-ai/pumasi-ops/blob/main/roles/product-manager.md), duty 3).
First pass 2026-08-29, steward-directed.

**The rule this file runs under: every claim about a competitor is cited or
absent.** This repo has already shipped one uncited "the leaders have open bugs"
and removed it (`0d1674d`); the fairness bar is
[`core/spec/DUPLICATION.md`](../core/spec/DUPLICATION.md)'s treatment of Cal.com —
written so the competitor could read it without objecting to a fact. Pricing
figures below were read from the cited public pricing pages on 2026-08-29 and
will drift; the date travels with the number.

---

## 1 · Cal.com

**What it is.** A mature, production-proven, feature-complete scheduling
platform — the category's open-source leader. Its core is **AGPL-3.0** with a
proprietary `/ee` tree beside it (open core)
([`DUPLICATION.md` §2.1, §3](../core/spec/DUPLICATION.md);
[github.com/calcom/cal.com](https://github.com/calcom/cal.com)).

**Pricing** ([cal.com/pricing](https://cal.com/pricing), read 2026-08-29):

| Tier | Price | Holds |
|---|---|---|
| Individuals | free forever | 1 user, unlimited event types and calendars, 100+ app integrations, mobile app, Stripe/PayPal payments, Salesforce & HubSpot sync |
| Teams | $12/user/month (annual) | round-robin, shared team availability, managed event types, routing forms, booking analytics, branding removal |
| Organizations | $28/user/month (annual) | SAML SSO/SCIM, unlimited sub-teams, SOC 2 / HIPAA / ISO 27001 compliance, role-based permissions |
| Enterprise | custom | onboarding, SLAs, HRIS integrations, dedicated database |

**Real strengths, stated so they could co-sign them.** The individual free tier
is genuinely generous — unlimited event types, integrations, mobile apps, and
payments at no cost ([pricing page](https://cal.com/pricing), 2026-08-29). The
AGPL core is self-hostable by anyone willing to carry copyleft obligations
([`DUPLICATION.md` §3](../core/spec/DUPLICATION.md)). It carries compliance
certifications (SOC 2, HIPAA, ISO 27001 at the Organizations tier — pricing
page, 2026-08-29) that we do not have and cannot claim. Its booking-page
conventions are what people already know how to use, which is why the steward
directed that ours follow them closely on behaviour and layout
([`service/spec/0002/INTENT.md`](../service/spec/0002/INTENT.md) Q4).

**The standing honest sentence**, from
[`core/spec/ALTERNATIVES.md`](../core/spec/ALTERNATIVES.md): for anyone who does
not require a permissive licence, Cal.com is the better choice today. Pumasi
does not compete by omission.

**What it cannot offer.** Apache-2.0 terms. AGPL cannot be relicensed,
vendored into a permissive work, or embedded without copyleft consequences, and
the `/ee` features are proprietary ([`DUPLICATION.md` §3](../core/spec/DUPLICATION.md)).
That constraint — not any technical deficiency — is the whole reason this
product exists (verdict: BUILD, on the licence alone).

## 2 · Calendly

**What it is.** The proprietary SaaS incumbent
([`DUPLICATION.md` §2.1](../core/spec/DUPLICATION.md)). Not inspectable, not
self-hostable; observed through the product and its public pages, which is all
that is available and all that is needed
([`roadmap/0004-feature-parity.md` §2](0004-feature-parity.md)).

**Pricing** ([calendly.com/pricing](https://calendly.com/pricing), read 2026-08-29):

| Tier | Price | Holds |
|---|---|---|
| Free | free | one event type, one calendar connection |
| Standard | $10/seat/month (annual) | unlimited event types, multiple calendars, automations/reminders, payments, Notetaker, Callie AI assistant (beta) |
| Teams | $16/seat/month (annual) | round-robin and team scheduling, lead qualification and routing, managed event types, Salesforce |
| Enterprise | from $15k/year, minimum 50 seats | SSO/SAML, audit logs, domain control, data deletion API, Dynamics 365 |

**Real strengths.** Deep CRM reach — Salesforce, Marketo, Pardot, Dynamics —
and AI meeting tooling (Notetaker, Callie) that we do not build
([pricing page](https://calendly.com/pricing), 2026-08-29; AI scheduling is off
our roadmap by steward decision,
[`roadmap/0004-feature-parity.md` §3](0004-feature-parity.md)). Meeting polls,
which Cal.com lacks, per the feature study recorded in
[`roadmap/0004-feature-parity.md` §3 item 7](0004-feature-parity.md). Its free
tier, at one event type and one calendar, is the narrowest of the three
products in this file (pricing page, 2026-08-29).

## 3 · The rest of the field

All per [`DUPLICATION.md` §2.1](../core/spec/DUPLICATION.md) (surveyed
2026-07-28):

| Product | Licence | Note |
|---|---|---|
| Easy!Appointments | GPL-3.0 | copyleft; unavailable to a permissive commons for the same reason as Cal.com |
| Rallly | AGPL-3.0 | group polls, a different product |
| SavvyCal, Chili Piper, Microsoft Bookings | proprietary | not inspectable, not reusable |
| Cronofy, Nylas | proprietary APIs | calendar-infrastructure vendors, not booking pages |

The survey's precise finding, kept precise here: it is **not** true that no
open-source scheduler exists. It is true that **no maintained
permissively-licensed one** exists ([`DUPLICATION.md` §3](../core/spec/DUPLICATION.md)).

## 4 · Our wedge

Bounded first by what may never be sold: the commons itself — access, code,
ledger — is never for sale, self-hosting stays first-class forever, and no
feature is ever hosted-exclusive
([whitepaper, "How it sustains itself"](https://github.com/pumasi-ai/pumasi);
commercialization foundations §1, §3, §7). A wedge that required the free
product to be worse would not ship.

**1 — The licence.** The only maintained scheduling product under Apache-2.0,
inbound equals outbound. Embed it, redistribute it, build a commercial product
on it, fork it — no copyleft obligations, and no contributor agreement grants
anyone relicensing power. Nobody else in the table can offer this, and the
open-source incumbent structurally cannot without abandoning its open-core
model. This claim carries its own retirement clause: if a maintained permissive
alternative appears, [`DUPLICATION.md` §5.4](../core/spec/DUPLICATION.md) makes
this product a deprecation candidate.

**2 — The per-seat line.** What the incumbents sell by the seat — round-robin
and team scheduling ($12–16/user/month), routing forms, SSO/SCIM and audit
($28/user/month or $15k/year minimum) — is in this product's one free,
self-hostable tier, built and tested
([`service/spec/0002/SPEC.md` §8.1](../service/spec/0002/SPEC.md); the P5–P8
commit series). The wedge is not the discount; it is the **published, structural
promise that this can never be reversed** — no open-core, no dual licensing, no
licence switch, no hosted-exclusive features, written down before the first
dollar (commercialization foundations §7). Per-seat pricing is, in the
foundations' words, "the sin that creates our wedge" (§5).

**3 — Verifiability.** The specifications, acceptance suites, cross-family
review transcripts, and the governance debt register are public — including
what is *not* done (no counsel review, no conformance reports from other
environments: [`DEBT.md` D-105, D-108](https://github.com/pumasi-ai/governance/blob/main/governance/DEBT.md)).
The privacy notice is enforced by tests against the actual booking form
(`8f77d66`), not merely published. This is a claim about our process being
public, not a claim that the incumbents lack rigor — theirs is simply not
inspectable, which for some buyers is the point.

## 5 · What the wedge is not

Not feature superiority: they have payments, mobile apps, an integrations
ecosystem, and compliance certifications; we have none of those, two by
deliberate decision ([`VALUE.md` §4](VALUE.md)). Not price alone: Cal.com's
individual tier is already free and its core already self-hostable
([cal.com/pricing](https://cal.com/pricing), 2026-08-29;
[`DUPLICATION.md` §3](../core/spec/DUPLICATION.md)). The wedge is the licence,
the un-enclosable free tier, and the public evidence — and it holds only while
all three stay true.
