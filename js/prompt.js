/* Prompt builder for the question-generation pipeline.
   Produces (1) a main generation prompt, (2) follow-up batch prompts, and (3) repair prompts
   from validator output. The JSON contract in here must stay in sync with parser.js. */
(function (SPS) {
  'use strict';
  const { taxonomy } = SPS;

  const DIFF_PLANS = {
    five: { label: '5 progressive bands', bands: ['easy', 'easy-medium', 'medium', 'medium-hard', 'hard'] },
    three: { label: '3 levels (easy / medium / hard)', bands: ['easy', 'medium', 'hard'] }
  };

  function difficultyTable(per, plan) {
    const bands = DIFF_PLANS[plan].bands, size = Math.floor(per / bands.length), rows = [];
    let start = 1;
    bands.forEach((b, i) => {
      const n = i === bands.length - 1 ? per - size * (bands.length - 1) : size;
      rows.push(`| ${start}–${start + n - 1} | \`${b}\` | ${n} |`);
      start += n;
    });
    return `| number_in_pattern | difficulty | count |\n|---|---|---:|\n${rows.join('\n')}`;
  }

  function mathVisualSpec() {
    return `### Visuals (the app draws these itself — never use TikZ, HTML, or ASCII art)
Use \`"visual": null\` when no figure is needed. Otherwise use exactly one of:

- Table: \`{"type":"table","headers":["x","f(x)"],"rows":[["0","3"],["2","7"]],"caption":"optional"}\`
- Coordinate plane: \`{"type":"coordinate_plane","x_min":-10,"x_max":10,"y_min":-10,"y_max":10,"x_step":1,"y_step":1,"lines":[{"m":2,"b":1}],"curves":[{"fn":"x^2-4x+3","label":"y = f(x)"}],"points":[{"x":1,"y":3,"label":"A"}],"segments":[{"x1":0,"y1":0,"x2":3,"y2":4}],"circles":[{"cx":0,"cy":0,"r":5}],"polygons":[{"points":[[0,0],[4,0],[4,3]]}]}\` — include only the keys you need. \`fn\` is an expression in x using + - * / ^ ( ) sqrt abs sin cos tan ln log exp pi. Vertical line: \`{"x":3}\`.
- Scatterplot: \`{"type":"scatter","x_label":"Hours","y_label":"Score","points":[[1,52],[2,60],[3,71]],"best_fit":{"m":9.5,"b":42}}\`
- Bar chart / histogram: \`{"type":"bar_chart","categories":["A","B","C"],"values":[12,7,9],"x_label":"…","y_label":"…"}\` (use \`"type":"histogram"\` for touching bars; use \`"series":[{"name":"2023","values":[…]},…]\` for grouped bars)
- Line graph: \`{"type":"line_chart","categories":["Mon","Tue","Wed"],"values":[3,5,4]}\`
- Geometry (schematic, not to scale): \`{"type":"geometry","shape":"cylinder","labels":{"radius":"5 cm","height":"8 cm"}}\`. Allowed shapes: ${SPS.visuals.SHAPES.join(', ')}. Label keys: edge, length, width, height, radius, diameter, base, side1, side2, hypotenuse, leg1, leg2, angle, A, B, C, base1, base2, angle1…angle4.
- Image: \`{"type":"image","src":"https://…","alt":"…"}\` — only when nothing above can show the figure.

The stem must still contain every number a student needs, unless reading the figure IS the skill being tested — in that case the figure must contain the data exactly.`;
  }

  function rwSpec() {
    return `### Reading & Writing fields
- \`passage\`: the short text (25–150 words, like the Digital SAT). Use \`______\` (six underscores) for the blank in Words in Context, Transitions, Boundaries and Form/Structure/Sense items. Light formatting is allowed: \`**bold**\`, \`*italic*\` (titles), \`__underlined__\`, and lines starting with \`- \` for the bulleted notes in Rhetorical Synthesis.
- \`passages\`: for Cross-Text Connections use \`[{"label":"Text 1","text":"…"},{"label":"Text 2","text":"…"}]\` instead of \`passage\`.
- \`stem\`: the question line only, e.g. "Which choice completes the text with the most logical and precise word or phrase?"
- Every R&W item is \`"type":"mcq"\` with four choices.
- For Command of Evidence (quantitative), add a \`table\` or \`bar_chart\`/\`line_chart\` visual using the formats below.
- Do NOT use \`$\` for money in R&W text; write "USD 5" or "5 dollars" (the dollar sign is reserved for math notation).
- \`explanation\`: \`{"rationale":"why the answer is right","distractors":"why each wrong choice fails","pattern_tip":"how to recognize this pattern quickly"}\`

${mathVisualSpec().split('\n').slice(0, 1).join('\n')}
- Table: \`{"type":"table","headers":["Year","Sales"],"rows":[["2019","1,200"]],"caption":"optional"}\`
- Bar chart: \`{"type":"bar_chart","categories":["A","B"],"values":[12,7],"x_label":"…","y_label":"…"}\`
- Line graph: \`{"type":"line_chart","categories":["2018","2019"],"series":[{"name":"City A","values":[3,5]}]}\``;
  }

  function exampleQuestion(section, bankId) {
    if (section === 'rw') {
      return {
        id: 'P01-Q001', pattern_id: 'P01', number_in_pattern: 1, difficulty: 'easy', type: 'mcq',
        passage: 'Marine biologist Ayana Okafor found that young reef fish rely on the sound of a healthy reef to navigate. When recordings of degraded reefs were played, fewer larvae settled nearby, a result that ______ the idea that reef noise acts as a homing signal.',
        stem: 'Which choice completes the text with the most logical and precise word or phrase?',
        choices: { A: 'supports', B: 'disguises', C: 'postpones', D: 'imitates' },
        correct_answer: 'A',
        explanation: { rationale: 'Fewer larvae settling near quieter reefs is evidence for the idea, so it “supports” it.', distractors: 'B, C and D do not describe how evidence relates to a claim.', pattern_tip: 'Predict your own word for the blank from the logic of the sentence before reading the choices.' },
        visual: null
      };
    }
    return {
      id: 'P01-Q001', pattern_id: 'P01', number_in_pattern: 1, difficulty: 'easy', type: 'mcq',
      stem: 'A cube-shaped container has no lid. Each edge is $4$ cm long. What is the total area of its five outside faces, in square centimeters?',
      choices: { A: '64', B: '80', C: '96', D: '16' },
      correct_answer: 'B', accepted_answers: [],
      explanation: { fast_method: 'Five faces, each $4^2=16$: $5(16)=80$.', hand_solution: '$A=5s^2=5(4^2)=80$.', desmos_method: 'Faster by hand.', pattern_tip: 'A lidless cube has five faces, not six.' },
      visual: { type: 'geometry', shape: 'open_cube', labels: { edge: '4 cm' } }
    };
  }

  function contract(o) {
    const isRW = o.section === 'rw';
    const meta = {
      id: o.bankId, title: o.title, section: o.section, domain: o.domain, skill: o.skill,
      description: `Original ${isRW ? 'Reading and Writing' : 'Math'} practice questions for ${o.skill}`,
      target_questions_per_pattern: o.perPattern, generated_by: 'LLM via SAT Practice Studio prompt', version: 1
    };
    const pattern = {
      id: 'P01', name: 'Short name of the recurring question pattern', section: o.section, domain: o.domain, skill: o.skill,
      recognition: 'How a student spots this pattern in under 10 seconds',
      ...(isRW ? {} : { formula: 'Key formula or relationship (TeX allowed)' }),
      skill_description: 'The exact thing the student must do',
      common_mistakes: ['Typical wrong move 1', 'Typical wrong move 2'],
      fastest_method: 'Fastest reliable approach',
      ...(isRW ? {} : { desmos_guidance: 'When/how Desmos helps, or "faster by hand"' }),
      source_ref: o.source === 'attached' ? 'Where in the attached source this pattern appears' : '',
      expected_question_count: o.perPattern
    };
    const json = JSON.stringify({ metadata: meta, patterns: [pattern], questions: [exampleQuestion(o.section)] }, null, 2);
    const fields = [
      '- `id`: globally unique within the bank, format `P01-Q001`.',
      '- `pattern_id`: must match an id in `patterns`.',
      `- \`number_in_pattern\`: 1–${o.perPattern}, each used exactly once per pattern.`,
      `- \`difficulty\`: one of ${DIFF_PLANS[o.diffPlan].bands.map(b => '`' + b + '`').join(', ')} (see table).`,
      isRW ? '- `type`: always `"mcq"`.' : '- `type`: `"mcq"` (four choices) or `"spr"` (student-produced numeric response).',
      '- `stem`: the question text. ' + (isRW ? 'Put the passage in `passage` / `passages`, not in `stem`.' : 'Use `$...$` for inline TeX and `$$...$$` for display math. In JSON every backslash is doubled: `"$\\\\frac{3}{4}$"`.'),
      '- `choices`: object with exactly the keys `A`, `B`, `C`, `D`; four distinct, plausible options' + (isRW ? '.' : '; omit for `spr`.'),
      '- `correct_answer`: the letter (`"B"`) for mcq — never the option text. ' + (isRW ? '' : 'For `spr`, a plain number string: `"12"`, `"-3/4"`, `"0.25"`. If the true answer involves π or a radical, ask for a numeric coefficient instead.'),
      ...(isRW ? [] : ['- `accepted_answers` (spr): equivalent forms, e.g. `["3/4","0.75"]`. Fractions and decimals are compared numerically.']),
      '- `explanation`: ' + (isRW ? '`rationale`, `distractors`, `pattern_tip`.' : '`fast_method`, `hand_solution`, `desmos_method`, `pattern_tip`. Hidden during test simulation.'),
      '- `visual`: `null` or one visual object (below).'
    ];
    return { json, fields: fields.join('\n') };
  }

  function buildMain(o) {
    const isRW = o.section === 'rw';
    const c = contract(o);
    const sectionName = isRW ? 'Reading and Writing' : 'Math';
    const patternLine = o.patternCount > 0
      ? `Identify exactly **${o.patternCount}** distinct question patterns for this skill.`
      : `Identify **every** distinct question pattern${o.source === 'attached' ? ' in the attached source' : ' that the Digital SAT uses for this skill'} (typically 4–15).`;
    const total = o.patternCount > 0 ? `${o.patternCount} × ${o.perPattern} = ${o.patternCount * o.perPattern} questions` : `(number of patterns) × ${o.perPattern} questions`;
    const sourceBlock = o.source === 'attached'
      ? `## Source material
I have attached official SAT practice questions for **${o.skill}** (for example the "No correct answers or explanations" and "With correct answers and explanations" PDFs, at ${o.levels.join('/')} difficulty). Use them ONLY to learn the patterns, style, difficulty, and wording conventions:
- Inspect every question, including figures, tables, and graphs (look at them visually; do not rely only on extracted text).
- Never copy a source question, passage, or sentence. Every generated item must be newly written with new numbers, contexts, and wording.
- Group source questions into a pattern only when the solving strategy is essentially the same. Do not split patterns just because the context or numbers change; do not merge different solving tasks just because they share a topic.`
      : `## Source material
No source file is attached. Base the patterns on your knowledge of how the Digital SAT (2024+) tests **${o.skill}**. Write fully original items in the style of the Digital SAT.`;

    return `# ROLE
You are an expert Digital SAT ${sectionName} item writer, editor, and structured-data engineer.

# GOAL
Create an original practice question bank for:
- Section: **${sectionName}**
- Domain: **${o.domain}**
- Skill: **${o.skill}**

The bank teaches students to recognize recurring question *patterns*: items that look different on the surface but are solved with the same strategy.

${sourceBlock}

## Patterns and counts
${patternLine}
Generate **exactly ${o.perPattern} questions per pattern** → ${total}.

Within every pattern, difficulty progresses as follows (it restarts for each pattern):

${difficultyTable(o.perPattern, o.diffPlan)}

Harder items should be ${isRW ? 'longer, denser, or more subtle versions of the *same* pattern (closer distractors, more complex syntax or vocabulary), not a different skill.' : 'better-disguised or multi-step versions of the *same* pattern, not unrelated mathematics.'}${isRW ? '' : ` Use roughly ${o.sprShare}% student-produced response (\`spr\`) items where the answer is a single number; the rest are four-option multiple choice.`}

# OUTPUT FORMAT — STRICT
${o.format === 'csv' ? csvSection(o) : o.format === 'jsonl' ? jsonlSection() : `Output **valid UTF-8 JSON only** — no Markdown fences, comments, trailing commas, or prose before/after. It must parse with \`JSON.parse\`.`}

${o.format === 'csv' ? '' : `Top-level structure (the question shown is a format example only — do not include it):

${c.json}
`}
## Field rules
${c.fields}

${isRW ? rwSpec() : mathVisualSpec()}

## Item-writing rules
1. Exactly one defensible correct answer; distractors reflect real student mistakes.
2. No answer leakage in the stem, choices, or pattern names.
3. ${isRW ? 'Passages are original, factual in tone, and cover varied subjects (science, history, social science, literature, arts).' : 'Numbers, units, figures, and explanations must agree. Verify every answer by solving it yourself.'}
4. Vary contexts, numbers, and representations — not just number swaps.
5. Keep language concise and natural, like the real Digital SAT.

# WORKFLOW — DO NOT OUTPUT EVERYTHING AT ONCE
${workflow(o)}

# SELF-CHECK BEFORE EACH OUTPUT
- Count: each pattern has exactly ${o.perPattern} items numbered 1–${o.perPattern}; difficulty counts match the table.
- Every mcq has A–D and a single-letter correct_answer${isRW ? '' : '; every spr answer is a plain number'}.
- IDs are unique; every pattern_id exists in \`patterns\`.
- ${isRW ? 'No `$` signs in passages.' : 'TeX is valid and backslashes are doubled for JSON.'}
- You actually solved each item and the key is right.
If you cannot finish within one reply, stop at a complete question object and say exactly where you stopped. Never invent a verification report.`;
  }

  function workflow(o) {
    const batch = o.batchSize;
    if (o.format === 'csv') return `1. First reply: list the patterns you identified (id, name, recognition, ${o.section === 'rw' ? '' : 'formula, '}common mistakes) as a short table, and wait.
2. Then output the CSV in batches of ${batch} rows per reply (header row only in the first batch). Continue when I say "continue".`;
    return `1. **Reply 1 — catalog only.** Output the JSON object with \`metadata\` and the complete \`patterns\` array, and \`"questions": []\`. Wait for me.
2. **Following replies — questions.** When I say "next", output a JSON **array** of the next ${batch} question objects (just the array), in order: P01 items 1–${batch}, then P01 items ${batch + 1}–${batch * 2}, … then P02, and so on.
3. I will save each reply as a separate file and merge them in SAT Practice Studio (Generate → Validate & merge), which checks counts, IDs, answers, and formats.`;
  }

  function csvSection(o) {
    return `Output **CSV only** (RFC 4180: quote any cell containing commas, quotes, or line breaks; double embedded quotes). One question per row with this exact header:

\`\`\`
id,pattern_id,pattern_name,section,domain,skill,number_in_pattern,difficulty,type,${o.section === 'rw' ? 'passage,' : ''}stem,option_a,option_b,option_c,option_d,correct_answer,accepted_answers_json,visual_json,${o.section === 'rw' ? 'rationale,pattern_tip' : 'fast_method,hand_solution,desmos_method,pattern_tip'}
\`\`\`
- \`accepted_answers_json\` and \`visual_json\` hold JSON text (e.g. \`["3/4","0.75"]\`), or are empty.
- spr rows leave option_a–option_d empty.`;
  }
  function jsonlSection() {
    return 'Output **JSON Lines**: one complete question object per line, nothing else. Every question must also carry `pattern_name`, `section`, `domain` and `skill` so the app can rebuild the pattern list.';
  }

  function buildBatch(o, b) {
    return `Continue the ${o.skill} bank. Output ONLY a JSON array of question objects for pattern **${b.pattern}**, \`number_in_pattern\` **${b.from}–${b.to}**, using the same contract as before (ids \`${b.pattern}-Q${String(b.from).padStart(3, '0')}\` … \`${b.pattern}-Q${String(b.to).padStart(3, '0')}\`). Follow the difficulty table exactly. Verify every answer before writing it. No prose, no code fences.`;
  }

  function buildRepair(report, fileHint) {
    const issues = [...(report.errors || []), ...(report.warnings || [])];
    return `The question bank${fileHint ? ` (${fileHint})` : ''} failed validation in SAT Practice Studio. Fix ONLY the items listed below and output them again as a JSON array of complete, corrected question objects (same ids). Re-solve each one and double-check the answer key. No prose, no code fences.

Validation messages:
${issues.slice(0, 80).map(x => '- ' + x).join('\n')}${issues.length > 80 ? `\n- …and ${issues.length - 80} more` : ''}

Rules reminder: mcq needs choices A–D and a single-letter correct_answer; spr correct_answer must be a plain number; ids must be unique; every pattern needs the required number of questions with number_in_pattern 1…N.`;
  }

  function defaults(section = 'math') {
    const sec = taxonomy.sections.find(s => s.id === section);
    const dom = sec.domains[0];
    return {
      section, domain: dom.name, skill: dom.skills[0], title: '', bankId: '',
      source: 'attached', levels: ['easy', 'medium', 'hard'], patternCount: 0, perPattern: 20,
      diffPlan: 'five', sprShare: 30, format: 'json', batchSize: 10
    };
  }
  function finalize(o) {
    const sec = o.section === 'rw' ? 'rw' : 'math';
    o.bankId = (o.bankId || `${sec}-${taxonomy.slug(o.skill)}`).slice(0, 48);
    o.title = o.title || `SAT ${sec === 'rw' ? 'R&W' : 'Math'} — ${o.skill}`;
    return o;
  }

  SPS.prompt = { DIFF_PLANS, defaults, finalize, buildMain, buildBatch, buildRepair };
})(window.SPS = window.SPS || {});
