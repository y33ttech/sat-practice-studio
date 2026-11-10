/* Client-side persistence. There is no backend.

   • Question banks  → IndexedDB (can be several MB; never leaves the browser)
   • Progress        → localStorage (full detail) + cookies (compact mirror, 1 character per question)
   • Progress file   → downloadable/uploadable JSON so progress can move between browsers/devices

   Cookies are deliberately capped (COOKIE_BUDGET) because the browser attaches them to every
   request made to the site, and very large cookie headers can be rejected by the host. */
(function (SPS) {
  'use strict';
  const { hash } = SPS.util;
  const LS = { progress: 'sps.progress.v1', history: 'sps.history.v1', session: 'sps.session.v1', settings: 'sps.settings.v1', meta: 'sps.meta.v1' };
  const COOKIE_PREFIX = 'spsp_';
  const COOKIE_CHUNK = 3600, COOKIE_BUDGET = 7200, COOKIE_DAYS = 400;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  /* ---------------- safe localStorage ---------------- */
  const ls = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { } }
  };

  /* ---------------- cookies ---------------- */
  const cookiePath = () => { const p = location.pathname; return p.slice(0, p.lastIndexOf('/') + 1) || '/'; };
  function cookieAttrs(maxAge) { return `; path=${cookiePath()}; max-age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; }
  function readCookies() {
    const out = {};
    for (const part of (document.cookie || '').split(';')) {
      const i = part.indexOf('='); if (i < 0) continue;
      const k = part.slice(0, i).trim(); if (k) out[k] = part.slice(i + 1).trim();
    }
    return out;
  }
  function setCookie(k, v) { document.cookie = `${k}=${v}${cookieAttrs(COOKIE_DAYS * 86400)}`; }
  function delCookie(k) { document.cookie = `${k}=${cookieAttrs(0)}`; }
  const cookiesWork = (() => { try { document.cookie = 'sps_t=1' + cookieAttrs(60); const ok = /(?:^|;\s*)sps_t=1/.test(document.cookie); delCookie('sps_t'); return ok; } catch { return false; } })();

  /* ---------------- IndexedDB bank library ---------------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open('sat-practice-studio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('banks', { keyPath: 'key' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db(); if (!d) return null;
    return new Promise((resolve, reject) => {
      const t = d.transaction('banks', mode), store = t.objectStore('banks');
      let result; const r = fn(store); if (r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    });
  }
  const banks = {
    async all() { try { return (await tx('readonly', s => s.getAll())) || []; } catch { return []; } },
    async put(bank) { try { await tx('readwrite', s => s.put(bank)); return true; } catch { return false; } },
    async remove(key) { try { await tx('readwrite', s => s.delete(key)); } catch { } },
    async clear() { try { await tx('readwrite', s => s.clear()); } catch { } },
    available: async () => !!(await db())
  };

  /* ---------------- progress ----------------
     entries: { [question uid]: [attempts, correctCount, lastResult(1|0), flagged(1|0), lastTimestamp] } */
  let entries = ls.get(LS.progress, {}) || {};
  let history = ls.get(LS.history, []) || [];
  let meta = ls.get(LS.meta, { lastBackup: 0, lastChange: 0 }) || { lastBackup: 0, lastChange: 0 };
  let loadedBanks = []; // normalized banks currently in the library (for cookie encoding)
  let saveTimer = null;

  function get(uid) { const e = entries[uid]; return e ? { attempts: e[0], correct: e[1], last: e[2], flagged: !!e[3], at: e[4] } : null; }
  function record(uid, isCorrect) {
    const e = entries[uid] || [0, 0, 0, 0, 0];
    e[0]++; if (isCorrect) e[1]++; e[2] = isCorrect ? 1 : 0; e[4] = Date.now();
    entries[uid] = e; touch();
  }
  function setFlag(uid, on) {
    const e = entries[uid] || [0, 0, 0, 0, 0];
    e[3] = on ? 1 : 0; if (!e[4]) e[4] = Date.now();
    if (!e[0] && !e[3]) delete entries[uid]; else entries[uid] = e;
    touch();
  }
  /** status: 'unseen' | 'correct' | 'missed' */
  function status(uid) { const e = entries[uid]; if (!e || !e[0]) return 'unseen'; return e[2] ? 'correct' : 'missed'; }
  function touch() { meta.lastChange = Date.now(); clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250); }
  function flush() {
    clearTimeout(saveTimer);
    ls.set(LS.progress, entries); ls.set(LS.history, history.slice(-300)); ls.set(LS.meta, meta);
    writeCookieMirror();
  }
  window.addEventListener('pagehide', () => flush());

  /* ----- cookie mirror: per bank, one base64url char per question (sorted by id) -----
     bits 0-1: 0 unseen / 1 last correct / 2 last missed; bit 2: flagged; bits 3-5: attempts (capped at 7) */
  function bankFingerprint(bank) { return hash(bank.questions.map(q => q.id).sort().join('|')).slice(0, 4); }
  function encodeBank(bank) {
    const ids = bank.questions.map(q => q.id).sort();
    let any = false, s = '';
    for (const id of ids) {
      const e = entries[bank.key + '::' + id];
      let v = 0;
      if (e) { if (e[0]) { v = e[2] ? 1 : 2; any = true; } if (e[3]) { v |= 4; any = true; } v |= Math.min(7, e[0] || 0) << 3; }
      s += B64[v];
    }
    return any ? `${ids.length.toString(36)}.${bankFingerprint(bank)}.${s.replace(/A+$/, '')}` : '';
  }
  let lastCookieReport = { banks: 0, bytes: 0, truncated: [] };
  function writeCookieMirror() {
    if (!cookiesWork) return;
    const existing = readCookies();
    const groups = {};
    for (const [k, v] of Object.entries(existing)) {
      if (!k.startsWith(COOKIE_PREFIX)) continue;
      const [bh, idx] = k.slice(COOKIE_PREFIX.length).split('_');
      (groups[bh] = groups[bh] || [])[Number(idx) || 0] = v;
    }
    const payloads = []; // {bh, value, recent}
    const loadedHashes = new Set();
    for (const b of loadedBanks) {
      const bh = hash(b.key).slice(0, 6); loadedHashes.add(bh);
      const value = encodeBank(b);
      if (value) payloads.push({ bh, value, recent: bankRecency(b), title: b.metadata.title });
    }
    // Keep mirrors of banks that are not loaded right now (removed from library) untouched
    for (const [bh, parts] of Object.entries(groups)) if (!loadedHashes.has(bh)) payloads.push({ bh, value: parts.join(''), recent: 0, title: bh });
    payloads.sort((a, b) => b.recent - a.recent);
    let used = 0; const keep = new Set(), truncated = [];
    for (const p of payloads) {
      if (used + p.value.length > COOKIE_BUDGET) { truncated.push(p.title); continue; }
      used += p.value.length;
      for (let i = 0, c = 0; i < p.value.length; i += COOKIE_CHUNK, c++) {
        const name = `${COOKIE_PREFIX}${p.bh}_${c}`, val = p.value.slice(i, i + COOKIE_CHUNK);
        keep.add(name); if (existing[name] !== val) setCookie(name, val);
      }
    }
    for (const k of Object.keys(existing)) if (k.startsWith(COOKIE_PREFIX) && !keep.has(k)) delCookie(k);
    lastCookieReport = { banks: payloads.length - truncated.length, bytes: used, truncated };
  }
  function bankRecency(bank) {
    let t = 0; const pre = bank.key + '::';
    for (const [uid, e] of Object.entries(entries)) if (e[4] > t && uid.startsWith(pre)) t = e[4];
    return t;
  }
  /** If localStorage was cleared but cookies survived, rebuild entries from the cookie mirror. */
  function restoreFromCookies(bank) {
    if (!cookiesWork) return 0;
    const all = readCookies(), bh = hash(bank.key).slice(0, 6), parts = [];
    for (const [k, v] of Object.entries(all)) if (k.startsWith(`${COOKIE_PREFIX}${bh}_`)) parts[Number(k.split('_').pop())] = v;
    if (!parts.length) return 0;
    const [count, fp, chars = ''] = parts.join('').split('.');
    const ids = bank.questions.map(q => q.id).sort();
    if (parseInt(count, 36) !== ids.length || fp !== bankFingerprint(bank)) return 0;
    let restored = 0;
    ids.forEach((id, i) => {
      const v = B64.indexOf(chars[i] || 'A'); if (v <= 0) return;
      const uid = bank.key + '::' + id, attempts = v >> 3, st = v & 3, flag = (v >> 2) & 1;
      const cur = entries[uid];
      if (cur && cur[0] >= attempts && (cur[3] || !flag)) return;
      entries[uid] = [Math.max(attempts, st ? 1 : 0), st === 1 ? 1 : 0, st === 1 ? 1 : 0, flag, cur ? cur[4] : 0];
      restored++;
    });
    if (restored) touch();
    return restored;
  }
  function attachBanks(list) {
    loadedBanks = list;
    let restored = 0; for (const b of list) restored += restoreFromCookies(b);
    writeCookieMirror();
    return restored;
  }

  /* ---------------- history, session, settings ---------------- */
  function addHistory(item) { history.push(item); touch(); }
  const session = { load: () => ls.get(LS.session, null), save: s => ls.set(LS.session, s), clear: () => ls.del(LS.session) };
  const settings = {
    load() { return ls.get(LS.settings, {}) || {}; },
    save(s) { ls.set(LS.settings, s); if (cookiesWork) setCookie('sps_settings', encodeURIComponent(JSON.stringify({ theme: s.theme || '' }))); }
  };

  /* ---------------- progress file ---------------- */
  function exportProgress(bankList) {
    meta.lastBackup = Date.now(); flush();
    return {
      format: 'sat-practice-studio/progress', version: 1, exported_at: new Date().toISOString(),
      note: 'Progress backup for SAT Practice Studio. Upload it on the Progress page to restore. Question banks are not included — keep your bank files too.',
      banks: bankList.map(b => ({ key: b.key, title: b.metadata.title, questions: b.questions.length })),
      settings: settings.load(),
      entries, history
    };
  }
  function importProgress(obj, mode = 'merge') {
    if (!obj || obj.format !== 'sat-practice-studio/progress' || typeof obj.entries !== 'object') throw new Error('This is not a SAT Practice Studio progress file.');
    let changed = 0;
    if (mode === 'replace') { entries = {}; history = []; }
    for (const [uid, e] of Object.entries(obj.entries)) {
      if (!Array.isArray(e) || e.length < 5) continue;
      const cur = entries[uid];
      if (!cur || e[0] > cur[0] || (e[0] === cur[0] && e[4] > cur[4]) || (e[3] && !cur[3])) {
        entries[uid] = cur && e[0] <= cur[0] ? [cur[0], cur[1], cur[2], e[3] || cur[3], cur[4]] : e.slice(0, 5).map(Number);
        changed++;
      }
    }
    const seen = new Set(history.map(h => h.at));
    for (const h of Array.isArray(obj.history) ? obj.history : []) if (h && !seen.has(h.at)) history.push(h);
    history.sort((a, b) => a.at - b.at);
    if (obj.settings && mode === 'replace') settings.save(obj.settings);
    meta.lastBackup = Date.now(); touch(); flush();
    return changed;
  }
  function resetProgress(prefix) {
    if (prefix) { for (const k of Object.keys(entries)) if (k.startsWith(prefix + '::')) delete entries[k]; }
    else { entries = {}; history = []; }
    touch(); flush();
  }

  SPS.storage = {
    banks, cookiesWork, attachBanks, flush,
    progress: { get, record, setFlag, status, addHistory, history: () => history, entries: () => entries, meta: () => meta, exportProgress, importProgress, reset: resetProgress, cookieReport: () => lastCookieReport, COOKIE_BUDGET },
    session, settings
  };
})(window.SPS = window.SPS || {});
