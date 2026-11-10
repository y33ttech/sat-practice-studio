#!/usr/bin/env node
/* Regenerates prompts/<section>/<skill>.md from js/prompt.js so the static prompt files
   always match the in-app builder. Run: node tools/build_prompts.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const window = {};
const ctx = vm.createContext({ window, console, Intl, document: { getElementById: () => null } });
for (const f of ['util', 'taxonomy', 'grading', 'visuals', 'parser', 'prompt']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx);
const S = window.SPS;
const outDir = path.join(root, 'prompts');
fs.rmSync(outDir, { recursive: true, force: true });
const index = ['# Generation prompts', '', 'One ready-to-use prompt per Digital SAT skill (JSON output, 20 questions per pattern, source PDFs attached).', 'For other settings, use the builder on the **Generate** page of the site — these files are produced by the same code (`node tools/build_prompts.js`).', ''];
for (const sec of S.taxonomy.sections) {
  index.push(`## ${sec.name}`, '');
  fs.mkdirSync(path.join(outDir, sec.id), { recursive: true });
  for (const d of sec.domains) for (const skill of d.skills) {
    const o = S.prompt.finalize({ ...S.prompt.defaults(sec.id), domain: d.name, skill });
    const file = `${sec.id}/${S.taxonomy.slug(skill)}.md`;
    fs.writeFileSync(path.join(outDir, file), S.prompt.buildMain(o) + '\n');
    index.push(`- **${d.name}** → [${skill}](${file})`);
  }
  index.push('');
}
fs.writeFileSync(path.join(outDir, 'README.md'), index.join('\n'));
console.log('Wrote prompts for', S.taxonomy.sections.reduce((n, s) => n + s.domains.reduce((m, d) => m + d.skills.length, 0), 0), 'skills');
