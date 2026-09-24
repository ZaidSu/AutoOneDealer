const monthInput = document.getElementById('monthInput');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const notice = document.getElementById('reportNotice');
const bars = document.getElementById('bars');
const details = document.getElementById('reportDetails');
const viewMonth = document.getElementById('viewMonth');
const applyRange = document.getElementById('applyRange');
let running = false;

function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function lastOfMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}
function setError(message) { notice.textContent = message; notice.classList.add('error'); }
function dateLabel(yyyyMmDd) {
  return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' }).format(new Date(yyyyMmDd + 'T12:00:00Z'));
}
function bucketLabel(bucket, mode) {
  if (mode === 'day') return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(bucket.start + 'T12:00:00Z'));
  if (mode === 'month') return new Intl.DateTimeFormat('en-US', { month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(bucket.start + 'T12:00:00Z'));
  return dateLabel(bucket.start);
}
function addOneDay(ymd) {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0,10);
}
async function loadReport(start, end) {
  if (running) return;
  if (!start || !end || start > end) { setError('Choose a valid start and end date.'); return; }
  if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 366) { setError('Select a range of up to 366 days.'); return; }
  running = true;
  notice.classList.remove('error');
  notice.textContent = 'Reading historical lead counts from Gmail. This can take a little longer for larger ranges...';
  viewMonth.disabled = applyRange.disabled = true;
  try {
    const url = `/api/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const res = await fetch(url, { cache:'no-store' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Could not load the selected dates.');
    startDate.value = start;
    endDate.value = end;
    document.getElementById('totalLeads').textContent = result.total.toLocaleString();
    document.getElementById('avgLeads').textContent = (result.total / result.days).toFixed(1);
    const peak = result.buckets.reduce((best, item) => !best || item.count > best.count ? item : best, null);
    document.getElementById('peakLeads').textContent = peak ? peak.count.toLocaleString() : '0';
    document.getElementById('peakLabel').textContent = peak ? bucketLabel(peak, result.mode) + ' (' + result.mode + ')' : '';
    document.getElementById('chartTitle').textContent = result.mode === 'day' ? 'Daily Lead Volume' : result.mode === 'week' ? 'Weekly Lead Volume' : 'Monthly Lead Volume';
    document.getElementById('chartRange').textContent = `${dateLabel(result.start)} – ${dateLabel(result.end)}`;
    bars.replaceChildren();
    details.replaceChildren();
    const max = Math.max(1, ...result.buckets.map(b => b.count));
    for (const bucket of result.buckets) {
      const label = bucketLabel(bucket, result.mode);
      const wrap = document.createElement('div'); wrap.className = 'bar-wrap';
      const value = document.createElement('strong'); value.textContent = bucket.count;
      const bar = document.createElement('div'); bar.className = 'bar'; bar.style.height = Math.max(3, (bucket.count / max) * 210) + 'px';
      bar.title = `${label}: ${bucket.count} matching emails`;
      const date = document.createElement('span'); date.textContent = label;
      wrap.append(value, bar, date); bars.appendChild(wrap);
      const row = document.createElement('div'); row.className = 'detail-row';
      const dateText = document.createElement('span');
      const lastDate = new Date(bucket.endExclusive + 'T12:00:00Z'); lastDate.setUTCDate(lastDate.getUTCDate() - 1);
      dateText.textContent = result.mode === 'day' ? dateLabel(bucket.start) : `${dateLabel(bucket.start)} – ${dateLabel(lastDate.toISOString().slice(0,10))}`;
      const count = document.createElement('strong'); count.textContent = bucket.count.toLocaleString();
      row.append(dateText, count); details.appendChild(row);
    }
    notice.textContent = `${result.total.toLocaleString()} matching lead emails found. Full result pages counted; no sample numbers.`;
  } catch (error) { setError(error.message); }
  finally { running = false; viewMonth.disabled = applyRange.disabled = false; }
}

viewMonth.addEventListener('click', () => {
  const month = monthInput.value;
  if (!month) return setError('Choose a month first.');
  const first = month + '-01';
  const last = lastOfMonth(month);
  const today = chicagoToday();
  if (first > today) return setError('Select the current month or an earlier month.');
  loadReport(first, last > today ? today : last);
});
applyRange.addEventListener('click', () => loadReport(startDate.value, endDate.value));
(async () => {
  const today = chicagoToday();
  monthInput.value = today.slice(0,7);
  monthInput.max = today.slice(0,7);
  startDate.value = today.slice(0,7) + '-01';
  endDate.value = today;
  endDate.max = startDate.max = today;
  await loadReport(startDate.value, endDate.value);
})();
