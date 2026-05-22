// ─────────────────────────────────────────────────────────────────────────────
// db.js — Eventide Encrypted Database
// XOR cipher + Base64 encoding over localStorage
// ─────────────────────────────────────────────────────────────────────────────

const DB_KEY    = 'eventide_v1';
const NOTIF_KEY = 'notified_ids';
const SECRET    = 'Ev3nt1d3$3cr3t!K3y';

// ── Encryption ────────────────────────────────────────────────────────────────

function xorEncrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  try {
    return btoa(unescape(encodeURIComponent(result)));
  } catch (e) {
    return btoa(result);
  }
}

function xorDecrypt(encoded, key) {
  try {
    const raw = decodeURIComponent(escape(atob(encoded)));
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(
        raw.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return out;
  } catch (e) {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function dbSave(data) {
  const json = JSON.stringify(data);
  localStorage.setItem(DB_KEY, xorEncrypt(json, SECRET));
}

function dbLoad() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return [];
  const dec = xorDecrypt(raw, SECRET);
  if (!dec) return [];
  try { return JSON.parse(dec); } catch (e) { return []; }
}

function dbSaveNotified(set) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify([...set]));
}

function dbLoadNotified() {
  return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'));
}
