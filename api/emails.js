import { authorizedSession, googleGet, parseGmailMessage, method, json, safeMessage } from './_utils.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const session = await authorizedSession(req, res);
    if (!session) return json(res, 401, { error: 'Connect the approved Gmail account in Settings first.' });

    const max = 15; // Small batches keep serverless requests quick.
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
    const listing = await googleGet('messages', session.access_token, {
      labelIds: 'INBOX', maxResults: max, pageToken
    });
    const ids = listing.messages || [];
    // Process in three modest-sized batches to avoid Gmail bursts.
    const emails = [];
    for (let i = 0; i < ids.length; i += 5) {
      const batch = await Promise.all(ids.slice(i, i + 5).map(async ({ id }) => {
        const message = await googleGet('messages/' + encodeURIComponent(id), session.access_token, { format: 'full' });
        return parseGmailMessage(message);
      }));
      emails.push(...batch);
    }
    emails.sort((a, b) => b.date - a.date);
    return json(res, 200, { emails, nextPageToken: listing.nextPageToken || null, readOnly: true });
  } catch (error) {
    return json(res, 502, { error: safeMessage(error) });
  }
}
