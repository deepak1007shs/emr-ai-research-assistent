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
| `study` | title, design, framework, guideline, population, groups, sample size |
| `timepoints` | every occasion anything is measured |
| `objectives` | question, tier, outcome refs |
| `outcomes` | definition, instrument, timepoint, data type, summary statistic, source variables |
| `variables` | **role**, data type, unit, categories, reference level, CRF placement, derivation |
| `analyses` | objective → outcome → unadjusted test → adjusted model → covariates → tables |
| `tables` | number, block, title, kind, row variables, columns, footnote |
| `crf_sections` | sections and sub-sections, in order |
| `populations`, `multiplicity`, `sensitivity_analyses`, `open_items` | analysis rules |
| `review` | the Step 1 critique, so Protocol Understanding renders from here too |

Three choices carry the weight:

**Roles are causal.** `role` is one of `outcome_source, exposure, covariate,
effect_modifier, mediator, collider, precision, stratifier, derived,
administrative, eligibility, censoring`. Naming `mediator` and `collider` as
first-class roles is what lets the gate *refuse* them in an adjustment set. A
schema whose only category is "covariate" will happily let you adjust away the
effect you are measuring.

**Derived values are computed, never captured.** A `derived` variable names
`derived_from` and a formula and has no CRF block. The gate expands it to its raw
ingredients when checking what the form must capture — so "length of stay"
reaches the shell table while "date of surgery" and "date of discharge" reach the
form, with no way to forget one.

**One concept, one wording.** `label` is the single authoritative string. Two
objects sharing a label is an error. This is what literally delivers "no mismatch
of a single line": there is only one line, stored once.

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

## Renderers

Four pure functions, one shared formatting library so two renderers cannot format
the same field differently.

- **CRF** — sections in order; every field as `Field / Variable | Field type |
  Response`; options pre-printed; units shown; derived variables marked and not
  fillable.
- **SAP** — study at a glance, objectives as answerable questions, variable
  table, analysis map, general rules, populations, multiplicity, sensitivity.
- **Shell Tables** — `Table N. Title`, blocks in order, empty cells, every
  analytical table closing with `Test applied: …`, unadjusted and adjusted side
  by side, a 95% CI on every effect column.

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
