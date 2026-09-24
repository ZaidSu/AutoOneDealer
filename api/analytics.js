import { authorizedSession, googleGet, method, json, safeMessage } from './_utils.js';
import { addDays, daysBetween, dateQuery, exactCount, reportBuckets, midnightChicago } from './_leads.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const session = await authorizedSession(req, res);
    if (!session) return json(res, 401, { error: 'Connect Gmail in Settings first.' });
    const start = typeof req.query.start === 'string' ? req.query.start : '';
    const end = typeof req.query.end === 'string' ? req.query.end : '';
    midnightChicago(start);
    midnightChicago(end);
    const endExclusive = addDays(end, 1);
    const span = daysBetween(start, endExclusive);
    if (span < 1 || span > 366) return json(res, 400, { error: 'Select a date range from 1 to 366 days.' });
    const { mode, buckets } = reportBuckets(start, endExclusive);
    const results = new Array(buckets.length);
    let cursor = 0;
    // Limit concurrency so large reports do not exhaust Gmail's quotas.
    await Promise.all(Array.from({ length: Math.min(4, buckets.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= buckets.length) return;
        const bucket = buckets[i];
        const count = await exactCount(googleGet, session.access_token, dateQuery(bucket.start, bucket.endExclusive));
        results[i] = { ...bucket, count };
      }
    }));
    const total = results.reduce((sum, bucket) => sum + bucket.count, 0);
    return json(res, 200, { start, end, timezone: 'America/Chicago', mode, buckets: results, total, days: span, leadOnly: true, readOnly: true });
  } catch (error) {
    const msg = String(error?.message || '');
    if (msg.includes('Dates must be valid') || msg.includes('Too many Gmail') || msg.includes('Invalid time value')) {
      return json(res, 400, { error: msg.includes('Invalid time value') ? 'Enter valid start and end dates.' : msg });
    }
    return json(res, 502, { error: safeMessage(error) });
  }
}
