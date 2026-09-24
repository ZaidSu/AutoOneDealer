// The login page is only a visual demo. Sign-out clears the actual Gmail session cookie.
document.querySelectorAll('a.logout').forEach(link => {
  link.addEventListener('click', async event => {
    event.preventDefault();
    try { await fetch('/api/disconnect', { method: 'POST', credentials: 'same-origin' }); } catch {}
    location.assign('../index.html');
  });
});
