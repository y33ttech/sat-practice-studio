/* Declarative visuals → SVG/HTML. Colors come from CSS classes so light/dark themes work.
   Types: table, image, coordinate_plane, geometry, bar_chart, line_chart, scatter. */
(function (SPS) {
  'use strict';
  const { esc, rich, num } = SPS.util;
  const pos = (v, f) => (num(v, f) > 0 ? num(v, f) : f);
  const arr = x => (Array.isArray(x) ? x : []);
  const r2 = x => Math.round(x * 100) / 100;

  function validImageSrc(s) {
    s = String(s || '').trim();
    return /^(https:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,|\.\.?\/|assets\/|banks\/)/i.test(s) ? s : null;
  }

  function wrap(inner, vis) {
    return `<figure class="figure-card">${inner}${vis.caption ? `<figcaption>${esc(vis.caption)}</figcaption>` : ''}</figure>`;
  }

  function render(vis) {
    if (!vis || typeof vis !== 'object' || !vis.type) return '';
    try {
      switch (String(vis.type).toLowerCase()) {
        case 'table': return table(vis);
        case 'image': { const src = validImageSrc(vis.src); return src ? wrap(`<img src="${esc(src)}" alt="${esc(vis.alt || 'Question figure')}" loading="lazy">`, vis) : ''; }
        case 'coordinate_plane': case 'graph': return wrap(plane(vis), vis);
        case 'geometry': { const g = geometry(vis); return g ? wrap(g, vis) : ''; }
        case 'bar_chart': case 'histogram': return wrap(barChart(vis), vis);
        case 'line_chart': return wrap(lineChart(vis), vis);
        case 'scatter': case 'scatterplot': return wrap(scatter(vis), vis);
        default: return `<div class="figure-card figure-missing">Unsupported figure type “${esc(vis.type)}”.</div>`;
      }
    } catch (e) {
      return `<div class="figure-card figure-missing">Figure could not be drawn: ${esc(e.message)}</div>`;
    }
  }

  function table(v) {
    const heads = arr(v.headers), rows = arr(v.rows);
    if (!rows.length) return '';
    return wrap(`<div class="table-scroll"><table class="data-table">${v.title ? `<caption>${rich(v.title)}</caption>` : ''}${heads.length ? `<thead><tr>${heads.map(h => `<th>${rich(h)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.map(r => `<tr>${arr(r).map((c, i) => i === 0 && v.row_headers ? `<th>${rich(c)}</th>` : `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`, v);
  }

  /* ---------- Cartesian helpers ---------- */
  function frame(v, W = 520, H = 340) {
    const pad = { l: 46, r: 18, t: 18, b: 40 };
    const xmin = num(v.x_min, -10), xmax = num(v.x_max, 10), ymin = num(v.y_min, -10), ymax = num(v.y_max, 10);
    if (!(xmax > xmin && ymax > ymin)) throw new Error('axis ranges are invalid');
    const sx = (W - pad.l - pad.r) / (xmax - xmin), sy = (H - pad.t - pad.b) / (ymax - ymin);
    // Equal x/y scale keeps circles round; otherwise fill the frame like SAT graphs do.
    const ratio = (sx / sy) || 1;
    const equal = v.equal_scale === true || (v.equal_scale !== false && (arr(v.circles).length > 0 || (v.type === 'coordinate_plane' && ratio > 0.6 && ratio < 1.67)));
    const s = Math.min(sx, sy);
    const kx = equal ? s : sx, ky = equal ? s : sy;
    const ox = pad.l + ((W - pad.l - pad.r) - kx * (xmax - xmin)) / 2, oy = pad.t + ((H - pad.t - pad.b) - ky * (ymax - ymin)) / 2;
    const X = x => r2(ox + (num(x) - xmin) * kx), Y = y => r2(oy + (ymax - num(y)) * ky);
    return { W, H, xmin, xmax, ymin, ymax, X, Y, kx, ky };
  }
  function niceStep(range) {
    const raw = range / 10, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
  }
  function gridAndAxes(f, v, { axesAtZero = true } = {}) {
    const out = [];
    const sx = pos(v.x_step, niceStep(f.xmax - f.xmin)), sy = pos(v.y_step, niceStep(f.ymax - f.ymin));
    const xAxisY = axesAtZero && f.ymin <= 0 && f.ymax >= 0 ? f.Y(0) : f.Y(f.ymin);
    const yAxisX = axesAtZero && f.xmin <= 0 && f.xmax >= 0 ? f.X(0) : f.X(f.xmin);
    const label = n => esc(String(r2(n)).replace('-', '−'));
    for (let k = Math.ceil(f.xmin / sx - 1e-9), c = 0; k * sx <= f.xmax + 1e-9 && c < 80; k++, c++) {
      const x = k * sx; out.push(`<line class="viz-grid" x1="${f.X(x)}" y1="${f.Y(f.ymin)}" x2="${f.X(x)}" y2="${f.Y(f.ymax)}"/>`);
      if (v.hide_labels !== true && (Math.abs(x) > 1e-9 || !axesAtZero)) out.push(`<text class="viz-tick" x="${f.X(x)}" y="${Math.min(f.H - 22, xAxisY + 15)}" text-anchor="middle">${label(x)}</text>`);
    }
    for (let k = Math.ceil(f.ymin / sy - 1e-9), c = 0; k * sy <= f.ymax + 1e-9 && c < 80; k++, c++) {
      const y = k * sy; out.push(`<line class="viz-grid" x1="${f.X(f.xmin)}" y1="${f.Y(y)}" x2="${f.X(f.xmax)}" y2="${f.Y(y)}"/>`);
      if (v.hide_labels !== true && (Math.abs(y) > 1e-9 || !axesAtZero)) out.push(`<text class="viz-tick" x="${yAxisX - 6}" y="${f.Y(y) + 4}" text-anchor="end">${label(y)}</text>`);
    }
    out.push(`<line class="viz-axis" x1="${f.X(f.xmin)}" y1="${xAxisY}" x2="${f.X(f.xmax)}" y2="${xAxisY}"/>`);
    out.push(`<line class="viz-axis" x1="${yAxisX}" y1="${f.Y(f.ymin)}" x2="${yAxisX}" y2="${f.Y(f.ymax)}"/>`);
    if (axesAtZero && f.xmin <= 0 && f.ymin <= 0 && f.xmax >= 0 && f.ymax >= 0) out.push(`<text class="viz-tick" x="${f.X(0) - 6}" y="${f.Y(0) + 15}" text-anchor="end">O</text>`);
    const xl = v.x_label ?? (axesAtZero ? 'x' : ''), yl = v.y_label ?? (axesAtZero ? 'y' : '');
    if (xl) out.push(axesAtZero ? `<text class="viz-label" x="${f.X(f.xmax) - 4}" y="${xAxisY - 7}" text-anchor="end">${esc(xl)}</text>` : `<text class="viz-label" x="${(f.X(f.xmin) + f.X(f.xmax)) / 2}" y="${f.H - 4}" text-anchor="middle">${esc(xl)}</text>`);
    if (yl) out.push(axesAtZero ? `<text class="viz-label" x="${yAxisX + 7}" y="${f.Y(f.ymax) + 12}">${esc(yl)}</text>` : `<text class="viz-label" transform="translate(12 ${(f.Y(f.ymin) + f.Y(f.ymax)) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`);
    return out.join('');
  }
  const svg = (f, body, label) => `<svg viewBox="0 0 ${f.W} ${f.H}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip${f.id}"><rect x="${f.X(f.xmin)}" y="${f.Y(f.ymax)}" width="${f.X(f.xmax) - f.X(f.xmin)}" height="${f.Y(f.ymin) - f.Y(f.ymax)}"/></clipPath></defs>${body}</svg>`;
  let clipCounter = 0;

  function pointsMarkup(f, points, cls = 'viz-s1') {
    return arr(points).map(p => {
      const x = Array.isArray(p) ? p[0] : p.x, y = Array.isArray(p) ? p[1] : p.y, lab = Array.isArray(p) ? p[2] : p.label;
      return `<circle class="viz-dot ${cls}${p.open ? ' open' : ''}" cx="${f.X(x)}" cy="${f.Y(y)}" r="4.2"/>${lab ? `<text class="viz-point-label" x="${f.X(x) + 8}" y="${f.Y(y) - 8}">${esc(lab)}</text>` : ''}`;
    }).join('');
  }

  function curvePath(f, fn, domain) {
    const [a, b] = domain || [f.xmin, f.xmax];
    const N = 360, segs = []; let cur = [];
    for (let i = 0; i <= N; i++) {
      const x = a + ((b - a) * i) / N; let y;
      try { y = fn({ x }); } catch { y = NaN; }
      if (!Number.isFinite(y) || y > f.ymax + (f.ymax - f.ymin) * 2 || y < f.ymin - (f.ymax - f.ymin) * 2) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
      cur.push(`${f.X(x)},${f.Y(y)}`);
    }
    if (cur.length > 1) segs.push(cur);
    return segs.map(s => 'M' + s.join(' L')).join(' ');
  }

  function plane(v) {
    const f = frame(v); f.id = ++clipCounter;
    const parts = [gridAndAxes(f, v)], plot = [];
    for (const p of arr(v.polygons)) {
      const pts = arr(p.points).map(q => `${f.X(q[0])},${f.Y(q[1])}`).join(' ');
      plot.push(`<polygon class="viz-shape" points="${pts}"/>`);
    }
    for (const c of arr(v.circles)) plot.push(`<ellipse class="viz-line viz-s1" fill="none" cx="${f.X(c.cx)}" cy="${f.Y(c.cy)}" rx="${Math.max(0, num(c.r) * f.kx)}" ry="${Math.max(0, num(c.r) * f.ky)}"/>`);
    for (const s of arr(v.segments)) plot.push(`<line class="viz-line viz-s3${s.dashed ? ' dashed' : ''}" x1="${f.X(s.x1)}" y1="${f.Y(s.y1)}" x2="${f.X(s.x2)}" y2="${f.Y(s.y2)}"/>`);
    arr(v.lines).forEach((l, i) => {
      let d;
      if (l.x !== undefined && l.m === undefined) d = `M${f.X(l.x)},${f.Y(f.ymin)} L${f.X(l.x)},${f.Y(f.ymax)}`;
      else { const m = num(l.m), b = num(l.b); d = `M${f.X(f.xmin)},${f.Y(m * f.xmin + b)} L${f.X(f.xmax)},${f.Y(m * f.xmax + b)}`; }
      plot.push(`<path class="viz-line viz-s${(i % 3) + 1}${l.dashed ? ' dashed' : ''}" d="${d}"/>`);
      if (l.label) plot.push(`<text class="viz-point-label" x="${f.X(f.xmax) - 6}" y="${f.Y(num(l.m) * f.xmax + num(l.b)) - 8}" text-anchor="end">${esc(l.label)}</text>`);
    });
    arr(v.curves).forEach((c, i) => {
      const expr = typeof c === 'string' ? c : c.fn || c.expression || c.y;
      if (!expr) return;
      const fn = SPS.grading.compile(String(expr).replace(/^\s*y\s*=\s*/i, ''));
      plot.push(`<path class="viz-line viz-s${((i + arr(v.lines).length) % 3) + 1}${c.dashed ? ' dashed' : ''}" d="${curvePath(f, fn, c.domain)}"/>`);
      if (c.label) {
        // Walk inward from the preferred x until the curve is comfortably inside the frame.
        const inside = y => Number.isFinite(y) && y <= f.ymax - (f.ymax - f.ymin) * 0.08 && y >= f.ymin + (f.ymax - f.ymin) * 0.05;
        const at = x => { try { return fn({ x }); } catch { return NaN; } };
        let lx = c.label_x !== undefined ? num(c.label_x) : f.xmax - (f.xmax - f.xmin) * 0.1, ly = at(lx);
        for (let k = 0; k < 200 && !inside(ly); k++) { lx -= (f.xmax - f.xmin) / 200; ly = at(lx); }
        if (inside(ly)) plot.push(`<text class="viz-point-label" x="${f.X(lx) + 8}" y="${f.Y(ly)}">${esc(c.label)}</text>`);
      }
    });
    plot.push(pointsMarkup(f, v.points));
    parts.push(`<g clip-path="url(#clip${f.id})">${plot.join('')}</g>`);
    return svg(f, parts.join(''), 'Graph in the xy-plane');
  }

  function scatter(v) {
    const pts = arr(v.points).map(p => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
    const xs = pts.map(p => num(p.x)), ys = pts.map(p => num(p.y));
    const auto = (vals, lo, hi) => { if (!vals.length) return [0, 10]; const a = Math.min(...vals), b = Math.max(...vals), m = (b - a) * 0.08 || 1; return [lo ?? Math.min(0, a - m), hi ?? b + m]; };
    const [x0, x1] = auto(xs, v.x_min, v.x_max), [y0, y1] = auto(ys, v.y_min, v.y_max);
    const f = frame({ ...v, x_min: x0, x_max: x1, y_min: y0, y_max: y1 }); f.id = ++clipCounter;
    const parts = [gridAndAxes(f, v, { axesAtZero: false })], plot = [];
    const fit = v.best_fit || v.line_of_best_fit;
    if (fit) {
      if (fit.fn || typeof fit === 'string') plot.push(`<path class="viz-line viz-s2" d="${curvePath(f, SPS.grading.compile(fit.fn || fit), null)}"/>`);
      else plot.push(`<line class="viz-line viz-s2" x1="${f.X(f.xmin)}" y1="${f.Y(num(fit.m) * f.xmin + num(fit.b))}" x2="${f.X(f.xmax)}" y2="${f.Y(num(fit.m) * f.xmax + num(fit.b))}"/>`);
    }
    plot.push(pointsMarkup(f, pts));
    parts.push(`<g clip-path="url(#clip${f.id})">${plot.join('')}</g>`);
    return svg(f, parts.join(''), v.title || 'Scatterplot');
  }

  function seriesOf(v) {
    if (Array.isArray(v.series)) return v.series.map(s => ({ name: s.name || '', values: arr(s.values).map(Number) }));
    return [{ name: v.series_name || '', values: arr(v.values).map(Number) }];
  }
  function legend(series, W) {
    if (series.length < 2) return '';
    return series.map((s, i) => `<g transform="translate(${W - 150} ${18 + i * 18})"><rect class="viz-bar viz-s${(i % 3) + 1}" width="12" height="12" rx="2"/><text class="viz-tick" x="18" y="10">${esc(s.name)}</text></g>`).join('');
  }

  function barChart(v) {
    const cats = arr(v.categories || v.labels).map(String), series = seriesOf(v);
    const max = Math.max(...series.flatMap(s => s.values).filter(Number.isFinite), 0);
    const ymax = num(v.y_max, max * 1.1 || 10), ymin = num(v.y_min, 0);
    const W = 520, H = 340, pad = { l: 50, r: 16, t: 16, b: v.x_label ? 56 : 40 };
    const Y = y => r2(pad.t + (ymax - y) * (H - pad.t - pad.b) / (ymax - ymin));
    const bandW = (W - pad.l - pad.r) / Math.max(1, cats.length), gap = v.type === 'histogram' ? 0 : bandW * 0.22, bw = (bandW - gap) / series.length;
    const ints = series.every(s => s.values.every(x => !Number.isFinite(x) || Number.isInteger(x)));
    const step = pos(v.y_step, ints ? Math.max(1, niceStep(ymax - ymin)) : niceStep(ymax - ymin)), out = [];
    for (let y = Math.ceil(ymin / step) * step, c = 0; y <= ymax + 1e-9 && c < 60; y += step, c++) {
      out.push(`<line class="viz-grid" x1="${pad.l}" y1="${Y(y)}" x2="${W - pad.r}" y2="${Y(y)}"/><text class="viz-tick" x="${pad.l - 6}" y="${Y(y) + 4}" text-anchor="end">${esc(r2(y))}</text>`);
    }
    cats.forEach((c, i) => {
      series.forEach((s, k) => {
        const val = s.values[i]; if (!Number.isFinite(val)) return;
        const x = pad.l + i * bandW + gap / 2 + k * bw;
        out.push(`<rect class="viz-bar viz-s${(k % 3) + 1}" x="${r2(x)}" y="${Y(Math.max(val, ymin))}" width="${r2(bw)}" height="${r2(Math.abs(Y(ymin) - Y(Math.max(val, ymin))))}"/>`);
        if (v.show_values) out.push(`<text class="viz-tick" x="${r2(x + bw / 2)}" y="${Y(val) - 5}" text-anchor="middle">${esc(val)}</text>`);
      });
      out.push(`<text class="viz-tick" x="${r2(pad.l + i * bandW + bandW / 2)}" y="${H - pad.b + 16}" text-anchor="middle">${esc(c)}</text>`);
    });
    out.push(`<line class="viz-axis" x1="${pad.l}" y1="${Y(ymin)}" x2="${W - pad.r}" y2="${Y(ymin)}"/><line class="viz-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${Y(ymin)}"/>`);
    if (v.x_label) out.push(`<text class="viz-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(v.x_label)}</text>`);
    if (v.y_label) out.push(`<text class="viz-label" transform="translate(13 ${(pad.t + Y(ymin)) / 2}) rotate(-90)" text-anchor="middle">${esc(v.y_label)}</text>`);
    out.push(legend(series, W));
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.title || 'Bar chart')}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
  }

  function lineChart(v) {
    const cats = arr(v.categories || v.labels || v.x_values).map(String), series = seriesOf(v);
    const vals = series.flatMap(s => s.values).filter(Number.isFinite);
    const ymax = num(v.y_max, (Math.max(...vals, 0) * 1.1) || 10), ymin = num(v.y_min, Math.min(0, ...vals));
    const W = 520, H = 340, pad = { l: 50, r: 16, t: 16, b: v.x_label ? 56 : 40 };
    const Y = y => r2(pad.t + (ymax - y) * (H - pad.t - pad.b) / (ymax - ymin));
    const X = i => r2(pad.l + 14 + i * (W - pad.l - pad.r - 28) / Math.max(1, cats.length - 1));
    const step = pos(v.y_step, niceStep(ymax - ymin)), out = [];
    for (let y = Math.ceil(ymin / step) * step, c = 0; y <= ymax + 1e-9 && c < 60; y += step, c++) out.push(`<line class="viz-grid" x1="${pad.l}" y1="${Y(y)}" x2="${W - pad.r}" y2="${Y(y)}"/><text class="viz-tick" x="${pad.l - 6}" y="${Y(y) + 4}" text-anchor="end">${esc(r2(y))}</text>`);
    cats.forEach((c, i) => out.push(`<text class="viz-tick" x="${X(i)}" y="${H - pad.b + 16}" text-anchor="middle">${esc(c)}</text>`));
    series.forEach((s, k) => {
      const pts = s.values.map((val, i) => Number.isFinite(val) ? `${X(i)},${Y(val)}` : null).filter(Boolean);
      out.push(`<polyline class="viz-line viz-s${(k % 3) + 1}" fill="none" points="${pts.join(' ')}"/>`);
      s.values.forEach((val, i) => { if (Number.isFinite(val)) out.push(`<circle class="viz-dot viz-s${(k % 3) + 1}" cx="${X(i)}" cy="${Y(val)}" r="3.6"/>`); });
    });
    out.push(`<line class="viz-axis" x1="${pad.l}" y1="${Y(ymin)}" x2="${W - pad.r}" y2="${Y(ymin)}"/><line class="viz-axis" x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${Y(ymin)}"/>`);
    if (v.x_label) out.push(`<text class="viz-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(v.x_label)}</text>`);
    if (v.y_label) out.push(`<text class="viz-label" transform="translate(13 ${(pad.t + Y(ymin)) / 2}) rotate(-90)" text-anchor="middle">${esc(v.y_label)}</text>`);
    out.push(legend(series, W));
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.title || 'Line graph')}" xmlns="http://www.w3.org/2000/svg">${out.join('')}</svg>`;
  }

  /* ---------- Schematic geometry ---------- */
  function geometry(v) {
    const name = String(v.shape || '').toLowerCase(), L = v.labels || {};
    const t = (text, x, y, anchor = 'middle') => text ? `<text class="viz-label geo" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>` : '';
    let p = '';
    if (['cube', 'open_cube', 'prism', 'rectangular_prism', 'box'].includes(name)) {
      const top = name === 'open_cube' ? '<polyline class="geo-edge" fill="none" points="150,114 216,65 350,65 284,114"/>' : '<polygon class="geo-face light" points="150,114 284,114 350,65 216,65"/>';
      p = `${top}<polygon class="geo-face" points="150,114 284,114 284,250 150,250"/><polygon class="geo-face dark" points="284,114 350,65 350,201 284,250"/>`;
      if (name === 'open_cube') p += '<polygon class="geo-hole" points="158,110 278,110 336,70 222,70"/>';
      p += t(L.edge || L.length || L.base, 217, 276) + t(L.height, 362, 165, 'start') + t(L.width || L.depth, 326, 100, 'start');
    } else if (name === 'cylinder') {
      p = `<path class="geo-face" d="M170 92 L170 222 A90 32 0 0 0 350 222 L350 92"/><ellipse class="geo-face light" cx="260" cy="92" rx="90" ry="32"/><path class="geo-edge dashed" fill="none" d="M170 222 A90 32 0 0 1 350 222"/><line class="geo-mark" x1="260" y1="92" x2="350" y2="92"/><circle class="geo-dot" cx="260" cy="92" r="3"/>`;
      p += t(L.radius || L.diameter, 305, 82) + t(L.height, 362, 162, 'start');
    } else if (name === 'cone') {
      p = `<path class="geo-face" d="M170 222 L260 60 L350 222 A90 30 0 0 1 170 222"/><path class="geo-edge dashed" fill="none" d="M170 222 A90 30 0 0 1 350 222"/><line class="geo-mark dashed" x1="260" y1="60" x2="260" y2="222"/><line class="geo-mark" x1="260" y1="222" x2="350" y2="222"/>`;
      p += t(L.radius, 305, 244) + t(L.height, 268, 150, 'start') + t(L.slant, 318, 132, 'start');
    } else if (name === 'pyramid') {
      p = `<polygon class="geo-face dark" points="160,230 300,230 260,62"/><polygon class="geo-face" points="300,230 360,190 260,62"/><path class="geo-edge dashed" fill="none" d="M160 230 L220 190 L360 190 M220 190 L260 62"/>`;
      p += t(L.base || L.edge, 230, 254) + t(L.height, 280, 150, 'start');
    } else if (name === 'sphere' || name === 'hemisphere') {
      p = name === 'sphere' ? `<circle class="geo-face light" cx="260" cy="153" r="95"/><ellipse class="geo-edge dashed" fill="none" cx="260" cy="153" rx="95" ry="28"/>` : `<path class="geo-face light" d="M165 170 A95 95 0 0 1 355 170 Z"/><ellipse class="geo-face" cx="260" cy="170" rx="95" ry="26"/>`;
      const cy = name === 'sphere' ? 153 : 170;
      p += `<line class="geo-mark" x1="260" y1="${cy}" x2="355" y2="${cy}"/><circle class="geo-dot" cx="260" cy="${cy}" r="3.5"/>` + t(L.radius || L.diameter, 307, cy - 9);
    } else if (name === 'rectangle' || name === 'square') {
      const w = name === 'square' ? 170 : 250, h = name === 'square' ? 170 : 140;
      p = `<rect class="geo-face light" x="${260 - w / 2}" y="${150 - h / 2}" width="${w}" height="${h}"/>` + t(L.edge || L.width || L.side || L.length, 260, 150 + h / 2 + 24) + t(L.height || (name === 'square' ? '' : L.width2), 260 + w / 2 + 10, 155, 'start');
      if (L.diagonal) p += `<line class="geo-mark dashed" x1="${260 - w / 2}" y1="${150 + h / 2}" x2="${260 + w / 2}" y2="${150 - h / 2}"/>` + t(L.diagonal, 262, 142);
    } else if (name === 'circle') {
      p = `<circle class="geo-face light" cx="260" cy="150" r="105"/><circle class="geo-dot" cx="260" cy="150" r="3.5"/>`;
      if (L.diameter && !L.radius) p += `<line class="geo-mark" x1="155" y1="150" x2="365" y2="150"/>` + t(L.diameter, 260, 140);
      else p += `<line class="geo-mark" x1="260" y1="150" x2="365" y2="150"/>` + t(L.radius, 312, 140);
      if (L.center) p += t(L.center, 252, 168, 'end');
      if (L.angle) p += `<line class="geo-mark" x1="260" y1="150" x2="${260 + 105 * Math.cos(-1)}" y2="${150 + 105 * Math.sin(-1)}"/>` + t(L.angle, 290, 132, 'start');
    } else if (name === 'triangle' || name === 'right_triangle') {
      if (name === 'right_triangle') {
        p = `<polygon class="geo-face light" points="150,240 380,240 150,70"/><path class="geo-edge" fill="none" d="M150 224 h16 v16"/>`;
        p += t(L.base || L.leg2 || L.adjacent, 265, 264) + t(L.height || L.leg1 || L.opposite, 140, 158, 'end') + t(L.hypotenuse, 275, 145, 'start');
        p += t(L.A, 140, 64, 'end') + t(L.B, 140, 256, 'end') + t(L.C, 392, 256, 'start') + t(L.angle, 340, 230, 'end');
      } else {
        p = `<polygon class="geo-face light" points="140,240 380,240 285,70"/><line class="geo-mark dashed" x1="285" y1="70" x2="285" y2="240"/><path class="geo-mark" fill="none" d="M285 226 h14 v14"/>`;
        p += t(L.base, 260, 264) + t(L.height, 293, 160, 'start') + t(L.side1 || L.left, 196, 148, 'end') + t(L.side2 || L.right, 344, 148, 'start');
        p += t(L.A, 130, 256, 'end') + t(L.B, 392, 256, 'start') + t(L.C, 285, 60);
      }
    } else if (name === 'trapezoid') {
      p = `<polygon class="geo-face light" points="130,235 390,235 320,90 200,90"/><line class="geo-mark dashed" x1="200" y1="90" x2="200" y2="235"/>` + t(L.base1 || L.bottom, 260, 259) + t(L.base2 || L.top, 260, 80) + t(L.height, 208, 168, 'start');
    } else if (name === 'parallel_lines' || name === 'angles') {
      p = `<line class="geo-edge" x1="90" y1="110" x2="430" y2="110"/><line class="geo-edge" x1="90" y1="210" x2="430" y2="210"/><line class="geo-mark" x1="170" y1="270" x2="350" y2="50"/>`;
      p += t(L.line1 || 'ℓ', 440, 114, 'start') + t(L.line2 || 'm', 440, 214, 'start') + t(L.angle1, 302, 100, 'start') + t(L.angle2, 236, 230, 'end') + t(L.angle3, 280, 128, 'start') + t(L.angle4, 216, 200, 'end');
    } else return '';
    return `<svg viewBox="0 0 520 290" class="geo" role="img" aria-label="${esc(name.replace(/_/g, ' '))} (not drawn to scale)" xmlns="http://www.w3.org/2000/svg">${p}<text class="viz-tick" x="510" y="284" text-anchor="end">Figure not drawn to scale</text></svg>`;
  }

  SPS.visuals = { render, validImageSrc, SHAPES: ['cube', 'open_cube', 'prism', 'cylinder', 'cone', 'pyramid', 'sphere', 'hemisphere', 'square', 'rectangle', 'circle', 'triangle', 'right_triangle', 'trapezoid', 'parallel_lines'] };
})(window.SPS = window.SPS || {});
