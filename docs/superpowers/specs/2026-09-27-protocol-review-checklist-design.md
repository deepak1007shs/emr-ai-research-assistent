# Protocol review: fixed checklist behind the existing review

Date: 2026-09-27 · Status: approved design · Scope: protocol review only (no data cleaning)

Source: `Protocol_Analyzer_Software_Spec.docx` (EaseMyResearch, September 2026), Algorithm A
and the Section 5 master checklist. This is sub-project 1 of 4 in bringing the review up to
that spec. Later sub-projects: 2 — code-computed sample size and consistency engine;
3 — multi-document intake and CRF trace; 4 — ready-to-paste fixes, full report and decision log.

## Goal

Make the existing protocol review better and repeatable **without changing what the
investigator receives**. Today one Claude call decides every finding, so the same protocol
reviewed twice gives different key issues. After this change, every protocol is judged
against one fixed, versioned checklist; each finding carries a quote that code has found in
the protocol; each issue has a fixed priority; and the existing review is written from those
verified findings.

### Success criteria

- The report keeps its six sections, the separate action document, and the .docx / .md
  downloads. `build_review_md.js` and `docx.ts` are not edited.
- Every one of the 106 checks has a result on every review — none blank.
- Zero quotes in the report that are not found in the protocol text.
- Every Critical and Major failure appears in Section 6.
- Stability, measured by hand on 2–3 real protocols run 3 times each: ≥ 95% of check
  results identical across runs.

### Out of scope

Messy-data mode (Algorithm B); code sample-size recalculation; the consistency engine;
CRF / PIS / consent uploads; OCR; the scale library (A6); PubMed / Crossref lookups;
ready-to-paste corrected text; PDF output; the printed checklist annexure; a gold test set.

## 1. How a review runs

```
upload → 1 Read text → 2 Checklist (13 group calls) → 3 Verify quotes (code)
       → 4 Existing review call + verified failures → 5 Coverage check (code) → .docx / .md
```

1. **Read text.** PDFs are still sent to Claude natively. Code also extracts text page by
   page with `unpdf`, used only for quote verification and page numbers. DOCX text comes
   from mammoth as today; its location is the nearest preceding section heading instead of
   a page. Pasted text is located by heading the same way.
2. **Checklist.** 13 calls, one per group: DOC, TI, DE, OB, SS, CRF, EL, IN, TF, RB, AN, ET,
   and CO+RF together. Model: Sonnet 5. The protocol and the shared rules are one cached
   prefix reused by all 13 calls. In batch mode the 13 go in one batch; in live mode they
   run in parallel.
3. **Verify quotes (code).** Each quote is searched for in the protocol text after
   normalising whitespace, line breaks, curly/straight quotes and hyphenation. Found → add
   `page` (or `section`) and `quote_verified: true`. Not found → result becomes
   `NOT_STATED`, note `"quote not found — needs review"`, and it raises no issue.
4. **Existing review call.** Same model, effort, schema and output as today. Its prompt
   additionally carries the verified FAIL and NOT_STATED results with check IDs, priorities
   and quotes. Each `key_issues` entry gains a `check_ids` array in the model schema
   (removed before the spec reaches the renderers).
5. **Coverage check (code).** Every Critical and Major failure must be named in some key
   issue's `check_ids`. Missing ones get one repair call that returns only the missing
   issues. Still missing → code appends a plain issue built from the check's own text,
   quote and note, so nothing is dropped.

Batch mode now takes two rounds (checklist, then review), so the wait roughly doubles.
Live mode (`BUILD_MODE=live`) stays at minutes.

## 2. The checklist and its results

### The checklist file

`src/lib/checklist/checks.ts` — a plain list, in the style of `checks/registry.ts` and
`objectives/promises.ts`, with a `VERSION` date bumped on any change.

```ts
type ChecklistItem = {
  id: string;                 // "SS3" — the spec's ID, unchanged
  group: Group;               // "SS"
  area: string;               // "Sample size"
  fails_when: string;         // the spec's "Check (FAIL when…)" wording
  priority: "Critical" | "Major" | "Minor";   // fixed here; the model never chooses
  judged_by: "model" | "model-provisional";
};
```

`model-provisional` marks checks the spec assigns to code, a lookup or a library (any
"Done by" other than plain "LLM"). Claude answers them in this version; sub-projects 2 and 3
replace them with code under the same ID. The full list is in the appendix.

`DOC5` (more than one version uploaded) is answered by code as `NOT_APPLICABLE`, because
the app accepts one file.

### What each group call receives

- The protocol (cached prefix).
- The rules (cached prefix): answer every listed check; quote the protocol word for word;
  if the protocol is silent the result is `NOT_STATED`, never a guess; judge
  `NOT_APPLICABLE` from the protocol's own design.
- Only the knowledge table its group needs, from a new
  `src/lib/protocol/knowledge/05-checklist-tables.md` holding spec Appendix A1–A5:
  DE ← A1 decision tree + A2 guideline map; SS ← A3 formula lookup; RB ← A4 design
  checklists; AN ← A5 test lookup + effect-measure rule. Other groups get none.
- The exact check IDs to answer, each with its `fails_when` text.

### What comes back

Structured output, validated with Zod; one retry on a schema failure.

```json
{ "check_id": "OB4", "target": "S2", "result": "FAIL",
  "quote": "Pain will be assessed post-operatively",
  "note": "No scale, no time point, no unit given for pain." }
```

`result` ∈ `PASS | FAIL | NOT_APPLICABLE | NOT_STATED`. `target` is the objective or
outcome the check was applied to, or `""`. A check may appear more than once with different
targets (OB4 per outcome). Code then adds `page | section` and `quote_verified`, copies
`priority` and `judged_by` from the checklist, and fills any unanswered ID as `NOT_STATED`
with note `"not answered"`.

## 3. Report and storage

### Report — same shape, same renderers

Changes live inside existing text fields:

- **Section 6 heading** starts with the highest priority among its `check_ids`:
  `[Critical] Sample size uses a single-proportion formula`. Code sets the tag, so it
  always matches the checklist.
- **Section 6 body** starts with `Protocol says: "<verified quote>" (p. 14).` — or
  `(Section: Methodology)` for DOCX. The quote comes from the check result, not from the
  model's prose. When the finding is `NOT_STATED`, the line reads
  `Protocol says: nothing on this.`
- **Order:** Critical → Major → Minor; within a priority, the model's order.
- **Action document:** same four columns, re-ranked in that order.
- **Footer** gains one line:
  `Checked against checklist v2026-09-27: 106 checks, 14 failed (3 Critical, 7 Major, 4 Minor).`

The checklist is not printed in either document.

### Storage

Migration `0019_review_checklist.sql` adds one column to `reviews`: `checklist jsonb`,
holding the whole run — version, model, whether the text could be read, every verified
result, and the checklist's own token usage. It is written as soon as the checklist
finishes, **before** the review is sent, so a build that dies and resumes its review batch
shapes the review with the same findings the batch was sent with.

The checklist's usage is stored apart from `reviews.usage` because it is priced at Sonnet 5
rates and `usage` at the review model's; tokens from two price lists cannot be summed and
priced once.

Reviews without the column render exactly as before.

### Result meanings

- `FAIL` — the problem is present. Raised as an issue. A FAIL with an empty quote is kept
  (absence has nothing to quote) and its body line reads `Protocol says: nothing on this.`
- `NOT_STATED` — the protocol says too little to judge. Raised as an issue.
- `PASS`, `NOT_APPLICABLE` — not raised.
- `needs_review: true` — the quote was not found, the check was not answered, or its group
  failed. Shown in the panel, never raised. A FAIL whose quote is not found becomes
  `NOT_STATED` with `needs_review: true`.

### In the app

The review page gets one collapsed panel, **"Checklist (106 checks)"**: a read-only table
of ID, area, result, priority, quote, page / section, and a "provisional" marker. Failures
are listed first. Nothing else in the interface changes.

## 4. Errors, cost and testing

### Failure handling

| Failure | Behaviour |
|---|---|
| A group call fails twice | Its checks are `NOT_STATED`, note `"check group failed"`; the review continues |
| A quote is not found | `NOT_STATED — needs review`; no issue raised |
| The whole checklist stage fails | Review runs as today; footer says `Checklist not run.`; `checklist` is null |
| The repair call fails | Code appends the missing issues from the check text |
| `unpdf` cannot read a PDF | Every quote is unverifiable → all failures become `NOT_STATED — needs review`; footer notes it |

The user never loses a review because of the checklist.

### Cost

Checklist usage is stored inside `reviews.checklist` and priced at Sonnet 5 rates
(already in `pricing.ts`). The job's running cost adds it in dollars; the review page shows
a second "What this checklist cost" panel; the home-page total adds it to each review
without counting it as a review. The real per-review figure is measured in the live check.
Sonnet 5 rejects `temperature`, so none is sent; repeatability rests on the fixed list, the
small groups and strict structured output.

### Automated tests (vitest, no API key)

- The checklist has exactly the 106 IDs in the appendix, each with a priority and
  `judged_by`; IDs are unique; every group has a call.
- Quote matching accepts whitespace, line-break, quote-style and hyphenation differences,
  rejects a paraphrase, and returns the right page / section.
- Unanswered IDs are filled as `NOT_STATED`.
- Coverage check finds a Critical / Major failure absent from `check_ids`, and the fallback
  issue is built from the check text.
- Heading tags and Critical → Major → Minor ordering; the action list follows it.
- `check_ids` is stripped before `reviewSpecSchema.strict()` validation.
- Existing renderer tests (including the docx/markdown drift test) still pass unchanged.

### Live check (by hand, with an API key)

2–3 real protocols, 3 runs each. Report: % identical check results, count of unverified
quotes reaching the report (target 0), and cost per review compared with today.

### Build order

1. Checklist file + knowledge tables
2. Group calls and result schema
3. Text extraction and quote verification
4. Wiring into the review call (`check_ids`, tags, quote line, ordering, footer)
5. Coverage check and repair call
6. Migration, storage and the review-page panel

## Appendix — the checklist (v2026-09-27, 106 checks)

P = priority (C Critical, M Major, m Minor). J = judged_by (✓ model, ◐ model-provisional).

| ID | Fails when | P | J |
|---|---|---|---|
| DOC1 | Protocol text incomplete or truncated | C | ◐ |
| DOC2 | CRF / proforma not provided | M | ◐ |
| DOC3 | PIS / consent / assent not provided | M | ◐ |
| DOC4 | Scale named but its annexure missing | M | ◐ |
| DOC5 | More than one version uploaded, final not confirmed | m | code (N/A) |
| TI1 | Design not named or named wrongly in title | m | ✓ |
| TI2 | Over-claiming word (efficacy / impact / effect) without a control group | M | ◐ |
| TI3 | Cause words (predictors / risk factors) in a one-time-point design | M | ◐ |
| TI4 | A promise in the title (profile, trajectory…) has no objective or analysis | M | ✓ |
| TI5 | Population / intervention words differ from inclusion or objectives | m | ◐ |
| TI6 | Spelling, informal terms, abbreviations not expanded | m | ✓ |
| DE1 | Stated design differs from design found by the decision tree | M | ◐ |
| DE2 | Timing word used as the design | M | ✓ |
| DE3 | Special aim (diagnostic, prediction, agreement) labelled as ordinary design | M | ◐ |
| DE4 | Two designs mixed without per-objective labels | M | ✓ |
| DE5 | Reporting guideline absent or wrong for the design | m | ◐ |
| DE6 | Wrong frame (PICO for observational / PECO for trial) or comparator undefined | m | ◐ |
| OB1 | No primary objective, or more than one without multiplicity plan | C | ◐ |
| OB2 | Primary objective bundles several outcomes | M | ✓ |
| OB3 | Primary outcome differs between aim, objectives, methods, sample size, analysis | C | ◐ |
| OB4 | Outcome missing what / how / tool / time / unit / type | M | ✓ |
| OB5 | Cut-off or international definition not stated, or two different cut-offs | M | ◐ |
| OB6 | Promise in aim / introduction / consent not an objective | M | ✓ |
| OB7 | Predictor written as an outcome (or reverse) | m | ✓ |
| OB8 | Objective unanswerable with the planned design or data | C | ✓ |
| OB9 | Composite outcome not declared | m | ✓ |
| OB10 | Hypothesis absent, wrong direction, or back-to-front | M | ✓ |
| OB11 | Continuous outcome cut into groups without reason | m | ✓ |
| OB12 | Too many secondary objectives for the sample size | m | ◐ |
| OB13 | Definition depends on the study's own data (e.g. cohort median) | M | ✓ |
| SS1 | No calculation ("time-bound" / convenience without justification) | C | ✓ |
| SS2 | Formula family wrong for design + primary outcome | C | ◐ |
| SS3 | Recalculated n differs >5% from stated n | C | ◐ |
| SS4 | Powered on an outcome that is not the primary | C | ◐ |
| SS5 | Inputs have no source, or source does not report the value / unit / population | M | ◐ |
| SS6 | Unit or z-value error | M | ◐ |
| SS7 | Events per variable < 10 for a planned regression | M | ◐ |
| SS8 | Non-inferiority margin absent or unjustified | C | ✓ |
| SS9 | Cluster without design effect; repeated measures / 3+ groups with 2-group formula | M | ◐ |
| SS10 | Calculated n abandoned for a smaller convenience number | M | ✓ |
| SS11 | No dropout allowance | m | ◐ |
| SS12 | Pilot study presented as confirmatory | M | ✓ |
| CRF1 | Primary outcome or exposure has no field | C | ◐ |
| CRF2 | Secondary outcome has no field | M | ◐ |
| CRF3 | Control group not given the same fields | M | ✓ |
| CRF4 | Free-text / multi-value field where analysis needs categories | M | ✓ |
| CRF5 | Summary or score recorded without its raw inputs | M | ✓ |
| CRF6 | No date for each visit; no admission / discharge dates for duration outcomes | M | ✓ |
| CRF7 | Known confounders not collected (suggested list, needs agreement) | M | ✓ |
| CRF8 | Group / allocation field missing in a comparative study | C | ◐ |
| CRF9 | Fields that serve no objective | m | ◐ |
| CRF10 | Identifiers (name, phone) used as study ID | M | ◐ |
| EL1 | Gap or overlap between inclusion and exclusion | M | ✓ |
| EL2 | Control group not defined (source, criteria, matching) | C | ✓ |
| EL3 | Controls related to cases, not healthy, or not matched as promised | M | ✓ |
| EL4 | Exclusion on something that is also an outcome | M | ✓ |
| EL5 | Exclusion of patients unable to consent in a severity / mortality study | M | ✓ |
| EL6 | Post-randomisation exclusions | M | ✓ |
| EL7 | Criteria not measurable, or exclusion criteria absent | m | ✓ |
| EL8 | Exclusion that causes spectrum bias in a diagnostic study | M | ✓ |
| IN1 | Scale annexure: item count, range or scoring does not match its source | M | ◐ |
| IN2 | Reverse-scored items or cut-offs not stated | M | ◐ |
| IN3 | Adult / wrong-age / wrong-language version | M | ◐ |
| IN4 | Licensed scale without permission mentioned | m | ◐ |
| IN5 | Measure does not fit the modality (CT units in MRI) | M | ✓ |
| IN6 | Tool only partly used (criteria missing) without saying so | M | ◐ |
| IN7 | Several different tools named for one outcome | M | ◐ |
| TF1 | Follow-up longer than the study period | C | ◐ |
| TF2 | Follow-up shorter than the outcome needs | M | ✓ |
| TF3 | Measurement timing undefined | M | ✓ |
| TF4 | No visit windows / no maximum interval between tests | m | ✓ |
| TF5 | Required tests not available locally (asks user to confirm) | M | ◐ |
| TF6 | No yearly patient numbers behind the sample size | m | ✓ |
| TF7 | Fixed order of conditions confounded with time | M | ✓ |
| TF8 | Retrospective arm cannot supply variables / scales | M | ✓ |
| RB1 | Randomisation sequence method not stated | M | ✓ |
| RB2 | Allocation concealment not stated, or two methods offered as alternatives | M | ✓ |
| RB3 | Blinding unclear or contradictory ("open-label single-blind") | M | ✓ |
| RB4 | Readers of index / reference tests not blinded (diagnostic) | M | ✓ |
| RB5 | Reference standard not applied to all (verification bias) | M | ✓ |
| RB6 | Test component also inside the reference definition (incorporation bias) | M | ✓ |
| RB7 | Design-specific checklist item missing (Appendix A4) | M | ✓ |
| AN1 | No analysis section or one line only | C | ◐ |
| AN2 | Test does not fit outcome type / groups / pairing | M | ◐ |
| AN3 | 3+ visits not analysed with repeated-measures / mixed model | M | ◐ |
| AN4 | Unit of analysis (eye / side / session) not stated | M | ✓ |
| AN5 | OR for a common outcome in cohort / cross-sectional / RCT | M | ◐ |
| AN6 | No adjustment plan for confounders | M | ✓ |
| AN7 | No missing-data, ITT or multiplicity plan | M | ✓ |
| AN8 | Unplanned or unadjusted interim analysis | M | ✓ |
| AN9 | Wrong test for comparing AUCs (use DeLong) / no calibration for prediction | M | ✓ |
| AN10 | Software / significance level not stated | m | ✓ |
| ET1 | Ethics text describes a different design | C | ◐ |
| ET2 | Children enrolled without parent consent + child assent | C | ✓ |
| ET3 | No LAR route for patients unable to consent | M | ✓ |
| ET4 | Trial not planned for CTRI registration before first patient | C | ✓ |
| ET5 | PIS / consent content differs from protocol (tests, visits, numbers) | M | ◐ |
| ET6 | Consent form claims approval already granted | M | ✓ |
| ET7 | No confidentiality / coded-ID statement | m | ✓ |
| ET8 | No adverse-event reporting or stopping rule for an intervention | M | ✓ |
| CO1 | Sample size differs between documents / sections | M | ◐ |
| CO2 | Duration or dates differ | m | ◐ |
| CO3 | Measurement site / method differs between methods, CRF and analysis | M | ◐ |
| CO4 | Leftover template text (e.g. placebo arm in two-arm trial) | m | ✓ |
| RF1 | Citation cannot be found (Crossref / PubMed lookup) | M | ◐ |
| RF2 | Number credited to a paper that does not report it | M | ◐ |
