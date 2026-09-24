# Auto One Email System — Gmail Read-Only Test

This is the next version of the original HTML/CSS/JS UI. It uses **your existing OAuth Client ID** and Vercel URL. It **does not send, reply to, modify, or mark emails read**.

## 1. Google Cloud

Use your EXISTING Google Cloud OAuth web client. Authorized redirect URI must be exactly:

`https://auto-one-dealer.vercel.app/api/google-callback`

In Google Auth Platform > Audience, add your dealership Gmail address as a **test user**. Data Access must include `https://www.googleapis.com/auth/gmail.readonly`. The Gmail API must be enabled.

## 2. Vercel environment variables

Set these in Vercel Project > Settings > Environment Variables:

- `GOOGLE_CLIENT_ID`: your existing client ID
- `GOOGLE_CLIENT_SECRET`: your private client secret
- `GOOGLE_REDIRECT_URI`: `https://auto-one-dealer.vercel.app/api/google-callback`
- `GMAIL_ALLOWED_EMAIL`: the exact Gmail address the dealership will connect (e.g. `txautoone@gmail.com` if that is the actual mailbox)
- `SESSION_SECRET`: generate a long random value, at least 32 characters, with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Do not place your secret values in GitHub, screenshots, or client-side JS. Use Vercel **Secret** variables. For the preview domain, ensure they're assigned to the correct environment and redeploy after adding.

## 3. Deploy

Upload/commit **the contents** of this project folder to the root of your existing GitHub repository. Keep the Vercel Framework Preset at **Other**, leave Build Command empty unless your project already needs one, and deploy. Node >=20 is required. Vercel discovers the `api/` serverless functions automatically.

## 4. Connect

Visit `https://auto-one-dealer.vercel.app/settings/settings.html`, click **Connect Gmail**, choose your approved dealership email address, and consent to Gmail read-only permission. Then open **Inbox**. The initial inbox batch contains up to 15 of your newest Inbox messages; click **Load more emails** for older messages. Search and filters operate on the fetched batches.

## Notes / limitations

- **This is a testing-only sign-in UI**. The root login accepts anything; it is not actual authentication. Gmail API calls require a separate encrypted Google OAuth session and the exact configured `GMAIL_ALLOWED_EMAIL`. Do not use this for public/customer data access until real application login is added.
- OAuth refresh tokens for an External/Testing Google consent screen expire after about seven days when Gmail scopes are used. Reconnect as needed while testing.
- For now, the Google token is stored encrypted in an HttpOnly Secure browser cookie using AES-256-GCM. No Supabase project is needed to *read* Gmail at this stage. This browser-specific approach is not suitable for unattended 24/7 background checks; a future version should store encrypted credentials server-side behind real application authentication.
- This version only requests `gmail.readonly`; it does not send messages or store emails in Supabase.
- The Dashboard shows only the latest fetched batch; Analytics remains clearly labeled **sample data**.
- Plain-text email bodies are displayed as text. HTML-only messages fall back to Gmail's snippet for safety. Attachments are not downloaded.
- If connecting fails, check that the authorized redirect URI matches **exactly**, test user is whitelisted, all five environment variables are set, and deployment is current.

## Layout

`index.html`, `script.js`, `style.css`; sections `dashboard/`, `inbox/`, `analytics/`, `settings/`; backend `api/`; all remain separate.
