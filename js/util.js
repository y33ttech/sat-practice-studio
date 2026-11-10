/* Shared helpers. Everything runs in the browser; nothing is sent to a server. */
(function (SPS) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Escaped text with line breaks. Optional light markup for prose (R&W):
      **bold**, *italic*, __underline__, and "- " bullet lines. */
  function rich(text, prose = false) {
    let s = esc(String(text ?? ''));
    if (prose) {
      s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_\n]+?)__/g, '<u>$1</u>')
        .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>');
      const lines = s.split(/\r?\n/);
      if (lines.some(l => /^\s*[-•]\s+/.test(l))) {
        let out = '', inList = false;
        for (const l of lines) {
          const m = l.match(/^\s*[-•]\s+(.*)$/);
          if (m) { if (!inList) { out += '<ul>'; inList = true; } out += `<li>${m[1]}</li>`; }
          else { if (inList) { out += '</ul>'; inList = false; } out += l ? l + '<br>' : '<br>'; }
        }
        if (inList) out += '</ul>';
        return out.replace(/(<br>)+$/, '');
      }
    }
    return s.replace(/\r?\n/g, '<br>');
  }

  const num = (v, f = 0) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : f);
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmt = new Intl.NumberFormat('en-US');
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  /** FNV-1a 32-bit → 6 base36 chars. Used for compact progress keys. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36).padStart(7, '0').slice(-7);
  }

  let toastTimer;
  function toast(msg, kind = '') {
    const el = $('toast'); if (!el) return;
    el.textContent = msg; el.className = 'toast show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  let mathQueue = Promise.resolve();
  function typeset(scope) {
    if (!window.MathJax || !window.MathJax.typesetPromise) return;
    const nodes = scope ? [scope] : undefined;
    mathQueue = mathQueue.catch(() => { }).then(() => window.MathJax.typesetPromise(nodes).catch(() => { }));
  }

  function download(filename, body, mime = 'application/json') {
    const blob = new Blob([body], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { }
      ta.remove(); return ok;
    }
  }

  function shuffle(items) {
    const r = [...items];
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  const today = () => new Date().toISOString().slice(0, 10);

  SPS.util = { $, esc, rich, num, clone, fmt, pct, hash, toast, typeset, download, copyText, shuffle, timeAgo, today };
})(window.SPS = window.SPS || {});
