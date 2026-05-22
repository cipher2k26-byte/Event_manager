// ── db.js ─────────────────────────────────────────────────────────────────────
// Handles all localStorage persistence with XOR-based encryption.
// Consumed by app.js via dbSave / dbLoad / dbSaveNotified / dbLoadNotified.

const DB_KEY    = 'eventide_v1';
const NOTIF_KEY = 'notified_ids';
const SECRET    = 'Ev3nt1d3$3cr3t!K3y';

function xorEncrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++)
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  try { return btoa(unescape(encodeURIComponent(result))); } catch (e) { return btoa(result); }
}

function xorDecrypt(encoded, key) {
  try {
    const raw = decodeURIComponent(escape(atob(encoded)));
    let out = '';
    for (let i = 0; i < raw.length; i++)
      out += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    return out;
  } catch (e) { return null; }
}

function dbSave(data)      { localStorage.setItem(DB_KEY, xorEncrypt(JSON.stringify(data), SECRET)); }
function dbLoad()          {
  const r = localStorage.getItem(DB_KEY);
  if (!r) return [];
  const d = xorDecrypt(r, SECRET);
  if (!d) return [];
  try { return JSON.parse(d); } catch { return []; }
}
function dbSaveNotified(s) { localStorage.setItem(NOTIF_KEY, JSON.stringify([...s])); }
function dbLoadNotified()  { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')); }
