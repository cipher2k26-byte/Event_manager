// ── app.js ────────────────────────────────────────────────────────────────────
// Main application logic + Calendar.
// Depends on db.js being loaded first (uses dbLoad/dbSave/dbLoadNotified/dbSaveNotified).

// ── State ─────────────────────────────────────────────────────────────────────
let events          = dbLoad();
let currentFilter   = 'all';
let deleteTarget    = null;
let selectedColor   = '#c8a96e';
let deSelectedColor = '#c8a96e';
let notifiedIds     = dbLoadNotified();

// Calendar state
let calYear         = new Date().getFullYear();
let calMonth        = new Date().getMonth();
let calSelectedDate = null; // 'YYYY-MM-DD'

// ── Page Navigation ───────────────────────────────────────────────────────────
function switchPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'calendar') renderCalendar();
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDT(iso) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function isPast(iso)  { return new Date(iso).getTime() < Date.now(); }
function isToday(iso) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function isoDateStr(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2,'0') + '-' +
    String(date.getDate()).padStart(2,'0');
}
function eventDateStr(iso) { return iso.slice(0, 10); }

function countdown(iso) {
  const now = Date.now(), target = new Date(iso).getTime(), diff = target - now;
  if (diff < 0) {
    const ago = -diff;
    if (ago < 3_600_000)  return { text: `${Math.floor(ago/60_000)}m ago`,    cls: 'done' };
    if (ago < 86_400_000) return { text: `${Math.floor(ago/3_600_000)}h ago`, cls: 'done' };
    return { text: `${Math.floor(ago/86_400_000)}d ago`, cls: 'done' };
  }
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)         return { text: `In ${mins}m`,                                         cls: 'urgency' };
  if (diff < 86_400_000) return { text: `In ${Math.floor(diff/3_600_000)}h ${mins%60}m`,      cls: mins<120?'urgency':'' };
  return { text: `In ${Math.floor(diff/86_400_000)}d`, cls: '' };
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
  if (Notification.permission === 'granted') new Notification(`Eventide: ${title}`, { body });
  setTimeout(() => { if (card.parentElement) card.remove(); }, 8000);
}

function checkNotifications() {
  const now = Date.now();
  events.forEach(ev => {
    if (isPast(ev.datetime) && new Date(ev.datetime).getTime() > now - 60_000) {
      const key = ev.id + '_hit';
      if (!notifiedIds.has(key)) { notifiedIds.add(key); showNotif(ev.title, 'Event is starting now!', true); }
    }
    const notifyMs = (ev.notifyBefore || 0) * 60_000;
    if (notifyMs > 0) {
      const notifyAt = new Date(ev.datetime).getTime() - notifyMs;
      const key = ev.id + '_pre';
      if (now >= notifyAt && now < notifyAt + 60_000 && !notifiedIds.has(key)) {
        notifiedIds.add(key); showNotif(ev.title, `Starting in ${ev.notifyBefore} minutes`);
      }
    }
  });
  dbSaveNotified(notifiedIds);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('s-total').textContent    = events.length;
  document.getElementById('s-upcoming').textContent = events.filter(e => !isPast(e.datetime)).length;
  document.getElementById('s-today').textContent    = events.filter(e => isToday(e.datetime)).length;
  document.getElementById('s-past').textContent     = events.filter(e => isPast(e.datetime)).length;
  document.getElementById('event-count').textContent = events.length;
}

// ── Events Render ─────────────────────────────────────────────────────────────
function renderEvents() {
  const q    = document.getElementById('search-input').value.toLowerCase();
  const grid = document.getElementById('events-grid');
  let filtered = events.filter(ev => {
    if (q && !ev.title.toLowerCase().includes(q) && !(ev.desc||'').toLowerCase().includes(q)) return false;
    if (currentFilter === 'upcoming') return !isPast(ev.datetime);
    if (currentFilter === 'today')    return isToday(ev.datetime);
    if (currentFilter === 'past')     return isPast(ev.datetime);
    return true;
  });
  filtered.sort((a,b) => {
    const ap=isPast(a.datetime), bp=isPast(b.datetime);
    if (ap !== bp) return ap ? 1 : -1;
    return new Date(a.datetime) - new Date(b.datetime);
  });
  updateStats();
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="big">✦</div><p>No events found. Add one to get started.</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map(ev => {
    const past=isPast(ev.datetime), today=isToday(ev.datetime), cd=countdown(ev.datetime);
    const dtCls  = past ? 'past-time' : today ? 'today-time' : '';
    const cardCls = past ? 'past' : today ? 'today' : '';
    return `
    <div class="event-card ${cardCls}" id="card-${ev.id}">
      <div class="color-bar" style="background:${ev.color||'#c8a96e'}"></div>
      <div class="event-cat">${escHtml(ev.category||'General')}</div>
      <div class="event-title">${escHtml(ev.title)}</div>
      ${ev.desc?`<div class="event-desc">${escHtml(ev.desc)}</div>`:''}
      <div class="event-datetime ${dtCls}">📅 ${formatDT(ev.datetime)}</div>
      <div class="countdown ${cd.cls}">${cd.text}</div>
      <div class="event-actions">
        <button class="btn btn-secondary btn-sm" onclick="editEvent('${ev.id}')">✏ Edit</button>
        <button class="btn btn-danger btn-sm"    onclick="askDelete('${ev.id}','${escHtml(ev.title)}')">✕ Delete</button>
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
  if (!title)    { alert('Please enter a title.'); return; }
  if (!datetime) { alert('Please pick a date and time.'); return; }
  if (id) {
    const idx = events.findIndex(e => e.id === id);
    if (idx > -1) events[idx] = { ...events[idx], title, desc, datetime, category, color: selectedColor, notifyBefore, updatedAt: new Date().toISOString() };
  } else {
    events.push({ id: uid(), title, desc, datetime, category, color: selectedColor, notifyBefore, createdAt: new Date().toISOString() });
  }
  dbSave(events);
  clearForm();
  renderEvents();
  if (document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-events').classList.add('active');
  document.querySelector('.nav-tab').classList.add('active');
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
  if (calSelectedDate) renderDayPanel(calSelectedDate);
  if (document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
}
function closeModal() { document.getElementById('del-modal').classList.remove('open'); deleteTarget = null; }

function clearForm() {
  document.getElementById('edit-id').value    = '';
  document.getElementById('f-title').value    = '';
  document.getElementById('f-desc').value     = '';
  document.getElementById('f-datetime').value = '';
  document.getElementById('f-cat').value      = 'General';
  document.getElementById('f-notify').value   = '15';
  selectColor('#c8a96e');
  document.getElementById('form-heading').innerHTML = 'New <em>Event</em>';
  document.getElementById('cancel-btn').style.display = 'none';
}

// ── Color Picker ──────────────────────────────────────────────────────────────
function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('#color-picker .color-swatch').forEach(s =>
    s.classList.toggle('selected', s.dataset.color === color));
}
function selectDeColor(color) {
  deSelectedColor = color;
  document.querySelectorAll('#de-color-picker .color-swatch').forEach(s =>
    s.classList.toggle('selected', s.dataset.color === color));
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
  document.getElementById('clock').textContent =
    new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// ════════════════════════════════════
// CALENDAR
// ════════════════════════════════════

function calNav(dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}
function calGoToday() {
  const n = new Date();
  calYear = n.getFullYear(); calMonth = n.getMonth();
  calSelectedDate = isoDateStr(n);
  renderCalendar();
  renderDayPanel(calSelectedDate);
}

function getEventsForDate(dateStr) {
  return events
    .filter(ev => eventDateStr(ev.datetime) === dateStr)
    .sort((a,b) => new Date(a.datetime) - new Date(b.datetime));
}

function renderCalendar() {
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').innerHTML = `<span>${monthNames[calMonth]}</span> ${calYear}`;

  // Stats strip
  const monthEvs = events.filter(ev => {
    const d = new Date(ev.datetime);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });
  document.getElementById('cal-stats-row').innerHTML = `
    <div class="cal-stat"><div class="cal-stat-num">${monthEvs.length}</div><div class="cal-stat-lbl">This Month</div></div>
    <div class="cal-stat"><div class="cal-stat-num">${monthEvs.filter(e => !isPast(e.datetime)).length}</div><div class="cal-stat-lbl">Upcoming</div></div>
    <div class="cal-stat"><div class="cal-stat-num">${[...new Set(monthEvs.map(e=>eventDateStr(e.datetime)))].length}</div><div class="cal-stat-lbl">Active Days</div></div>
  `;

  // Build day cells
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const todayStr    = isoDateStr(new Date());

  let cells = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(calYear, calMonth - 1, daysInPrev - i);
    cells.push({ date: d, dateStr: isoDateStr(d), otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calYear, calMonth, d);
    cells.push({ date, dateStr: isoDateStr(date), otherMonth: false });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(calYear, calMonth + 1, next++);
    cells.push({ date: d, dateStr: isoDateStr(d), otherMonth: true });
  }

  const MAX_PILLS = 2;
  document.getElementById('cal-days').innerHTML = cells.map(cell => {
    const dayEvs = getEventsForDate(cell.dateStr);
    const isT    = cell.dateStr === todayStr;
    const isSel  = cell.dateStr === calSelectedDate;
    let cls = '';
    if (cell.otherMonth) cls += ' other-month';
    if (isT)   cls += ' is-today';
    if (isSel) cls += ' selected';

    let pillsHtml = '';
    if (dayEvs.length > 0) {
      pillsHtml = dayEvs.slice(0, MAX_PILLS).map(ev =>
        `<div class="cal-event-pill" style="background:${ev.color||'#c8a96e'}">${escHtml(ev.title)}</div>`
      ).join('');
      if (dayEvs.length > MAX_PILLS)
        pillsHtml += `<div class="cal-event-more">+${dayEvs.length - MAX_PILLS} more</div>`;
    }
    return `
    <div class="cal-day${cls}" onclick="calSelectDate('${cell.dateStr}')">
      <div class="cal-day-num">${cell.date.getDate()}</div>
      <div class="cal-event-dots">${pillsHtml}</div>
    </div>`;
  }).join('');

  if (calSelectedDate) renderDayPanel(calSelectedDate);
}

function calSelectDate(dateStr) {
  calSelectedDate = dateStr;
  document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  renderDayPanel(dateStr);
}

function renderDayPanel(dateStr) {
  const [y, m, d]  = dateStr.split('-').map(Number);
  const dateObj     = new Date(y, m - 1, d);
  const dayNames    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const todayStr    = isoDateStr(new Date());
  const isToday_    = dateStr === todayStr;
  const dayEvs      = getEventsForDate(dateStr);

  document.getElementById('dp-date').innerHTML =
    `${dayNames[dateObj.getDay()]}, <span>${d} ${monthNames[m-1]} ${y}</span>`;
  document.getElementById('dp-sub').textContent =
    isToday_ ? 'Today' : dayEvs.length > 0 ? `${dayEvs.length} event${dayEvs.length>1?'s':''}` : 'No events';

  const body = document.getElementById('dp-body');
  if (dayEvs.length === 0) {
    body.innerHTML = `
      <div class="day-panel-empty">
        <div class="big">✦</div>
        <p>No events on this day.</p>
      </div>`;
  } else {
    body.innerHTML = dayEvs.map(ev => {
      const cd = countdown(ev.datetime);
      return `
      <div class="day-event-item" style="border-left-color:${ev.color||'#c8a96e'}">
        <div class="day-event-time">${formatTime(ev.datetime)} &nbsp;·&nbsp; <span class="countdown ${cd.cls}" style="padding:0;background:none;margin:0;font-size:0.6rem">${cd.text}</span></div>
        <div class="day-event-title">${escHtml(ev.title)}</div>
        <div class="day-event-cat">${escHtml(ev.category||'General')}</div>
        ${ev.desc?`<div class="day-event-desc">${escHtml(ev.desc)}</div>`:''}
        <div class="day-event-actions">
          <button class="btn btn-secondary btn-sm" onclick="openDayEdit('${ev.id}')">✏ Edit</button>
          <button class="btn btn-danger btn-sm"    onclick="askDelete('${ev.id}','${escHtml(ev.title)}')">✕ Delete</button>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('dp-add-btn-wrap').style.display = 'block';
}

// ── Add event prefilled to selected date ─────────────────────────────────────
function addEventOnDate() {
  if (!calSelectedDate) return;
  const dt = calSelectedDate + 'T09:00';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-events').classList.add('active');
  document.querySelector('.nav-tab').classList.add('active');
  clearForm();
  document.getElementById('f-datetime').value = dt;
  document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
  document.getElementById('f-title').focus();
}

// ── Day-edit modal ────────────────────────────────────────────────────────────
function openDayEdit(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  document.getElementById('de-id').value       = ev.id;
  document.getElementById('de-title').value    = ev.title;
  document.getElementById('de-desc').value     = ev.desc || '';
  document.getElementById('de-datetime').value = ev.datetime;
  document.getElementById('de-cat').value      = ev.category || 'General';
  document.getElementById('de-notify').value   = ev.notifyBefore || 15;
  selectDeColor(ev.color || '#c8a96e');
  document.getElementById('day-edit-modal').classList.add('open');
}

function closeDayEditModal() {
  document.getElementById('day-edit-modal').classList.remove('open');
}

function saveDayEdit() {
  const id           = document.getElementById('de-id').value;
  const title        = document.getElementById('de-title').value.trim();
  const desc         = document.getElementById('de-desc').value.trim();
  const datetime     = document.getElementById('de-datetime').value;
  const category     = document.getElementById('de-cat').value;
  const notifyBefore = parseInt(document.getElementById('de-notify').value);
  if (!title)    { alert('Please enter a title.'); return; }
  if (!datetime) { alert('Please pick a date and time.'); return; }
  const idx = events.findIndex(e => e.id === id);
  if (idx > -1) {
    events[idx] = { ...events[idx], title, desc, datetime, category, color: deSelectedColor, notifyBefore, updatedAt: new Date().toISOString() };
  }
  dbSave(events);
  closeDayEditModal();
  renderCalendar();
  showNotif(title, 'Event updated.');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('Notification' in window && Notification.permission === 'default')
    Notification.requestPermission();

  document.getElementById('color-picker').addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch');
    if (sw) selectColor(sw.dataset.color);
  });
  document.getElementById('de-color-picker').addEventListener('click', e => {
    const sw = e.target.closest('.color-swatch');
    if (sw) selectDeColor(sw.dataset.color);
  });
  document.getElementById('search-input').addEventListener('input', renderEvents);
  document.getElementById('f-datetime').min =
    new Date(Date.now() - 86_400_000 * 365).toISOString().slice(0, 16);

  calSelectedDate = isoDateStr(new Date());

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(checkNotifications, 30_000);
  checkNotifications();
  renderEvents();
});
