import { authorizedSession, googleGet, parseGmailMessage, method, json, safeMessage } from './_utils.js';
import { inboxQuery, sourceFor } from './_leads.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const session = await authorizedSession(req, res);
    if (!session) return json(res, 401, { error: 'Connect the approved Gmail account in Settings first.' });
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken.slice(0, 400) : '';
    const max = Math.min(50, Math.max(1, Number.parseInt(req.query.max, 10) || 30));
    // Important: the client never supplies its own Gmail query. Lead messages
    // are filtered BEFORE Gmail returns message IDs or message bodies.
    const listing = await googleGet('messages', session.access_token, {
      q: inboxQuery(), maxResults: max, pageToken
    });
    const ids = listing.messages || [];
    const emails = [];
    for (let i = 0; i < ids.length; i += 8) {
      const batch = await Promise.all(ids.slice(i, i + 8).map(async ({ id }) => {
        const message = await googleGet('messages/' + encodeURIComponent(id), session.access_token, { format: 'full' });
        const email = parseGmailMessage(message);
        return { ...email, source: sourceFor(email) };
      }));
      emails.push(...batch);
    }
    emails.sort((a, b) => b.date - a.date);
    return json(res, 200, {
      emails, nextPageToken: listing.nextPageToken || null,
      resultSizeEstimate: listing.resultSizeEstimate ?? null, readOnly: true, leadOnly: true
    });
  } catch (error) {
    return json(res, 502, { error: safeMessage(error) });
  }
}
