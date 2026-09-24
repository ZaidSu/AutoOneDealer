const statusLabel = document.getElementById('gmailConnection');
const message = document.getElementById('gmailMessage');
const connect = document.getElementById('connectGmail');
const disconnect = document.getElementById('disconnectGmail');

async function refreshStatus() {
  try {
    const res = await fetch('/api/status', { cache:'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unable to check Gmail.');
    if (data.connected) {
      statusLabel.textContent = 'Connected';
      statusLabel.style.color = '#14804a';
      message.textContent = `${data.email} · Read-only Gmail access.`;
      connect.textContent = 'Reconnect Gmail';
      disconnect.hidden = false;
    } else {
      statusLabel.textContent = 'Not connected';
      message.textContent = 'Connect the approved dealership Gmail account to read incoming messages.';
      connect.textContent = 'Connect Gmail';
      disconnect.hidden = true;
    }
  } catch (error) {
    statusLabel.textContent = 'Connection error';
    message.textContent = error.message;
  }
}

const result = new URLSearchParams(location.search).get('gmail');
const feedback = {
  connected:'Gmail connected successfully! Open the Inbox to view real emails.',
  denied:'Google permission was declined. Try Connect Gmail again.',
  wrong_account:'You selected the wrong Google account. Choose the dealership Gmail address.',
  invalid_state:'The login attempt expired or could not be verified. Try Connect Gmail again.',
  no_refresh_token:'Google did not return a refresh token. Try Connect Gmail again.',
  connection_failed:'Could not connect Gmail. Check OAuth settings and the callback URL, then try again.'
};

connect.addEventListener('click', () => location.assign('/api/google-login'));
disconnect.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/disconnect', { method:'POST', credentials:'same-origin' });
    if (!res.ok) throw new Error('Could not disconnect Gmail.');
    await refreshStatus();
    message.textContent = 'This browser has been disconnected. Google permission can also be revoked in your Google Account.';
  } catch (error) { message.textContent = error.message; }
});
refreshStatus().then(() => {
  if (result && feedback[result]) message.textContent = feedback[result];
});
