// ─────────────────────────────────────────────────────────────────────────────
// app.js — Eventide Application Logic
// Depends on: db.js (dbSave, dbLoad, dbSaveNotified, dbLoadNotified)
// ─────────────────────────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
let events        = dbLoad();
let currentFilter = 'all';
let deleteTarget  = null;
let selectedColor = '#c8a96e';
let notifiedIds   = dbLoadNotified();

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDT(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function isPast(iso)  { return new Date(iso).getTime() < Date.now(); }

function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth()    === n.getMonth()    &&
    d.getDate()     === n.getDate()
  );
}

function countdown(iso) {
  const now    = Date.now();
  const target = new Date(iso).getTime();
  const diff   = target - now;

  if (diff < 0) {
    const ago = -diff;
    if (ago < 3_600_000)  return { text: `${Math.floor(ago / 60_000)}m ago`,  cls: 'done' };
    if (ago < 86_400_000) return { text: `${Math.floor(ago / 3_600_000)}h ago`, cls: 'done' };
    return { text: `${Math.floor(ago / 86_400_000)}d ago`, cls: 'done' };
  }

  const mins = Math.floor(diff / 60_000);
  if (mins < 60)         return { text: `In ${mins}m`, cls: 'urgency' };
  if (diff < 86_400_000) return { text: `In ${Math.floor(diff / 3_600_000)}h ${mins % 60}m`, cls: mins < 120 ? 'urgency' : '' };
  return { text: `In ${Math.floor(diff / 86_400_000)}d`, cls: '' };
}

// ── Notifications ─────────────────────────────────────────────────────────────

function showNotif(title, body, urgent = false) {
  const bar  = document.getElementById('notif-bar');
  const card = document.createElement('div');
  card.className = 'notif-card' + (urgent ? ' urgent' : '');
  card.innerHTML = `
    <span class="notif-icon">${urgent ? '🔔' : '📅'}</span>
    <div class="notif-text">
      <div class="notif-title">${urgent ? 'NOW' : 'REMINDER'}</div>
      <div class="notif-body"><strong>${escHtml(title)}</strong> — ${escHtml(body)}</div>
    </div>
    <button class="notif-close" onclick="this.parentElement.remove()">✕</button>`;
  bar.appendChild(card);

  // Browser push notification
  if (Notification.permission === 'granted') {
    new Notification(`Eventide: ${title}`, { body });
  }

  setTimeout(() => { if (card.parentElement) card.remove(); }, 8000);
}

function checkNotifications() {
  const now = Date.now();
  events.forEach(ev => {
    // Fires exactly when event hits
    if (isPast(ev.datetime) && new Date(ev.datetime).getTime() > now - 60_000) {
      const key = ev.id + '_hit';
      if (!notifiedIds.has(key)) {
        notifiedIds.add(key);
        showNotif(ev.title, 'Event is starting now!', true);
      }
    }
    // Pre-event reminder
    const notifyMs = (ev.notifyBefore || 0) * 60_000;
    if (notifyMs > 0) {
      const notifyAt = new Date(ev.datetime).getTime() - notifyMs;
      const key      = ev.id + '_pre';
      if (now >= notifyAt && now < notifyAt + 60_000 && !notifiedIds.has(key)) {
        notifiedIds.add(key);
        showNotif(ev.title, `Starting in ${ev.notifyBefore} minutes`);
      }
    }
  });
  dbSaveNotified(notifiedIds);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function updateStats() {
  document.getElementById('s-total').textContent    = events.length;
  document.getElementById('s-upcoming').textContent = events.filter(e => !isPast(e.datetime)).length;
  document.getElementById('s-today').textContent    = events.filter(e => isToday(e.datetime)).length;
  document.getElementById('s-past').textContent     = events.filter(e => isPast(e.datetime)).length;
  document.getElementById('event-count').textContent = events.length;
}

function renderEvents() {
  const q    = document.getElementById('search-input').value.toLowerCase();
  const grid = document.getElementById('events-grid');

  let filtered = events.filter(ev => {
    if (q && !ev.title.toLowerCase().includes(q) && !(ev.desc || '').toLowerCase().includes(q)) return false;
    if (currentFilter === 'upcoming') return !isPast(ev.datetime);
    if (currentFilter === 'today')    return isToday(ev.datetime);
    if (currentFilter === 'past')     return isPast(ev.datetime);
    return true;
  });

  // Sort: upcoming first, then soonest
  filtered.sort((a, b) => {
    const ap = isPast(a.datetime), bp = isPast(b.datetime);
    if (ap !== bp) return ap ? 1 : -1;
    return new Date(a.datetime) - new Date(b.datetime);
  });

  updateStats();

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="big">✦</div>
        <p>No events found. Add one to get started.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(ev => {
    const past    = isPast(ev.datetime);
    const today   = isToday(ev.datetime);
    const cd      = countdown(ev.datetime);
    const dtCls   = past ? 'past-time' : today ? 'today-time' : '';
    const cardCls = past ? 'past'      : today ? 'today'      : '';

    return `
    <div class="event-card ${cardCls}" id="card-${ev.id}">
      <div class="color-bar" style="background:${ev.color || '#c8a96e'}"></div>
      <div class="event-cat">${escHtml(ev.category || 'General')}</div>
      <div class="event-title">${escHtml(ev.title)}</div>
      ${ev.desc ? `<div class="event-desc">${escHtml(ev.desc)}</div>` : ''}
      <div class="event-datetime ${dtCls}">📅 ${formatDT(ev.datetime)}</div>
      <div class="countdown ${cd.cls}">${cd.text}</div>
      <div class="event-actions">
        <button class="btn btn-secondary btn-sm" onclick="editEvent('${ev.id}')">✏ Edit</button>
        <button class="btn btn-danger btn-sm"    onclick="askDelete('${ev.id}', '${escHtml(ev.title)}')">✕ Delete</button>
      </div>
    </div>`;
  }).join('');
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function saveEvent() {
  const id           = document.getElementById('edit-id').value;
  const title        = document.getElementById('f-title').value.trim();
  const desc         = document.getElementById('f-desc').value.trim();
  const datetime     = document.getElementById('f-datetime').value;
  const category     = document.getElementById('f-cat').value;
  const notifyBefore = parseInt(document.getElementById('f-notify').value);

  if (!title)    { alert('Please enter a title.');         return; }
  if (!datetime) { alert('Please pick a date and time.'); return; }

  if (id) {
    // Update existing
    const idx = events.findIndex(e => e.id === id);
    if (idx > -1) {
      events[idx] = {
        ...events[idx],
        title, desc, datetime, category,
        color: selectedColor, notifyBefore,
        updatedAt: new Date().toISOString()
      };
    }
  } else {
    // Create new
    events.push({
      id: uid(),
      title, desc, datetime, category,
      color: selectedColor, notifyBefore,
      createdAt: new Date().toISOString()
    });
  }

  dbSave(events);
  clearForm();
  renderEvents();
  showNotif(title, id ? 'Event updated.' : 'Event added!');
}

function editEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;

  document.getElementById('edit-id').value    = ev.id;
  document.getElementById('f-title').value    = ev.title;
  document.getElementById('f-desc').value     = ev.desc || '';
  document.getElementById('f-datetime').value = ev.datetime;
  document.getElementById('f-cat').value      = ev.category || 'General';
  document.getElementById('f-notify').value   = ev.notifyBefore || 15;
  selectColor(ev.color || '#c8a96e');

  document.getElementById('form-heading').innerHTML = 'Edit <em>Event</em>';
  document.getElementById('cancel-btn').style.display = 'block';
  document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
}

function askDelete(id, title) {
  deleteTarget = id;
  document.getElementById('del-title').textContent = title;
  document.getElementById('del-modal').classList.add('open');
}

function confirmDelete() {
  if (!deleteTarget) return;
  events = events.filter(e => e.id !== deleteTarget);
  dbSave(events);
  closeModal();
  renderEvents();
}

function closeModal() {
  document.getElementById('del-modal').classList.remove('open');
  deleteTarget = null;
}

function clearForm() {
  document.getElementById('edit-id').value    = '';
  document.getElementById('f-title').value    = '';
  document.getElementById('f-desc').value     = '';
  document.getElementById('f-datetime').value = '';
  document.getElementById('f-cat').value      = 'General';
  document.getElementById('f-notify').value   = '15';
  selectColor('#c8a96e');
  document.getElementById('form-heading').innerHTML   = 'New <em>Event</em>';
  document.getElementById('cancel-btn').style.display = 'none';
}

// ── Color Picker ──────────────────────────────────────────────────────────────

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color);
  });
}

// ── Filter Tabs ───────────────────────────────────────────────────────────────

function setFilter(btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderEvents();
}

// ── Clock ─────────────────────────────────────────────────────────────────────

function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Request browser notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Color picker delegation
  document.getElementById('color-picker').addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch');
    if (sw) selectColor(sw.dataset.color);
  });

  // Search live filter
  document.getElementById('search-input').addEventListener('input', renderEvents);

  // Set datetime input floor
  document.getElementById('f-datetime').min =
    new Date(Date.now() - 86_400_000 * 365).toISOString().slice(0, 16);

  // Kick off
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(checkNotifications, 30_000);
  checkNotifications();
  renderEvents();
});
