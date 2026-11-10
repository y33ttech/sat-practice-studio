/* SAT Practice Studio — application shell: router, library, session builder, player,
   results, generation pipeline, and progress pages. Unofficial; not affiliated with College Board. */
(function (SPS) {
  'use strict';
  const { $, esc, rich, fmt, pct, toast, typeset, download, copyText, shuffle, timeAgo, today, clone } = SPS.util;
  const { parser, grading, visuals, taxonomy, storage } = SPS;
  const P = storage.progress;

  const state = {
    banks: [], qIndex: new Map(), pIndex: new Map(), tree: null,
    selected: new Set(), expanded: new Set(['s:math', 's:rw']),
    filters: { sat: new Set(['easy', 'medium', 'hard']), sub: new Set(['easy', 'medium', 'hard']), status: 'all', type: new Set(['mcq', 'spr']) },
    search: '', session: null, tick: null, showTimer: true, reviewFilter: 'all',
    validator: { files: [], bank: null }, examples: null
  };

  /* =========================================================
     Library index
     ========================================================= */
  function rebuildIndex() {
    state.qIndex.clear(); state.pIndex.clear();
    for (const bank of state.banks) {
      for (const p of bank.patterns) state.pIndex.set(p.uid, { pattern: p, bank, questions: [] });
      for (const q of bank.questions) {
        const entry = state.pIndex.get(bank.key + '::' + q.pattern_id);
        state.qIndex.set(q.uid, { q, bank, pattern: entry.pattern });
        entry.questions.push(q);
      }
    }
    for (const e of state.pIndex.values()) e.questions.sort((a, b) => (a.number_in_pattern ?? 1e9) - (b.number_in_pattern ?? 1e9));
    for (const uid of [...state.selected]) if (!state.pIndex.has(uid)) state.selected.delete(uid);
    state.tree = buildTree();
    storage.attachBanks(state.banks);
  }

  function buildTree() {
    const order = new Map();
    taxonomy.sections.forEach((s, i) => { order.set('s:' + s.id, i); s.domains.forEach((d, j) => { order.set(`d:${s.id}/${d.id}`, j); d.skills.forEach((k, m) => order.set(`k:${s.id}/${d.id}/${taxonomy.slug(k)}`, m)); }); });
    const root = new Map();
    for (const { pattern: p } of state.pIndex.values()) {
      const sKey = 's:' + p.sectionId, dKey = `d:${p.sectionId}/${p.domainId}`, kKey = `k:${p.sectionId}/${p.domainId}/${p.skillId}`;
      if (!root.has(sKey)) root.set(sKey, { key: sKey, name: p.sectionName, kids: new Map() });
      const s = root.get(sKey);
      if (!s.kids.has(dKey)) s.kids.set(dKey, { key: dKey, name: p.domainName, kids: new Map() });
      const d = s.kids.get(dKey);
      if (!d.kids.has(kKey)) d.kids.set(kKey, { key: kKey, name: p.skillName, patterns: [] });
      d.kids.get(kKey).patterns.push(p.uid);
    }
    const sortBy = arr => arr.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || a.name.localeCompare(b.name));
    const sections = sortBy([...root.values()]).map(s => ({
      ...s, kids: sortBy([...s.kids.values()]).map(d => ({ ...d, kids: sortBy([...d.kids.values()]) }))
    }));
    for (const s of sections) for (const d of s.kids) for (const k of d.kids) {
      k.patterns.sort((a, b) => {
        const pa = state.pIndex.get(a), pb = state.pIndex.get(b);
        return pa.bank.metadata.title.localeCompare(pb.bank.metadata.title) || String(pa.pattern.id).localeCompare(String(pb.pattern.id), undefined, { numeric: true });
      });
    }
    return sections;
  }
  const nodePatterns = node => node.patterns || node.kids.flatMap(nodePatterns);

  function statsFor(patternUids) {
    let total = 0, correct = 0, missed = 0, flagged = 0;
    for (const uid of patternUids) {
      const e = state.pIndex.get(uid); if (!e) continue;
      for (const q of e.questions) {
        total++;
        const st = P.status(q.uid);
        if (st === 'correct') correct++; else if (st === 'missed') missed++;
        if (P.get(q.uid)?.flagged) flagged++;
      }
    }
    return { total, correct, missed, seen: correct + missed, flagged };
  }
  const bar = s => `<span class="mbar" title="${s.correct} correct · ${s.missed} missed · ${s.total - s.seen} new"><i class="ok" style="width:${(100 * s.correct / (s.total || 1)).toFixed(1)}%"></i><i class="bad" style="width:${(100 * s.missed / (s.total || 1)).toFixed(1)}%"></i></span>`;

  /* =========================================================
     Library view
     ========================================================= */
  function renderLibrary() {
    const has = state.banks.length > 0;
    $('library-empty').hidden = has; $('library-main').hidden = !has;
    renderResumeBanner();
    if (!has) { renderExamples($('examples-empty')); return; }
    const qs = state.qIndex.size, ps = state.pIndex.size;
    const skills = state.tree.reduce((n, s) => n + s.kids.reduce((m, d) => m + d.kids.length, 0), 0);
    $('library-summary').textContent = `${fmt.format(qs)} questions · ${ps} patterns · ${skills} skill${skills === 1 ? '' : 's'} · ${state.banks.length} bank${state.banks.length === 1 ? '' : 's'}`;
    renderTree(); renderBuilder();
  }

  function renderResumeBanner() {
    const s = state.session;
    $('resume-banner').innerHTML = s && !s.finished ? `<div class="banner"><span>You have an unfinished session · question ${s.index + 1} of ${s.qids.length}</span><span class="row gap-s"><button class="btn ghost small" data-action="discard-session">Discard</button><button class="btn primary small" data-action="resume-session">Resume →</button></span></div>` : '';
  }

  function checkState(uids) {
    let n = 0; for (const u of uids) if (state.selected.has(u)) n++;
    return n === 0 ? 'none' : n === uids.length ? 'all' : 'some';
  }
  function matchesSearch(text) { return !state.search || text.toLowerCase().includes(state.search); }

  function renderTree() {
    const out = [];
    const q = state.search;
    for (const s of state.tree) {
      const sp = nodePatterns(s); const sOpen = state.expanded.has(s.key) || !!q;
      const inner = [];
      for (const d of s.kids) {
        const dOpen = state.expanded.has(d.key) || !!q; const dInner = [];
        for (const k of d.kids) {
          const kOpen = state.expanded.has(k.key) || !!q;
          const banksInSkill = new Set(k.patterns.map(u => state.pIndex.get(u).bank.key));
          const levelsOf = e => parser.LEVELS.filter(l => e.questions.some(q => q.satLevel === l));
          const pats = k.patterns.filter(u => { const e = state.pIndex.get(u); return matchesSearch(`${k.name} ${d.name} ${e.pattern.name} ${e.pattern.id} ${e.bank.metadata.title} ${levelsOf(e).join(' ')}`); });
          if (!pats.length) continue;
          const pRows = kOpen ? pats.map(u => {
            const e = state.pIndex.get(u), st = statsFor([u]);
            const tags = levelsOf(e).map(l => `<span class="lvl lvl-${l}" title="SAT ${parser.LEVEL_NAMES[l]} level${e.bank.metadata.sat_difficulty_assumed ? ' (assumed — set it in Manage banks)' : ''}">${parser.LEVEL_NAMES[l][0]}${e.bank.metadata.sat_difficulty_assumed ? '?' : ''}</span>`).join('');
            return `<div class="tnode leaf" role="treeitem"><label class="tlabel"><input type="checkbox" data-sel="${esc(u)}" ${state.selected.has(u) ? 'checked' : ''}><span class="pid">${esc(e.pattern.id)}</span>${tags}<span class="tname">${esc(e.pattern.name)}${banksInSkill.size > 1 ? `<small class="muted"> · ${esc(e.bank.metadata.title)}</small>` : ''}</span></label><span class="tcount">${st.seen}/${st.total}</span>${bar(st)}<button class="link-btn tiny" data-info="${esc(u)}" title="Pattern details" aria-label="Pattern details">ⓘ</button></div>`;
          }).join('') : '';
          dInner.push(treeNode(k, pats, kOpen, 'skill', pRows));
        }
        if (dInner.length) inner.push(treeNode(d, nodePatterns(d), dOpen, 'domain', dInner.join('')));
      }
      if (inner.length) out.push(treeNode(s, sp, sOpen, 'section', inner.join('')));
    }
    $('tree').innerHTML = out.join('') || '<p class="muted pad">No skills or patterns match your search.</p>';
    $('tree').querySelectorAll('input[data-state="some"]').forEach(i => { i.indeterminate = true; });
  }
  function treeNode(node, uids, open, level, inner) {
    const st = statsFor(uids), cs = checkState(uids);
    return `<div class="tnode ${level}" role="treeitem" aria-expanded="${open}">
      <div class="trow"><button class="twist ${open ? 'open' : ''}" data-toggle="${esc(node.key)}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(node.name)}">▸</button>
      <label class="tlabel"><input type="checkbox" data-group="${esc(node.key)}" data-state="${cs}" ${cs === 'all' ? 'checked' : ''}><span class="tname">${esc(node.name)}</span></label>
      <span class="tcount">${st.seen}/${st.total}</span>${bar(st)}</div>
      ${open ? `<div class="tkids" role="group">${inner}</div>` : ''}</div>`;
  }
  function findNode(key) {
    for (const s of state.tree) { if (s.key === key) return s; for (const d of s.kids) { if (d.key === key) return d; for (const k of d.kids) if (k.key === key) return k; } }
    return null;
  }

  function candidateQuestions() {
    const f = state.filters, out = [];
    for (const uid of state.selected) {
      const e = state.pIndex.get(uid); if (!e) continue;
      for (const q of e.questions) {
        if (!f.sat.has(q.satLevel) || !f.sub.has(q.subLevel) || !f.type.has(q.type)) continue;
        const pr = P.get(q.uid);
        if (f.status === 'unseen' && pr && pr.attempts) continue;
        if (f.status === 'missed' && P.status(q.uid) !== 'missed') continue;
        if (f.status === 'flagged' && !(pr && pr.flagged)) continue;
        out.push(q);
      }
    }
    return out;
  }

  function renderBuilder() {
    const sel = [...state.selected];
    const qs = candidateQuestions(), n = Number($('opt-count').value) || qs.length;
    const count = Math.min(n, qs.length);
    $('builder-count').textContent = fmt.format(count);
    $('start-btn').disabled = !count;
    const skills = new Set(sel.map(u => state.pIndex.get(u)?.pattern.skillName).filter(Boolean));
    $('builder-scope').textContent = sel.length ? `${sel.length} pattern${sel.length === 1 ? '' : 's'} in ${skills.size} skill${skills.size === 1 ? '' : 's'}${skills.size <= 2 ? ': ' + [...skills].join(', ') : ''}` : 'Select skills or patterns on the left.';
    const anySpr = sel.some(u => state.pIndex.get(u)?.questions.some(q => q.type === 'spr'));
    $('type-field').hidden = !anySpr;
    for (const seg of document.querySelectorAll('#builder .seg')) {
      const k = seg.dataset.filter;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', k === 'status' ? state.filters.status === b.dataset.v : state.filters[k].has(b.dataset.v)));
    }
  }

  function showPatternInfo(uid) {
    const e = state.pIndex.get(uid); if (!e) return;
    const p = e.pattern, st = statsFor([uid]);
    const rows = [['Recognize it', p.recognition], ['Formula', p.formula], ['What to do', p.skill_description || (taxonomy.locate({ skill: p.skill }).custom ? p.skill : '')], ['Fastest method', p.fastest_method], ['Desmos', p.desmos_guidance], ['Common mistakes', Array.isArray(p.common_mistakes) ? p.common_mistakes.join(' · ') : p.common_mistakes], ['Source', p.source_ref]].filter(r => r[1]);
    const byLevel = parser.LEVELS.map(L => { const qs = e.questions.filter(q => q.satLevel === L); return qs.length ? `<b>${parser.LEVEL_NAMES[L]}</b> level: ${parser.LEVELS.map(l => `${l} ${qs.filter(q => q.subLevel === l).length}`).join(', ')}` : ''; }).filter(Boolean).join('<br>');
    openModal(`${p.id} · ${p.name}`, `<p class="muted small">${esc(p.sectionName)} › ${esc(p.domainName)} › ${esc(p.skillName)} — ${esc(e.bank.metadata.title)}</p>
      <dl class="deflist">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${rich(v)}</dd>`).join('')}</dl>
      <p class="small"><b>${st.total}</b> questions.<br>${byLevel}<br> Seen ${st.seen}, correct ${st.correct}, missed ${st.missed}, flagged ${st.flagged}.</p>`,
      [{ label: 'Practise this pattern', cls: 'primary', onClick: () => { state.selected = new Set([uid]); closeModal(); renderLibrary(); startSession(); } }]);
    if (p.sectionId !== 'rw') typeset($('modal-body'));
  }

  /* ---------- Banks: import / manage ---------- */
  async function readFiles(fileList) {
    const files = [];
    for (const f of fileList) {
      if (f.size > 40 * 1024 * 1024) { toast(`${f.name} is larger than 40 MB — split it into smaller banks.`, 'error'); continue; }
      files.push({ name: f.name, text: await f.text() });
    }
    return files;
  }
  async function importBankFiles(fileList) {
    const files = await readFiles(fileList);
    let added = 0;
    for (const f of files) {
      try {
        const bank = parser.importFiles([f]);
        if (await addBank(bank, f.name)) added++;
      } catch (e) { reportImportError(f.name, e); }
    }
    if (added) { rebuildIndex(); autoSelect(); route(); toast(`Added ${added} bank${added === 1 ? '' : 's'} to your library.`); }
  }
  function reportImportError(name, e) {
    openModal('Could not import ' + name, `<p>${esc(e.message)}</p><p class="small muted">Tip: if the file came straight from an LLM in several parts, use <a href="#/generate" data-close>Generate → Validate &amp; merge</a>, which also builds a repair prompt you can paste back into the LLM.</p>`);
  }
  async function addBank(bank, filename) {
    const existing = state.banks.find(b => b.key === bank.key);
    if (existing) {
      const choice = await ask(`“${bank.metadata.title}” is already in your library`, `<p>The library already has a bank with id <code>${esc(bank.key)}</code> (${existing.questions.length} questions). The new file has ${bank.questions.length} questions.</p><p class="small muted">Replacing keeps your progress for questions whose ids stay the same.</p>`, [{ label: 'Keep both', value: 'both' }, { label: 'Replace', value: 'replace', cls: 'primary' }]);
      if (!choice) return false;
      if (choice === 'replace') state.banks = state.banks.filter(b => b !== existing);
      else {
        let i = 2; while (state.banks.some(b => b.key === `${bank.key}-${i}`)) i++;
        bank = parser.normalize(parser.toCanonical(bank), { key: `${bank.key}-${i}` });
      }
    }
    if (bank.report.errors.length || bank.report.warnings.length) {
      toast(`${bank.metadata.title}: ${bank.report.valid}/${bank.report.total} questions loaded${bank.report.errors.length ? `, ${bank.report.errors.length} skipped` : ''}.`, bank.report.errors.length ? 'warn' : '');
    }
    state.banks.push(bank);
    await storage.banks.put({ key: bank.key, filename, importedAt: Date.now(), raw: parser.toCanonical(bank) });
    lastAdded = bank;
    return true;
  }
  let lastAdded = null;
  function autoSelect() {
    if (!lastAdded) return;
    const skillKeys = new Set(lastAdded.patterns.map(p => [`s:${p.sectionId}`, `d:${p.sectionId}/${p.domainId}`, `k:${p.sectionId}/${p.domainId}/${p.skillId}`]).flat());
    skillKeys.forEach(k => state.expanded.add(k));
    if (!state.selected.size) lastAdded.patterns.forEach(p => state.selected.add(p.uid));
    lastAdded = null;
  }

  function manageBanks() {
    const body = state.banks.map(b => {
      const st = statsFor(b.patterns.map(p => p.uid));
      const issues = b.report.errors.length + b.report.warnings.length;
      const lv = b.metadata.sat_levels || [];
      const mixed = lv.length > 1 && !b.metadata.sat_difficulty_assumed;
      const cur = b.metadata.sat_difficulty_assumed ? '' : mixed ? 'mixed' : lv[0];
      const levelSel = `<label class="small lvl-pick">SAT level <select data-bank-level="${esc(b.key)}">${b.metadata.sat_difficulty_assumed ? '<option value="" selected>Not set (assumed Medium)</option>' : ''}${mixed ? '<option value="mixed" selected>Mixed (from file)</option>' : ''}${parser.LEVELS.map(l => `<option value="${l}" ${cur === l ? 'selected' : ''}>${parser.LEVEL_NAMES[l]}</option>`).join('')}</select></label>`;
      return `<div class="bank-row"><div><strong>${esc(b.metadata.title)}</strong> ${levelSel}<div class="small muted">${fmt.format(b.questions.length)} questions · ${b.patterns.length} patterns · id <code>${esc(b.key)}</code> · ${st.seen} answered${issues ? ` · <button class="link-btn" data-bank-report="${esc(b.key)}">${issues} note${issues === 1 ? '' : 's'}</button>` : ''}</div></div>
        <div class="row gap-s"><button class="btn ghost small" data-bank-export="${esc(b.key)}">↓ JSON</button><button class="btn danger-ghost small" data-bank-remove="${esc(b.key)}">Remove</button></div></div>`;
    }).join('');
    openModal('Question banks', `<p class="small muted">Banks are stored in this browser (IndexedDB). Removing a bank keeps its progress, so re-adding the same file restores it.</p>${body}<div id="examples-modal" class="examples"></div>`,
      [{ label: '+ Add banks', cls: 'primary', onClick: () => $('file-input').click() }]);
    renderExamples($('examples-modal'));
  }
  async function setBankLevel(key, level) {
    const i = state.banks.findIndex(x => x.key === key); if (i < 0 || !parser.LEVELS.includes(level)) return;
    const updated = parser.withSatLevel(state.banks[i], level);
    state.banks[i] = updated;
    await storage.banks.put({ key, filename: key + '.json', importedAt: Date.now(), raw: parser.toCanonical(updated) });
    rebuildIndex(); renderLibrary(); manageBanks();
    toast(`“${updated.metadata.title}” is now SAT ${parser.LEVEL_NAMES[level]} level. Progress is unchanged.`);
  }
  function showBankReport(key) {
    const b = state.banks.find(x => x.key === key); if (!b) return;
    openModal('Import notes · ' + b.metadata.title, reportHtml(b.report));
  }
  async function removeBank(key) {
    const b = state.banks.find(x => x.key === key); if (!b) return;
    const ok = await ask('Remove this bank?', `<p>Remove “${esc(b.metadata.title)}” from your library? Your progress for it is kept.</p>`, [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, cls: 'danger' }]);
    if (!ok) return manageBanks();
    state.banks = state.banks.filter(x => x !== b);
    await storage.banks.remove(key);
    rebuildIndex(); route(); manageBanks();
  }

  async function loadExampleIndex() {
    if (state.examples) return state.examples;
    try { const r = await fetch('banks/index.json', { cache: 'no-cache' }); state.examples = r.ok ? (await r.json()).banks || [] : []; }
    catch { state.examples = []; }
    return state.examples;
  }
  async function renderExamples(el) {
    if (!el) return;
    const list = await loadExampleIndex();
    if (!list.length) { el.innerHTML = location.protocol === 'file:' ? '<p class="small muted">Example banks load when the site is served over http(s) (e.g. GitHub Pages).</p>' : ''; return; }
    const loaded = new Set(state.banks.map(b => b.key));
    el.innerHTML = `<h4>Example banks</h4>${list.map(x => `<div class="example"><div><strong>${esc(x.title)}</strong><div class="small muted">${esc(x.description || '')}</div></div><button class="btn ghost small" data-example="${esc(x.file)}" ${loaded.has(x.id) ? 'disabled' : ''}>${loaded.has(x.id) ? 'Added' : 'Add'}</button></div>`).join('')}`;
  }
  async function addExample(file) {
    try {
      const r = await fetch(`banks/${file}?v=${(window.SPS_VERSION || {}).commit || 'dev'}`); if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const bank = parser.importFiles([{ name: file, text }]);
      if (await addBank(bank, file)) { rebuildIndex(); autoSelect(); closeModal(); route(); toast(`Added “${bank.metadata.title}”.`); }
    } catch (e) { toast('Could not load example: ' + e.message, 'error'); }
  }

  /* =========================================================
     Sessions
     ========================================================= */
  function startSession(questions) {
    let qs = questions || candidateQuestions();
    if (!qs.length) return toast('No questions match these filters.');
    const order = $('opt-order').value;
    if (!questions) {
      if (order === 'shuffle') qs = shuffle(qs);
      else if (order === 'weak') {
        const rank = q => { const st = P.status(q.uid); return st === 'missed' ? 0 : st === 'unseen' ? 1 : 2; };
        qs = shuffle(qs).sort((a, b) => rank(a) - rank(b));
      }
      const n = Number($('opt-count').value);
      if (order === 'progressive' && n && n < qs.length) qs = shuffle(qs); // sample across all levels, then order
      if (n) qs = qs.slice(0, n);
      if (order === 'progressive') {
        qs = [...qs].sort((a, b) => a.rank - b.rank || (a.number_in_pattern ?? 0) - (b.number_in_pattern ?? 0));
      }
    }
    const timer = $('opt-timer').value;
    let seconds = 0;
    if (timer === 'auto') seconds = Math.round(qs.reduce((s, q) => s + (state.qIndex.get(q.uid).pattern.sectionId === 'rw' ? 71 : 95), 0));
    else seconds = (Number(timer) || 0) * 60;
    state.session = {
      id: Date.now(), qids: qs.map(q => q.uid), mode: $('opt-mode').value, showPattern: $('opt-show-pattern').checked,
      duration: seconds, deadline: seconds ? Date.now() + seconds * 1000 : 0, started: Date.now(),
      index: 0, answers: {}, checked: {}, flags: {}, crossed: {}, crossMode: false, finished: false
    };
    for (const uid of state.session.qids) if (P.get(uid)?.flagged) state.session.flags[uid] = true;
    saveSession();
    location.hash = '#/test';
  }
  const sQuestions = () => (state.session ? state.session.qids.map(u => state.qIndex.get(u)?.q).filter(Boolean) : []);
  const current = () => { const s = state.session; return s ? state.qIndex.get(s.qids[s.index]) : null; };
  function saveSession() { if (state.session) storage.session.save(state.session); else storage.session.clear(); }
  const answerOf = uid => state.session.checked[uid] ?? state.session.answers[uid];
  const hasAnswer = uid => String(state.session.answers[uid] ?? '').trim() !== '';

  function renderTest() {
    const s = state.session;
    if (!s || s.finished) { location.hash = s?.finished ? '#/results' : '#/library'; return; }
    s.qids = s.qids.filter(u => state.qIndex.has(u));
    if (!s.qids.length) { state.session = null; saveSession(); location.hash = '#/library'; return; }
    s.index = Math.max(0, Math.min(s.index, s.qids.length - 1));
    const { q, pattern, bank } = current();
    const isRW = pattern.sectionId === 'rw';
    const twoPane = !!(q.passage || q.passages.length);
    $('t-title').textContent = `${pattern.sectionName} · ${s.mode === 'exam' ? 'Test' : 'Practice'}`;
    $('t-sub').textContent = pattern.skillName;
    $('t-body').classList.toggle('single', !twoPane);
    $('t-body').classList.toggle('no-math', isRW);
    $('t-num').textContent = s.index + 1;
    $('t-diff').textContent = parser.levelLabel(q);
    $('t-diff').title = `SAT ${parser.LEVEL_NAMES[q.satLevel]} level, ${q.subLevel} within that level`;
    $('t-pattern').hidden = !s.showPattern; $('t-pattern').textContent = `${pattern.id} · ${pattern.name}`;
    const flagged = !!s.flags[q.uid];
    $('t-flag').classList.toggle('on', flagged); $('t-flag').setAttribute('aria-pressed', flagged);
    $('t-flag').innerHTML = `<span>⚑</span> ${flagged ? 'Marked for review' : 'Mark for review'}`;
    $('t-abc').classList.toggle('on', s.crossMode); $('t-abc').hidden = q.type !== 'mcq';

    const figure = visuals.render(q.visual);
    const passageHtml = q.passages.length
      ? q.passages.map(p => `<div class="passage"><div class="passage-label">${esc(p.label)}</div>${rich(p.text, true)}</div>`).join('')
      : q.passage ? `<div class="passage">${rich(q.passage, isRW)}</div>` : '';
    const stemHtml = `<div class="stem">${rich(q.stem, isRW)}</div>`;
    if (twoPane) { $('t-left').innerHTML = passageHtml + figure; $('t-right').innerHTML = stemHtml + answerArea(q); }
    else { $('t-left').innerHTML = ''; $('t-right').innerHTML = stemHtml + figure + answerArea(q); }
    renderCheck(q, pattern);
    $('t-pos').textContent = `Question ${s.index + 1} of ${s.qids.length}`;
    $('t-prev').disabled = s.index === 0;
    const last = s.index === s.qids.length - 1;
    $('t-next').textContent = last ? 'Finish' : 'Next';
    $('t-next').classList.toggle('finish', last);
    $('t-ref').hidden = isRW; $('t-calc').hidden = isRW;
    renderTimer();
    if (!isRW) typeset($('t-body'));
    saveSession();
  }
  function answerArea(q) {
    const s = state.session, locked = s.checked[q.uid] !== undefined;
    if (q.type === 'mcq') {
      const crossed = s.crossed[q.uid] || {};
      return `<div class="choices ${s.crossMode ? 'cross-mode' : ''}" role="radiogroup" aria-label="Answer choices">${'ABCD'.split('').map(L => {
        const sel = s.answers[q.uid] === L, x = !!crossed[L];
        let mark = '';
        if (locked) mark = L === q.correct_answer ? 'is-correct' : sel ? 'is-wrong' : '';
        return `<div class="choice ${sel ? 'selected' : ''} ${x ? 'crossed' : ''} ${mark}" data-choice="${L}" role="radio" aria-checked="${sel}" tabindex="${locked ? -1 : 0}"><span class="letter">${L}</span><span class="ctext">${rich(q.choices[L])}</span>${s.crossMode ? `<button class="xbtn" data-cross="${L}" aria-label="${x ? 'Undo cross-out' : 'Cross out'} ${L}">${x ? 'Undo' : `<s>${L}</s>`}</button>` : ''}</div>`;
      }).join('')}</div>`;
    }
    return `<div class="spr"><label class="label" for="spr-input">Your answer</label><input id="spr-input" class="spr-input" autocomplete="off" inputmode="decimal" maxlength="7" value="${esc(s.answers[q.uid] || '')}" ${locked ? 'disabled' : ''} placeholder="e.g. 3/4 or .75"><div class="spr-preview" id="spr-preview"></div><p class="hint">Enter a number. Fractions (3/4) and decimals (.75) are both accepted; negative answers start with −. If the answer has π or a root, the question asks for the coefficient.</p></div>`;
  }
  function explanationHtml(q, isRW) {
    const ex = q.explanation || {};
    const labels = { fast_method: 'Fast method', hand_solution: 'By hand', desmos_method: 'Desmos / calculator', rationale: 'Why', distractors: 'Wrong choices', pattern_tip: 'Pattern tip' };
    const keys = [...Object.keys(labels).filter(k => ex[k]), ...Object.keys(ex).filter(k => !labels[k] && ex[k] && typeof ex[k] === 'string')];
    if (!keys.length) return '<p class="muted small">No explanation supplied for this question.</p>';
    return keys.map(k => `<p><b>${esc(labels[k] || k.replace(/_/g, ' '))}:</b> ${rich(ex[k], isRW)}</p>`).join('');
  }
  function renderCheck(q, pattern) {
    const s = state.session, el = $('t-check');
    if (s.mode !== 'practice') { el.innerHTML = ''; return; }
    const locked = s.checked[q.uid];
    if (locked === undefined) {
      el.innerHTML = `<button class="btn primary" id="check-btn" ${hasAnswer(q.uid) ? '' : 'disabled'}>Check answer</button>`;
      return;
    }
    const ok = grading.grade(q, locked);
    el.innerHTML = `<div class="feedback ${ok ? 'good' : 'bad'}"><strong>${ok ? '✓ Correct' : '✕ Not quite'}</strong><p>Answer: <b>${rich(grading.displayAnswer(q))}</b></p>${explanationHtml(q, pattern.sectionId === 'rw')}</div>`;
  }
  function checkCurrent() {
    const { q } = current(), s = state.session;
    if (!hasAnswer(q.uid) || s.checked[q.uid] !== undefined) return;
    s.checked[q.uid] = s.answers[q.uid];
    P.record(q.uid, grading.grade(q, s.answers[q.uid]));
    renderTest();
  }
  function selectChoice(L) {
    const c = current(); if (!c) return; const s = state.session;
    if (s.checked[c.q.uid] !== undefined) return;
    if (s.crossMode && s.crossed[c.q.uid]?.[L]) { s.crossed[c.q.uid][L] = false; }
    s.answers[c.q.uid] = s.answers[c.q.uid] === L && s.mode === 'exam' ? undefined : L;
    if (s.answers[c.q.uid] === undefined) delete s.answers[c.q.uid];
    renderTest();
  }
  function toggleCross(L) { const c = current(); const s = state.session; const m = s.crossed[c.q.uid] = s.crossed[c.q.uid] || {}; m[L] = !m[L]; if (m[L] && s.answers[c.q.uid] === L && s.checked[c.q.uid] === undefined) delete s.answers[c.q.uid]; renderTest(); }
  function go(i) { const s = state.session; if (!s || i < 0 || i >= s.qids.length) return; s.index = i; closeModal(); renderTest(); window.scrollTo(0, 0); }
  function toggleFlag() { const c = current(); const s = state.session; s.flags[c.q.uid] = !s.flags[c.q.uid]; P.setFlag(c.q.uid, s.flags[c.q.uid]); renderTest(); }

  function showNavigator() {
    const s = state.session;
    const cells = s.qids.map((u, i) => {
      const cls = [hasAnswer(u) ? 'answered' : '', s.flags[u] ? 'flagged' : '', i === s.index ? 'current' : ''];
      if (s.mode === 'practice' && s.checked[u] !== undefined) cls.push(grading.grade(state.qIndex.get(u).q, s.checked[u]) ? 'good' : 'bad');
      return `<button class="cell ${cls.join(' ')}" data-goto="${i}" aria-label="Question ${i + 1}">${i + 1}</button>`;
    }).join('');
    const answered = s.qids.filter(hasAnswer).length;
    openModal('Questions', `<div class="legend small"><span><i class="lg cur"></i>Current</span><span><i class="lg ans"></i>Answered (${answered})</span><span><i class="lg flag"></i>For review</span></div><div class="grid-nav">${cells}</div>`,
      [{ label: 'Finish session', cls: 'primary', onClick: confirmFinish }]);
  }
  function confirmFinish() {
    const s = state.session, unanswered = s.qids.filter(u => !hasAnswer(u)).length, flagged = s.qids.filter(u => s.flags[u]).length;
    openModal('Finish this session?', `<p>${unanswered ? `<b>${unanswered}</b> question${unanswered === 1 ? ' is' : 's are'} unanswered. ` : 'All questions answered. '}${flagged ? `${flagged} marked for review.` : ''}</p>`,
      [{ label: 'Keep working', onClick: closeModal }, { label: 'Finish', cls: 'primary', onClick: finishSession }]);
  }
  function finishSession() {
    closeModal(); const s = state.session; if (!s || s.finished) return;
    clearInterval(state.tick);
    s.finished = true; s.ended = Date.now();
    let correct = 0, answered = 0;
    for (const u of s.qids) {
      const q = state.qIndex.get(u)?.q; if (!q) continue;
      const a = answerOf(u); const ok = grading.grade(q, a);
      if (String(a ?? '').trim()) answered++;
      if (ok) correct++;
      if (s.checked[u] === undefined && String(a ?? '').trim()) P.record(u, ok); // practice-mode checks were already recorded
    }
    const skills = [...new Set(s.qids.map(u => state.qIndex.get(u)?.pattern.skillName).filter(Boolean))];
    P.addHistory({ at: s.ended, n: s.qids.length, answered, correct, mode: s.mode, secs: Math.round((s.ended - s.started) / 1000), skills: skills.slice(0, 4) });
    storage.flush(); saveSession();
    location.hash = '#/results';
  }

  function renderTimer() {
    const s = state.session; if (!s) return;
    $('t-timer-toggle').hidden = !s.duration;
    if (!s.duration) { $('t-time').textContent = 'Untimed'; return; }
    const left = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
    $('t-time').textContent = state.showTimer ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '—:—';
    $('t-timer').classList.toggle('low', left <= 300 && state.showTimer);
    $('t-timer-toggle').textContent = state.showTimer ? 'Hide' : 'Show';
  }
  function startTicker() {
    clearInterval(state.tick);
    const s = state.session; if (!s || !s.duration || s.finished) return;
    state.tick = setInterval(() => {
      if (!state.session || state.session.finished) return clearInterval(state.tick);
      renderTimer();
      if (Date.now() >= state.session.deadline) { clearInterval(state.tick); toast('Time is up — session submitted.'); finishSession(); }
    }, 1000);
  }

  /* ---------- Tools ---------- */
  function showCalculator() {
    const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', 'π', '=', 'x²', '√', '^', '⌫'];
    openModal('Calculator', `<div class="calc"><input class="calc-screen" id="calc-screen" value="" placeholder="0" aria-label="Expression"><div class="calc-out" id="calc-out"></div><div class="calc-keys">${keys.map(k => `<button data-calc="${esc(k)}" class="${/[=]/.test(k) ? 'eq' : /[÷×−+^√²]/.test(k) ? 'op' : ''}">${esc(k)}</button>`).join('')}</div><p class="small muted">Scientific basics. On test day you'll have the built-in Desmos graphing calculator — <a href="https://www.desmos.com/calculator" target="_blank" rel="noopener">open Desmos ↗</a> to practise with it.</p></div>`);
    const scr = $('calc-screen'), out = $('calc-out');
    const evalNow = () => { try { out.textContent = '= ' + String(Number(grading.evaluate(scr.value).toPrecision(12))); } catch { out.textContent = ''; } };
    scr.addEventListener('input', evalNow);
    scr.addEventListener('keydown', e => { if (e.key === 'Enter') { try { scr.value = String(Number(grading.evaluate(scr.value).toPrecision(12))); evalNow(); } catch { out.textContent = 'Error'; } } });
    $('modal-body').querySelector('.calc-keys').addEventListener('click', e => {
      const b = e.target.closest('[data-calc]'); if (!b) return; const k = b.dataset.calc;
      if (k === 'C') scr.value = ''; else if (k === '⌫') scr.value = scr.value.slice(0, -1);
      else if (k === '=') { try { scr.value = String(Number(grading.evaluate(scr.value).toPrecision(12))); } catch { out.textContent = 'Error'; return; } }
      else if (k === 'x²') scr.value = `(${scr.value || '0'})^2`; else if (k === '√') scr.value += 'sqrt(';
      else scr.value += { '÷': '/', '×': '*', '−': '-' }[k] || k;
      evalNow(); scr.focus();
    });
    scr.focus();
  }
  function showReference() {
    const f = [['Circle', '$A=\\pi r^2$, $\\;C=2\\pi r$'], ['Rectangle', '$A=\\ell w$'], ['Triangle', '$A=\\tfrac12 bh$'], ['Pythagorean theorem', '$c^2=a^2+b^2$'],
    ['Special right triangles', '$x,\\ x\\sqrt3,\\ 2x$ (30°-60°-90°)<br>$s,\\ s,\\ s\\sqrt2$ (45°-45°-90°)'], ['Rectangular prism', '$V=\\ell wh$'], ['Cylinder', '$V=\\pi r^2h$'],
    ['Sphere', '$V=\\tfrac43\\pi r^3$'], ['Cone', '$V=\\tfrac13\\pi r^2h$'], ['Pyramid', '$V=\\tfrac13\\ell wh$']];
    openModal('Reference', `<div class="ref-grid">${f.map(([k, v]) => `<div class="ref"><b>${k}</b><div>${v}</div></div>`).join('')}</div><p class="small muted">The number of degrees of arc in a circle is 360. The number of radians of arc in a circle is $2\\pi$. The sum of the measures in degrees of the angles of a triangle is 180.</p>`);
    typeset($('modal-body'));
  }

  /* =========================================================
     Results
     ========================================================= */
  function renderResults() {
    const s = state.session;
    if (!s || !s.finished) { location.hash = '#/library'; return; }
    const qs = sQuestions();
    const correct = qs.filter(q => grading.grade(q, answerOf(q.uid))).length;
    const p = pct(correct, qs.length);
    $('r-pct').textContent = p + '%';
    $('r-ring').style.setProperty('--p', p);
    $('r-head').textContent = `${correct} of ${qs.length} correct`;
    const mins = Math.round((s.ended - s.started) / 60000);
    $('r-sub').textContent = `${s.mode === 'exam' ? 'Test mode' : 'Practice mode'} · ${mins} min · ${qs.filter(q => !String(answerOf(q.uid) ?? '').trim()).length} unanswered`;
    $('r-retry').disabled = correct === qs.length;
    const groups = new Map();
    for (const q of qs) { const e = state.qIndex.get(q.uid); const k = e.pattern.uid; if (!groups.has(k)) groups.set(k, { p: e.pattern, n: 0, ok: 0 }); const g = groups.get(k); g.n++; if (grading.grade(q, answerOf(q.uid))) g.ok++; }
    $('r-patterns').innerHTML = [...groups.values()].sort((a, b) => a.ok / a.n - b.ok / b.n).map(g => `<div class="prow"><div><strong>${esc(g.p.name)}</strong><div class="small muted">${esc(g.p.skillName)}</div></div><span class="num">${g.ok}/${g.n}</span><span class="pbar"><i style="width:${pct(g.ok, g.n)}%"></i></span></div>`).join('');
    $('r-review-card').hidden = true;
  }
  function renderReview() {
    const s = state.session, f = state.reviewFilter;
    document.querySelectorAll('#r-filter button').forEach(b => b.classList.toggle('on', b.dataset.v === f));
    const items = sQuestions().map((q, i) => ({ q, i })).filter(({ q }) => f === 'wrong' ? !grading.grade(q, answerOf(q.uid)) : f === 'flagged' ? s.flags[q.uid] : true);
    $('r-list').innerHTML = items.length ? items.map(({ q, i }) => {
      const e = state.qIndex.get(q.uid), isRW = e.pattern.sectionId === 'rw', a = answerOf(q.uid), ok = grading.grade(q, a);
      const passage = q.passages.length ? q.passages.map(p => `<div class="passage"><div class="passage-label">${esc(p.label)}</div>${rich(p.text, true)}</div>`).join('') : q.passage ? `<div class="passage">${rich(q.passage, isRW)}</div>` : '';
      const choices = q.type === 'mcq' ? `<ol class="review-choices">${'ABCD'.split('').map(L => `<li class="${L === q.correct_answer ? 'is-correct' : L === a ? 'is-wrong' : ''}"><b>${L}.</b> ${rich(q.choices[L])}</li>`).join('')}</ol>` : '';
      return `<article class="review ${isRW ? 'no-math' : ''}"><header><span class="small muted">#${i + 1} · ${esc(e.pattern.id)} ${esc(e.pattern.name)} · ${esc(parser.levelLabel(q))}</span><span class="tag ${ok ? 'good' : 'bad'}">${ok ? '✓ Correct' : a ? '✕ Incorrect' : '— Blank'}</span></header>${passage}<div class="stem">${rich(q.stem, isRW)}</div>${visuals.render(q.visual)}${choices}<p class="small"><b>Your answer:</b> ${esc(a || '—')} · <b>Correct:</b> ${rich(grading.displayAnswer(q))}</p><div class="explain">${explanationHtml(q, isRW)}</div></article>`;
    }).join('') : '<p class="muted">Nothing here.</p>';
    typeset($('r-list'));
  }
  function exportResults() {
    const s = state.session, qs = sQuestions();
    download(`sat-results-${today()}.json`, JSON.stringify({
      started: new Date(s.started).toISOString(), ended: new Date(s.ended).toISOString(), mode: s.mode,
      correct: qs.filter(q => grading.grade(q, answerOf(q.uid))).length, total: qs.length,
      responses: qs.map((q, i) => { const e = state.qIndex.get(q.uid); return { n: i + 1, bank: e.bank.key, id: q.id, pattern: e.pattern.name, skill: e.pattern.skillName, sat_difficulty: q.satLevel, difficulty: q.difficulty, answer: answerOf(q.uid) ?? null, correct_answer: q.correct_answer, correct: grading.grade(q, answerOf(q.uid)), flagged: !!s.flags[q.uid] }; })
    }, null, 2));
  }

  /* =========================================================
     Generate (pipeline)
     ========================================================= */
  let gen = SPS.prompt.defaults('math');
  function fillDomains() {
    const sec = taxonomy.sections.find(s => s.id === $('g-section').value);
    $('g-domain').innerHTML = sec.domains.map(d => `<option>${esc(d.name)}</option>`).join('');
    fillSkills();
  }
  function fillSkills() {
    const sec = taxonomy.sections.find(s => s.id === $('g-section').value);
    const dom = sec.domains.find(d => d.name === $('g-domain').value) || sec.domains[0];
    $('g-skill').innerHTML = dom.skills.map(k => `<option>${esc(k)}</option>`).join('') + '<option value="__custom">Custom skill…</option>';
  }
  function readGen() {
    const custom = $('g-skill').value === '__custom';
    $('g-custom-wrap').hidden = !custom;
    $('g-spr-wrap').hidden = $('g-section').value === 'rw';
    const prevAuto = gen.bankIdAuto;
    gen = {
      ...gen, section: $('g-section').value, domain: $('g-domain').value,
      skill: custom ? ($('g-custom').value.trim() || 'Custom skill') : $('g-skill').value,
      source: $('g-source').querySelector('.on')?.dataset.v || 'attached',
      patternCount: Number($('g-patterns').value) || 0, perPattern: Number($('g-per').value) || 20,
      diffPlan: $('g-diff').value, satLevel: $('g-level').value, sprShare: $('g-section').value === 'rw' ? 0 : Number($('g-spr').value), format: $('g-format').value,
      batchSize: Number($('g-batch').value) || 10, title: ''
    };
    const auto = SPS.prompt.finalize({ ...gen, bankId: '' }).bankId;
    if (!$('g-bankid').value || $('g-bankid').value === prevAuto) $('g-bankid').value = auto;
    gen.bankIdAuto = auto; gen.bankId = taxonomy.slug($('g-bankid').value) || auto;
    SPS.prompt.finalize(gen);
    $('g-output').value = SPS.prompt.buildMain(gen);
    $('b-to').value = Math.min(Number($('b-from').value) + gen.batchSize - 1, gen.perPattern);
  }
  function renderGenerate() { if (!$('g-domain').options.length) { fillDomains(); readGen(); } renderValidator(); }

  async function addValidatorFiles(fileList) {
    const files = await readFiles(fileList);
    state.validator.files.push(...files.map(f => ({ ...f, id: Math.random().toString(36).slice(2) })));
    runValidator();
  }
  function runValidator() {
    const v = state.validator; v.bank = null; v.error = null;
    const raws = [];
    for (const f of v.files) {
      try { f.raw = parser.parseText(f.name, f.text); f.error = null; raws.push(f.raw); }
      catch (e) { f.error = e.message; f.raw = null; }
      f.kind = !f.raw ? 'error' : Array.isArray(f.raw) ? (f.raw.length && (f.raw[0].stem || f.raw[0].question) ? `${f.raw.length} questions` : `${f.raw.length} patterns`) : `${(f.raw.questions || []).length} questions${(f.raw.patterns || []).length ? `, ${f.raw.patterns.length} patterns` : ''}`;
    }
    if (raws.length) {
      try { v.bank = parser.normalize(parser.mergeRaw(raws), { filename: v.files.find(f => f.raw)?.name }); }
      catch (e) { v.error = e.message; }
    }
    renderValidator();
  }
  function reportHtml(r) {
    return `${r.errors.length ? `<details open class="issues bad"><summary>${r.errors.length} error${r.errors.length === 1 ? '' : 's'} (items skipped)</summary><ul>${r.errors.slice(0, 200).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      ${r.warnings.length ? `<details class="issues warn" ${r.errors.length ? '' : 'open'}><summary>${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}</summary><ul>${r.warnings.slice(0, 200).map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
      ${!r.errors.length && !r.warnings.length ? '<p class="good-note">✓ No problems found.</p>' : ''}`;
  }
  function renderValidator() {
    const v = state.validator;
    $('v-files').innerHTML = v.files.map(f => `<li class="${f.error ? 'bad' : ''}"><span>${esc(f.name)}</span><small>${esc(f.error || f.kind || '')}</small><button class="link-btn" data-vremove="${f.id}" aria-label="Remove ${esc(f.name)}">✕</button></li>`).join('');
    if (!v.files.length) { $('v-report').innerHTML = ''; return; }
    if (v.error || !v.bank) { $('v-report').innerHTML = `<div class="issues bad pad">${esc(v.error || 'No usable data yet.')}</div>`; return; }
    const b = v.bank, r = b.report;
    const levels = parser.LEVELS;
    const rows = b.patterns.map(p => {
      const qs = b.questions.filter(q => q.pattern_id === p.id);
      const exp = p.expected_question_count;
      return `<tr><td><b>${esc(p.id)}</b></td><td>${esc(p.name)}<div class="small muted">${esc(p.skillName)}</div></td><td>${esc([...new Set(qs.map(q => parser.LEVEL_NAMES[q.satLevel]))].join(', '))}</td>${levels.map(l => `<td class="num">${qs.filter(q => q.subLevel === l).length}</td>`).join('')}<td class="num">${qs.filter(q => q.type === 'spr').length}</td><td class="num ${exp && qs.length !== exp ? 'warn' : 'ok'}">${qs.length}${exp ? ' / ' + exp : ''}</td></tr>`;
    }).join('');
    $('v-report').innerHTML = `<div class="v-summary"><div><strong>${esc(b.metadata.title)}</strong> <code>${esc(b.key)}</code><div class="small muted">${r.valid} valid of ${r.total} questions · ${b.patterns.length} patterns</div></div>
      <div class="row gap-s wrap"><button class="btn ghost small" id="v-download">↓ Merged JSON</button>${r.errors.length || r.warnings.length ? '<button class="btn ghost small" id="v-repair">Copy repair prompt</button>' : ''}<button class="btn primary small" id="v-add">Add to library →</button></div></div>
      <div class="table-scroll"><table class="data-table compact"><thead><tr><th>ID</th><th>Pattern</th><th>SAT level</th><th title="Within the SAT level">easy</th><th title="Within the SAT level">medium</th><th title="Within the SAT level">hard</th><th>SPR</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${reportHtml(r)}
      <details class="preview"><summary>Preview first questions</summary><div id="v-preview"></div></details>`;
    $('v-preview').innerHTML = b.questions.slice(0, 3).map(q => { const p = b.patterns.find(x => x.id === q.pattern_id); const isRW = p?.sectionId === 'rw'; return `<div class="review ${isRW ? 'no-math' : ''}"><div class="small muted">${esc(q.id)} · ${esc(q.type)} · ${esc(parser.levelLabel(q))}</div>${q.passage ? `<div class="passage">${rich(q.passage, isRW)}</div>` : ''}<div class="stem">${rich(q.stem, isRW)}</div>${visuals.render(q.visual)}${q.choices ? `<ol class="review-choices">${'ABCD'.split('').map(L => `<li class="${L === q.correct_answer ? 'is-correct' : ''}"><b>${L}.</b> ${rich(q.choices[L])}</li>`).join('')}</ol>` : `<p>Answer: <b>${esc(q.correct_answer)}</b></p>`}</div>`; }).join('');
    typeset($('v-report'));
  }

  /* =========================================================
     Progress view
     ========================================================= */
  function renderProgress() {
    const entries = P.entries(), hist = P.history(), meta = P.meta();
    const vals = Object.entries(entries).filter(([uid]) => state.qIndex.has(uid)).map(([, e]) => e);
    const seen = vals.filter(e => e[0]).length, last = vals.filter(e => e[0] && e[2]).length, attempts = vals.reduce((s, e) => s + e[0], 0), flagged = vals.filter(e => e[3]).length;
    const tiles = [['Questions answered', fmt.format(seen), `of ${fmt.format(state.qIndex.size)} in library`], ['Accuracy (latest try)', seen ? pct(last, seen) + '%' : '—', `${fmt.format(last)} correct now`], ['Total attempts', fmt.format(attempts), `${hist.length} session${hist.length === 1 ? '' : 's'}`], ['Marked for review', fmt.format(flagged), 'flagged questions']];
    $('p-stats').innerHTML = tiles.map(([k, v, s]) => `<div class="card stat"><span class="small muted">${k}</span><strong>${v}</strong><span class="small muted">${s}</span></div>`).join('');

    const rows = [];
    for (const s of state.tree || []) for (const d of s.kids) for (const k of d.kids) {
      const st = statsFor(k.patterns);
      rows.push(`<div class="prow"><div><strong>${esc(k.name)}</strong><div class="small muted">${esc(s.name)} › ${esc(d.name)}</div></div><span class="num" title="answered / total">${st.seen}/${st.total}</span><span class="num ${st.seen ? '' : 'muted'}">${st.seen ? pct(st.correct, st.seen) + '%' : '—'}</span>${bar(st)}<button class="btn ghost small" data-practice-skill="${esc(k.key)}" ${st.missed ? '' : 'disabled'} title="Practise questions you missed">Missed (${st.missed})</button></div>`);
    }
    $('p-skills').innerHTML = rows.join('') || '<p class="muted">Add a question bank to see progress by skill.</p>';

    const orphan = Object.keys(entries).length - vals.length;
    $('p-backup-info').innerHTML = `Last download: <b>${meta.lastBackup ? timeAgo(meta.lastBackup) : 'never'}</b>. Last change: ${meta.lastChange ? timeAgo(meta.lastChange) : '—'}.${orphan > 0 ? ` Includes ${orphan} answers for banks not currently loaded.` : ''}`;
    const ck = P.cookieReport();
    $('p-storage').innerHTML = [
      `<li><b>Cookies:</b> ${storage.cookiesWork ? `on — compact mirror of ${ck.banks} bank${ck.banks === 1 ? '' : 's'}, ${fmt.format(ck.bytes)} of ${fmt.format(P.COOKIE_BUDGET)} characters used.${ck.truncated.length ? ` <span class="warn">Over budget, not mirrored: ${esc(ck.truncated.join(', '))}. The progress file still has everything.</span>` : ''}` : 'blocked in this browser (normal when opening the file directly from disk). Progress is still saved in local storage.'}</li>`,
      `<li><b>Local storage:</b> ${fmt.format(Object.keys(entries).length)} answer records, ${hist.length} sessions.</li>`,
      `<li><b>Question banks:</b> ${state.banks.length} in IndexedDB.</li>`,
      '<li>Clearing your browser data removes all of this, so download a progress file now and then.</li>'
    ].join('');
    $('p-history').innerHTML = hist.length ? `<ul class="history">${hist.slice(-12).reverse().map(h => `<li><span>${new Date(h.at).toLocaleDateString()} · ${esc((h.skills || []).join(', ') || 'Mixed')}</span><b>${h.correct}/${h.n}</b></li>`).join('')}</ul>` : '<p class="muted small">No sessions yet.</p>';
  }
  function exportProgressFile() {
    download(`sat-progress-${today()}.json`, JSON.stringify(P.exportProgress(state.banks)));
    updateBackupBadge(); toast('Progress file downloaded. Keep it somewhere safe.');
  }
  async function importProgressFile(file) {
    try {
      const obj = JSON.parse(await file.text());
      const n = P.importProgress(obj, $('p-replace').checked ? 'replace' : 'merge');
      const missing = (obj.banks || []).filter(b => !state.banks.some(x => x.key === b.key));
      toast(`Progress loaded: ${n} records updated.`);
      if (missing.length) openModal('Progress loaded', `<p>Your progress file also has answers for these banks, which aren't in this library yet:</p><ul>${missing.map(b => `<li>${esc(b.title)} <small class="muted">(${b.questions} questions)</small></li>`).join('')}</ul><p class="small muted">Add the same bank files to see that progress.</p>`);
      route();
    } catch (e) { toast('Could not read progress file: ' + e.message, 'error'); }
  }
  function updateBackupBadge() {
    const m = P.meta(), stale = m.lastChange && m.lastChange > m.lastBackup;
    $('backup-dot').className = 'dot ' + (stale ? (Date.now() - m.lastBackup > 7 * 864e5 ? 'warn' : 'pending') : 'ok');
    $('backup-label').textContent = m.lastBackup ? `Backup · ${timeAgo(m.lastBackup)}` : 'Backup progress';
    $('backup-btn').title = stale ? 'You have progress that is not in a downloaded file yet. Click to download.' : 'Download a progress file';
  }

  /* =========================================================
     Modal helpers
     ========================================================= */
  let modalResolve = null;
  function openModal(title, body, buttons = []) {
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(null); }
    $('modal-title').textContent = title; $('modal-body').innerHTML = body;
    $('modal-foot').innerHTML = ''; $('modal-foot').hidden = !buttons.length;
    for (const b of buttons) {
      const el = document.createElement('button'); el.className = 'btn ' + (b.cls || 'ghost'); el.textContent = b.label;
      el.onclick = b.onClick; $('modal-foot').appendChild(el);
    }
    $('modal').hidden = false;
    const focusEl = $('modal-foot').querySelector('.primary') || $('modal-close'); focusEl.focus();
    typeset($('modal-body'));
  }
  function closeModal() { $('modal').hidden = true; if (modalResolve) { const r = modalResolve; modalResolve = null; r(null); } }
  function ask(title, body, options) {
    return new Promise(resolve => {
      openModal(title, body, options.map(o => ({ label: o.label, cls: o.cls, onClick: () => { modalResolve = null; $('modal').hidden = true; resolve(o.value); } })));
      modalResolve = resolve;
    });
  }

  /* =========================================================
     Router
     ========================================================= */
  const VIEWS = ['library', 'generate', 'progress', 'guide', 'test', 'results'];
  function route() {
    let v = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'library';
    if (!VIEWS.includes(v)) v = 'library';
    if (v === 'test' && (!state.session || state.session.finished)) v = state.session?.finished ? 'results' : 'library';
    if (v === 'results' && !(state.session && state.session.finished)) v = 'library';
    for (const name of VIEWS) $('view-' + name).hidden = name !== v;
    document.body.classList.toggle('in-player', v === 'test');
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === v));
    if (v !== 'test') clearInterval(state.tick);
    ({ library: renderLibrary, generate: renderGenerate, progress: renderProgress, guide: renderGuide, test: () => { renderTest(); startTicker(); }, results: renderResults })[v]();
    updateBackupBadge();
  }
  function renderGuide() { if (!$('guide-content').innerHTML) { $('guide-content').innerHTML = SPS.guideHtml(); typeset($('guide-content')); } }

  /* =========================================================
     Events
     ========================================================= */
  function setupDrop(el, onFiles) {
    if (!el) return;
    ['dragenter', 'dragover'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); el.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(t => el.addEventListener(t, e => { e.preventDefault(); if (t === 'drop' || !el.contains(e.relatedTarget)) el.classList.remove('drag'); }));
    el.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files); });
  }

  function bind() {
    window.addEventListener('hashchange', route);
    document.addEventListener('click', e => {
      const t = e.target;
      const act = t.closest('[data-action]')?.dataset.action;
      if (act === 'pick-files') return $('file-input').click();
      if (act === 'manage-banks') return manageBanks();
      if (act === 'select-none') { state.selected.clear(); renderTree(); renderBuilder(); return; }
      if (act === 'expand-all') { const all = state.tree.flatMap(s => [s.key, ...s.kids.flatMap(d => [d.key, ...d.kids.map(k => k.key)])]); const allOpen = all.every(k => state.expanded.has(k)); all.forEach(k => allOpen ? state.expanded.delete(k) : state.expanded.add(k)); renderTree(); return; }
      if (act === 'resume-session') { location.hash = '#/test'; return; }
      if (act === 'discard-session') { state.session = null; saveSession(); renderResumeBanner(); return; }
      const tg = t.closest('[data-toggle]'); if (tg) { const k = tg.dataset.toggle; state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k); renderTree(); return; }
      const info = t.closest('[data-info]'); if (info) return showPatternInfo(info.dataset.info);
      const ex = t.closest('[data-example]'); if (ex) return addExample(ex.dataset.example);
      const br = t.closest('[data-bank-remove]'); if (br) return removeBank(br.dataset.bankRemove);
      const be = t.closest('[data-bank-export]'); if (be) { const b = state.banks.find(x => x.key === be.dataset.bankExport); if (b) download(`${b.key}.json`, JSON.stringify(parser.toCanonical(b), null, 1)); return; }
      const rep = t.closest('[data-bank-report]'); if (rep) return showBankReport(rep.dataset.bankReport);
      const ps = t.closest('[data-practice-skill]'); if (ps) {
        const node = findNode(ps.dataset.practiceSkill); if (!node) return;
        const qs = node.patterns.flatMap(u => state.pIndex.get(u).questions).filter(q => P.status(q.uid) === 'missed');
        $('opt-mode').value = 'practice'; return startSession(shuffle(qs));
      }
      if (t.closest('[data-close]')) closeModal();
      const seg = t.closest('#builder .seg button');
      if (seg) {
        const k = seg.parentElement.dataset.filter, v = seg.dataset.v;
        if (k === 'status') state.filters.status = v;
        else { const set = state.filters[k]; if (set.has(v) && set.size > 1) set.delete(v); else set.add(v); }
        renderBuilder(); return;
      }
      const single = t.closest('.seg.single button');
      if (single && single.parentElement.id === 'g-source') { single.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === single)); readGen(); }
    });
    document.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-sel]')) { t.checked ? state.selected.add(t.dataset.sel) : state.selected.delete(t.dataset.sel); renderTree(); renderBuilder(); }
      if (t.matches('[data-bank-level]')) { if (t.value !== 'mixed') setBankLevel(t.dataset.bankLevel, t.value); return; }
      if (t.matches('[data-group]')) { const node = findNode(t.dataset.group); const uids = nodePatterns(node); const on = checkState(uids) !== 'all'; uids.forEach(u => on ? state.selected.add(u) : state.selected.delete(u)); renderTree(); renderBuilder(); }
    });
    $('tree-search').addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderTree(); });
    ['opt-count', 'opt-order', 'opt-mode', 'opt-timer'].forEach(id => $(id).addEventListener('change', () => { renderBuilder(); saveBuilderPrefs(); }));
    $('opt-show-pattern').addEventListener('change', saveBuilderPrefs);
    $('start-btn').onclick = () => startSession();
    $('file-input').addEventListener('change', async e => { if (e.target.files.length) await importBankFiles([...e.target.files]); e.target.value = ''; });
    setupDrop($('dropzone-empty'), f => importBankFiles([...f]));
    setupDrop($('dropzone-main'), f => importBankFiles([...f]));
    $('dropzone-empty').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file-input').click(); } });
    $('dropzone-empty').addEventListener('click', e => { if (!e.target.closest('button')) $('file-input').click(); });

    // Player
    $('t-body').addEventListener('click', e => {
      const x = e.target.closest('[data-cross]'); if (x) { e.stopPropagation(); return toggleCross(x.dataset.cross); }
      const c = e.target.closest('[data-choice]'); if (c) return selectChoice(c.dataset.choice);
      if (e.target.closest('#check-btn')) return checkCurrent();
    });
    $('t-body').addEventListener('input', e => {
      if (e.target.id !== 'spr-input') return;
      const c = current(), s = state.session; if (s.checked[c.q.uid] !== undefined) return;
      const v = e.target.value.replace(/[^0-9./\-−]/g, '').replace('−', '-');
      if (v !== e.target.value) e.target.value = v;
      s.answers[c.q.uid] = v; saveSession();
      const n = grading.parseNumeric(v); $('spr-preview').textContent = v && Number.isFinite(n) && v.includes('/') ? '= ' + Number(n.toPrecision(6)) : '';
      const btn = $('check-btn'); if (btn) btn.disabled = !v.trim();
    });
    $('t-body').addEventListener('keydown', e => { if (e.target.id === 'spr-input' && e.key === 'Enter') { e.preventDefault(); if (state.session.mode === 'practice') checkCurrent(); } });
    $('t-flag').onclick = toggleFlag;
    $('t-abc').onclick = () => { state.session.crossMode = !state.session.crossMode; renderTest(); };
    $('t-prev').onclick = () => go(state.session.index - 1);
    $('t-next').onclick = () => state.session.index === state.session.qids.length - 1 ? confirmFinish() : go(state.session.index + 1);
    $('t-nav').onclick = showNavigator;
    $('t-timer-toggle').onclick = () => { state.showTimer = !state.showTimer; renderTimer(); };
    $('t-calc').onclick = showCalculator; $('t-ref').onclick = showReference;
    $('t-exit').onclick = () => openModal('Leave this session?', '<p>Your answers are saved. You can resume from the Library.</p>', [{ label: 'Stay', onClick: closeModal }, { label: 'Save & exit', cls: 'primary', onClick: () => { closeModal(); location.hash = '#/library'; } }]);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('modal').hidden) return closeModal();
      if ($('view-test').hidden || !$('modal').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase(), c = current(); if (!c) return;
      if (c.q.type === 'mcq' && 'abcd'.includes(k) && k.length === 1) { e.preventDefault(); selectChoice(k.toUpperCase()); }
      else if (e.key === 'ArrowRight') go(state.session.index + 1);
      else if (e.key === 'ArrowLeft') go(state.session.index - 1);
      else if (k === 'f') toggleFlag();
      else if (e.key === 'Enter' && state.session.mode === 'practice') checkCurrent();
      else if ((e.key === ' ') && e.target.closest?.('[data-choice]')) { e.preventDefault(); selectChoice(e.target.closest('[data-choice]').dataset.choice); }
    });

    // Results
    $('r-review').onclick = () => { const c = $('r-review-card'); c.hidden = !c.hidden; if (!c.hidden) { state.reviewFilter = 'all'; renderReview(); c.scrollIntoView({ behavior: 'smooth' }); } };
    $('r-filter').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.reviewFilter = b.dataset.v; renderReview(); } });
    $('r-export').onclick = exportResults;
    $('r-retry').onclick = () => { const s = state.session; const qs = sQuestions().filter(q => !grading.grade(q, answerOf(q.uid))); $('opt-mode').value = s.mode; startSession(qs); };

    // Generate
    $('g-section').addEventListener('change', () => { fillDomains(); readGen(); });
    $('g-domain').addEventListener('change', () => { fillSkills(); readGen(); });
    ['g-skill', 'g-patterns', 'g-per', 'g-diff', 'g-level', 'g-spr', 'g-format', 'g-batch'].forEach(id => $(id).addEventListener('change', readGen));
    ['g-custom', 'g-bankid'].forEach(id => $(id).addEventListener('input', readGen));
    $('g-copy').onclick = async () => toast((await copyText($('g-output').value)) ? 'Prompt copied. Paste it into your LLM along with the PDFs.' : 'Copy failed — select the text and copy manually.');
    $('g-download').onclick = () => download(`prompt-${gen.bankId}.md`, $('g-output').value, 'text/markdown');
    $('b-from').addEventListener('change', () => { $('b-to').value = Math.min(Number($('b-from').value) + gen.batchSize - 1, gen.perPattern); });
    $('b-copy').onclick = async () => toast((await copyText(SPS.prompt.buildBatch(gen, { pattern: $('b-pattern').value.trim() || 'P01', from: Number($('b-from').value) || 1, to: Number($('b-to').value) || gen.batchSize }))) ? 'Follow-up prompt copied.' : 'Copy failed.');
    $('v-drop').addEventListener('click', () => $('v-file-input').click());
    $('v-drop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('v-file-input').click(); } });
    setupDrop($('v-drop'), f => addValidatorFiles([...f]));
    $('v-file-input').addEventListener('change', async e => { if (e.target.files.length) await addValidatorFiles([...e.target.files]); e.target.value = ''; });
    $('v-add-paste').onclick = () => { const t = $('v-paste').value.trim(); if (!t) return; const n = state.validator.files.length + 1; state.validator.files.push({ id: Math.random().toString(36).slice(2), name: `pasted-${n}.${/^\s*[\[{]/.test(t) ? 'json' : /^id[,\t]/i.test(t) ? 'csv' : 'txt'}`, text: t }); $('v-paste').value = ''; runValidator(); };
    $('v-clear').onclick = () => { state.validator = { files: [], bank: null }; renderValidator(); };
    $('v-files').addEventListener('click', e => { const b = e.target.closest('[data-vremove]'); if (b) { state.validator.files = state.validator.files.filter(f => f.id !== b.dataset.vremove); runValidator(); } });
    $('v-report').addEventListener('click', async e => {
      const b = state.validator.bank; if (!b) return;
      if (e.target.closest('#v-download')) download(`${b.key}.json`, JSON.stringify(parser.toCanonical(b), null, 1));
      if (e.target.closest('#v-repair')) toast((await copyText(SPS.prompt.buildRepair(b.report, b.key))) ? 'Repair prompt copied — paste it back into the LLM.' : 'Copy failed.');
      if (e.target.closest('#v-add')) { if (await addBank(parser.normalize(parser.toCanonical(b), { key: b.key }), b.key + '.json')) { rebuildIndex(); autoSelect(); location.hash = '#/library'; toast(`Added “${b.metadata.title}” to your library.`); } }
    });

    // Progress
    $('p-export').onclick = exportProgressFile; $('backup-btn').onclick = exportProgressFile;
    $('p-import').onclick = () => $('p-file').click();
    $('p-file').addEventListener('change', e => { if (e.target.files[0]) importProgressFile(e.target.files[0]); e.target.value = ''; });
    $('p-reset').onclick = async () => {
      const ok = await ask('Reset all progress?', '<p>This deletes every answer record and session history in this browser. Banks stay in your library. It can only be undone by loading a progress file you downloaded earlier.</p>', [{ label: 'Cancel', value: false }, { label: 'Download backup first', value: 'backup' }, { label: 'Reset', value: true, cls: 'danger' }]);
      if (ok === 'backup') exportProgressFile();
      if (ok === true) { P.reset(); route(); toast('Progress reset.'); }
    };

    // Modal & theme
    $('modal-close').onclick = closeModal;
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); const g = e.target.closest('[data-goto]'); if (g) go(Number(g.dataset.goto)); });
    $('theme-btn').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      const s = storage.settings.load(); s.theme = next; storage.settings.save(s);
    };
    setInterval(updateBackupBadge, 60000);
    // MathJax loads asynchronously; typeset whatever is on screen once it's ready.
    document.addEventListener('mathjax-ready', () => { const v = document.querySelector('.view:not([hidden])'); if (v && !v.classList.contains('no-math')) typeset(v); });
  }

  function saveBuilderPrefs() {
    const s = storage.settings.load();
    s.builder = { count: $('opt-count').value, order: $('opt-order').value, mode: $('opt-mode').value, timer: $('opt-timer').value, showPattern: $('opt-show-pattern').checked };
    storage.settings.save(s);
  }
  function loadBuilderPrefs() {
    const b = storage.settings.load().builder; if (!b) return;
    if (b.count) $('opt-count').value = b.count; if (b.order) $('opt-order').value = b.order;
    if (b.mode) $('opt-mode').value = b.mode; if (b.timer) $('opt-timer').value = b.timer;
    $('opt-show-pattern').checked = !!b.showPattern;
  }

  /* =========================================================
     Boot
     ========================================================= */
  async function boot() {
    bind(); loadBuilderPrefs();
    const stored = await storage.banks.all();
    for (const rec of stored) {
      try { state.banks.push(parser.normalize(rec.raw, { key: rec.key, filename: rec.filename })); }
      catch (e) { console.warn('Could not restore bank', rec.key, e); }
    }
    state.banks.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
    rebuildIndex();
    state.session = storage.session.load();
    if (state.session && !state.session.qids?.every(u => state.qIndex.has(u))) state.session = null;
    if (state.banks.length && !state.selected.size) {
      const firstSkill = state.tree[0]?.kids[0]?.kids[0];
      if (firstSkill) { firstSkill.patterns.forEach(u => state.selected.add(u)); state.expanded.add(state.tree[0].kids[0].key); state.expanded.add(firstSkill.key); }
    }
    $('boot').remove();
    route();
  }
  // For tests
  SPS.app = { state, rebuildIndex, candidateQuestions };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.SPS = window.SPS || {});
