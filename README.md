# SAT Practice Studio

A **static, browser-only** SAT practice platform with a question-generation pipeline.

1. **Generate**: build a prompt for any Digital SAT skill, run it in any LLM (ChatGPT, Claude, Gemini…), optionally attaching the official practice PDFs for that skill.
2. **Validate & merge**: drop the LLM's replies into the site. They're merged, checked, and turned into one bank. A *repair prompt* is generated for anything broken.
3. **Practise**: browse Section → Domain → Skill → Pattern, filter by difficulty and by new, missed, or flagged questions, and practise in check-as-you-go or test mode.
4. **Keep progress locally**: progress is saved in local storage with a cookie mirror, and you can download or upload a progress file to back it up or move devices.

No backend, no accounts, no build step. Everything runs from plain HTML/CSS/JS, so it deploys to GitHub Pages as-is.

> Unofficial practice tool. SAT® is a trademark of the College Board, which is not affiliated with this project. Generated questions are original; the official PDFs are only used as reference input to the LLM and are **not** part of this repository.

## Run locally

```bash
python -m http.server 8000
```

Open <http://localhost:8000>. Opening `index.html` directly also works, but browsers block cookies and `fetch` on `file://`, so example banks and the cookie mirror only work over http(s).

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository (default branch `main`).
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs the smoke tests and publishes the site (`.github/workflows/pages.yml`). It will be at `https://<user>.github.io/<repo>/`.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | Single-page app shell and styles (light/dark) |
| `js/taxonomy.js` | Digital SAT sections → domains → skills; maps free-text skill names onto it |
| `js/parser.js` | Import pipeline: JSON / JSONL / CSV / TSV, lenient with LLM output, merge, validate, normalize |
| `js/grading.js` | Answer checking (SAT grid-in rules) and a safe expression evaluator (calculator, graph curves) |
| `js/visuals.js` | Renders declarative figures: tables, coordinate planes and curves, scatterplots, bar/line charts, geometry |
| `js/storage.js` | IndexedDB bank library, progress (localStorage + cookie mirror), progress file import/export |
| `js/prompt.js` | Prompt builder: main prompt, follow-up batch prompts, repair prompts |
| `js/app.js`, `js/guide.js` | Views: Library, session player, results, Generate, Progress, Guide |
| `banks/` | Example banks listed in `banks/index.json` (includes the 1,050-question Area & Volume bank) |
| `prompts/` | Static copy of the prompt for every skill (`node tools/build_prompts.js`) |
| `schema/question-bank.schema.json` | JSON Schema of the bank format |
| `examples/` | CSV example |
| `tools/` | `validate.js` (CLI validator/merger), `smoke_test.js`, `build_prompts.js` |

## Question bank format (summary)

```json
{
  "metadata": { "id": "math-circles", "title": "SAT Math — Circles", "section": "math",
                "domain": "Geometry and Trigonometry", "skill": "Circles" },
  "patterns": [ { "id": "P01", "name": "Arc length from central angle", "recognition": "…" } ],
  "questions": [
    { "id": "P01-Q001", "pattern_id": "P01", "number_in_pattern": 1, "difficulty": "easy",
      "type": "mcq", "stem": "…$\\frac{\\pi}{3}$…", "choices": {"A":"…","B":"…","C":"…","D":"…"},
      "correct_answer": "B", "explanation": { "fast_method": "…" }, "visual": null }
  ]
}
```

- `type`: `mcq` (A–D) or `spr` (numeric; fractions and decimals are compared numerically).
- Reading & Writing items use `passage` (or `passages` for cross-text pairs). Light markup is supported: `**bold**`, `*italic*`, `__underline__`, `- ` bullets.
- `visual`: `table`, `coordinate_plane` (lines, `curves` with `fn`, points, segments, circles, polygons), `scatter`, `bar_chart`, `histogram`, `line_chart`, `geometry`, `image`.
- Difficulty: `easy`, `easy-medium`, `medium`, `medium-hard`, `hard`. The old `hard-very-hard` is accepted too.
- Progress is keyed by `metadata.id` + question `id`. Keep both stable when you re-import an updated bank.

The full reference is on the **Guide** page and in `schema/`.

## Command-line tools (Node 18+)

```bash
node tools/validate.js catalog.json P01.json P02.json --out merged.json   # same rules as the site
node tools/smoke_test.js                                                  # import every bundled bank, grade every key, render every figure
node tools/build_prompts.js                                               # regenerate prompts/
```

## How progress is stored

| Where | What | Notes |
|---|---|---|
| IndexedDB | Question banks | Per browser. Never uploaded. |
| localStorage | Every answer record: attempts, correct count, last result, flag, timestamp; session history | Main store |
| Cookies (`spsp_*`) | Compact mirror, 1 character per question per bank (last result, flag, attempts up to 7) | Capped at about 7 KB because cookies are sent with every request. Restores progress if localStorage is wiped. Scoped to the site path. |
| Progress file | `sat-progress-YYYY-MM-DD.json` | Download/upload on the Progress page or with the **Backup** button. Merge or replace. |
