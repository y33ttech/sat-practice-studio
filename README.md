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

## CI/CD and updating the site

`.github/workflows/pages.yml` runs on every pull request and every push:

| Job | When | What it does |
|---|---|---|
| **Checks** | PRs and pushes | `node --check` on every script; smoke tests (import every bank, grade every answer key, render every figure, build every prompt, verify `banks/index.json` and `index.html` references); CLI validation of each bank; fails if `prompts/` is stale |
| **Build** | pushes to `main` | Copies the site to `_site`, writes the commit and date into `js/version.js`, and adds `?v=<commit>` to every script and stylesheet URL so browsers never mix old and new files after a deploy |
| **Deploy** | after Build | Publishes to GitHub Pages, then fetches the live site and fails if it isn't serving the new commit |

Dependabot (`.github/dependabot.yml`) opens a PR each month when the Actions it uses have updates.

**Typical update flow**

```bash
git checkout -b my-change
# edit js/… or add banks/new-bank.json (+ an entry in banks/index.json)
node tools/smoke_test.js        # same checks CI runs
node tools/build_prompts.js     # only if you changed js/prompt.js or js/taxonomy.js
git commit -am "…" && git push -u origin my-change   # open a PR → Checks run
# merge the PR → site redeploys automatically
```

Users' saved data survives updates. Banks are stored in their canonical form and re-normalized by the current code on every load, and the storage keys are versioned (`sps.*.v1`). The deployed version is shown at the bottom of the Guide page.

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
| `prompts/` | Static prompt for every skill × SAT level, mirroring the PDF folders (`node tools/build_prompts.js`) |
| `schema/question-bank.schema.json` | JSON Schema of the bank format |
| `examples/` | CSV example |
| `tools/` | `validate.js` (CLI validator/merger), `smoke_test.js`, `build_prompts.js` |

## Question bank format (summary)

```json
{
  "metadata": { "id": "math-circles-medium", "title": "SAT Math — Circles (Medium)", "section": "math", "sat_difficulty": "medium",
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
- **Difficulty has two levels.** `sat_difficulty` is the official SAT level of the source batch (`easy` / `medium` / `hard`, i.e. which `math/<level>/<skill>/` folder the PDFs came from), usually set once in `metadata`. `difficulty` is the position *within* that level (`easy` / `medium` / `hard`; the 5-step scale and `hard-very-hard` also work). Questions are ordered globally Easy·easy → … → Hard·hard. Banks without a level are assumed Medium and can be corrected in *Manage banks*.
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
