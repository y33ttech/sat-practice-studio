# ROLE
You are an expert Digital SAT Reading and Writing item writer, editor, and structured-data engineer.

# GOAL
Create an original practice question bank for:
- Section: **Reading and Writing**
- Domain: **Information and Ideas**
- Skill: **Command of Evidence**

The bank teaches students to recognize recurring question *patterns*: items that look different on the surface but are solved with the same strategy.

## Source material
I have attached official SAT practice questions for **Command of Evidence** (for example the "No correct answers or explanations" and "With correct answers and explanations" PDFs, from the **Easy** SAT difficulty level (the `reading and writing/easy/Command of Evidence/` folder)). Use them ONLY to learn the patterns, style, difficulty, and wording conventions:
- Inspect every question, including figures, tables, and graphs (look at them visually; do not rely only on extracted text).
- Never copy a source question, passage, or sentence. Every generated item must be newly written with new numbers, contexts, and wording.
- Group source questions into a pattern only when the solving strategy is essentially the same. Do not split patterns just because the context or numbers change; do not merge different solving tasks just because they share a topic.

## Patterns and counts
Identify **every** distinct question pattern in the attached source (typically 4–15).
Generate **exactly 30 questions per pattern** → (number of patterns) × 30 questions.

## Difficulty — two levels
1. **SAT level (`sat_difficulty`)** — every item in this bank is SAT **Easy** level, like the attached/reference questions. Match their real difficulty: Easy means one or two direct steps, familiar wording, little disguise.
2. **Within-level difficulty (`difficulty`)** — the source batch still varies, so spread items across the lower, middle and upper part of the Easy level. Within every pattern it progresses as follows (it restarts for each pattern):

| number_in_pattern | difficulty | count |
|---|---|---:|
| 1–10 | `easy` | 10 |
| 11–20 | `medium` | 10 |
| 21–30 | `hard` | 10 |

An item labelled `easy` here is "Easy level, easier end" — never easier than the SAT level itself.

Harder items should be longer, denser, or more subtle versions of the *same* pattern (closer distractors, more complex syntax or vocabulary), not a different skill.

# OUTPUT FORMAT — STRICT
Output **valid UTF-8 JSON only** — no Markdown fences, comments, trailing commas, or prose before/after. It must parse with `JSON.parse`.

Top-level structure (the question shown is a format example only — do not include it):

{
  "metadata": {
    "id": "rw-command-of-evidence-easy",
    "title": "SAT R&W — Command of Evidence (Easy)",
    "section": "rw",
    "domain": "Information and Ideas",
    "skill": "Command of Evidence",
    "description": "Original Reading and Writing practice questions for Command of Evidence",
    "sat_difficulty": "easy",
    "target_questions_per_pattern": 30,
    "generated_by": "LLM via SAT Practice Studio prompt",
    "version": 1
  },
  "patterns": [
    {
      "id": "P01",
      "name": "Short name of the recurring question pattern",
      "section": "rw",
      "domain": "Information and Ideas",
      "skill": "Command of Evidence",
      "recognition": "How a student spots this pattern in under 10 seconds",
      "skill_description": "The exact thing the student must do",
      "common_mistakes": [
        "Typical wrong move 1",
        "Typical wrong move 2"
      ],
      "fastest_method": "Fastest reliable approach",
      "source_ref": "Where in the attached source this pattern appears",
      "expected_question_count": 30
    }
  ],
  "questions": [
    {
      "id": "P01-Q001",
      "pattern_id": "P01",
      "number_in_pattern": 1,
      "sat_difficulty": "easy",
      "difficulty": "easy",
      "type": "mcq",
      "passage": "Marine biologist Ayana Okafor found that young reef fish rely on the sound of a healthy reef to navigate. When recordings of degraded reefs were played, fewer larvae settled nearby, a result that ______ the idea that reef noise acts as a homing signal.",
      "stem": "Which choice completes the text with the most logical and precise word or phrase?",
      "choices": {
        "A": "supports",
        "B": "disguises",
        "C": "postpones",
        "D": "imitates"
      },
      "correct_answer": "A",
      "explanation": {
        "rationale": "Fewer larvae settling near quieter reefs is evidence for the idea, so it “supports” it.",
        "distractors": "B, C and D do not describe how evidence relates to a claim.",
        "pattern_tip": "Predict your own word for the blank from the logic of the sentence before reading the choices."
      },
      "visual": null
    }
  ]
}

## Field rules
- `id`: globally unique within the bank, format `P01-Q001`.
- `pattern_id`: must match an id in `patterns`.
- `number_in_pattern`: 1–30, each used exactly once per pattern.
- `sat_difficulty`: the official SAT difficulty level — always `"easy"` (also set in `metadata`).
- `difficulty`: the item's position *within* that SAT level: one of `easy`, `medium`, `hard` (see table). It is relative to the SAT level: `easy` means the easier end of the Easy level, not an SAT Easy question.
- `type`: always `"mcq"`.
- `stem`: the question text. Put the passage in `passage` / `passages`, not in `stem`.
- `choices`: object with exactly the keys `A`, `B`, `C`, `D`; four distinct, plausible options.
- `correct_answer`: the letter (`"B"`) for mcq — never the option text. 
- `explanation`: `rationale`, `distractors`, `pattern_tip`.
- `visual`: `null` or one visual object (below).

### Reading & Writing fields
- `passage`: the short text (25–150 words, like the Digital SAT). Use `______` (six underscores) for the blank in Words in Context, Transitions, Boundaries and Form/Structure/Sense items. Light formatting is allowed: `**bold**`, `*italic*` (titles), `__underlined__`, and lines starting with `- ` for the bulleted notes in Rhetorical Synthesis.
- `passages`: for Cross-Text Connections use `[{"label":"Text 1","text":"…"},{"label":"Text 2","text":"…"}]` instead of `passage`.
- `stem`: the question line only, e.g. "Which choice completes the text with the most logical and precise word or phrase?"
- Every R&W item is `"type":"mcq"` with four choices.
- For Command of Evidence (quantitative), add a `table` or `bar_chart`/`line_chart` visual using the formats below.
- Do NOT use `$` for money in R&W text; write "USD 5" or "5 dollars" (the dollar sign is reserved for math notation).
- `explanation`: `{"rationale":"why the answer is right","distractors":"why each wrong choice fails","pattern_tip":"how to recognize this pattern quickly"}`

### Visuals (the app draws these itself — never use TikZ, HTML, or ASCII art)
- Table: `{"type":"table","headers":["Year","Sales"],"rows":[["2019","1,200"]],"caption":"optional"}`
- Bar chart: `{"type":"bar_chart","categories":["A","B"],"values":[12,7],"x_label":"…","y_label":"…"}`
- Line graph: `{"type":"line_chart","categories":["2018","2019"],"series":[{"name":"City A","values":[3,5]}]}`

## Item-writing rules
1. Exactly one defensible correct answer; distractors reflect real student mistakes.
2. No answer leakage in the stem, choices, or pattern names.
3. Passages are original, factual in tone, and cover varied subjects (science, history, social science, literature, arts).
4. Vary contexts, numbers, and representations — not just number swaps.
5. Keep language concise and natural, like the real Digital SAT.

# WORKFLOW — DO NOT OUTPUT EVERYTHING AT ONCE
1. **Reply 1 — catalog only.** Output the JSON object with `metadata` and the complete `patterns` array, and `"questions": []`. Wait for me.
2. **Following replies — questions.** When I say "next", output a JSON **array** of the next 10 question objects (just the array), in order: P01 items 1–10, then P01 items 11–20, … then P02, and so on.
3. I will save each reply as a separate file and merge them in SAT Practice Studio (Generate → Validate & merge), which checks counts, IDs, answers, and formats.

# SELF-CHECK BEFORE EACH OUTPUT
- Count: each pattern has exactly 30 items numbered 1–30; difficulty counts match the table.
- Every item has `"sat_difficulty": "easy"` and is genuinely SAT Easy level.
- Every mcq has A–D and a single-letter correct_answer.
- IDs are unique; every pattern_id exists in `patterns`.
- No `$` signs in passages.
- You actually solved each item and the key is right.
If you cannot finish within one reply, stop at a complete question object and say exactly where you stopped. Never invent a verification report.
