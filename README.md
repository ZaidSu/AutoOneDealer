# Auto One Email System v0.3 — Lead-Only Inbox and Live Historical Analytics

This update builds on v0.2 and uses the **same existing Google Cloud OAuth client** and same Vercel deployment. No new OAuth scope, Client ID, Supabase, or API service is required. Gmail remains **read-only**.

## Changes

- Dashboard now counts **all matching lead messages received today / this month**, not just the first 15 emails.
- Inbox fetches **30 lead emails per page**, with Load More. The server filters Gmail *before* returning the message bodies. Search and source tabs work on the loaded pages only.
- Only matching dealership leads appear, using a single configurable Gmail search query. Starter query: `from:salesleads@cars.com`, other senders containing `salesleads`, `from:carzing.com`, `from:cutx.org`, and `from:credituniontexas.org`. The latter domain guesses **must be checked against actual Gmail sender addresses**; the example from Cars.com is confirmed from the provided screen.
- Analytics reads historic matching Gmail leads. Select January or any other month, or choose custom dates up to 366 days. Charts automatically group by day, week, or month. Counts paginate through all Gmail search results (up to 12,500 per bucket), rather than using estimates or sample data. Analytics searches mail including *archived* matching leads; Inbox stays in Inbox only.
- Historical date boundaries follow `America/Chicago`, including DST. Empty months are shown as zero rather than sample numbers.
- Other messages (auction updates, personal correspondence, receipts) should not match this filter unless their sender also matches an approved rule.

## Deploy

1. Unzip the project. Copy **the files and folders inside** `auto-one-email-system-v0.3/` into your current GitHub repository root, replacing old files. Preserve `api/`, `dashboard/`, `inbox/`, `analytics/`, `settings/`.
2. Vercel redeploys on commit. Keep your existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GMAIL_ALLOWED_EMAIL`, `SESSION_SECRET` environment variables.
3. Open `https://auto-one-dealer.vercel.app/settings/settings.html` to confirm the connected mailbox and view the active Gmail query.
4. Open Inbox to see lead-only messages, then Analytics and select a past month or custom date range.
5. If some leads from CarZing or Credit Union of Texas are missing, open one of their **real messages in Gmail** and copy its **actual From email address**. In Vercel, set the optional `LEAD_GMAIL_QUERY` environment variable. For example:

   `{from:salesleads@cars.com from:leads@ACTUAL-CARZING-DOMAIN.com from:ACTUAL-CUTX-DOMAIN.org}`

   Replace placeholders with verified sender addresses or domains. Entries inside braces use OR. Save to **Production** and redeploy. This entirely replaces the starter query. Do not paste credentials into the query.

6. Test the query directly in Gmail's search box first. It should return lead emails and exclude personal/auction mail.

## Measurement rules

- One received Gmail message = one lead email. It does not deduplicate repeat inquiries, forwarded notifications, or multiple lead messages from the same customer. Later, the CRM can count unique leads separately.
- Inbox restricts to matching leads that are still in Gmail **Inbox**. Analytics counts historical matching leads wherever Gmail search finds them except Spam, Trash and Sent. The Dashboard's today/month cards follow Analytics' all-mail matching rule; its Recent Leads widget follows the lead-only Inbox rule.
- Gmail's `resultSizeEstimate` is approximate and is not used to produce Analytics totals.
- Reports are read live from Gmail. A broad query or a long range may take longer, and Gmail rate limits still apply. If an unusually large report cannot complete, narrow its date range.
- UI still uses **demo login**, not secure application authentication. Only test privately; do not expose this app as a customer portal until real authentication is added. The current encrypted Gmail OAuth session is stored in the authorized browser, not Supabase. No automated background Gmail processing yet. The report endpoints are configured for up to 60 seconds on Vercel. Extremely large ranges may need to be split into smaller ranges.
- Google OAuth External/Testing refresh tokens normally expire in seven days for Gmail access. You may need to reconnect during testing.

## Structure

`index.html`, `style.css`, `script.js` plus per-page files in `dashboard/`, `inbox/`, `analytics/`, `settings/`. Backend in `api/` including new `_leads.js`, `analytics.js`, and `overview.js`.
