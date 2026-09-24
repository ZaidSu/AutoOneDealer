const recentContainer = document.getElementById('recentEmails');
const gmailStatus = document.getElementById('gmailStatus');
const connectButton = document.getElementById('connectButton');
connectButton.addEventListener('click', () => location.assign('../settings/settings.html'));

async function loadDashboard() {
  try {
    const status = await fetch('/api/status', { cache:'no-store' }).then(r => r.json());
    if (!status.connected) {
      gmailStatus.textContent = 'Not connected';
      recentContainer.textContent = 'Connect Gmail in Settings to view real customer emails.';
      return;
    }
    gmailStatus.textContent = 'Connected · ' + status.email;
    gmailStatus.classList.remove('warning');
    connectButton.textContent = 'Gmail Settings';
    const response = await fetch('/api/emails', {cache:'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load Gmail');
    const today = new Date().toDateString();
    document.getElementById('emailsToday').textContent = data.emails.filter(e => new Date(e.date).toDateString() === today).length;
    document.getElementById('emailsMonth').textContent = data.emails.length;
    document.getElementById('reviewCount').textContent = data.emails.filter(e => e.unread).length;
    recentContainer.replaceChildren();
    for (const email of data.emails.slice(0, 5)) {
      const row = document.createElement('div'); row.className = 'email-row';
      const from = document.createElement('strong'); from.textContent = email.from;
      const subject = document.createElement('p'); subject.textContent = email.subject;
      const time = document.createElement('small'); time.textContent = new Date(email.date).toLocaleDateString();
      row.append(from, subject, time); recentContainer.appendChild(row);
    }
    if (!data.emails.length) recentContainer.textContent = 'Your Gmail inbox is empty.';
  } catch (error) {
    gmailStatus.textContent = 'Connection error';
    recentContainer.textContent = error.message;
  }
}
loadDashboard();
