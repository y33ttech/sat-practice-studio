/* Import pipeline: raw file text → parsed object → normalized, validated bank.
   Lenient with typical LLM output (code fences, prose around JSON, trailing commas),
   strict about what a question needs to be gradable. */
(function (SPS) {
  'use strict';
  const { taxonomy } = SPS;

  const BANDS = ['easy', 'easy-medium', 'medium', 'medium-hard', 'hard'];
  const BAND_NAMES = { 'easy': 'Easy', 'easy-medium': 'Easy–Medium', 'medium': 'Medium', 'medium-hard': 'Medium–Hard', 'hard': 'Hard' };
  const LEVEL_OF = { 'easy': 'easy', 'easy-medium': 'easy', 'medium': 'medium', 'medium-hard': 'hard', 'hard': 'hard' };

  function band(value, number, perPattern) {
    const raw = String(value || '').toLowerCase().trim().replace(/[–—_\s]+/g, '-').replace(/-to-/g, '-');
    if (BANDS.includes(raw)) return raw;
    if (/^(hard-very-hard|very-hard|hardest|difficult)$/.test(raw)) return 'hard';
    if (raw === 'e' || raw === '1') return 'easy';
    if (raw === 'm' || raw === '2' || raw === '3') return 'medium';
    if (raw === 'h' || raw === '4' || raw === '5') return 'hard';
    if (number && perPattern === 50 && number >= 1 && number <= 50) return BANDS[Math.floor((number - 1) / 10)];
    return 'medium';
  }

  const makeId = (prefix, x) => (prefix + String(x || 'unknown').toLowerCase().replace(/[^a-z0-9-]+/g, '-')).slice(0, 80);
  function asArray(x) {
    if (Array.isArray(x)) return x.map(String);
    if (x === undefined || x === null || x === '') return [];
    if (typeof x === 'string') {
      try { const j = JSON.parse(x); return Array.isArray(j) ? j.map(String) : [String(j)]; }
      catch { return x.split('|').map(s => s.trim()).filter(Boolean); }
    }
    return [String(x)];
  }
  function asObject(x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) return x;
    if (typeof x === 'string' && x.trim()) {
      try { const j = JSON.parse(x); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { }
    }
    return null;
  }

  /* ---------- Text → object ---------- */

  function parseDelimited(text, delimiter) {
    text = String(text).replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false; else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); if (row.some(x => x.trim())) rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (quoted) throw new Error('The spreadsheet has an unclosed quoted cell.');
    row.push(cell); if (row.some(x => x.trim())) rows.push(row);
    if (rows.length < 2) throw new Error('A spreadsheet needs a header row and at least one question row.');
    const fields = rows.shift().map(x => x.trim().toLowerCase().replace(/\s+/g, '_'));
    if (!fields.includes('stem') && !fields.includes('question')) throw new Error('Missing the required “stem” column.');
    return rows.map(items => { const o = {}; fields.forEach((f, j) => { o[f] = (items[j] ?? '').trim(); }); return o; });
  }

  function rowsToRaw(rows, name) {
    const questions = rows.map(r => {
      const choices = {};
      for (const L of 'ABCD') {
        const v = r['option_' + L.toLowerCase()] ?? r['choice_' + L.toLowerCase()] ?? r[L.toLowerCase()];
        if (v !== undefined && v !== '') choices[L] = v;
      }
      const explanation = { ...(asObject(r.explanation_json) || asObject(r.explanation) || {}) };
      if (r.explanation && !asObject(r.explanation)) explanation.rationale = r.explanation;
      for (const f of ['fast_method', 'hand_solution', 'desmos_method', 'pattern_tip', 'rationale']) if (r[f]) explanation[f] = r[f];
      const q = {
        id: r.id, pattern_id: r.pattern_id, pattern_name: r.pattern_name, topic: r.topic, skill: r.skill, domain: r.domain, section: r.section,
        number_in_pattern: r.number_in_pattern, difficulty: r.difficulty, type: r.type || r.response_type,
        passage: r.passage, stem: r.stem || r.question, choices, correct_answer: r.correct_answer || r.answer,
        accepted_answers: r.accepted_answers_json || r.accepted_answers, explanation,
        visual: asObject(r.visual_json) || asObject(r.visual) || undefined
      };
      if (r.passage_json) q.passages = (() => { try { return JSON.parse(r.passage_json); } catch { return undefined; } })();
      if (r.image_url && !q.visual) q.visual = { type: 'image', src: r.image_url, alt: r.image_alt || 'Question figure' };
      if (r.tolerance) q.tolerance = r.tolerance;
      return q;
    });
    return { metadata: { title: name.replace(/\.(csv|tsv|txt)$/i, '') }, questions };
  }

  /** Pull a JSON value out of messy LLM output: code fences, leading prose, trailing commas. */
  function extractJson(text) {
    let t = String(text).replace(/^﻿/, '').trim();
    try { return JSON.parse(t); } catch { }
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) { try { return JSON.parse(fence[1]); } catch { t = fence[1]; } }
    const start = t.search(/[\[{]/);
    if (start > -1) {
      const open = t[start], close = open === '{' ? '}' : ']';
      const end = t.lastIndexOf(close);
      if (end > start) {
        const slice = t.slice(start, end + 1);
        try { return JSON.parse(slice); } catch { }
        try { return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
      }
    }
    throw new Error('Could not find JSON in this file.');
  }

  function parseText(filename, text) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'csv') return rowsToRaw(parseDelimited(text, ','), filename);
    if (ext === 'tsv') return rowsToRaw(parseDelimited(text, '\t'), filename);
    if (ext === 'jsonl' || ext === 'ndjson') return { metadata: { title: filename }, questions: parseJsonl(text) };
    if (ext === 'json' || ext === 'txt' || ext === 'md' || !ext || ext === filename.toLowerCase()) {
      try { return extractJson(text); }
      catch (e) {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length > 1 && lines.every(l => l.trim().startsWith('{'))) return { metadata: { title: filename }, questions: parseJsonl(text) };
        if (/^﻿?\s*id[,\t]/i.test(text) || /(^|,)stem(,|$)/i.test(lines[0] || '')) return rowsToRaw(parseDelimited(text, lines[0].includes('\t') ? '\t' : ','), filename);
        throw e;
      }
    }
    throw new Error(`Unsupported file type “.${ext}”. Use JSON, JSONL, CSV or TSV. PDFs must first be turned into a question bank with the generation prompt.`);
  }
  function parseJsonl(text) {
    return text.replace(/^﻿/, '').split(/\r?\n/).filter(x => x.trim()).map((line, i) => {
      try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${i + 1}.`); }
    });
  }

  /* ---------- Raw object → normalized bank ---------- */

  function splitRaw(raw) {
    if (Array.isArray(raw)) {
      // Either an array of questions, or an array of pattern records (a catalog file)
      const looksLikePatterns = raw.length && raw.every(x => x && typeof x === 'object' && !x.stem && !x.question && (x.name || x.recognition));
      return looksLikePatterns ? { metadata: {}, patterns: raw, questions: [] } : { metadata: {}, patterns: [], questions: raw };
    }
    if (raw && typeof raw === 'object') {
      if (raw.stem || raw.question) return { metadata: {}, patterns: [], questions: [raw] };
      const metadata = asObject(raw.metadata) || { title: raw.title, id: raw.id };
      const patterns = Array.isArray(raw.patterns) ? raw.patterns : Array.isArray(raw.pattern_catalog) ? raw.pattern_catalog : [];
      const questions = raw.questions || raw.items || [];
      return { metadata, patterns, questions: Array.isArray(questions) ? questions : [] };
    }
    throw new Error('The file does not contain a question bank.');
  }

  /** Combine several raw parsed files (catalog + per-pattern question files) into one raw bank. */
  function mergeRaw(list) {
    const out = { metadata: {}, patterns: [], questions: [] };
    const pSeen = new Map();
    for (const raw of list) {
      const part = splitRaw(raw);
      if (part.metadata && Object.keys(part.metadata).filter(k => part.metadata[k] !== undefined).length) out.metadata = { ...part.metadata, ...out.metadata };
      for (const p of part.patterns) {
        const id = String(p.id || p.pattern_id || '');
        if (id && pSeen.has(id)) Object.assign(pSeen.get(id), p);
        else { const c = { ...p }; out.patterns.push(c); if (id) pSeen.set(id, c); }
      }
      out.questions.push(...part.questions);
    }
    return out;
  }

  /**
   * normalize(raw, opts) → {key, metadata, patterns, questions, report}
   * Invalid questions are dropped and listed in report.errors so partially broken
   * LLM output still loads.
   */
  function normalize(raw, opts = {}) {
    const { metadata: m0, patterns: rawPatterns, questions: rawQuestions } = splitRaw(raw);
    const metadata = { ...m0 };
    for (const k of Object.keys(metadata)) if (metadata[k] === undefined) delete metadata[k];
    metadata.title = String(metadata.title || opts.filename?.replace(/\.[a-z]+$/i, '') || 'Imported question bank');
    const perPattern = Number(metadata.target_questions_per_pattern) || 0;
    const errors = [], warnings = [];

    const bankDefaults = { section: metadata.section, domain: metadata.domain, skill: metadata.skill, topic: metadata.topic, subject: metadata.subject };
    const patterns = new Map();
    function addPattern(p, i) {
      const id = String(p.id || p.pattern_id || `P${String(i + 1).padStart(2, '0')}`);
      const loc = taxonomy.locate({
        section: p.section || bankDefaults.section, domain: p.domain || bankDefaults.domain,
        skill: p.skill_area || (p.skill && taxonomy.locate({ skill: p.skill }).custom ? null : p.skill) || bankDefaults.skill,
        topic: p.topic || bankDefaults.topic, subject: bankDefaults.subject
      });
      const pat = {
        ...p, id, name: String(p.name || p.pattern_name || id),
        recognition: String(p.recognition || ''), expected_question_count: Number(p.expected_question_count) || perPattern || 0,
        sectionId: loc.section.id, sectionName: loc.section.name, domainId: loc.domain.id, domainName: loc.domain.name,
        skillName: loc.skill, skillId: loc.skillId
      };
      patterns.set(id, pat);
      return pat;
    }
    rawPatterns.forEach((p, i) => { if (p && typeof p === 'object') addPattern(p, i); });

    const seen = new Set(), questions = [];
    rawQuestions.forEach((rq, i) => {
      const where = `Question ${i + 1}${rq && rq.id ? ` (${rq.id})` : ''}`;
      if (!rq || typeof rq !== 'object') { errors.push(`${where}: not an object.`); return; }
      let id = String(rq.id || `Q${String(i + 1).padStart(4, '0')}`).trim();
      if (seen.has(id)) { errors.push(`${where}: duplicate id “${id}” — skipped.`); return; }
      seen.add(id);

      const pattern_id = String(rq.pattern_id || rq.pattern || makeId('p-', rq.pattern_name || rq.skill || rq.topic || metadata.skill || 'general'));
      if (!patterns.has(pattern_id)) {
        addPattern({ id: pattern_id, name: rq.pattern_name || (rq.pattern_id ? pattern_id : (rq.skill || rq.topic || metadata.skill || 'General')), topic: rq.topic, skill: rq.skill, domain: rq.domain, section: rq.section }, patterns.size);
        if (rawPatterns.length) warnings.push(`${id}: pattern “${pattern_id}” is not in the patterns list; created automatically.`);
      }

      let choices = rq.choices ?? rq.options ?? {};
      if (Array.isArray(choices)) {
        const r = {};
        choices.forEach((c, k) => {
          if (c && typeof c === 'object') r[String(c.label || c.letter || 'ABCD'[k]).toUpperCase()] = c.text ?? c.value ?? '';
          else r['ABCD'[k]] = c;
        });
        choices = r;
      }
      if (typeof choices === 'string') choices = asObject(choices) || {};
      if (!Object.keys(choices).length) {
        for (const L of 'ABCD') { const v = rq['option_' + L.toLowerCase()] ?? rq['choice_' + L.toLowerCase()]; if (v !== undefined && v !== '') choices[L] = v; }
      }
      const upperChoices = {};
      for (const [k, v] of Object.entries(choices)) upperChoices[k.trim().toUpperCase()] = v;

      let type = String(rq.type || rq.response_type || (Object.keys(upperChoices).length ? 'mcq' : 'spr')).toLowerCase().trim();
      if (/^(multiple.?choice|mc)$/.test(type)) type = 'mcq';
      if (/^(student.?produced.?response|grid.?in|numeric|free.?response|fr)$/.test(type)) type = 'spr';

      const num = Number(rq.number_in_pattern) || null;
      const diff = band(rq.difficulty, num, perPattern);
      const explanation = asObject(rq.explanation) || (typeof rq.explanation === 'string' && rq.explanation ? { rationale: rq.explanation } : {});
      if (rq.rationale && !explanation.rationale) explanation.rationale = rq.rationale;

      const q = {
        id, pattern_id, number_in_pattern: num, difficulty: diff, level: LEVEL_OF[diff], type,
        stem: String(rq.stem ?? rq.question ?? '').trim(),
        passage: rq.passage ? String(rq.passage) : '',
        passages: Array.isArray(rq.passages) ? rq.passages.filter(Boolean).map((p, k) => typeof p === 'string' ? { label: `Text ${k + 1}`, text: p } : { label: String(p.label || `Text ${k + 1}`), text: String(p.text || '') }) : [],
        correct_answer: String(rq.correct_answer ?? rq.answer ?? '').trim(),
        accepted_answers: asArray(rq.accepted_answers),
        explanation, visual: asObject(rq.visual) || asObject(rq.visual_json) || null,
        tolerance: Number(rq.tolerance) > 0 ? Number(rq.tolerance) : 0
      };
      if (rq.image_url && !q.visual) q.visual = { type: 'image', src: rq.image_url, alt: rq.image_alt || 'Question figure' };
      if (q.visual && !Object.keys(q.visual).length) q.visual = null;

      if (!q.stem) { errors.push(`${where}: missing “stem” — skipped.`); return; }
      if (q.type !== 'mcq' && q.type !== 'spr') { errors.push(`${where}: type must be “mcq” or “spr”, got “${q.type}” — skipped.`); return; }
      if (q.type === 'mcq') {
        const clean = {};
        for (const L of 'ABCD') if (upperChoices[L] !== undefined && upperChoices[L] !== null) clean[L] = String(upperChoices[L]);
        if (Object.keys(clean).length !== 4 || Object.values(clean).some(x => !x.trim())) { errors.push(`${where}: multiple choice needs four non-empty choices A–D — skipped.`); return; }
        q.choices = clean;
        let ans = q.correct_answer.toUpperCase().replace(/^\(?([ABCD])[).:]?(\s.*)?$/, '$1');
        if (!'ABCD'.includes(ans) || ans.length !== 1) {
          // Answer given as option text instead of letter
          const byText = Object.entries(clean).find(([, v]) => v.trim() === q.correct_answer);
          if (byText) { ans = byText[0]; warnings.push(`${id}: correct_answer was option text; converted to “${ans}”.`); }
          else { errors.push(`${where}: correct_answer must be A, B, C or D — skipped.`); return; }
        }
        q.correct_answer = ans;
        if (new Set(Object.values(clean).map(v => v.trim())).size < 4) warnings.push(`${id}: two or more answer choices are identical.`);
      } else {
        q.choices = null;
        if (!q.correct_answer && !q.accepted_answers.length) { errors.push(`${where}: numeric response needs correct_answer — skipped.`); return; }
        if (!q.correct_answer) q.correct_answer = q.accepted_answers[0];
        if (!SPS.grading.isNumeric(q.correct_answer)) warnings.push(`${id}: student-produced answer “${q.correct_answer}” is not a plain number; only exact text matches will be graded correct.`);
      }
      if (!Object.values(q.explanation).some(Boolean)) q._noExplanation = true;
      questions.push(q);
    });

    if (!questions.length) {
      const why = errors.length ? ' ' + errors.slice(0, 3).join(' ') : '';
      throw new Error('No valid questions found. Expected a “questions” array.' + why);
    }

    // Drop patterns with no questions, but remember them for the report
    const counts = {};
    for (const q of questions) counts[q.pattern_id] = (counts[q.pattern_id] || 0) + 1;
    const finalPatterns = [...patterns.values()].filter(p => counts[p.id]);
    for (const p of patterns.values()) {
      const n = counts[p.id] || 0;
      if (p.expected_question_count && n !== p.expected_question_count) warnings.push(`${p.id} “${p.name}”: ${n} of ${p.expected_question_count} expected questions.`);
    }
    const noExp = questions.filter(q => q._noExplanation).length;
    if (noExp) warnings.push(`${noExp} question(s) have no explanation; review will show the answer only.`);
    questions.forEach(q => delete q._noExplanation);

    const key = opts.key || bankKey(metadata, opts.filename);
    metadata.id = key;
    for (const q of questions) q.uid = key + '::' + q.id;
    for (const p of finalPatterns) p.uid = key + '::' + p.id;

    return {
      key, metadata, patterns: finalPatterns, questions,
      report: { errors, warnings, total: rawQuestions.length, valid: questions.length }
    };
  }

  function bankKey(metadata, filename) {
    const base = metadata.id || metadata.title || filename || 'bank';
    return taxonomy.slug(base).slice(0, 48) || 'bank';
  }

  /** Entire pipeline from files' text. files: [{name, text}] */
  function importFiles(files, opts = {}) {
    const raws = files.map(f => {
      try { return parseText(f.name, f.text); }
      catch (e) { throw new Error(`${f.name}: ${e.message}`); }
    });
    const raw = raws.length === 1 ? raws[0] : mergeRaw(raws);
    return normalize(raw, { filename: files[0]?.name, ...opts });
  }

  /** Serialize a normalized bank back to the canonical JSON contract. */
  function toCanonical(bank) {
    const strip = p => { const c = { ...p }; for (const k of ['uid', 'sectionId', 'sectionName', 'domainId', 'domainName', 'skillName', 'skillId']) delete c[k]; return c; };
    return {
      metadata: bank.metadata,
      patterns: bank.patterns.map(p => ({ ...strip(p), section: p.sectionId, domain: p.domainName, skill: p.skillName })),
      questions: bank.questions.map(q => {
        const c = { ...q }; delete c.uid; delete c.level;
        if (!c.passage) delete c.passage; if (!c.passages?.length) delete c.passages;
        if (!c.tolerance) delete c.tolerance; if (!c.choices) delete c.choices;
        return c;
      })
    };
  }

  SPS.parser = { BANDS, BAND_NAMES, LEVEL_OF, band, parseText, parseDelimited, extractJson, mergeRaw, normalize, importFiles, toCanonical };
})(window.SPS = window.SPS || {});
