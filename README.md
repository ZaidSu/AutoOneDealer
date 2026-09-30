# AutoDash

Dealership operations platform for Auto One Motors: leads, credit applications, customers, appointments
and analytics, built from the dealership's Gmail and a Supabase database.

Built with Next.js (React + TypeScript) and Tailwind. There are no `.html` files on purpose: each page is a
`page.tsx` file and Next.js turns it into HTML when the site runs.

## Where things are

```
src/
  app/                      pages and API (Next.js routes by folder)
    (public)/login/         login page ("/" sends you here or to the dashboard)
    (app)/                  signed-in pages (every page and API checks the session; signed-out visitors go to /login)
      dashboard/  inbox/  leads/  credit-applications/  customers/
      pipeline/  appointments/  analytics/  settings/  developer/
    api/                    backend endpoints (login, Google callback, Gmail, lead sync, health, ...)
    actions.ts              form actions (customer labels, appointments, team, sources)
    globals.css             site-wide styles and theme colors
    layout.tsx, fonts.ts    root HTML shell and fonts
  components/               UI pieces, one folder per page (+ layout/ for sidebar and search, ui/ for shared bits)
  lib/                      backend logic, no UI
    auth/                   sessions, encryption, roles, Google sign-in
    gmail/                  reading the dealership mailbox
    parsers/                turning lead emails (CarsForSale, ADF/XML, Cars.com, ...) into structured leads
    leads/                  saving leads to the database and background sync
    customers/              grouping leads into customers
    crm/                    customer, pipeline and analytics queries
    db/                     Supabase connection, table setup, data access
    dealership/             dealership name and settings
    utils/                  formatting, dates/time zones, states, small helpers
tests/
  unit/                     fast tests, no database (npm test)
  integration/              database tests (npm run test:db)
  fixtures/                 sample lead emails used by the tests
```

Each page folder in `src/app/(app)/` has a `page.tsx` (the page) and usually a `loading.tsx` (shown while it
loads). Its pieces live in the matching `src/components/<page>/` folder.

## Run it locally (VS Code)

1. Open this folder in VS Code (File → Open Folder) and accept the recommended extensions.
2. `npm install`
3. Fill in `.env.local` (`.env.example` explains each value). Quickest: `npx vercel env pull .env.local`,
   then set `GOOGLE_REDIRECT_URI` back to `http://localhost:3000/api/google-callback`.
4. `npm run dev` (or press F5) and open http://localhost:3000

For Gmail connect to work locally, add `http://localhost:3000/api/google-callback` under **Authorized redirect
URIs** in Google Cloud. Without `DATABASE_URL` the site still runs, minus the database features.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with live reload |
| `npm test` | Unit tests |
| `npm run build` | Type check + production build (run before pushing) |
| `DATABASE_URL=postgres://... npm run test:db` | Database tests. Drops and recreates tables, so use a throwaway database |

## Deploying

Pushing to `main` deploys production on Vercel (https://auto-one-dealer.vercel.app). Environment variables live
in Vercel → Project → Settings → Environment Variables, set for **Production** (and Preview if you use branches):

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = `https://auto-one-dealer.vercel.app/api/google-callback`
- `SESSION_SECRET` (32+ random characters)
- `GMAIL_ALLOWED_EMAIL`, optional `STAFF_ACCESS`
- `DATABASE_URL` (Supabase **Transaction pooler**, port 6543)
- `REQUIRE_GOOGLE_SIGNIN=true` to require Google sign-in with the staff allowlist

`/api/health` confirms a deployment is live, and the Developer page shows which settings are missing.

## Debugging slow pages

The server writes a short trail to **Vercel → Logs** (lines starting with `[autodash:...]`):

- `[autodash:db] opened page connection` / `replacing page connection (unused for 42s)`: a fresh database connection.
- `... <- slow`: any page step or database check that took over a second, with its time.
- `[autodash:step] Counts: FAILED after 8003ms`: a part of a page that gave up.

Set `AUTODASH_DEBUG=1` in Vercel (then redeploy) to log every step of every page load, including the fast ones.
`DB_DEBUG=1` also logs each database query. Turn both off again when you're done.

## Features

- **Sign-in**: Google identity only (`openid email profile`), staff allowlist with roles (owner, manager,
  salesperson, developer). Without `REQUIRE_GOOGLE_SIGNIN=true` the login screen is open: username and
  password are not checked. Sessions last 30 days.
- **Settings → Connect Gmail** (owners/managers): read-only scope, Test / Reconnect / Disconnect. Only the
  mailbox in `GMAIL_ALLOWED_EMAIL` is accepted.
- **Inbox**: read-only list, views, search, text-only reading view (email HTML is never rendered).
- **Credit Applications**: CarsForSale "New Loan App Submitted" emails parsed into applicant, phone, location,
  loan amount, down payment, application ID and a link to the full application.
- **Leads**: credit applications plus website inquiries from every lead source, newest first.
- **Customers**: leads grouped into people by phone (then email), with every inquiry, application, source,
  vehicle asked about, and their email conversations with the dealership.
- **Dashboard**: live counts (applications today / 7 days, inquiries, unread) and today's appointments.
- **Analytics**: lead sources, in state vs out of state, top out-of-state states, leads over time, credit
  applications; with the database, purchases by source and salesperson results.

### Saved leads

With the database connected, each lead email is read from Gmail once, parsed and saved in the `leads` table
(`src/lib/leads/`), so pages load in well under a second. While AutoDash is open, a background check runs every
few minutes (`src/components/layout/AutoSync.tsx`), plus an **Update now** button. The first run imports the last
12 months in batches. Non-lead matches (e.g. "Re:" replies) are remembered so they're never re-read.

### Database features (Supabase)

Turned on by `DATABASE_URL`. The site creates and upgrades its own tables on first use (tracked by
`schema_version`):

- **Settings → Sales team** and **Where customers heard about us** (editable lists).
- **Customer labels**: salesperson, status, financing (auto "Needs review" for loan apps), heard about us (auto
  from lead source), in/out of state (auto), notes, and booking appointments. "Returning" is added automatically
  when a purchased customer sends a new lead.
- **Appointments**: week view, filter by salesperson, double-booking warning, Showed up / No-show / Canceled,
  and a no-shows-to-call-back list.

## History

The previous version of the site is preserved in the git tag `backup-before-rebuild-2026-09-26`.
