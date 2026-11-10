/* In-app guide (static content). */
(function (SPS) {
  'use strict';
  const code = s => SPS.util.esc(s);
  SPS.guideHtml = () => `
<h1 class="h-page">Guide</h1>
<p class="lead">SAT Practice Studio is a static website. There is no server and no account. Question banks, answers, and progress stay in your browser, plus any files you choose to download.</p>

<nav class="toc"><a href="#/guide" data-jump="g-flow">How it works</a><a href="#/guide" data-jump="g-format">File format</a><a href="#/guide" data-jump="g-visuals">Figures</a><a href="#/guide" data-jump="g-progress">Progress &amp; privacy</a><a href="#/guide" data-jump="g-faq">FAQ</a></nav>

<h2 id="g-flow">How it works</h2>
<ol>
  <li><b>Pick a skill</b> on <a href="#/generate">Generate</a>. Skills follow the Digital SAT: Section → Domain → Skill (for example Math → Geometry and Trigonometry → Circles). The builder writes a full prompt with the exact JSON contract this app reads.</li>
  <li><b>Run it in any LLM</b> (ChatGPT, Claude, Gemini…). Attach the official practice PDFs for that skill if you have them (for example <code>math/medium/Circles/With correct answers and explanations.pdf</code>). The LLM learns the patterns from them but is told to write only original questions. The prompt asks for the pattern list first, then batches of questions, so long banks don't get cut off.</li>
  <li><b>Validate &amp; merge.</b> Drop every reply file (or paste each reply) into step 3 on the Generate page. They're merged into one bank and checked: counts per pattern and difficulty, duplicate IDs, answer keys, answer choices, and number formats. If anything's wrong, <i>Copy repair prompt</i> gives you a ready-made message to send back to the LLM.</li>
  <li><b>Practise.</b> Add the bank to your library and choose a section, domain, skill, or individual patterns. You can filter by SAT level and by difficulty within that level and by new, missed, or flagged questions, and run in practice mode (check each answer) or test mode (answers at the end).</li>
</ol>
<p>You can keep many banks at once, for example one per skill. Each one appears in the right place in the library tree.</p>

<h2 id="g-format">File format</h2>
<p>JSON is the main format. JSON Lines, CSV and TSV import too. The importer also accepts LLM replies with code fences or text around the JSON. One file can hold a whole bank, or just a pattern catalog, or just an array of questions. Use <i>Validate &amp; merge</i> to combine pieces.</p>
<pre><code>${code(`{
  "metadata": { "id": "math-circles", "title": "SAT Math — Circles",
                "section": "math", "domain": "Geometry and Trigonometry", "skill": "Circles",
                "target_questions_per_pattern": 20 },
  "patterns": [
    { "id": "P01", "name": "Arc length from central angle",
      "recognition": "Angle given in degrees or radians, asked for arc",
      "formula": "s = rθ", "common_mistakes": ["Using degrees in s = rθ"],
      "expected_question_count": 20 }
  ],
  "questions": [
    { "id": "P01-Q001", "pattern_id": "P01", "number_in_pattern": 1,
      "sat_difficulty": "medium", "difficulty": "easy", "type": "mcq",
      "stem": "A circle has radius $6$. What is the length of an arc with central angle $\\\\frac{\\\\pi}{3}$?",
      "choices": { "A": "$\\\\pi$", "B": "$2\\\\pi$", "C": "$3\\\\pi$", "D": "$6\\\\pi$" },
      "correct_answer": "B",
      "explanation": { "fast_method": "$s=r\\\\theta=6\\\\cdot\\\\frac{\\\\pi}{3}=2\\\\pi$" },
      "visual": null }
  ]
}`)}</code></pre>
<table class="data-table compact">
<thead><tr><th>Field</th><th>Required</th><th>Notes</th></tr></thead><tbody>
<tr><td><code>metadata.id</code></td><td>recommended</td><td>Stable bank id. Progress is linked to <code>bank id + question id</code>, so keep it the same when you re-import an updated bank.</td></tr>
<tr><td><code>metadata.section / domain / skill</code></td><td>recommended</td><td>Where the bank goes in the library. Patterns can override them. Unknown names go under “Custom topics”.</td></tr>
<tr><td><code>id</code></td><td>yes</td><td>Unique within the bank, e.g. <code>P03-Q017</code>.</td></tr>
<tr><td><code>pattern_id</code></td><td>yes</td><td>Matches <code>patterns[].id</code>. Missing patterns are created automatically.</td></tr>
<tr><td><code>type</code></td><td>yes</td><td><code>mcq</code> (A–D) or <code>spr</code> (student-produced numeric response).</td></tr>
<tr><td><code>stem</code></td><td>yes</td><td>Question text. Math uses <code>$…$</code> TeX (double the backslashes in JSON).</td></tr>
<tr><td><code>passage</code> / <code>passages</code></td><td>R&amp;W</td><td>Passage text, or <code>[{"label":"Text 1","text":"…"}, …]</code> for cross-text questions. Supports <code>**bold**</code>, <code>*italic*</code>, <code>__underline__</code>, and “- ” bullets.</td></tr>
<tr><td><code>choices</code></td><td>mcq</td><td><code>{"A":…,"B":…,"C":…,"D":…}</code></td></tr>
<tr><td><code>correct_answer</code></td><td>yes</td><td>The letter for mcq. A number for spr (<code>"3/4"</code>, <code>"-2"</code>, <code>".25"</code>).</td></tr>
<tr><td><code>accepted_answers</code></td><td>no</td><td>Other accepted spr forms. Fractions and decimals are compared numerically, and truncated or rounded repeating decimals are accepted as on the SAT.</td></tr>
<tr><td><code>sat_difficulty</code></td><td>recommended</td><td>The <b>official SAT level</b> of the source batch: <code>easy</code>, <code>medium</code> or <code>hard</code> (the folder the PDFs came from, e.g. <code>math/medium/…</code>). Usually set once in <code>metadata</code>. Missing levels are assumed Medium; fix them in <i>Library → Manage banks</i>.</td></tr>
<tr><td><code>difficulty</code></td><td>no</td><td>Position <b>within</b> that SAT level: <code>easy</code>, <code>medium</code>, <code>hard</code> (5-step <code>easy-medium</code> / <code>medium-hard</code> also work). A <i>Medium · hard</i> question is the hard end of the SAT Medium level, still easier than a <i>Hard · easy</i> one.</td></tr>
<tr><td><code>explanation</code></td><td>no</td><td>Any of <code>fast_method</code>, <code>hand_solution</code>, <code>desmos_method</code>, <code>rationale</code>, <code>distractors</code>, <code>pattern_tip</code>.</td></tr>
<tr><td><code>visual</code></td><td>no</td><td>A figure object (see below) or <code>null</code>.</td></tr>
</tbody></table>
<p><b>CSV header:</b></p>
<pre><code>id,pattern_id,pattern_name,section,domain,skill,number_in_pattern,difficulty,type,passage,stem,option_a,option_b,option_c,option_d,correct_answer,accepted_answers_json,visual_json,fast_method,hand_solution,desmos_method,rationale,pattern_tip</code></pre>
<p>The full machine-readable contract is in <a href="schema/question-bank.schema.json" target="_blank" rel="noopener">schema/question-bank.schema.json</a>.</p>

<h2 id="g-visuals">Figures</h2>
<p>The app draws figures from small JSON descriptions, so the LLM never has to make an image:</p>
<ul>
<li><code>table</code>: <code>headers</code>, <code>rows</code></li>
<li><code>coordinate_plane</code>: <code>lines</code> (<code>m</code>, <code>b</code>), <code>curves</code> (<code>fn</code>: an expression in x such as <code>"x^2-4x+3"</code>), <code>points</code>, <code>segments</code>, <code>circles</code>, <code>polygons</code></li>
<li><code>scatter</code>: <code>points</code>, optional <code>best_fit</code></li>
<li><code>bar_chart</code> / <code>histogram</code> / <code>line_chart</code>: <code>categories</code> and <code>values</code>, or <code>series</code></li>
<li><code>geometry</code>: schematic shapes with <code>labels</code> (${SPS.visuals.SHAPES.join(', ')})</li>
<li><code>image</code>: an https or base64 image, when nothing else works</li>
</ul>

<h2 id="g-progress">Progress &amp; privacy</h2>
<ul>
<li><b>Banks</b> are kept in your browser's IndexedDB. They're never uploaded.</li>
<li><b>Progress</b> (attempts, latest result, flags) is saved in local storage. A compact copy is also saved in <b>cookies</b>: one character per question, scoped to this site's path. Cookies are sent with every page request, so that copy is capped at about 7 KB and covers your most recently practised banks first.</li>
<li><b>Progress file.</b> Use <i>Backup</i> (top right) or the Progress page to download <code>sat-progress-YYYY-MM-DD.json</code>. Load it on another browser or device to merge or restore. The dot next to Backup turns amber when you have answers that aren't in a downloaded file yet.</li>
<li>Clearing site data in your browser deletes the banks and progress kept there. Keep your bank files and progress file safe.</li>
</ul>

<h2 id="g-faq">FAQ</h2>
<p><b>Can I upload the College Board PDFs directly?</b> No. PDFs are input for the LLM, not for the app. Layout-heavy math PDFs don't survive automatic extraction, and the goal is original practice questions.</p>
<p><b>The LLM stopped halfway.</b> Say “continue”, or use <i>Follow-up prompt for a specific batch</i> on the Generate page. Save each reply separately and merge them.</p>
<p><b>Is the answer key guaranteed correct?</b> No. The validator checks structure, not math. The prompt asks the LLM to solve every item, but you should still spot-check, especially the hard ones.</p>
<p><b>Keyboard shortcuts</b> during a session: <kbd>A</kbd>–<kbd>D</kbd> choose, <kbd>←</kbd>/<kbd>→</kbd> move between questions, <kbd>F</kbd> flag, <kbd>Enter</kbd> check (practice mode).</p>
<p class="small muted">Version ${code((window.SPS_VERSION || {}).commit || 'dev')}${(window.SPS_VERSION || {}).built ? ' · built ' + code(window.SPS_VERSION.built) : ''}</p>
<p class="small muted">SAT® is a trademark registered by the College Board, which is not affiliated with and does not endorse this site. This is an independent practice tool.</p>`;

  document.addEventListener('click', e => {
    const j = e.target.closest('[data-jump]'); if (!j) return;
    e.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth' });
  });
})(window.SPS = window.SPS || {});
