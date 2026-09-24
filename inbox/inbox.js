const list = document.getElementById('emailList');
const search = document.getElementById('searchInput');
const filter = document.getElementById('statusFilter');
const sourceFilter = document.getElementById('sourceFilter');
const notice = document.getElementById('inboxNotice');
const badge = document.getElementById('connectionBadge');
const moreButton = document.getElementById('loadMore');
let emails = [];
let selectedEmail = null;
let nextPageToken = null;
let loading = false;

function showNotice(message, isError = false) {
  notice.textContent = message + ' ';
  notice.classList.toggle('error', isError);
  const link = document.createElement('a');
  link.href = '../settings/settings.html';
  link.textContent = 'Gmail Settings';
  notice.appendChild(link);
}

async function getEmails(append = false) {
  if (loading) return;
  loading = true;
  document.getElementById('refreshInbox').disabled = true;
  moreButton.disabled = true;
  if (!append) showNotice('Loading dealership lead emails from Gmail...');
  try {
    const url = '/api/emails' + (append && nextPageToken ? '?pageToken=' + encodeURIComponent(nextPageToken) : '');
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load Gmail.');
    emails = append ? [...emails, ...data.emails] : data.emails;
    nextPageToken = data.nextPageToken;
    badge.textContent = 'Gmail connected · Read only';
    showNotice(`Displaying ${emails.length} approved lead emails${nextPageToken ? ' so far · older leads available' : ''}. Read-only; no replies will be sent.`);
    renderList();
  } catch (error) {
    badge.textContent = 'Gmail not connected';
    showNotice(error.message, true);
    if (!append) { emails = []; nextPageToken = null; renderList(); }
  } finally {
    loading = false;
    document.getElementById('refreshInbox').disabled = false;
    moreButton.disabled = false;
    moreButton.classList.toggle('hidden', !nextPageToken);
  }
}

function renderList() {
  const term = search.value.toLowerCase().trim();
  const wanted = filter.value;
  const source = sourceFilter.value;
  const visible = emails.filter(email => {
    const haystack = `${email.from} ${email.subject} ${email.snippet} ${email.body}`.toLowerCase();
    return haystack.includes(term) && (source === 'all' || email.source === source) && (wanted === 'all' || (wanted === 'unread' ? email.unread : !email.unread));
  });
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = emails.length ? 'No emails match your filters.' : 'No matching lead emails loaded. Check Settings if a lead source is missing.';
    list.appendChild(empty);
  }
  for (const email of visible) {
    const item = document.createElement('div');
    item.className = 'email-item' + (selectedEmail?.id === email.id ? ' active' : '');
    const row = document.createElement('div'); row.className = 'row';
    const from = document.createElement('h3'); from.textContent = email.from;
    const date = document.createElement('small'); date.textContent = new Date(email.date).toLocaleString();
    row.append(from, date);
    const subject = document.createElement('strong'); subject.textContent = email.subject;
    const sourceTag = document.createElement('span'); sourceTag.className = 'source-tag'; sourceTag.textContent = email.source || 'Other lead';
    const preview = document.createElement('p'); preview.textContent = email.snippet;
    item.append(row, subject, sourceTag, preview);
    if (email.unread) item.classList.add('unread');
    item.addEventListener('click', () => openEmail(email));
    list.appendChild(item);
  }
}

function openEmail(email) {
  selectedEmail = email;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('emailView').classList.remove('hidden');
  document.getElementById('emailSubject').textContent = email.subject;
  document.getElementById('emailMeta').textContent = `${email.from} · ${new Date(email.date).toLocaleString()}`;
  document.getElementById('emailStatus').textContent = `${email.source || 'Lead'} · ${email.unread ? 'Unread' : 'Read'}`;
  document.getElementById('emailBody').textContent = email.body;
  renderList();
}

search.addEventListener('input', renderList);
filter.addEventListener('change', renderList);
sourceFilter.addEventListener('change', renderList);
moreButton.addEventListener('click', () => getEmails(true));
document.getElementById('refreshInbox').addEventListener('click', () => getEmails());
getEmails();
