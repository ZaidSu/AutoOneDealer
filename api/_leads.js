// All lead filtering happens on the backend. Never accept a Gmail query
// directly from the public Inbox or Analytics URL.
export const DEFAULT_LEAD_QUERY = '{from:salesleads@cars.com from:salesleads from:carzing.com from:cutx.org from:credituniontexas.org}';

export function leadQuery() {
  const configured = (process.env.LEAD_GMAIL_QUERY || '').trim();
  const base = configured || DEFAULT_LEAD_QUERY;
  if (base.length > 1500) throw new Error('LEAD_GMAIL_QUERY is too long.');
  return `(${base}) -in:sent -in:spam -in:trash`;
}

export function inboxQuery() {
  return `${leadQuery()} in:inbox`;
}

// Return only a UI label; do not use these guesses to decide which mail
// is allowed through. The single Gmail query above controls access.
export function sourceFor(message) {
  const source = `${message.from || ''} ${message.subject || ''}`.toLowerCase();
  if (source.includes('cars.com')) return 'Cars.com';
  if (source.includes('carzing')) return 'CarZing';
  if (source.includes('cutx.org') || source.includes('credituniontexas')) return 'Credit Union of Texas';
  return 'Other lead';
}

// Gmail after:/before: expect Unix timestamps. Date-only searches otherwise
// use Google's Pacific timezone. We use America/Chicago for the dealership.
const tz = 'America/Chicago';
const offsetFormat = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset', hour: '2-digit' });
function offsetAt(instant) {
  const value = offsetFormat.formatToParts(new Date(instant)).find(p => p.type === 'timeZoneName')?.value || 'GMT-6';
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Could not determine dealership timezone.');
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] || 0)) * 60_000;
}

export function midnightChicago(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('Dates must be valid YYYY-MM-DD values.');
  }
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  let guess = utcMidnight + 6 * 60 * 60 * 1000;
  // Two iterations also handle transitions in offset.
  for (let i = 0; i < 2; i++) guess = utcMidnight - offsetAt(guess);
  return Math.floor(guess / 1000);
}

export function addDays(date, n) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + n);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(start, endExclusive) {
  return Math.round((Date.parse(`${endExclusive}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
}

export function chicagoDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function dateQuery(start, endExclusive) {
  return `${leadQuery()} after:${midnightChicago(start)} before:${midnightChicago(endExclusive)}`;
}

// Lists return IDs only. Keep paging to get an *exact* count rather than
// displaying Gmail's resultSizeEstimate, which is not an exact count.
export async function exactCount(googleGet, token, query, maxPages = 25) {
  let count = 0;
  let next = '';
  let pages = 0;
  do {
    if (++pages > maxPages) throw new Error('Too many Gmail results for a single report bucket. Narrow the date range.');
    const page = await googleGet('messages', token, { q: query, maxResults: 500, pageToken: next });
    count += (page.messages || []).length;
    next = page.nextPageToken || '';
  } while (next);
  return count;
}

export function reportBuckets(start, endExclusive) {
  const span = daysBetween(start, endExclusive);
  const mode = span <= 35 ? 'day' : span <= 119 ? 'week' : 'month';
  const buckets = [];
  for (let current = start; current < endExclusive;) {
    let next;
    if (mode === 'day') next = addDays(current, 1);
    else if (mode === 'week') next = addDays(current, 7);
    else {
      const [year, month] = current.split('-').map(Number);
      next = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
    }
    if (next > endExclusive) next = endExclusive;
    buckets.push({ start: current, endExclusive: next });
    current = next;
  }
  return { mode, buckets };
}
