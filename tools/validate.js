#!/usr/bin/env node
/* Validate (and optionally merge) LLM-generated question files with exactly the same rules
   the website uses.

   node tools/validate.js bank.json
   node tools/validate.js catalog.json P01.json P02.json --out merged.json
   node tools/validate.js bank.json --strict        # warnings also fail (exit 1)  */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out'), out = outIdx > -1 ? args.splice(outIdx, 2)[1] : null;
const strict = args.includes('--strict'), files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.log('Usage: node tools/validate.js <files...> [--out merged.json] [--strict]'); process.exit(2); }

const window = {};
const ctx = vm.createContext({ window, console, Intl, document: { getElementById: () => null } });
for (const f of ['util', 'taxonomy', 'grading', 'visuals', 'parser']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx);
const { parser, grading, visuals } = window.SPS;

let bank;
try { bank = parser.importFiles(files.map(f => ({ name: path.basename(f), text: fs.readFileSync(f, 'utf8') }))); }
catch (e) { console.error('✕ ' + e.message); process.exit(1); }

const figErrors = [];
for (const q of bank.questions) {
  if (q.visual) { const h = visuals.render(q.visual); if (!h || h.includes('figure-missing')) figErrors.push(`${q.id}: figure “${q.visual.type}” could not be drawn`); }
  if (!grading.grade(q, q.correct_answer)) figErrors.push(`${q.id}: correct_answer does not grade as correct`);
}
const r = bank.report;
r.errors.push(...figErrors);

console.log(`${bank.metadata.title}  [${bank.key}]`);
console.log(`${r.valid}/${r.total} valid questions, ${bank.patterns.length} patterns\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('ID', 8) + pad('Pattern', 46) + pad('Skill', 30) + 'E  M  H  SPR  Total');
for (const p of bank.patterns) {
  const qs = bank.questions.filter(q => q.pattern_id === p.id);
  const c = l => String(qs.filter(q => q.level === l).length).padEnd(3);
  console.log(pad(p.id, 8) + pad(p.name.slice(0, 44), 46) + pad(p.skillName.slice(0, 28), 30) + c('easy') + c('medium') + c('hard') + pad(qs.filter(q => q.type === 'spr').length, 5) + qs.length + (p.expected_question_count ? '/' + p.expected_question_count : ''));
}
if (r.errors.length) { console.log(`\n✕ ${r.errors.length} error(s):`); r.errors.forEach(e => console.log('  - ' + e)); }
if (r.warnings.length) { console.log(`\n! ${r.warnings.length} warning(s):`); r.warnings.forEach(e => console.log('  - ' + e)); }
if (out) { fs.writeFileSync(out, JSON.stringify(parser.toCanonical(bank), null, 1)); console.log(`\nMerged bank written to ${out}`); }
const fail = r.errors.length || (strict && r.warnings.length);
console.log(fail ? '\nFAILED' : '\nOK');
process.exit(fail ? 1 : 0);
