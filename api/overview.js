import { authorizedSession, googleGet, method, json, safeMessage } from './_utils.js';
import { chicagoDate, addDays, dateQuery, exactCount } from './_leads.js';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const session = await authorizedSession(req, res);
    if (!session) return json(res, 401, { error: 'Connect Gmail in Settings first.' });
    const today = chicagoDate();
    const monthStart = `${today.slice(0, 7)}-01`;
    const [todayCount, monthCount, unreadMonth] = await Promise.all([
      exactCount(googleGet, session.access_token, dateQuery(today, addDays(today, 1))),
      exactCount(googleGet, session.access_token, dateQuery(monthStart, addDays(today, 1))),
      exactCount(googleGet, session.access_token, `${dateQuery(monthStart, addDays(today, 1))} is:unread`)
    ]);
    return json(res, 200, { today: todayCount, month: monthCount, unreadMonth, date: today, timezone: 'America/Chicago', leadOnly: true });
  } catch (error) {
    return json(res, 502, { error: safeMessage(error) });
  }
}
