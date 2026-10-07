# Marketplace Wholesale LLC

Public website plus a private tracker for purchases, sales, invoices, contractors and quarterly tax totals.
Built the same way as AutoDash: Next.js (React + TypeScript) and Tailwind, Supabase Postgres through
`DATABASE_URL`, Google sign-in, deployed on Vercel. There are no `.html` files on purpose: each page is a
`page.tsx` file and Next.js turns it into HTML when the site runs.

## Where things are

```
src/
  app/
    page.tsx                  public landing page ("/")
    (public)/                 login, privacy, terms (SMS Terms are on the terms page, #sms)
    (app)/                    signed-in pages: dashboard, invoices (+ [id]), items, expenses,
                              customers, contractors (+ [id]), analytics, quarters, taxes
    api/                      google-login, google-callback, logout, files/[id], export (CSV), health
    (each page file is one line; the page itself is a "view" in components/views, shared by both modes)
    actions.ts                every change made in the app (checks sign-in + role, validates input)
    globals.css               theme colors and shared styles
  components/                 site/ (public pages), layout/ (sidebar), forms/, dashboard/, ui/
  lib/
    auth/                     sessions, encryption, Google sign-in, roles
    db/                       connection, automatic table setup (schema.ts), reading data
    preview/                  preview mode: saves to the browser instead of the database
    calc.ts, validate.ts      the money math and the form checks (shared by both modes, unit tested)
tests/unit/                   npm test
```

## Preview mode (the default: nothing to set up)
With no settings at all, the site still works. The landing page, privacy policy and terms are public, and the tracker runs in
**preview mode**: "Continue with Google" simply opens the app on that browser, and everything you enter (rows and uploaded
PDFs or photos) is saved in that browser only. A "Preview mode" tag shows in the sidebar, with an "Erase preview data" button.
Nothing is shared between devices, and nothing is sent anywhere.

When you're ready to go live, add the Google and database settings below in Vercel. The site switches to live mode by itself
(`/api/health` shows `"mode": "preview"` or `"mode": "live"`). Preview entries stay in the browser and are not copied to the database.

## What the tracker does
The app is built around one thing: the **invoice**. Everything else is worked out from it.
- **Invoices:** drop an invoice PDF on the Invoices page and the site reads it (invoice number, date, customer, and each item's name, last 4 of the UPC, quantity and price). You check the items, add what each one cost you, and save. Or create one by hand. A PO the customer sent you works the same way. Scanned or photographed PDFs can't be read (there's no OCR), so those are attached and you type the items.
- **The numbers on every invoice:** *They owe you* (the total of its items plus any tax, or a total you type), *Cost of goods* (the buying price of each item, or one number you type), and *Profit* = what they owe you (before tax) minus cost of goods. You can edit anything, any time: open the invoice and change items, prices, miles or the customer.
- **Miles belong to the invoice,** one trip counted once, priced at a rate you set per year (Taxes page). The app flags the same store on the same day on more than one invoice, since that is usually one trip counted twice.
- **Items** are created for you when you save an invoice (matched by name and last 4 of the UPC), and you can add, edit or delete them on the Items page.
- **Quarters:** finalize a quarter to lock the invoices and expenses dated in it and save its totals; reopen it if something needs fixing. Reminders are on screen only.
- **Contractors:** mark who bought an invoice's goods; you see what you owe them, the payments you made, and totals per month, quarter and year.
- **Software side (sidebar section "Software"):** **Income** records money you were paid (date, from where, which project, amount) with totals by source, software expenses for comparison, and a CSV; **Projects** lists your software jobs with client, status and what each has paid you. Software income is also included in the tax package (7-software-income.csv).
- **Which card:** every item is marked "My card" (the customer owes the full price) or "Their card" (they paid the store themselves, so they owe you only your profit on it). Set it per item when editing, or for a whole invoice from the dropdown on its row. What they owe, the Dashboard and the Taxes checks all follow it; sales, cost of goods and profit don't change.
- **Purchase orders:** dropping a PO PDF reads its number, date, customer, items and the last 4 of each UPC (the UPC is printed in two pieces and is put back together).
- **Import a batch** (/import): choose a data file and a folder of PDFs to add many invoices at once, PDFs attached. Anything already in the app is skipped.
- **Analytics, Taxes, Expenses, Customers:** charts and tables, Q1 to Q4 and full-year totals with a "before you file" checklist, a tax package ZIP (summary, invoices, items, expenses, mileage log, contractors), expenses with receipts, and customers with their usual tax treatment and resale certificate.

Pages load from the database in a single query. If they're still slow, check that Vercel's Function Region (Project Settings > Functions) is in the same region as your Supabase project.

Upgrading from the older purchases/sales version: on first start the database (or your preview browser data) is converted once. Each old sale becomes an invoice line; miles are put on one invoice per purchase trip; sales that were not on an invoice become "Imported <date>" invoices marked paid. Items that were bought but never sold are not carried over. The old tables are left untouched as a backup. The default tax rate is `DEFAULT_TAX_RATE` in `src/lib/calc.ts`.
Uploaded files are stored in the database (PDF, PNG, JPG, WebP or GIF, up to 4 MB each).

Two roles: **owner** (everything) and **accountant** (view and download only). Set them with `OWNER_EMAIL` / `STAFF_ACCESS`.

## Run it locally (VS Code)
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in. For Google sign-in locally, set
   `GOOGLE_REDIRECT_URI=http://localhost:3000/api/google-callback` and add that address under **Authorized redirect URIs** in Google Cloud.
3. `npm run dev` and open http://localhost:3000 (landing page) or http://localhost:3000/login.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with live reload |
| `npm test` | Unit tests (money math, roles, cookies) |
| `npm run build` | Type check + production build (run before pushing) |

## Deploying
Pushing to `main` deploys on Vercel. `vercel.json` tells Vercel this is a Next.js app, so you don't need to change
any project setting, and no environment variables are needed for preview mode.

## Going live later
Add these under **Vercel > Project > Settings > Environment Variables** (Production), then redeploy. Live mode turns on
once Google sign-in and the database are both set:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` = `https://YOUR-DOMAIN/api/google-callback` (also add it to Google Cloud's Authorized redirect URIs)
- `SESSION_SECRET` (32+ random characters)
- `OWNER_EMAIL`, optional `STAFF_ACCESS`
- `DATABASE_URL` (Supabase **Transaction pooler**, port 6543)
- optional `CONTACT_EMAIL` (shown on the public site and legal pages)

`/api/health` confirms a deployment is live and lists any missing settings; `/api/health?check=db` checks the database.

## Database
The first time the site connects, it creates its own tables (all start with `mw_`, so it can share a Supabase project with
AutoDash without clashing). Row Level Security is turned on, so Supabase's public API can't read them; only this site can.

## Google Cloud
Use the OAuth client you already made for AutoDash, or create a new one. Add the new redirect URI above. If the consent
screen is in **Testing** mode, add each person's email under Test users. Use `https://YOUR-DOMAIN/privacy` and
`https://YOUR-DOMAIN/terms` for the privacy policy and terms links.

## Which card paid (update 10)

On an invoice, "Which card paid for the goods" has two boxes: how much was spent on the customer's card, and which of your own cards paid the rest.
They owe you the sale minus what went on their card; profit never changes. The Invoices page has a "Card spending" summary by card.
Importing a file again leaves existing invoices alone except for their paid / not paid status.

## Contractor invoices (update 12)

Each contractor's page has its own invoices: add items (search your item list or type a new one), what the contractor paid for each, and what they
charge you for each. You owe what they charge; they make the difference. These are kept apart from your own invoices, so they never count in your
sales, profit, analytics or taxes. Payments you record to a contractor are subtracted from what you owe.
