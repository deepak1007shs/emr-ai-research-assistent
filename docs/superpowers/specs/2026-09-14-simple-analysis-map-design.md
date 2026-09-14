# The simple Analysis Map

Chosen by the investigator on 14 Sep 2026 from three options (A: a simple grid;
B: a block per objective; C: a map plus an appendix). This is A.

## Why the map was hard to read

1. One cell did six jobs: unadjusted test, its fallback, adjusted model,
   covariates, table number, fit table, exception note.
2. The map repeated the shell-table footnotes word for word.
3. "per participant, 1 value per participant" was the same on every row.
4. Exception rows said the same thing twice.
5. Unadjusted and adjusted sat inside one sentence, not side by side.

## The grid

| Objective | Outcome | Predictor(s) | Unadjusted | Adjusted for | Table |

- **Objective**: `PRIMARY - P1`, as today.
- **Outcome**: the label, then the data type in brackets: `Amputation within 30
  days (binary)`. A row whose unit of analysis or count differs from the
  plan-wide one adds it: `Haemoglobin (continuous; 4 readings per participant)`.
- **Predictor(s)**: labels, or `None`.
- **Unadjusted**: the test's short name, or `None`.
- **Adjusted for**: `<model short name>; <covariate labels>`, the model alone
  where there are no covariates, or the reason there is no model:
  `Not applicable: estimation only` / `safety outcome, reported not modelled` /
  `too few events to fit a model` / `diagnostic accuracy` / `correlation`.
  Otherwise `None`.
- **Table**: the distinct unadjusted and adjusted table numbers, `T10, T12`. Fit
  tables are not listed; each is numbered beside its model table in Section 6.

Above the grid: the fixed map line, one sentence naming the plan-wide unit of
analysis, and one sentence saying the full test, its fallback and the model's
details are in the footnote of the table named.

## Where the short names come from

At build time, beside the sentence they shorten, because that is where the code
knows which decision-table row and which modifiers it used. Parsing sentences at
render time was rejected: labels contain "and" and commas ("Ganga score: skin
and fascia involvement"), so a parser would cut some label wrongly.

- `tests.md` gains `Unadjusted short` and `Adjusted short`; `binary-models.md`
  and `screen.md` gain `Short`. A blank short cell means the full cell is
  already short. A test fails for any cell over 45 characters with no short.
- Code-built sentences (screen, safety, interaction, log scale, diagnostic)
  build their short beside their sentence.
- `Unadjusted.short` and `Adjusted.short` are optional. A plan stored before
  this change has none and prints its full sentence; rebuilding a plan re-reads
  the protocol, which is a paid call, so stored plans must keep rendering.

## The promise, and the two bugs it exposed

The grid drops detail on the promise that each dropped item is in the footnote
of the table the row names. A probe over IDA-PREG, the elastography study and
Vishal's reading found it false twice:

1. **Association rows had no unadjusted table number.** `numberTheMap` did not
   list the `screen` kind added in e2fbdcf. S7-12 passed anyway because it
   filtered out empty numbers before checking them. Fix: number the screen;
   S7-12 fails on an unadjusted or adjusted half with no table.
2. **An accuracy objective inside a non-diagnostic study printed no test in its
   footnote**, only the prevalence note. Fix: the footnote names its test in
   every study.

## Tests

- Every map row prints six cells; no cell contains an underscore identifier.
- No Table cell is empty for a row with an analysis; every number is a table.
- For every row, each dropped item (fallback, full test, full model, covariate)
  appears in the footnote or rows of a table the row names.
- Every decision-table cell over 45 characters has a short name.
- A stored row with no `short` prints its full sentence.
- IDA-PREG still builds byte-identically, with 16 tables, 4 fit tables and 1
  figure.
- Each fix disabled makes a test fail.
