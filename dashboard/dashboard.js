const recentContainer = document.getElementById('recentEmails');
const gmailStatus = document.getElementById('gmailStatus');
const connectButton = document.getElementById('connectButton');
connectButton.addEventListener('click', () => location.assign('../settings/settings.html'));

async function loadDashboard() {
  try {
    const statusResponse = await fetch('/api/status', { cache:'no-store' });
    const status = await statusResponse.json();
    if (!status.connected) {
      gmailStatus.textContent = 'Not connected';
      recentContainer.textContent = 'Connect Gmail in Settings to view lead emails.';
      return;
    }
    gmailStatus.textContent = 'Connected · ' + status.email;
    gmailStatus.classList.remove('warning');
    connectButton.textContent = 'Gmail Settings';
    const [overviewRes, recentRes] = await Promise.all([
      fetch('/api/overview', { cache:'no-store' }),
      fetch('/api/emails?max=8', { cache:'no-store' })
    ]);
    const overview = await overviewRes.json();
    const recent = await recentRes.json();
    if (!overviewRes.ok) throw new Error(overview.error || 'Unable to load lead counts.');
    if (!recentRes.ok) throw new Error(recent.error || 'Unable to load recent leads.');
    document.getElementById('emailsToday').textContent = overview.today.toLocaleString();
    document.getElementById('emailsMonth').textContent = overview.month.toLocaleString();
    document.getElementById('reviewCount').textContent = overview.unreadMonth.toLocaleString();
    recentContainer.replaceChildren();
    for (const email of recent.emails.slice(0, 5)) {
      const row = document.createElement('div'); row.className = 'email-row';
      const from = document.createElement('strong'); from.textContent = email.from;
      const subject = document.createElement('p'); subject.textContent = email.subject;
      const date = document.createElement('small'); date.textContent = new Date(email.date).toLocaleDateString();
      row.append(from, subject, date); recentContainer.appendChild(row);
    }
    if (!recent.emails.length) recentContainer.textContent = 'No matching lead emails in the Inbox. Check the lead filter in Settings.';
  } catch (error) {
    gmailStatus.textContent = 'Connection error';
    recentContainer.textContent = error.message;
  }
}
loadDashboard();
