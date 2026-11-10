#!/usr/bin/env node
/* Headless checks for the non-DOM modules: parser, grading, visuals, prompt builder.
   Usage: node tools/smoke_test.js [extra-bank-files...] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const window = {};
const ctx = vm.createContext({ window, console, Intl, setTimeout, clearTimeout, document: { getElementById: () => null } });
for (const f of ['util', 'taxonomy', 'grading', 'visuals', 'parser', 'prompt']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
const S = window.SPS;
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } };

// 1. Every bundled bank imports cleanly, all answer keys grade, all figures render
const files = fs.readdirSync(path.join(root, 'banks')).filter(f => /\.(json|csv)$/.test(f) && f !== 'index.json');
files.push(...process.argv.slice(2));
for (const f of files) {
  const p = fs.existsSync(f) ? f : path.join(root, 'banks', f);
  const bank = S.parser.importFiles([{ name: path.basename(p), text: fs.readFileSync(p, 'utf8') }]);
  check(bank.report.errors.length === 0, `${f}: import errors ${bank.report.errors.slice(0, 3).join(' | ')}`);
  for (const q of bank.questions) {
    check(S.grading.grade(q, q.correct_answer), `${f} ${q.id}: own answer key does not grade correct`);
    if (q.type === 'mcq') check(!S.grading.grade(q, { A: 'B', B: 'C', C: 'D', D: 'A' }[q.correct_answer]), `${f} ${q.id}: wrong answer graded correct`);
    if (q.visual) { const html = S.visuals.render(q.visual); check(html.includes('figure-card') && !html.includes('figure-missing'), `${f} ${q.id}: figure failed (${q.visual.type})`); }
  }
  const unknown = bank.patterns.filter(p => p.domainId === 'custom').map(p => p.id);
  check(!unknown.length, `${f}: patterns not mapped to SAT taxonomy: ${unknown.join(', ')}`);
  console.log(`ok  ${f}: ${bank.questions.length} questions, ${bank.patterns.length} patterns → ${[...new Set(bank.patterns.map(p => p.skillName))].join('; ')}${bank.report.warnings.length ? ` (${bank.report.warnings.length} warnings)` : ''}`);
}

// 1b. banks/index.json lists real files whose ids match
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'banks', 'index.json'), 'utf8')).banks;
for (const m of manifest) {
  const p = path.join(root, 'banks', m.file);
  if (!fs.existsSync(p)) { check(false, `banks/index.json: missing file ${m.file}`); continue; }
  const b = S.parser.importFiles([{ name: m.file, text: fs.readFileSync(p, 'utf8') }]);
  check(b.key === m.id, `banks/index.json: id “${m.id}” ≠ bank key “${b.key}” (the Add button would not show “Added”)`);
}

// 1c. index.html references only files that exist
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="((?:js|css|assets)\/[^"?]+)/g)) check(fs.existsSync(path.join(root, ref)), `index.html references missing ${ref}`);

// 2. Lenient parsing of typical LLM output
const fenced = 'Sure! Here is the batch:\n```json\n[{"id":"P01-Q001","pattern_id":"P01","type":"mcq","stem":"x?","choices":{"A":"1","B":"2","C":"3","D":"4"},"correct_answer":"B",}]\n```\nLet me know!';
const b1 = S.parser.importFiles([{ name: 'reply.txt', text: fenced }]);
check(b1.questions.length === 1 && b1.questions[0].correct_answer === 'B', 'fenced JSON with trailing comma');
const textAnswer = S.parser.normalize({ questions: [{ id: 'a', stem: 's', choices: ['10', '20', '30', '40'], correct_answer: '30' }] });
check(textAnswer.questions[0].correct_answer === 'C', 'array choices + answer given as option text');
const merged = S.parser.normalize(S.parser.mergeRaw([
  { metadata: { id: 'm', skill: 'Circles' }, patterns: [{ id: 'P01', name: 'Arc length' }], questions: [] },
  [{ id: 'P01-Q001', pattern_id: 'P01', type: 'spr', stem: 's', correct_answer: '3/4' }],
  [{ id: 'P01-Q002', pattern_id: 'P01', type: 'spr', stem: 't', correct_answer: '2' }]
]));
check(merged.questions.length === 2 && merged.patterns[0].skillName === 'Circles' && merged.patterns[0].domainName === 'Geometry and Trigonometry', 'merge catalog + batches, taxonomy mapping');
const bad = S.parser.normalize({ questions: [{ id: 'x', stem: 's', type: 'mcq', choices: { A: '1', B: '2' }, correct_answer: 'A' }, { id: 'y', stem: 't', type: 'spr', correct_answer: '1' }] });
check(bad.questions.length === 1 && bad.report.errors.length === 1, 'invalid items are skipped and reported');

// 3. Numeric grading (SAT grid-in rules)
const spr = a => ({ type: 'spr', correct_answer: a, accepted_answers: [], tolerance: 0 });
check(S.grading.grade(spr('2/3'), '.6666') && S.grading.grade(spr('2/3'), '.6667') && S.grading.grade(spr('2/3'), '2/3'), '2/3 accepts .6666, .6667');
check(!S.grading.grade(spr('2/3'), '.66') && !S.grading.grade(spr('2/3'), '0.67'), '2/3 rejects .66 and .67');
check(S.grading.grade(spr('3.5'), '7/2') && S.grading.grade(spr('-0.5'), '-1/2'), 'fraction/decimal equivalence');

// 4. Evaluator
for (const [e, v] of [['2+3*4', 14], ['2x^2-3', 15], ['(x-1)(x+1)', 8], ['sqrt(16)+pi', 4 + Math.PI], ['-2^2', -4], ['3pi', 3 * Math.PI], ['2^-1', 0.5]]) {
  let got; try { got = S.grading.evaluate(e, { x: 3 }); } catch (err) { got = err.message; }
  check(Math.abs(got - v) < 1e-9, `evaluate ${e} = ${v}, got ${got}`);
}

// 5. Prompt builder produces a complete prompt for every skill
let prompts = 0;
for (const sec of S.taxonomy.sections) for (const d of sec.domains) for (const skill of d.skills) {
  for (const format of ['json', 'csv']) {
    const o = S.prompt.finalize({ ...S.prompt.defaults(sec.id), domain: d.name, skill, format });
    const txt = S.prompt.buildMain(o);
    check(txt.includes(skill) && txt.includes('correct_answer') && txt.length > 3000, `prompt for ${skill} (${format})`);
    if (format === 'json') { const m = txt.match(/\n(\{\n  "metadata"[\s\S]*?\n\})\n/); check(m && JSON.parse(m[1]).questions.length === 1, `prompt example JSON parses for ${skill}`); }
    prompts++;
  }
}
console.log(`ok  ${prompts} prompts generated`);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nPASS: all smoke tests');
