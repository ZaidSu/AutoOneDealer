import crypto from 'node:crypto';

const SESSION_COOKIE = '__Host-a1_gmail_session';
const STATE_COOKIE = '__Host-a1_oauth_state';
const COOKIE_AGE = 60 * 60 * 24 * 7;

export function requiredConfig() {
  const needed = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'SESSION_SECRET'];
  const missing = needed.filter(name => !process.env[name]);
  if (!process.env.GMAIL_ALLOWED_EMAIL && !process.env.GMAIL_ADDRESS) missing.push('GMAIL_ALLOWED_EMAIL (or GMAIL_ADDRESS)');
  if (missing.length) throw new Error('Missing Vercel environment variables: ' + missing.join(', '));
  if (process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
}

function key() {
  return crypto.createHash('sha256').update(process.env.SESSION_SECRET || '').digest();
}

export function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

export function unseal(raw) {
  try {
    const parts = String(raw || '').split('.');
    if (parts.length !== 3) return null;
    const [iv, tag, encrypted] = parts.map(x => Buffer.from(x, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) result[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return result;
}

function makeCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function sessionCookie(session) { return makeCookie(SESSION_COOKIE, seal(session), COOKIE_AGE); }
export function stateCookie(state) { return makeCookie(STATE_COOKIE, seal({ state, expires: Date.now() + 10 * 60 * 1000 }), 600); }
export function clearSessionCookie() { return makeCookie(SESSION_COOKIE, '', 0); }
export function clearStateCookie() { return makeCookie(STATE_COOKIE, '', 0); }
export function getSession(req) { return unseal(cookies(req)[SESSION_COOKIE]); }
export function getState(req) { return unseal(cookies(req)[STATE_COOKIE]); }

export function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}

export function method(req, res, expected) {
  if (req.method !== expected) { res.setHeader('Allow', expected); json(res, 405, { error: 'Method not allowed.' }); return false; }
  return true;
}

export async function tokenRequest(params) {
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params
    })
  });
  const data = await result.json();
  if (!result.ok || !data.access_token) throw new Error('Google token request failed. Reconnect Gmail.');
  return data;
}

export async function googleGet(path, token, params={}) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/' + path);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Gmail permission expired or was denied. Please reconnect Gmail.');
    throw new Error(`Gmail request failed (${response.status}).`);
  }
  return response.json();
}

export async function authorizedSession(req, res) {
  const saved = getSession(req);
  if (!saved || saved.email !== allowedEmail() || !saved.refresh_token) return null;
  if (saved.access_token && saved.expires_at > Date.now() + 60_000) return saved;
  const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refresh_token });
  const updated = {
    ...saved, access_token: fresh.access_token,
    expires_at: Date.now() + (fresh.expires_in || 3600) * 1000
  };
  res.setHeader('Set-Cookie', sessionCookie(updated));
  return updated;
}

export function allowedEmail() { return (process.env.GMAIL_ALLOWED_EMAIL || process.env.GMAIL_ADDRESS || '').trim().toLowerCase(); }

export function safeMessage(error) {
  const message = String(error?.message || 'Something went wrong.');
  return message.startsWith('Missing Vercel environment') || message.startsWith('SESSION_SECRET')
    ? message : message.startsWith('Gmail ') || message.startsWith('Google token') ? message : 'Unable to load Gmail. Please try again.';
}

export function parseGmailMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers || []).map(h => [h.name.toLowerCase(), h.value]));
  let plain = '';
  function traverse(part) {
    if (!part) return;
    // Attachments are intentionally not downloaded. HTML is never rendered in the UI.
    if (part.mimeType === 'text/plain' && part.body?.data && !part.filename && !plain) {
      plain = Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    for (const child of part.parts || []) traverse(child);
  }
  traverse(message.payload);
  if (!plain && message.payload?.body?.data && message.payload?.mimeType === 'text/plain') {
    plain = Buffer.from(message.payload.body.data, 'base64url').toString('utf8');
  }
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from || 'Unknown sender',
    to: headers.to || '',
    subject: headers.subject || '(No subject)',
    replyTo: headers['reply-to'] || '',
    messageId: headers['message-id'] || '',
    references: headers.references || '',
    date: Number(message.internalDate || Date.now()),
    snippet: message.snippet || '',
    body: plain.slice(0, 25000) || message.snippet || '(HTML-only email; plain-text preview shown.)',
    unread: (message.labelIds || []).includes('UNREAD')
  };
}
