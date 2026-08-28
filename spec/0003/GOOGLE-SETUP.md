# Google OAuth setup — record of what was done (Q-003, closed)

**All of this is done — 2026-08-27.** Via `gcloud` (CLI delegation): project
**`pumasi-commons`** created, **Google Calendar API** enabled. Via the operator
browser (`tools/operator/`, agent-driven Chrome under the steward's one-time
sign-in): consent screen, scope, test user, and client — the steps below. The
steward personally accepted both terms acceptances (Cloud ToS; the API
Services User Data Policy checkbox), per `HUMAN.md`.

The click list is kept as the record of what the operator did, and as the
recipe for the Microsoft equivalent later:

## 1 · Consent screen (once, ~2 minutes)

1. Open <https://console.cloud.google.com/auth/overview?project=pumasi-commons>
   and click **Get started**.
2. **App information:** name `Pumasi` · support email `admin@pumasi.ai`.
3. **Audience:** **External**.
4. **Contact information:** `admin@pumasi.ai`. Agree, **Create**.

## 2 · The narrow scope (the intent statement's promise)

1. Left menu **Data access** → **Add or remove scopes**.
2. Add exactly one Calendar scope:
   `https://www.googleapis.com/auth/calendar.freebusy` — "See your availability
   in your calendars". **Not** `calendar.readonly`, not `calendar.events`.
   (Write-back, if you later opt in per the intent, adds
   `calendar.events.owned` — a separate grant, added separately, later.)
   **Finding, better than predicted:** the console classes `calendar.freebusy`
   as **non-sensitive** — the earlier "sensitive, standard verification"
   estimate in Q-003 was too cautious. A non-sensitive-only app faces the
   lightest review tier when it publishes.
3. **Update**, then **Save**.

## 3 · Test users (this is what makes test mode work today)

1. Left menu **Audience** → **Test users** → **Add users**.
2. Add the Google accounts allowed to connect calendars before verification
   clears: `admin@pumasi.ai` plus your personal account(s). Up to 100.

## 4 · OAuth client (the credential the service will use)

1. Left menu **Clients** → **Create client** → type **Web application**,
   name `pumasi-service`.
2. Authorized redirect URI: `http://localhost:3000/oauth/google/callback`
   for now — **URIs are editable any time**, and the spec will fix the real
   path and production URL.
3. **Create**, then copy the **Client ID** and **Client secret** into a file
   that never enters git — e.g. `apps/service/.env` (already gitignored):

       GOOGLE_OAUTH_CLIENT_ID=...
       GOOGLE_OAUTH_CLIENT_SECRET=...

## Not yet — deliberately

**Verification submission** waits until there is a deployed app to verify:
Google's review wants a homepage on a verified domain, a privacy policy URL
(→ D-105/Q-002 — the human items meet here), and possibly a demo of the
consent flow. With only the non-sensitive `calendar.freebusy` scope this is
the lightest review tier — no sensitive-scope review, no third-party security
assessment (those attach to sensitive/restricted scopes like `calendar.readonly`
or Gmail/Drive). This answers the intent statement's open question 3. Until
the app is published, the 100-test-user cap is the ceiling — which D-105's
5-owner ceiling makes moot anyway.

**Credentials** live in `apps/service/.env` (gitignored, verified untracked):
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`. The redirect URI is `http://localhost:3000/oauth/google/callback`
until the spec fixes the real path; URIs are editable on the client any time.
