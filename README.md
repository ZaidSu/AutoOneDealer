# Auto One Dealer — live Gmail dashboard

A responsive, vanilla HTML/CSS/JS + Vercel Functions dealership lead inbox. The original demo-only numbers, sample conversations, fake login and nonworking buttons were replaced with real APIs. No npm dependencies are required for deployment.

## Quick setup (keep your existing environment variables)

1. Deploy this folder as the **root** of your existing Vercel project. Keep the server-side Google variables you already set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SESSION_SECRET` and `GMAIL_ALLOWED_EMAIL` (or `GMAIL_ADDRESS`). `SESSION_SECRET` must be at least 32 characters. **Do not paste keys into any frontend page, GitHub or chat.**
2. In Google Cloud OAuth settings, make sure the authorized redirect URI is `https://YOUR-DOMAIN/api/google-callback` (identical to `GOOGLE_REDIRECT_URI`). Gmail read **and compose** scopes are now requested. After deployment, use **Connect with Google** or **Settings → Reconnect** once and grant permission. Existing old read-only sessions need reconnection to enable drafts/send.
3. If you use Supabase, keep `SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Open your Supabase project's **SQL Editor** and run `supabase/schema.sql` once. This creates five private tables for persistent leads, AI instructions, templates, encrypted Gmail refresh tokens and duplicate-safe automation jobs. An existing `integration_accounts` table is **not** required.
4. For AI replies, keep `OPENAI_API_KEY` server-side. `OPENAI_MODEL` defaults to `gpt-4.1-mini`; set it to a chat-completions-compatible model that is actually available to your API account. Open **Train Your AI** and save real dealership details. For daily automatic drafts, add a random `CRON_SECRET`, enable the switch in **Automation**, and deploy with `vercel.json`.

An example of all supported variable names is provided in `.env.example`. There are **no secrets** in this ZIP. Adding/changing environment variables in Vercel generally requires redeploying the project for them to take effect.

## What works

| Page | Connected behavior |
| --- | --- |
| Dashboard | Live matched Gmail counts for today/month, unread count, recent emails, tracked open leads and service health. |
| Lead Inbox | Read 30 real approved-source Gmail messages per page; search/filter loaded page; view plain-text message; select template; generate OpenAI suggestion; save a Gmail draft; manually review and send. |
| Leads | Automatically record fetched inbox lead messages in Supabase, edit stages/notes/follow-up dates and view real pipeline totals. |
| Analytics | Exact Gmail counts across a selectable 1–366-day date range (America/Chicago timezone). |
| Train Your AI | Save verified dealership name, hours, contact info, reply tone and financing/human-review rules in Supabase. |
| Templates | Preview four starter replies; create, edit, delete and restore templates in Supabase. |
| Automation | When enabled, scan newest 15 matching lead emails received within 7 days and create up to five **unsent** Gmail drafts per execution. Duplicate IDs are tracked. Manual scan button and an optional daily Vercel Cron are included. |
| Settings | Reconnect/disconnect Google, check configured services, view effective lead-source Gmail filter. |

### Critical limitations and safety

- **Automatic sending is deliberately off.** Customer emails, exact finance terms and inventory promises need a person to check the output. Generating an AI draft is not the same thing as sending it. To send, use the inbox's **Review & send** action and confirm the recipient.
- **Lead-source filtering is server-side** and uses your existing `LEAD_GMAIL_QUERY` if configured, otherwise a default for Cars.com, CarZing and Credit Union of Texas. The UI cannot widen the server filter.
- **Supabase is optional for Gmail reading and one-off AI drafting**, but required for cross-device lead pipeline, saved templates/training and automatic scanning. Until tables exist, those pages explicitly show setup messages and **do not pretend to save**.
- **OpenAI is optional** for reading the inbox and using manual templates, but required for generating AI replies or automated drafts. Calls consume tokens on your own API account.
- The optional Vercel scheduler in `vercel.json` is **once daily at 14:00 UTC**. That is 8 a.m. Central Standard Time or 9 a.m. Central Daylight Time. Hobby-plan cron has a daily frequency limit and no precise start-time guarantee. For faster automated scanning you need a compatible plan or an external authenticated scheduler. You can use **Run draft scan now** in the app without waiting for a scheduled scan.
- Only **15 newest inbox messages from the last 7 days** are considered per automation run. Older messages aren't backfilled automatically. Each run creates at most 5 drafts to limit unexpected cost/volume.
- Gmail HTML is **not injected into the webpage**; only a plain-text part or Google snippet is shown. Uploaded files/attachments are not fetched.
- Without access to your live Vercel project, database, API credentials or Gmail mailbox, the included tests can validate code and mocked API behavior, but cannot prove the live Google consent, external services, or actual mail delivery in your account.

## Troubleshooting

- **Redirect URI mismatch:** verify `GOOGLE_REDIRECT_URI` exactly matches the URI in Google Cloud, including protocol, domain and `/api/google-callback`. Do not use a URL from an old deployment.
- **Wrong Google account:** confirm `GMAIL_ALLOWED_EMAIL` (or legacy `GMAIL_ADDRESS`) matches the signed-in account exactly.
- **Compose permission missing:** reconnect Google from Settings to authorize `gmail.compose`. Draft and Send buttons remain disabled until permission is granted.
- **Database request failed / tables not found:** run `supabase/schema.sql` and confirm `SUPABASE_URL` plus the correct **server-only** key. Current `sb_secret_...` keys and legacy service-role JWT keys are both supported.
- **No leads returned:** confirm Gmail has messages matching the Settings filter. Set `LEAD_GMAIL_QUERY` to approved sender addresses if necessary, and redeploy.
- **No AI reply:** configure `OPENAI_API_KEY` and a supported `OPENAI_MODEL`. Always review generated text before sending.
- **Scheduled drafts not running:** make sure `CRON_SECRET` is set and Supabase tables are present. Reconnect Gmail after the tables are created to store the encrypted refresh token. Check Vercel Function logs for `/api/cron` failures. The Cron runs once per day and does not send emails.
- **Local testing:** this project is designed for HTTPS on Vercel. Its session cookies use `Secure` and `__Host-` attributes. To test the entire API locally, use Vercel's development server and configure a matching Google OAuth localhost callback in your own Google project.

## Security notes

Only the approved Google mailbox may sign in; no hardcoded demo password. OAuth CSRF state is validated and refresh tokens are encrypted using the server's `SESSION_SECRET` (both in the HTTP-only session cookie and, when Supabase is configured, its integration table). Database secret keys and OpenAI keys never reach the browser. Supabase tables have row-level security enabled and no anon/authenticated grants. Client write APIs verify same-origin requests and the signed lead ID returned by the server. Disconnect revokes the current Google grant on a best-effort basis and removes its stored automation token when Supabase is available.

## Tests

Run `npm run check` with Node 20 or newer. It performs syntax, Gmail filtering/paging, timezone/analytics, signed lead access, MIME construction, access control and mock integration checks. No live email is sent by tests.
