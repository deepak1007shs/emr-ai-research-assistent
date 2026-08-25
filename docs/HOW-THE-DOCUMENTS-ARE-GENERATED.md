# How the CRF, SAP and Shell Tables are generated

*Everything the model is told, everything the gate enforces, and every rule the
renderers follow. Quoted from the code, not summarised from memory.*

---

## 1. The shape of the thing

The three documents are **not written separately**. There is one object,
`study_spec.json`, and the documents are projections of it.

```
protocol (.docx / .pdf)
        |
        v   five model calls, in order
  study_spec.json   <-- the only editable artifact
        |
        v   75 invariant guards; ERROR stops the build
        |
   +----+--------------------+--------------------+
   v                         v                    v
Case Record Form   Statistical Analysis Plan   Shell Tables
```

This is why the CRF cannot contain a variable the SAP does not analyse, and why
the shell tables cannot report an outcome the SAP does not define. They are not
checked against each other; they are computed from the same fields.

**The consequence you should hold onto:** if a document is wrong, the fix is in
the specification, never in the document. Editing a document breaks the guarantee.

---

## 2. What the model is told on every single call

Two things are attached to all five calls.

### 2.1 The role

> You are a senior medical research methodologist and trial statistician.
> You are converting a protocol into a single machine-readable study
> specification, from which a case record form, a statistical analysis plan and a
> set of shell tables will be generated automatically. **Whatever you leave out
> will simply be missing from all three.**
>
> Where the protocol is wrong, **encode the CORRECTED study, not its mistakes**:
> this object defines the study as it will now be run. Where the protocol is
> silent, choose the standard answer a methodologist would choose, and record the
> choice in `open_items` so the guide can see it and object.

### 2.2 The knowledge base

Five Markdown files, about 67,000 characters, sent with every call and held in a
prompt cache for an hour so repeats are cheap:

| File | What it carries |
|---|---|
| `workflow.md` | The six review sections, the eleven coverage areas, the hard rules, and the prose rules (no em dashes, no machine vocabulary) |
| `01-study-design-classification.md` | The design decision tree, all 35 designs, the reporting-guideline map, **aim beats structure**, the title-versus-design flags |
| `02-objectives-and-outcomes.md` | The seven-link outcome chain, primary versus secondary versus exploratory, the variable necessity filter |
| `03-detailed-methodology.md` | Eligibility, sampling, follow-up, and roughly fifteen sample-size formulas with their verdict criteria |
| `04-worked-example.md` | A complete real review at the required standard, used as the quality target |

**These files are the analyser.** Editing them changes how protocols are read.
No code change is needed.

### 2.3 Your answers, if you have written any

Anything typed into the answers box on the review page is attached **before**
everything else, worded as:

> The investigator has reviewed this protocol and made the following decisions.
> **Where any of them conflicts with what the protocol says, the decision wins**,
> and the specification must encode the study as decided rather than as written.
> Do not re-raise a problem that has been answered here.

---

## 3. The five stages, verbatim

One call each, in order. Each stage sees everything the stages before it decided,
so the chain stays consistent. Each is checkpointed the moment it finishes, so a
dropped connection costs one stage rather than the whole run.

Why five and not one: the API refuses a single schema this large - *"the compiled
grammar is too large"*. The split follows the traceability chain anyway.

### Stage 1 - Classifying the design and the population

> Build the first part of the specification: what kind of study this is.
>
> Classify the design with Reference 1 and record in `design_detail` the facts
> that design requires: a case-control needs its **matching variables and ratio**,
> a cluster trial its **ICC and cluster size**, a cohort its **follow-up schedule
> and censoring rule**, any randomised design its **sequence generation,
> allocation concealment and blinding**.
>
> Then the time points, each with a real window: **"day 30" is unusable,
> "day 30 +/- 3" is a protocol**. Then eligibility, as discrete checkable criteria
> that **leave no gap** between inclusion and exclusion.

### Stage 2 - Turning objectives into outcomes

> Now the questions the study asks.
>
> **Exactly one primary objective**, phrased as a question. The primary objective
> needs all five ICH E9(R1) estimand attributes, including the
> **intercurrent-event strategy** that says what happens when a patient stops
> treatment, gets rescue therapy or dies before the endpoint.
>
> Then the outcomes, **exactly one primary**. Give each its definition,
> instrument, the time point it is measured at, its data type and subtype, and
> **the summary statistic a table will carry**. You will name the variables in a
> later step, so give each outcome the `source_variable_ids` you intend to create.

### Stage 3 - Reproducing the sample size and the analysis rules

> Now the size of the study and the rules the analysis runs under.
>
> **Reproduce the sample size the protocol states**: the formula, every input
> **with the source it came from**, alpha, power, the attrition allowance and the
> resulting n. It must be **powered on the primary outcome**. Where the protocol
> gives no source for a number, **say so rather than inventing one**.
>
> Then the analysis populations (exactly one primary, required for any
> interventional design), the multiplicity rule for each outcome family, any
> sensitivity analyses, the missing-data plan, and anything the guide must still
> decide as `open_items`.

### Stage 4 - Deciding what the form collects and what is computed

*This is the stage that produces the CRF.*

> Now the variables and the form.
>
> Every variable an outcome names must exist here, and every variable must be
> either **CAPTURED** (with a section, a field type and an answer space) or
> **DERIVED** (with `derived_from`, a formula and a kind; not on the form).
>
> **Collect raw and rich. Dates rather than durations. The reading rather than a
> yes/no. A score's items rather than its total. The number rather than the band.
> Any value that can be computed must be derived, never a box someone fills in.**
>
> Also give every variable used as a categorical predictor a `reference_level`,
> and give every clinical category set its `definition_source` and
> `definition_reference` (quote the protocol, or name the standard: ISGPS,
> Clavien-Dindo, CDC, KDIGO, ASA).
>
> Create the CRF sections, one per baseline block and one per follow-up visit,
> each tied to a time point already defined.
>
> If the reporting guideline is CONSORT or STROBE, you **MUST** include an
> administrative variable recording the **screening outcome** for every person
> assessed. Without it the flow diagram those guidelines require cannot be drawn.

### Stage 5 - Writing the analyses and the tables

*This is the stage that produces the SAP's analysis map and the shell tables.*

> Finally the analyses and the tables.
>
> One analysis per outcome. **Never put a mediator or a collider in a covariate
> list: adjusting for one removes the effect being measured.** A Cox model must
> declare its proportional-hazards check.
>
> Then the tables, **numbered contiguously from 1**, blocks in order (descriptive,
> primary, secondary, exploratory, sensitivity), **sensitivity last**. **Never
> label a column Model 1 or Model 2.** Put **unadjusted and adjusted side by
> side**, each with a **95% CI**, and **name the test applied** on every
> analytical table.

### The repair round

If the gate objects, its findings are handed straight back with:

> The specification was rejected by the validator. Return the analyses and tables
> again, corrected so that these problems are gone. **Change nothing else.**

---

## 4. The gate: 75 guards

Nothing renders while an ERROR stands. Every guard is proved by a mutation that
breaks a clean specification in exactly one way, so a guard that rots fails CI.

| Group | Guards | The idea |
|---|---|---|
| Referential | `REF01-02`, `VAR10` | Ids unique, every reference resolves, **one concept has one wording** |
| Objectives | `OBJ01-06` | One primary; every objective has an outcome; the primary declares a full estimand |
| Outcomes | `OUT01-09` | One primary; every outcome analysed; units on numbers; the summary statistic must suit the data type |
| Sample size | `SS01-05` | Powered on the primary and nothing else; **`SS03` recomputes n and fails when the arithmetic does not reproduce** |
| Variables | `VAR01-17` | Raw in, derived out; no CRF field on a computed value; a band's source must be a captured number; a score's items must be on the form |
| Adjustment | `ADJ02-07` | **No mediator, no collider**, no self-adjustment; degrees of freedom counted from categories, not names; at least 10 events per df |
| Tests | `TEST01-06`, `SURV01-02` | The test must fit the data type; the effect measure must be one the model produces; a case-control cannot yield a risk ratio |
| Tables | `TBL01-10` | Numbering, block order, sensitivity last, no "Model 1", unadjusted beside adjusted, a 95% CI on every effect column |
| CRF | `CRF02, CRF05-09` | Sections ordered, selects have options, numbers show units, dates carry a mask |
| Design | `STU02-05` | Per-family required facts; **`STU05` refuses a design whose renderers do not exist rather than rendering it half-right** |
| Structure | `POP01-02`, `ELG01-02`, `TP01-02`, `GDL01` | Populations, eligibility gaps, time-point windows, the screening log |

---

## 5. What each document does with the specification

### 5.1 Case Record Form

- Header, participant identifiers, then an **eligibility checklist** built from
  the inclusion and exclusion criteria
- One numbered section per CRF section, in order, each showing its **time point
  and window**
- Every field in the house format: **`# | Field / Variable | Field type | Response`**
- Field types: Number, Date, Single-select, Multi-select, Single-select + text, Text
- Options pre-printed with tick boxes; numbers show their unit; dates carry a mask
- **Derived values never appear as fields.** They are listed separately under
  *"Values computed from this form, not collected on it"*, with the formula and
  the reason: a computed value entered by hand cannot be audited, and the raw data
  is what lets a scoring error be corrected later

### 5.2 Statistical Analysis Plan

Nine sections, all read from the specification:

| Section | Contents |
|---|---|
| 0 | Study at a glance |
| 1 | Objectives as answerable questions, with the full ICH E9(R1) estimand |
| 2 | The variable table: role, type, unit or levels, where the definition comes from |
| 3 | **Derived variables and scores**, each with its formula and source fields |
| 4 | The analysis map: objective, outcome, unadjusted test, adjusted model, covariates, effect measure, table |
| 5 | Sample size: every input **with its source**, and the result |
| 6 | General rules: populations, multiplicity, missing data, reporting |
| 7 | Sensitivity analyses |
| 8 | The shell-table list |

### 5.3 Shell Tables

- Blocks in order, headed: Descriptive characteristics, Primary outcome,
  Secondary outcomes, Exploratory outcomes, Sensitivity analyses
- `Table N. Title`, then the column headers, then the rows
- **Row labels carry their summary statistic** - `Age (years), mean (SD)`
- A categorical variable becomes **one row per level**, with the reference marked
- **Cells are empty.** These are shells, not results
- Every analytical table closes with `Test applied: ...`
- Exploratory blocks are marked as hypothesis-generating and not powered

---

## 6. House style, enforced for every document

- **Times New Roman 12pt throughout.** Headings differ by weight alone
- **Black on white only.** Every built-in Word style is overridden, because the
  library otherwise emits blue headings and blue hyperlinks
- **No rules or decorative lines.** Only table cells carry borders, in black
- **No em dashes, en dashes, smart quotes, ellipsis characters or stray glyphs.**
  Rewritten at the renderer boundary
- **No machine-written vocabulary.** 38 words and phrases are banned in the prompt
  (delve, leverage, robust, comprehensive, furthermore, pivotal, meticulous...)
  with the plain replacement given: *important* not *pivotal*, *also* not
  *furthermore*, *use* not *leverage*
- Every document stamps the specification version it was built from, and says so
  if that specification has not been signed off

---

## 7. Where to change what

| To change | Edit |
|---|---|
| How protocols are read and judged | `src/lib/protocol/knowledge/*.md` - prose, no code |
| What the model is asked for at each stage | `STAGES` in `src/lib/study-spec/ingest.ts` |
| What counts as an error | `src/lib/study-spec/invariants/*.js` |
| The shape of the specification | `src/lib/study-spec/study_spec.schema.json` |
| How a document looks | `src/lib/render/crf.ts`, `sap.ts`, `shell-tables.ts` |
| Fonts, colour, punctuation | `src/lib/render/house-style.ts` |

Run `npm run spec:mutate` after touching a guard: it breaks a clean specification
75 ways and asserts each guard fires.

---

## 8. The limits, stated plainly

The gate proves the four documents **agree with each other**. It cannot prove the
study is right. A perfectly consistent specification can encode the wrong primary
outcome.

That is why sign-off exists, and why an unsigned document opens with **DRAFT**.
The methodological judgement - is this the right primary outcome, is this
adjustment set defensible, would this sample size survive an examiner - is yours
and cannot be delegated to a validator.
