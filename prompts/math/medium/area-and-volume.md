# ROLE
You are an expert Digital SAT Math item writer, editor, and structured-data engineer.

# GOAL
Create an original practice question bank for:
- Section: **Math**
- Domain: **Geometry and Trigonometry**
- Skill: **Area and volume**

The bank teaches students to recognize recurring question *patterns*: items that look different on the surface but are solved with the same strategy.

## Source material
I have attached official SAT practice questions for **Area and volume** (for example the "No correct answers or explanations" and "With correct answers and explanations" PDFs, from the **Medium** SAT difficulty level (the `math/medium/Area and volume/` folder)). Use them ONLY to learn the patterns, style, difficulty, and wording conventions:
- Inspect every question, including figures, tables, and graphs (look at them visually; do not rely only on extracted text).
- Never copy a source question, passage, or sentence. Every generated item must be newly written with new numbers, contexts, and wording.
- Group source questions into a pattern only when the solving strategy is essentially the same. Do not split patterns just because the context or numbers change; do not merge different solving tasks just because they share a topic.

## Patterns and counts
Identify **every** distinct question pattern in the attached source (typically 4–15).
Generate **exactly 30 questions per pattern** → (number of patterns) × 30 questions.

## Difficulty — two levels
1. **SAT level (`sat_difficulty`)** — every item in this bank is SAT **Medium** level, like the attached/reference questions. Match their real difficulty: Medium means two or three steps, some translation from context or a mild twist.
2. **Within-level difficulty (`difficulty`)** — the source batch still varies, so spread items across the lower, middle and upper part of the Medium level. Within every pattern it progresses as follows (it restarts for each pattern):

| number_in_pattern | difficulty | count |
|---|---|---:|
| 1–10 | `easy` | 10 |
| 11–20 | `medium` | 10 |
| 21–30 | `hard` | 10 |

An item labelled `easy` here is "Medium level, easier end" — never easier than the SAT level itself.

Harder items should be better-disguised or multi-step versions of the *same* pattern, not unrelated mathematics. Use roughly 30% student-produced response (`spr`) items where the answer is a single number; the rest are four-option multiple choice.

# OUTPUT FORMAT — STRICT
Output **valid UTF-8 JSON only** — no Markdown fences, comments, trailing commas, or prose before/after. It must parse with `JSON.parse`.

Top-level structure (the question shown is a format example only — do not include it):

{
  "metadata": {
    "id": "math-area-and-volume-medium",
    "title": "SAT Math — Area and volume (Medium)",
    "section": "math",
    "domain": "Geometry and Trigonometry",
    "skill": "Area and volume",
    "description": "Original Math practice questions for Area and volume",
    "sat_difficulty": "medium",
    "target_questions_per_pattern": 30,
    "generated_by": "LLM via SAT Practice Studio prompt",
    "version": 1
  },
  "patterns": [
    {
      "id": "P01",
      "name": "Short name of the recurring question pattern",
      "section": "math",
      "domain": "Geometry and Trigonometry",
      "skill": "Area and volume",
      "recognition": "How a student spots this pattern in under 10 seconds",
      "formula": "Key formula or relationship (TeX allowed)",
      "skill_description": "The exact thing the student must do",
      "common_mistakes": [
        "Typical wrong move 1",
        "Typical wrong move 2"
      ],
      "fastest_method": "Fastest reliable approach",
      "desmos_guidance": "When/how Desmos helps, or \"faster by hand\"",
      "source_ref": "Where in the attached source this pattern appears",
      "expected_question_count": 30
    }
  ],
  "questions": [
    {
      "id": "P01-Q001",
      "pattern_id": "P01",
      "number_in_pattern": 1,
      "sat_difficulty": "medium",
      "difficulty": "easy",
      "type": "mcq",
      "stem": "A cube-shaped container has no lid. Each edge is $4$ cm long. What is the total area of its five outside faces, in square centimeters?",
      "choices": {
        "A": "64",
        "B": "80",
        "C": "96",
        "D": "16"
      },
      "correct_answer": "B",
      "accepted_answers": [],
      "explanation": {
        "fast_method": "Five faces, each $4^2=16$: $5(16)=80$.",
        "hand_solution": "$A=5s^2=5(4^2)=80$.",
        "desmos_method": "Faster by hand.",
        "pattern_tip": "A lidless cube has five faces, not six."
      },
      "visual": {
        "type": "geometry",
        "shape": "open_cube",
        "labels": {
          "edge": "4 cm"
        }
      }
    }
  ]
}

## Field rules
- `id`: globally unique within the bank, format `P01-Q001`.
- `pattern_id`: must match an id in `patterns`.
- `number_in_pattern`: 1–30, each used exactly once per pattern.
- `sat_difficulty`: the official SAT difficulty level — always `"medium"` (also set in `metadata`).
- `difficulty`: the item's position *within* that SAT level: one of `easy`, `medium`, `hard` (see table). It is relative to the SAT level: `easy` means the easier end of the Medium level, not an SAT Easy question.
- `type`: `"mcq"` (four choices) or `"spr"` (student-produced numeric response).
- `stem`: the question text. Use `$...$` for inline TeX and `$$...$$` for display math. In JSON every backslash is doubled: `"$\\frac{3}{4}$"`.
- `choices`: object with exactly the keys `A`, `B`, `C`, `D`; four distinct, plausible options; omit for `spr`.
- `correct_answer`: the letter (`"B"`) for mcq — never the option text. For `spr`, a plain number string: `"12"`, `"-3/4"`, `"0.25"`. If the true answer involves π or a radical, ask for a numeric coefficient instead.
- `accepted_answers` (spr): equivalent forms, e.g. `["3/4","0.75"]`. Fractions and decimals are compared numerically.
- `explanation`: `fast_method`, `hand_solution`, `desmos_method`, `pattern_tip`. Hidden during test simulation.
- `visual`: `null` or one visual object (below).

### Visuals (the app draws these itself — never use TikZ, HTML, or ASCII art)
Use `"visual": null` when no figure is needed. Otherwise use exactly one of:

- Table: `{"type":"table","headers":["x","f(x)"],"rows":[["0","3"],["2","7"]],"caption":"optional"}`
- Coordinate plane: `{"type":"coordinate_plane","x_min":-10,"x_max":10,"y_min":-10,"y_max":10,"x_step":1,"y_step":1,"lines":[{"m":2,"b":1}],"curves":[{"fn":"x^2-4x+3","label":"y = f(x)"}],"points":[{"x":1,"y":3,"label":"A"}],"segments":[{"x1":0,"y1":0,"x2":3,"y2":4}],"circles":[{"cx":0,"cy":0,"r":5}],"polygons":[{"points":[[0,0],[4,0],[4,3]]}]}` — include only the keys you need. `fn` is an expression in x using + - * / ^ ( ) sqrt abs sin cos tan ln log exp pi. Vertical line: `{"x":3}`.
- Scatterplot: `{"type":"scatter","x_label":"Hours","y_label":"Score","points":[[1,52],[2,60],[3,71]],"best_fit":{"m":9.5,"b":42}}`
- Bar chart / histogram: `{"type":"bar_chart","categories":["A","B","C"],"values":[12,7,9],"x_label":"…","y_label":"…"}` (use `"type":"histogram"` for touching bars; use `"series":[{"name":"2023","values":[…]},…]` for grouped bars)
- Line graph: `{"type":"line_chart","categories":["Mon","Tue","Wed"],"values":[3,5,4]}`
- Geometry (schematic, not to scale): `{"type":"geometry","shape":"cylinder","labels":{"radius":"5 cm","height":"8 cm"}}`. Allowed shapes: cube, open_cube, prism, cylinder, cone, pyramid, sphere, hemisphere, square, rectangle, circle, triangle, right_triangle, trapezoid, parallel_lines. Label keys: edge, length, width, height, radius, diameter, base, side1, side2, hypotenuse, leg1, leg2, angle, A, B, C, base1, base2, angle1…angle4.
- Image: `{"type":"image","src":"https://…","alt":"…"}` — only when nothing above can show the figure.

The stem must still contain every number a student needs, unless reading the figure IS the skill being tested — in that case the figure must contain the data exactly.

## Item-writing rules
1. Exactly one defensible correct answer; distractors reflect real student mistakes.
2. No answer leakage in the stem, choices, or pattern names.
3. Numbers, units, figures, and explanations must agree. Verify every answer by solving it yourself.
4. Vary contexts, numbers, and representations — not just number swaps.
5. Keep language concise and natural, like the real Digital SAT.

# WORKFLOW — DO NOT OUTPUT EVERYTHING AT ONCE
1. **Reply 1 — catalog only.** Output the JSON object with `metadata` and the complete `patterns` array, and `"questions": []`. Wait for me.
2. **Following replies — questions.** When I say "next", output a JSON **array** of the next 10 question objects (just the array), in order: P01 items 1–10, then P01 items 11–20, … then P02, and so on.
3. I will save each reply as a separate file and merge them in SAT Practice Studio (Generate → Validate & merge), which checks counts, IDs, answers, and formats.

# SELF-CHECK BEFORE EACH OUTPUT
- Count: each pattern has exactly 30 items numbered 1–30; difficulty counts match the table.
- Every item has `"sat_difficulty": "medium"` and is genuinely SAT Medium level.
- Every mcq has A–D and a single-letter correct_answer; every spr answer is a plain number.
- IDs are unique; every pattern_id exists in `patterns`.
- TeX is valid and backslashes are doubled for JSON.
- You actually solved each item and the key is right.
If you cannot finish within one reply, stop at a complete question object and say exactly where you stopped. Never invent a verification report.
