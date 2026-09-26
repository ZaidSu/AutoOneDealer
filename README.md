# AutoDash

Dealership operations platform, starting with Auto One Motors. This `rebuild` branch is a clean Next.js
rewrite. The previous version is preserved on `main` and in the tag `backup-before-rebuild-2026-09-26`.

## What works in this phase

- Staff sign-in with Google, identity only (`openid email profile`). No Gmail prompt at login.
- Staff allowlist with roles (owner, manager, salesperson, developer).
- Separate **Settings → Connect Gmail** for owners/managers, read-only scope, with Test connection,
  Reconnect and Disconnect. Only the mailbox in `GMAIL_ALLOWED_EMAIL` is accepted.
- Dashboard with honest empty states (no sample data), Settings, and a Developer page with the required
  "This page is meant for a developer" popup. Developer details are gated by role on the server.
- `/api/health` to confirm server routes are deployed.

- **Inbox** (read-only list, views, search, and a text-only reading view; email HTML is never rendered).
- **Credit Applications**: CarsForSale "New Loan App Submitted" emails parsed into applicant, phone,
  location, loan amount, down payment, application ID and a link to the full application in CarsForSale.
- **Leads**: credit applications plus CarsForSale website inquiries ("New Lead"), newest first.
- **Dashboard** counts from the live inbox (applications today/7 days, inquiries, unread).

Parsers live in `lib/parsers/carsforsale.ts` and are tested against fixtures matching the real layouts.

- **Customers**: leads grouped into people by phone (then email), with every inquiry and application,
  sites they came from, cars they asked about, and their email conversations with the dealership.

Not built yet: lead statuses/notes/assignment, appointments, AI drafts, SMS. These need the
shared database. They appear in the sidebar as "Soon".

**Temporary limitation:** the Gmail connection is stored in an encrypted cookie in the connecting browser.
It moves to the shared database in Phase 3 so the whole team and background jobs can use it.

## Login mode

The login screen currently has **open access**: username and password are optional and not checked
(chosen deliberately while the site is shared only with trusted people). Sessions last 30 days.
To require Google sign-in with the staff allowlist instead, set `REQUIRE_GOOGLE_SIGNIN=true` in Vercel
and redeploy; open sessions stop working immediately.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (see comments in that file).
3. `npm run dev`, then open http://localhost:3000
4. `npm test` runs unit tests; `npm run build` checks types and the production build.

## Google Cloud

The OAuth client needs each deployment's callback listed under **Authorized redirect URIs**, e.g.

- `https://auto-one-dealer.vercel.app/api/google-callback` (production)
- `https://auto-one-dealer-git-rebuild-zaidsus-projects.vercel.app/api/google-callback` (this branch's preview)

Both sign-in and Gmail connect use this one callback. The Developer page shows whether
`GOOGLE_REDIRECT_URI` matches the address you're on.

## Layout

```
app/(public)/login      sign-in screen
app/(app)/*             signed-in pages (layout checks the session on the server)
app/api/                route handlers (google-login, google-callback, integrations/gmail/*, logout, health)
components/             UI pieces
lib/auth/               sessions, encryption, roles, Google calls
tests/unit/             node:test unit tests
```
