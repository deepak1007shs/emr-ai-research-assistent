# SAP Analysis Map: rule traceability (sub-project A)

Date: 2026-09-27 · Status: approved design · Branch: `feat/sap-rule-traceability`

Source: `SAP_Test_Selection_Rules.docx` v1.0 (EaseMyResearch, September 2026). This is the
first of five sub-projects bringing the SAP's test selection up to that rule book, built in
the order **A → B → C → E → D**:

| | Sub-project | Scope |
|---|---|---|
| **A** | **Traceability** (this spec) | Rule IDs, rules version, `NO_RULE`, quoted facts, golden cases |
| B | Post hoc and effect sizes | New columns on every test row, printed in map and tables |
| C | Missing test families | Agreement, diagnostic comparison, Cronbach, one-sample, TOST/NI margin, factorial, qualitative, trend, Kendall, point-biserial; new Facts Sheet fields |
| E | Cross-checks and runtime switches | X3, X7, X10–X14; sphericity, discordant pairs, missing-data thresholds, linearity |
| D | Changed defaults | Welch, ANCOVA-first, pre-specified prediction models, cross-sectional OR <10%, unknown frequency → flag — each decided by the investigator, because several reverse decisions the code records as deliberate |

## Goal

Every test in a SAP can be traced to the exact table row that chose it, the version of the
tables, and the protocol sentences behind the facts that row matched on. Nothing about which
test is chosen changes in this sub-project.

### Success criteria

- Every Analysis Map row stores the ID of every table row that produced it and the rules
  version; none is blank.
- Every shell table's footnote names its rule IDs and the rules version; the Analysis Map
  grid is unchanged.
- Every key Facts Sheet field carries a quote that code has found in the protocol, with its
  page or section — or is marked unverified.
- An objective no table row matches is marked `NO_RULE` and raises a warning; the SAP still
  builds.
- The 20 rule-book golden cases are encoded; the 16 the app can express pass; 4 are marked
  pending sub-project C. The real-protocol cases from Supabase pass.
- Editing a decision table without bumping the rules version fails a test.
- The IDA-PREG acceptance test (`sap/markdown.test.ts`) still builds byte-identically twice
  and keeps its pinned register (16 numbered tables, 4 fit tables, 1 figure).

### Out of scope

Any change to which test, model or effect measure is chosen (sub-projects C and D); post hoc
and effect-size columns (B); new cross-checks (E); a "why this test" page in the app beyond
the one panel below.

## 1. Rule IDs in the decision tables

Each of the four markdown tables gains two leading columns:

| Column | Content |
|---|---|
| `Rule` | A stable ID: `A-01`… in `effect-measures.md`, `B-01`… in `tests.md`, `C-01`… in `binary-models.md`, `B2-01`… in `screen.md`. Numbered in the table's current row order. |
| `Rule book` | The rule-book rule the row implements (`R106`), several where it implements more than one (`R62, R64`), or `—` where the rule book has no counterpart (competing risks, a count against a measured number, …). |

Rules for the IDs:

- An ID is never reused or renumbered. A new row takes the next free number wherever it is
  placed; a deleted row's ID is retired.
- A test asserts IDs are unique within each table and match `^(A|B|C|B2)-\d{2}$`.
- `decision-tables.ts` parses the new columns unchanged — they are ordinary cells.

### The rules version

`decision-tables.ts` exports `RULES_VERSION = "2026-09-27"`. A test hashes the four table
files and compares the hash with one recorded beside the version; editing a table without
updating both fails with a message saying to bump the version. Every SAP records the version
it was built with.

## 2. What each Analysis Map row stores

`AnalysisRow` (in `study/types.ts`) gains:

```ts
rules: {
  effect: string | null;   // "A-02"
  test: string | null;     // "B-07", or "NO_RULE→B-07"
  model: string | null;    // "C-04" — binary outcomes with an adjusted model only
  screen: string[];        // "B2-04", one per factor, for an association objective
  rule_book: string[];     // the rule-book IDs of the rows above, deduplicated
};
```

and `SapBuild` gains `rules_version: string`.

`buildAnalysis` fills these from the `Rule` / `Rule book` cells of every row it matches —
including the diagnostic path (`diagnosticRow`) and the correlation path (table B2). Where a
path uses no table (an estimation or safety exception), the field is `null` and the reason is
the row's existing `exception` value.

### NO_RULE

Where `matchKey` finds no row for `<data type>/<shape>`, the build keeps today's behaviour —
the nearest row for the data type, and the TODO it already writes — and records
`test: "NO_RULE→B-xx"` (the nearest row's ID). Where there is no nearest row either, `test:
"NO_RULE"`. A new check, `S4-9` (warn), lists every objective whose test is `NO_RULE`:
*"P2: no rule covers a count outcome compared as paired; the plan uses the nearest row
(B-35). A statistician should name the test."*

It is a warning, not a gate, by the investigator's decision on 2026-09-27: the code records
that dropping an uncovered objective was tried and was worse.

## 3. Printed output

- **Each shell table's footnote** gains one line after the test line:
  `Rule B-07 (rule book R106) · rules v2026-09-27.` Several IDs are listed in the order
  effect, test, model, screen. `NO_RULE→B-07` prints as
  `No rule matched; nearest rule B-07 used — to be confirmed by a statistician.`
- **The SAP's closing line** gains `Tests chosen by decision tables v2026-09-27.`
- **The Analysis Map grid is unchanged** (layout chosen by the investigator, 14 Sep 2026).
- Markdown, Word and screen renderers all take the footnote from the same builder, so one
  change reaches all three.

## 4. Quoted facts

### Extraction

The Facts Sheet gains one field, `evidence`: an array of `{ field, quote }`. The prompt in
`facts/extract.ts` asks for a word-for-word quote for each of these fields:

`design`, `design_label`, `groups`, `allocation.matched`, `timepoints`,
`unit_of_analysis`, `question_type`, `exposure_fixed_at_baseline`, and for every outcome
chain (`primary`, `secondary[i]`): `type`, `distribution`, `kind`, `expected_frequency`,
`competing_event`.

`field` is the path as written above (`secondary[1].distribution`). Where the protocol says
nothing, the quote is `""` — the value itself keeps today's rules (empty, null or TODO), so
this adds no guessing.

The Zod schema gives `evidence` a default of `[]`, so every Facts Sheet already stored in
Supabase still parses and builds.

### Verification

After extraction, code checks each quote against the protocol text and adds `location`
(`p. 7` or `Section: Methodology`) and `verified`. It uses the quote-matching module shared
with the protocol-review checklist (`skeleton`, `locate`, `protocolPages`: letters and digits
only, a minimum length, page breaks allowed). That module lives at `src/lib/quotes/`;
whichever of this branch and `feat/protocol-review-checklist` is built first creates it, and
the other imports it.

An unverified quote is kept and marked, never used to change a value. The Facts Sheet is
still the one model output; nothing downstream is re-judged.

### Where quotes are shown

A collapsed panel on the SAP page, **"Why these tests"**: one block per Analysis Map row —
its rule IDs with their `Situation` cell, then the quoted facts that row matched on, each with
its location or "not verified". The facts a row matched on are fixed per path (for table B:
the outcome chain's `type` and `distribution`, plus `groups`, `timepoints`,
`allocation.matched`, `design` — the inputs of `shapeOf`). Not printed in the SAP document.

## 5. Golden cases

### Tier 1 — the rule book's twenty stories

`src/lib/analysis/golden/cases.ts` holds one hand-built Facts Sheet per story G01–G20, the
smallest that is valid under `factsSchema` and passes Gate A. Each case records:

```ts
{ id: "G06", story: "Diagnostic: normalised ADC value for significant cancer",
  rule_book: "R11", status: "active" | "pending-C" | "differs-D",
  expect: { objective: "P1", test: "B-xx", effect: "A-xx" } }   // IDs fixed when the tables are numbered
```

- **active** — the app's rule for the case implements the rule-book rule; the test asserts
  the app's IDs and that the row's `Rule book` cell contains the expected R-number.
- **pending-C** — G10 (agreement, R24), G11 (both eyes, R01), G16 (non-inferiority margin,
  R41), G20 (qualitative, R00): encoded, skipped with `it.skip` and the reason, switched on by
  sub-project C.
- **differs-D** — a case where the app today picks a different rule from the rule book (for
  example G03, baseline + one follow-up: rule book R70 ANCOVA-first, app B-xx t test with
  ANCOVA as the adjusted model). The test asserts the app's current IDs so behaviour cannot
  drift unnoticed, and names the rule-book rule it will move to under sub-project D.

The status of each case is decided when the fixtures are built and the table rows mapped;
the split above (16 active or differs-D, 4 pending-C) is fixed.

### Tier 2 — real protocols from Supabase

1. Read the `facts` of up to 10 ready `sap_plans` rows (read-only), covering as many
   designs as are stored.
2. Build each and list, per objective, the test the app chose with its rule IDs.
3. The investigator confirms or corrects each. A confirmed answer becomes the expectation; a
   corrected one becomes a `differs-D` or `pending-C` case with the correct answer recorded.
4. Each Facts Sheet is saved as `src/lib/analysis/golden/real/<code>.json` with its
   expectations. These hold protocol details, not patient data, as `fixture-vishal.ts`
   already does.

No model call is needed: the Facts Sheets are already stored.

## 6. Testing

- Table IDs unique and well-formed; every `Rule book` cell is `—` or a list of `R\d+`.
- Version hash: changing any table without bumping `RULES_VERSION` fails.
- `buildAnalysis` gives every row non-null `rules.test` (or an `exception`), across the
  existing fixtures and the five study shapes in `sap/shapes.test.ts`.
- `NO_RULE`: a Facts Sheet with an uncovered combination gets `NO_RULE→B-xx`, the TODO, and
  an `S4-9` warning; the SAP still renders.
- Footnotes carry the rule line; the map grid's headings are unchanged.
- Evidence: an old Facts Sheet without `evidence` parses; quotes are verified and located;
  a paraphrase is marked unverified; values are never changed by verification.
- Golden tiers 1 and 2 as above.
- Per CLAUDE.md, each new test is shown to fail by breaking the code it guards.
- The IDA-PREG acceptance test passes unchanged in its register.

## 7. Build order

1. `Rule` and `Rule book` columns in the four tables; `RULES_VERSION` and its hash test
2. `rules` on `AnalysisRow`, filled on every path; `NO_RULE` and `S4-9`
3. Footnote line and closing line
4. Golden tier 1
5. Shared quote module; `evidence` in the Facts Sheet; verification
6. "Why these tests" panel
7. Golden tier 2 with the investigator's confirmations
