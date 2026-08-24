# One Spec, Four Artifacts — design

*SAP Builder Step 2: Case Record Form, Statistical Analysis Plan, and Shell Tables.*

## Context

Step 1 reviews a protocol and produces a critique. Step 2 produces the three
documents a researcher actually runs the study with — a CRF to collect the data,
a SAP saying how it will be analysed, and shell tables showing exactly what will
be reported.

These three cannot be allowed to disagree. A covariate in an adjusted model that
was never on the form, a primary outcome that changed in the SAP but not in the
tables — each is invisible until submission, and each is found by a human
proofreading on a deadline.

The architecture the user supplied solves this by refusing to chain the
documents. There is one editable object; the documents are projections of it. A
mismatch is not something to detect, because it cannot be expressed.

## Decisions taken

| Question | Answer |
|---|---|
| Does the Sprint-1 spine exist? | No. Build schema, validator, mutation tests from the architecture doc. |
| One spec or two? | **One.** `study_spec.json` gains a `review` block; all four documents render from it. |
| Scope this round | Spine + ingest + all four renderers. No form editor. |
| Design coverage | **All** designs in the schema and the gate from day one; renderers ship by family, commonest first. An unsupported family is rejected, never approximated. |
| Deep-read additions | Estimand, structured sample size, eligibility registry, timepoint windows. |
| Use the `.skill` bundles in `~/Downloads`? | **No** — build from the architecture doc. Flagged: the resulting CRF and shell-table formats may differ in detail from the ones currently handed to students. |

## Architecture

```
protocol (PDF/DOCX)
   │
   ▼  Stage 0 — ingest (Claude, judgement)
study_spec.json  ◀── the only editable artifact, versioned
   │
   ▼  Stage 1 — validate_study_spec.js  (build gate: ERROR stops everything)
   │
   ├─▶ Protocol Understanding  (spec.review → ReviewSpec → vendored build_review_md.js)
   ├─▶ Case Record Form        (crf_sections + variables)
   ├─▶ Statistical Analysis Plan (objectives + outcomes + analyses + populations)
   └─▶ Shell Tables            (tables[])
```

The asymmetry is the point. Stage 0 holds all the clinical judgement — design,
primary outcome, which variables are confounders rather than mediators. Stages 1
onward contain no opinions at all.

**Protocol Understanding costs a mapping function, not a rewrite.** `spec.review`
projects onto the existing `ReviewSpec` shape and goes through the vendored
`build_review_md.js` untouched.

## The object

Registries, each a list of objects with a unique `id`; everything else is a
cross-reference.

| Registry | Holds |
|---|---|
| `study` | title, design, **design_detail**, framework, guideline, setting, centres, recruitment period, population, groups |
| `timepoints` | every occasion anything is measured, **with its window** |
| `objectives` | question, tier, **estimand**, comparison type and margin, outcome refs |
| `outcomes` | definition, instrument, timepoint, data type, summary statistic, **source variables** |
| `variables` | **role**, data type, **subtype**, unit, categories, **definition source and reference**, reference level, CRF placement, derivation |
| `analyses` | objective → outcome → unadjusted test → adjusted model → covariates → tables |
| `tables` | number, block, title, kind, row variables, columns, footnote |
| `crf_sections` | sections and sub-sections, in order |
| `eligibility` | inclusion and exclusion criteria as numbered, checkable items |
| `sample_size` | formula, sourced inputs, α, power, effect, attrition, n, powered outcome |
| `populations`, `multiplicity`, `sensitivity_analyses`, `missing_data`, `open_items` | analysis rules |
| `review` | the Step 1 critique, so Protocol Understanding renders from here too |

Three choices carry the weight:

**Roles are causal.** `role` is one of `outcome_source, exposure, covariate,
effect_modifier, mediator, collider, precision, stratifier, derived,
administrative, eligibility, censoring`. Naming `mediator` and `collider` as
first-class roles is what lets the gate *refuse* them in an adjustment set. A
schema whose only category is "covariate" will happily let you adjust away the
effect you are measuring.

**Raw and rich in, derived out.** See the section below — this is the rule that
decides what appears on which document.

**One concept, one wording.** `label` is the single authoritative string. Two
objects sharing a label is an error. This is what literally delivers "no mismatch
of a single line": there is only one line, stored once.

## Every design, and what the documents mean for each

The spec must cover every design Step 1 can classify. That is not the same as
every design rendering the same three documents — for several families, the
documents are different artefacts wearing the same names.

| Family | "CRF" is | "SAP" is | "Shell tables" are |
|---|---|---|---|
| Interventional; cohort; case–control; cross-sectional | patient-level data form | statistical analysis plan | descriptive + primary/secondary/exploratory outcome tables |
| Diagnostic accuracy | index-test and reference-standard form | accuracy analysis plan | 2×2, sensitivity/specificity/PPV/NPV/LR, ROC |
| Prognostic / prediction model | predictor and outcome form | model development and validation plan | discrimination, calibration, performance |
| Reliability / agreement | rater and occasion form | agreement plan | ICC, kappa, Bland–Altman |
| Economic evaluation | resource-use form | economic analysis plan | cost, effectiveness, ICER, sensitivity |
| Qualitative | interview or observation guide | analytic approach and trustworthiness | theme and quotation matrix |
| Mixed methods | both strands' instruments | both plans plus the integration point | both catalogues |
| Evidence synthesis | data-extraction form | synthesis plan | PRISMA flow, study characteristics, risk of bias, forest-plot shells |

**A design whose renderers are not implemented is rejected by the gate, never
approximated.** A half-right CRF is worse than no CRF, because it will be used.

### Design-specific required blocks

`design_detail` is a per-family block whose required fields the gate enforces.
Each one exists because omitting it makes a document wrong, not merely thin:

| Design | Required | Why it changes a document |
|---|---|---|
| Case–control | matching variables, ratio | Matching variables must be **on the CRF**, and the analysis must be **conditional** logistic regression |
| Cluster randomised | ICC, cluster size, unit of allocation | Sample size needs the design effect; analysis needs a mixed model |
| Crossover | washout, periods, sequences | The CRF needs per-period visits; the SAP needs carryover |
| Cohort | follow-up schedule, censoring rule, loss-to-follow-up definition | A time-to-event outcome needs a censoring date field |
| Randomised, any | sequence generation, concealment, blinding, ratio | CONSORT cannot be reported without them |
| Diagnostic | index test, reference standard, blinding, indeterminate handling | STARD tables cannot be built |
| Non-inferiority | margin δ, one-sided α | Both a sample-size input and an analysis rule |

Matching is the most-forgotten item in thesis case–control studies. Making it a
required field means it cannot be forgotten.

**Sequencing.** The schema and the gate cover every family from day one, so
nothing renders half-right. Renderers ship by family, commonest first:
interventional and observational patient-level, then diagnostic and reliability,
then evidence synthesis, then qualitative.

## Objectives carry an estimand

An objective is a question; an estimand is what the study is actually trying to
estimate. The primary objective declares all five ICH E9(R1) attributes:
treatment condition, population, endpoint, **intercurrent-event strategy**, and
population-level summary.

The intercurrent-event strategy is the attribute thesis protocols always omit,
and it decides the analysis: what happens when a patient stops treatment, gets
rescue therapy, or dies before the endpoint. Naming it forces the decision to be
made before data collection rather than argued about afterwards.

Objectives also declare the comparison type — **superiority, non-inferiority or
equivalence** — and, for the latter two, the margin δ, which is simultaneously a
sample-size input and an analysis rule.

## Sample size is computed, not quoted

A structured block, not a sentence: the formula, every input **with the source it
came from**, α, power, the effect being detected, the attrition allowance, the
resulting n, and `powered_outcome_id`.

That makes it checkable. `SS03` recomputes n from the stated inputs and fails when
the arithmetic does not reproduce — the check Step 1 currently performs by hand.
`SS01`/`SS02` already require that the study is powered on the **primary** outcome
and no other.

## Eligibility is a registry

Inclusion and exclusion criteria as discrete, numbered, individually checkable
items, each optionally bound to a variable.

This earns three things: the CRF gets an eligibility checklist, `GDL01`'s
screening-log requirement gains the fields a CONSORT or STROBE flow diagram
actually needs, and the gate can detect a criterion gap — a range that leaves
patients covered by neither the inclusion nor the exclusion rule, the ASA I/II
versus "ASA > III" error from the worked example.

Timepoints likewise carry a **window**, not just a label: "Day 28" is unusable,
"Day 28 ± 3" is a protocol. The CRF prints the window, and a visit outside it is
a protocol deviation.

## The traceability chain

Nothing in the spec floats. Every object earns its place by being reachable along
one chain, and the gate walks it in both directions.

```
objective  ──▶  outcome(s)  ──▶  variable(s)  ──▶  CRF field(s)
    ▲                                                    │
    └──────────── nothing exists that isn't on this chain ┘
```

**Forwards — nothing is less.** Every objective must name at least one outcome;
an objective with no outcome is a wish, not a question. Every outcome must name
the variables required to measure it; an outcome with no source variables cannot
be collected. Every one of those variables must end in a CRF field, directly if
captured or through its derivation chain if computed.

**Backwards — nothing is extra.** Every variable must be reachable from some
outcome, analysis or table, and every CRF field must trace back to a variable
that something needs. A field that traces to nothing is asking a patient a
question no one will analyse.

The two directions together are what make the four documents agree: the CRF
contains exactly what the outcomes require, no more and no less, and the shell
tables report exactly what the objectives asked.

### Type and subtype

Each variable carries two classifications, because one is not enough to choose a
summary statistic or a test.

- **`data_type`** — the statistical kind: `continuous`, `count`, `binary`,
  `ordinal`, `nominal`, `time_to_event`, `date`, `text`.
- **`subtype`** — the finer distinction that changes the analysis: a `continuous`
  variable that is a ratio versus an interval scale; a `count` that is bounded
  versus unbounded; a `time_to_event` and its censoring rule; an `ordinal` scale
  and the number of levels.

`data_type` plus `subtype` determine the summary statistic and the permissible
tests, so the existing `TEST01–05` guards read from them rather than from a
free-text guess.

### Definitions come from the protocol, or from a standard

A category set is never invented. Every variable whose levels are clinical states
declares where those levels come from:

- **`definition_source`** — `protocol` or `standard`.
- **`definition_reference`** — the exact quote from the protocol, or the named
  classification: ISGPS for POPF and PPH, Clavien–Dindo for complications, CDC
  criteria for SSI, KDIGO for AKI, NYHA, ASA, mRS, RECIST, and so on.

If the protocol defines the outcome, the spec quotes the protocol and the CRF
prints those levels. If the protocol is silent — which is the common case, and
one of the commonest findings in Step 1's reviews — the spec names the standard
being adopted, and that choice surfaces in the SAP where the guide can see it and
object. A grade is never left to the data collector's judgement.

### Invariants this adds

| Code | Rule |
|---|---|
| `OBJ02` | Every objective names at least one outcome. |
| `OUT07` | Every outcome names at least one source variable. |
| `OUT08` | Every source variable resolves, and its chain terminates in CRF fields. |
| `OUT09` | An outcome's summary statistic is one its `data_type` and `subtype` permit. |
| `VAR14` | Every variable declares both `data_type` and `subtype`. |
| `VAR15` | Every variable with clinical category levels declares `definition_source` and `definition_reference`. |
| `VAR16` | **WARN** — an outcome variable whose definition is neither quoted from the protocol nor attributed to a named standard. |

## Raw and rich in, derived out

The CRF collects **raw** data. Anything computed — a difference, a ratio, a
score, a grade, a band — is a derivation, and derivations live in the SAP (with
their formula stated) and in the shell tables where the study reports them. No
derived value ever appears as a field to be filled in.

Two failure modes this prevents, both irreversible once data collection starts:

**Capturing the answer instead of the ingredients.** A form with a "Length of
stay (days)" box invites a data collector to do arithmetic in their head, and the
dataset then has no way to audit it. Capture *date of surgery* and *date of
discharge*; the SAP states `length_of_stay = discharge − surgery`, and the shell
table prints "Length of stay (days), median (IQR)". One number, three documents,
computed once.

**Capturing coarse where rich is available — the "rich" half of the rule.** A
form that records *age band 50–65* instead of *date of birth*, *hypertensive
yes/no* instead of the blood-pressure reading, or *Fontaine grade* instead of the
findings that determine it, has destroyed information no analysis can recover. If
the guide later wants age as a continuous predictor, or a different cut-point,
the data is simply gone. **Always capture at the finest granularity available;
banding and grading are derivations.**

Scores follow the same rule. A CRF collects the *items* of GAD-7, PHQ-9, EQ-5D or
a MUST assessment; the total, index or category is derived. This also means a
scoring error is fixable after the fact, and a second scoring convention can be
applied to the same data.

### How the schema carries it

A variable is either **captured** — it has a `crf` block — or **derived** — it has
`derived_from`, a `derivation` formula, a `derivation_kind`
(`formula` / `score` / `band` / `index`), and **no `crf` block**. There is no
third option, and nothing is both.

The gate expands every derivation to its raw ingredients when it computes what
the form must capture, so a variable that reaches a table always drags its inputs
onto the CRF automatically.

### Invariants this adds

| Code | Rule |
|---|---|
| `VAR05` | A derived variable must not carry a `crf` block. |
| `VAR06` | It must name `derived_from` and a `derivation`. |
| `VAR07` | Every `derived_from` id resolves, and the chain terminates in captured variables — a derivation whose ingredients are never collected is unbuildable. |
| `VAR08` | No cycles in a derivation chain. |
| `VAR11` | A `band` derivation's source must be a **continuous captured** variable. |
| `VAR12` | **WARN** — a categorical variable whose categories are numeric ranges and which has no `derived_from` is a band being collected as a band. Capture the number instead. |
| `VAR13` | A `score` derivation must list every component item, and each component must have a CRF field. |
| `SAP01` | Every derived variable used by any analysis or table appears in the SAP's derivations section with its formula. |

## The gate

`validate_study_spec.js` — zero dependencies, CommonJS, portable, the same
discipline as `build_review_md.js`.

- **Layer 1, shape.** Minimal JSON-Schema subset check: types, enums, patterns,
  required properties, unknown properties.
- **Layer 2, invariants.** The cross-object rules JSON Schema cannot express,
  carrying the doc's codes: `REF01–02`, `OBJ01–04`, `OUT01–06`, `SS01–02`,
  `VAR01–10`, `ADJ02–07`, `TEST01–05`, `SURV01`, `TBL01–09`, `CRF01–09`,
  `GDL01–04`, `POP01–02`.

Severity: **ERROR** stops the build; **WARN** proceeds and is stamped into the
report. `--final` makes warnings fatal and blocks on unresolved `open_items`, so
a half-specified draft can still render something to argue over.

`test_invariants.js` breaks a clean spec once per guard and asserts each fires.
A mutation that stops failing means a guard has rotted.

## House style, for every .docx

One rule for all four documents, enforced in `src/lib/render/house-style.ts` and
shared by every renderer:

- **Times New Roman, 12pt, throughout.** Headings are distinguished by weight
  alone, because "12pt" is a blanket instruction and a larger heading breaks it.
- **Black on white only.** Every built-in Word style is overridden, not merely
  the ones we use, because the library otherwise emits blue headings and blue
  hyperlinks into a document meant to be black and white.
- **No rules or decorative lines.** Only table cells carry borders, and those are
  black.
- **No em dashes, en dashes, smart quotes, ellipsis characters or decorative
  glyphs.** `plain()` rewrites them at the renderer boundary, so the Markdown
  artifacts and the canonical builder stay untouched.
- **No generated-text vocabulary.** The prohibited list lives in `workflow.md`,
  so the model avoids it at source rather than having it patched at render time.

## Renderers

Four pure functions, one shared formatting library so two renderers cannot format
the same field differently.

- **CRF** — sections in order; every field as `Field / Variable | Field type |
  Response`; options pre-printed; units shown. **Captured variables only** —
  derived values do not appear at all, because a form is for recording what was
  observed, not what can be computed from it.
- **SAP** — study at a glance, objectives as answerable questions, variable
  table, **derivations** (every computed variable and score, with its formula and
  source fields), analysis map, general rules, populations, multiplicity,
  sensitivity.
- **Shell Tables** — `Table N. Title`, blocks in order, empty cells, every
  analytical table closing with `Test applied: …`, unadjusted and adjusted side
  by side, a 95% CI on every effect column. Rows may be derived variables and
  scores where the study reports them.

**A renderer that needs a fact the spec lacks is a schema bug.** Extend the
schema; never let a renderer supply a default. The moment one does, there is a
second hidden source of truth and drift is back.

## Ingest and sign-off

One Claude call drafts the spec from the protocol, reusing the Step 1 knowledge
base. High-stakes fields — design, primary outcome, sample-size basis, adjustment
set — carry a confidence and a source quote from the protocol.

The draft is never auto-accepted. Gate **G0** shows the investigator the rendered
Protocol Understanding and a plain-language summary of the decisions, not the
JSON. Nothing renders until it is signed.

## Storage

`study_specs`: `id`, `protocol_id`, `owner`, `spec jsonb`, `spec_version`,
`status` (`draft` / `signed` / `locked`), `validation jsonb`, `created_at`,
`signed_at`. RLS by owner, as the existing tables.

Semantic versioning: patch = wording, minor = a variable or table added, **major
= primary outcome, design, or adjustment set changed** — the change that needs
the guide's re-consent, made visible by forcing a version bump. Every rendered
artifact stamps the version it was built from.

## Verification

1. `tsc`, lint, and the full test suite clean.
2. `test_invariants.js` — every guard fires on its mutation.
3. A hand-written example spec renders all four documents; the CRF, SAP and
   shell tables agree on the primary outcome by construction.
4. **Round-trip check (G3):** re-parse each rendered artifact and diff the
   extracted facts against the spec. Drift means a renderer is impure.
5. End-to-end on JAY THESIS PROTOCOL: review → draft spec → sign off → four
   documents.
6. **Your judgement.** Whether the adjustment set is right, and whether the
   shell tables match what an examiner expects, are calls only you can make.

## Known limits

- The gate checks internal consistency, not truth. A perfectly consistent spec
  can encode the wrong primary outcome. G0 is not optional.
- Editing nested JSON by hand is miserable; the form editor is deliberately out
  of scope this round, and will be the thing that decides whether this is used.
- The test/model matrix encodes the common cases and will be wrong at the edges
  (competing risks, clustering, informative censoring). An `override` is allowed
  with a written justification that prints in the SAP — an override that must be
  explained in public is self-policing.
- Crossover, cluster, stepped-wedge, N-of-1, diagnostic and agreement designs
  need fields the enums only gesture at. An unsupported design must fail loudly
  rather than render silently.
