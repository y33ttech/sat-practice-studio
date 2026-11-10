#!/usr/bin/env node
/* Regenerates prompts/<section>/<sat-level>/<skill>.md from js/prompt.js so the static prompt
   files always match the in-app builder. Folder layout mirrors the source PDFs
   (math/easy/Circles/…). Run: node tools/build_prompts.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const window = {};
const ctx = vm.createContext({ window, console, Intl, document: { getElementById: () => null } });
for (const f of ['util', 'taxonomy', 'grading', 'visuals', 'parser', 'prompt']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx);
const S = window.SPS;
const LEVELS = ['easy', 'medium', 'hard'];
const outDir = path.join(root, 'prompts');
fs.rmSync(outDir, { recursive: true, force: true });
const index = [
  '# Generation prompts', '',
  'One ready-to-use prompt per Digital SAT skill **and SAT difficulty level**, matching the source PDF folders (`math/easy/<skill>/`, `math/medium/<skill>/`, …).',
  'Each prompt asks for JSON, 30 questions per pattern, spread easy / medium / hard *within* that SAT level, with the source PDFs attached.', '',
  'For other settings, use the builder on the **Generate** page of the site. These files come from the same code (`node tools/build_prompts.js`).', ''
];
let count = 0;
for (const sec of S.taxonomy.sections) {
  index.push(`## ${sec.name}`, '', '| Domain | Skill | SAT Easy | SAT Medium | SAT Hard |', '|---|---|---|---|---|');
  for (const lvl of LEVELS) fs.mkdirSync(path.join(outDir, sec.id, lvl), { recursive: true });
  for (const d of sec.domains) for (const skill of d.skills) {
    const links = LEVELS.map(lvl => {
      const o = S.prompt.finalize({ ...S.prompt.defaults(sec.id), domain: d.name, skill, satLevel: lvl });
      const file = `${sec.id}/${lvl}/${S.taxonomy.slug(skill)}.md`;
      fs.writeFileSync(path.join(outDir, file), S.prompt.buildMain(o) + '\n');
      count++;
      return `[prompt](${file})`;
    });
    index.push(`| ${d.name} | ${skill} | ${links.join(' | ')} |`);
  }
  index.push('');
}
fs.writeFileSync(path.join(outDir, 'README.md'), index.join('\n'));
console.log(`Wrote ${count} prompts (every skill × easy/medium/hard)`);
