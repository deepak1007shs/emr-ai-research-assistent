# Study Spec Spine — Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `study_spec.json`'s contract and its build gate — the schema, a zero-dependency validator carrying ~65 cross-object invariants, and a mutation harness that proves every guard fires.

**Architecture:** One editable object, validated before anything renders. The validator is plain CommonJS with no dependencies, following the same discipline as the vendored `build_review_md.js`, so it can be dropped into any Node program or run from CI. Layer 1 checks shape against a JSON-Schema subset; Layer 2 checks the cross-object rules JSON Schema cannot express.

**Tech Stack:** Node 24 (CommonJS, core only), TypeScript declarations for app consumption, Vitest for the app-side tests.

## Global Constraints

- **Zero runtime dependencies** in `validate_study_spec.js` and `test_invariants.js` — Node core only (`fs`, `path`, `process`). No npm packages, ever.
- **CommonJS**, `'use strict'`, `module.exports` — matches `build_review_md.js`, and keeps the file droppable into other projects.
- Both files must be **runnable standalone**: `node validate_study_spec.js spec.json`.
- Every finding carries `{ code, severity, path, message }`. `severity` is `'ERROR'` or `'WARN'`.
- **ERROR stops the build. WARN does not**, unless `--final`.
- Invariant codes are **stable identifiers** — never renumber one; retire and add.
- Messages name the offending id and say what to do: `OBJ01: 2 primary objectives (obj_1, obj_2) — exactly one is allowed. Demote one to secondary.`
- The file is excluded from ESLint, as `build_review_md.js` is (`require()` style imports).
- Design families: `interventional`, `cohort`, `case_control`, `cross_sectional`, `diagnostic`, `prognostic`, `reliability`, `economic`, `qualitative`, `mixed_methods`, `evidence_synthesis`. A family with no renderer is rejected at render time, not here.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/study-spec/study_spec.schema.json` | The contract: every registry, every enum. Layer 1 reads it. |
| `src/lib/study-spec/validate_study_spec.js` | The gate. Layer 1 shape + Layer 2 invariants + CLI. Zero deps. |
| `src/lib/study-spec/validate_study_spec.d.ts` | Types for app-side consumption. |
| `src/lib/study-spec/invariants/*.js` | One module per invariant group, each exporting `check(spec, ctx) → findings[]`. |
| `src/lib/study-spec/example_study_spec.json` | A complete, passing parallel-RCT spec exercising binary, continuous and time-to-event outcomes, a derived variable, a score, an adjusted model, censoring and a sensitivity block. |
| `src/lib/study-spec/test_invariants.js` | Mutation harness: breaks the example once per guard, asserts each fires. |
| `src/lib/study-spec/*.test.ts` | Vitest wrappers so the suite runs with `npm test`. |

Splitting invariants into one module per group keeps each file small enough to hold in context, and lets a reviewer reject one group without touching another.

---

### Task 1: The contract and the validator harness

**Files:**
- Create: `src/lib/study-spec/study_spec.schema.json`
- Create: `src/lib/study-spec/validate_study_spec.js`
- Create: `src/lib/study-spec/example_study_spec.json`
- Create: `src/lib/study-spec/validate.test.ts`
- Modify: `eslint.config.mjs` (add the validator to `globalIgnores`)

**Interfaces:**
- Produces: `validate(spec, options) → { ok: boolean, findings: Finding[] }` where
  `Finding = { code: string, severity: 'ERROR'|'WARN', path: string, message: string }`
  and `options = { final?: boolean }`.
- Produces: `module.exports = { validate, SCHEMA }`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/study-spec/validate.test.ts
import { describe, expect, it } from "vitest";
import { validate } from "./validate_study_spec";
import example from "./example_study_spec.json";

describe("validate", () => {
  it("passes the example spec with no errors", () => {
    const { ok, findings } = validate(example);
    const errors = findings.filter((f) => f.severity === "ERROR");
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("reports a shape violation with a path", () => {
    const broken = { ...example, study: { ...example.study, design: "not-a-design" } };
    const { ok, findings } = validate(broken);
    expect(ok).toBe(false);
    expect(findings.some((f) => f.path === "study.design")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/study-spec/validate.test.ts`
Expected: FAIL — cannot resolve `./validate_study_spec`.

- [ ] **Step 3: Write the schema**

`study_spec.schema.json` declares every registry from the design doc: `spec_version`, `study` (with `design`, `design_detail`, `framework`, `guideline`, `setting`, `centres`, `recruitment_period`, `population`, `groups`), `timepoints`, `eligibility`, `objectives`, `outcomes`, `variables`, `analyses`, `tables`, `crf_sections`, `sample_size`, `populations`, `multiplicity`, `sensitivity_analyses`, `missing_data`, `open_items`, `review`.

Enums to declare exactly: `role` (`outcome_source, exposure, covariate, effect_modifier, mediator, collider, precision, stratifier, derived, administrative, eligibility, censoring`); `data_type` (`continuous, count, binary, ordinal, nominal, time_to_event, date, text`); `derivation_kind` (`formula, score, band, index`); `definition_source` (`protocol, standard`); `tier` (`primary, secondary, exploratory`); `comparison_type` (`superiority, non_inferiority, equivalence, none`); `field_type` (`number, date, single_select, multi_select, single_select_text, text, derived`); table `block` (`descriptive, primary, secondary, exploratory, sensitivity`).

- [ ] **Step 4: Write the harness**

```js
'use strict';
const fs = require('fs');
const path = require('path');

const SCHEMA = require('./study_spec.schema.json');

/** Every invariant group, in the order findings should be reported. */
const GROUPS = [
  require('./invariants/referential'),
  // later tasks push their modules here
];

function finding(code, severity, p, message) {
  return { code, severity, path: p, message };
}

/** Layer 1 — shape. A deliberately small JSON-Schema subset. */
function checkShape(node, schema, p, findings) {
  // type, enum, required, properties, items, additionalProperties, pattern
  // (full implementation in this step)
}

function validate(spec, options) {
  const opts = options || {};
  const findings = [];
  checkShape(spec, SCHEMA, '', findings);

  // Shape failures make cross-object checks meaningless — stop here.
  if (!findings.some((f) => f.severity === 'ERROR')) {
    const ctx = buildIndex(spec);
    for (const group of GROUPS) findings.push(...group.check(spec, ctx));
  }

  const fatal = opts.final
    ? findings
    : findings.filter((f) => f.severity === 'ERROR');
  return { ok: fatal.length === 0, findings };
}

module.exports = { validate, SCHEMA };
```

`buildIndex(spec)` returns `{ byId: Map, labels: Map, variablesById, outcomesById, … }` so no group re-walks the spec.

- [ ] **Step 5: Write the example spec**

A complete passing parallel-RCT spec. It must exercise: a binary primary outcome, a continuous secondary, a time-to-event with censoring, a derived variable (length of stay from two dates), a score (items → total), an adjusted model with three covariates, one sensitivity analysis, and a full table set.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/study-spec/validate.test.ts`
Expected: PASS, both tests.

- [ ] **Step 7: Exclude from lint and commit**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/study-spec eslint.config.mjs
git commit -m "feat(spec): study spec contract and validator harness"
```

---

### Tasks 2–11: The invariant groups

Each task follows the identical five-step cycle: write the mutation test, watch it fail, implement `src/lib/study-spec/invariants/<group>.js`, watch it pass, commit. Each module exports `check(spec, ctx) → Finding[]` and is appended to `GROUPS`.

Every guard below is specified as: **code — condition that FAILS — severity**. The message must name the offending id and state the fix.

#### Task 2 — `referential.js`

| Code | Fails when | Severity |
|---|---|---|
| `REF01` | two objects anywhere share an `id` | ERROR |
| `REF02` | any cross-reference names an id that does not exist | ERROR |
| `VAR10` | two objects share a `label` (terminology lock) | ERROR |

#### Task 3 — `objectives.js`

| Code | Fails when | Severity |
|---|---|---|
| `OBJ01` | not exactly one objective with `tier: primary` | ERROR |
| `OBJ02` | an objective names no outcome | ERROR |
| `OBJ03` | an outcome's tier disagrees with its objective's tier | ERROR |
| `OBJ04` | an outcome belongs to no objective | ERROR |
| `OBJ05` | the primary objective's `estimand` lacks any of the five ICH E9(R1) attributes | ERROR |
| `OBJ06` | `comparison_type` is `non_inferiority` or `equivalence` and no `margin` is given | ERROR |

#### Task 4 — `outcomes.js`

| Code | Fails when | Severity |
|---|---|---|
| `OUT01` | not exactly one outcome with `tier: primary` | ERROR |
| `OUT02` | an outcome has no analysis | ERROR |
| `OUT03` | a `continuous` or `count` outcome has no `unit` | ERROR |
| `OUT04` | an outcome's `timepoint_id` does not resolve | ERROR |
| `OUT05` | an outcome has no `instrument` | ERROR |
| `OUT06` | `summary_statistic` is absent | ERROR |
| `OUT07` | an outcome names no `source_variable_ids` | ERROR |
| `OUT08` | a source variable's derivation chain does not terminate in captured variables | ERROR |
| `OUT09` | `summary_statistic` is not permitted by the outcome's `data_type`/`subtype` (mean for a nominal, median for a binary) | ERROR |

#### Task 5 — `variables.js`

| Code | Fails when | Severity |
|---|---|---|
| `VAR01` | a variable is not reachable from any outcome, analysis or table | WARN |
| `VAR03` | `role` is outside the enum | ERROR |
| `VAR04` | a `derived` variable lacks `derived_from`, `derivation` or `derivation_kind` | ERROR |
| `VAR05` | a `derived` variable carries a `crf` block | ERROR |
| `VAR06` | a non-derived variable that an analysis needs has no `crf` block | ERROR |
| `VAR07` | a derivation chain does not terminate in captured variables | ERROR |
| `VAR08` | a derivation chain contains a cycle | ERROR |
| `VAR09` | a `nominal` or `ordinal` variable declares no `categories` | ERROR |
| `VAR11` | a `band` derivation's source is not a continuous captured variable | ERROR |
| `VAR12` | a categorical variable's categories are numeric ranges and it has no `derived_from` | WARN |
| `VAR13` | a `score` derivation does not list components, or a component has no CRF field | ERROR |
| `VAR14` | `data_type` or `subtype` is missing | ERROR |
| `VAR15` | a variable with clinical categories lacks `definition_source` or `definition_reference` | ERROR |
| `VAR16` | an outcome-source variable's definition is neither quoted from the protocol nor attributed to a standard | WARN |
| `VAR17` | a categorical predictor has zero or more than one `reference_level` | ERROR |

#### Task 6 — `sample_size.js`

| Code | Fails when | Severity |
|---|---|---|
| `SS01` | `powered_outcome_id` is not the primary outcome | ERROR |
| `SS02` | more than one outcome claims to be powered | ERROR |
| `SS03` | the stated `n` does not reproduce from the stated inputs (±1 for rounding) | ERROR |
| `SS04` | any input lacks a `source` | WARN |
| `SS05` | no attrition allowance is stated | WARN |

`SS03` implements the formulas from Step 1's `03-detailed-methodology.md`: single proportion, single mean, two proportions, two means, paired means, case–control OR, correlation, sensitivity/specificity, time-to-event, cluster design effect, non-inferiority. Where the formula is unrecognised, emit `SS03` as WARN saying it could not be checked, never silently pass.

#### Task 7 — `adjustment.js`

| Code | Fails when | Severity |
|---|---|---|
| `ADJ02` | a `mediator` appears in an adjustment set | ERROR |
| `ADJ03` | a `collider` appears in an adjustment set | ERROR |
| `ADJ04` | the outcome or exposure appears in its own covariate list | ERROR |
| `ADJ05` | degrees of freedom exceed the events-per-variable budget (< 10 events per df) | ERROR |
| `ADJ06` | df are counted from variable names rather than category counts | ERROR |
| `ADJ07` | a covariate has no CRF field | ERROR |

`ADJ05` counts **degrees of freedom**: a continuous covariate is 1, a k-level categorical is k−1.

#### Task 8 — `tests.js`

| Code | Fails when | Severity |
|---|---|---|
| `TEST01` | the unadjusted test does not fit the outcome's `data_type` | ERROR |
| `TEST02` | the test does not fit the comparison (paired data, unpaired test) | ERROR |
| `TEST03` | the model does not fit the outcome's `data_type` | ERROR |
| `TEST04` | the effect measure is not one the model produces | ERROR |
| `TEST05` | a case–control design claims a risk ratio | ERROR |
| `TEST06` | outcome incidence > 10% and a logistic model reports an OR as if it were an RR | WARN |
| `SURV01` | a Cox model declares no proportional-hazards check | ERROR |
| `SURV02` | a `time_to_event` outcome has no censoring variable | ERROR |

#### Task 9 — `tables.js`

| Code | Fails when | Severity |
|---|---|---|
| `TBL01` | table numbers are not contiguous from 1 | ERROR |
| `TBL02` | blocks are out of order (descriptive → primary → secondary → exploratory → sensitivity) | ERROR |
| `TBL03` | a table has no row variables | ERROR |
| `TBL04` | a sensitivity table is not last in its block | ERROR |
| `TBL05` | an outcome family has more than one test and no multiplicity note | WARN |
| `TBL06` | an analytical table does not name its test | ERROR |
| `TBL07` | a column is labelled "Model 1", "Model 2", … | ERROR |
| `TBL08` | an adjusted column exists with no unadjusted column beside it | ERROR |
| `TBL09` | an effect column carries no 95% CI | ERROR |
| `TBL10` | a categorical row variable declares no reference row | ERROR |

#### Task 10 — `crf.js`

| Code | Fails when | Severity |
|---|---|---|
| `CRF01` | a `crf.section_id` does not resolve | ERROR |
| `CRF02` | section order is not contiguous | ERROR |
| `CRF03` | a variable an analysis needs has no CRF field | ERROR |
| `CRF04` | a CRF field traces back to no outcome, analysis or table | WARN |
| `CRF05` | a select field declares no options | ERROR |
| `CRF06` | two fields in a section share an S.No. | ERROR |
| `CRF07` | a multi-select is not flagged for one-binary-column-per-option export | WARN |
| `CRF08` | a `number` field shows no unit | ERROR |
| `CRF09` | a `date` field carries no mask | ERROR |

#### Task 11 — `design.js`, `guideline.js`, `populations.js`, `eligibility.js`, `timepoints.js`

| Code | Fails when | Severity |
|---|---|---|
| `STU01` | `design` is outside the enum | ERROR |
| `STU02` | `design_detail` omits a field its family requires (case–control without matching; cluster without ICC; crossover without washout; cohort without a censoring rule; randomised without sequence generation, concealment and blinding; diagnostic without index test and reference standard) | ERROR |
| `GDL01` | a CONSORT or STROBE study has no screening-log fields, so the flow diagram cannot be drawn | ERROR |
| `GDL02` | a time-to-event outcome exists with no censoring fields | ERROR |
| `GDL03` | interventional with `PECO`, or observational with `PICO` | ERROR |
| `GDL04` | the guideline does not match the design | ERROR |
| `POP01` | an interventional design defines no analysis populations | ERROR |
| `POP02` | not exactly one primary population | ERROR |
| `ELG01` | inclusion or exclusion criteria are absent | ERROR |
| `ELG02` | numeric criteria leave a gap (ASA I–II included, ASA > III excluded — III is covered by neither) | ERROR |
| `TP01` | a timepoint has no window | ERROR |
| `TP02` | timepoints are not in chronological order | ERROR |

---

### Task 12: CLI and the mutation harness

**Files:**
- Modify: `src/lib/study-spec/validate_study_spec.js` (append the CLI)
- Create: `src/lib/study-spec/test_invariants.js`
- Create: `src/lib/study-spec/invariants.test.ts`
- Modify: `package.json` (add `spec:validate` and `spec:mutate` scripts)

**Interfaces:**
- Consumes: `validate` from Task 1.
- Produces: exit code 0 on pass, 1 on failure; `--final`, `--json`, `--quiet`.
- Produces: `MUTATIONS` — an array of `{ code, mutate(spec) }`, one per guard.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/study-spec/invariants.test.ts
import { describe, expect, it } from "vitest";
import { MUTATIONS } from "./test_invariants";
import { validate } from "./validate_study_spec";
import example from "./example_study_spec.json";

describe("every guard fires on its mutation", () => {
  it.each(MUTATIONS.map((m) => [m.code, m] as const))(
    "%s",
    (code, mutation) => {
      const broken = mutation.mutate(structuredClone(example));
      const codes = validate(broken).findings.map((f) => f.code);
      expect(codes, `${code} did not fire`).toContain(code);
    },
  );

  it("covers every code the validator can emit", () => {
    const mutated = new Set(MUTATIONS.map((m) => m.code));
    for (const code of ALL_CODES) {
      expect(mutated, `${code} has no mutation`).toContain(code);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/study-spec/invariants.test.ts`
Expected: FAIL — cannot resolve `./test_invariants`.

- [ ] **Step 3: Write the mutation harness**

One entry per guard. Each mutation makes the *smallest possible* change that should trip exactly that code:

```js
'use strict';
const MUTATIONS = [
  { code: 'OBJ01', mutate: (s) => { s.objectives[1].tier = 'primary'; return s; } },
  { code: 'VAR05', mutate: (s) => {
      const d = s.variables.find((v) => v.role === 'derived');
      d.crf = { section_id: s.crf_sections[0].id, order: 99, field_type: 'number', response: '____' };
      return s;
    } },
  { code: 'ADJ02', mutate: (s) => {
      const m = s.variables.find((v) => v.role === 'mediator');
      s.analyses[0].covariate_ids.push(m.id);
      return s;
    } },
  // … one per code in Tasks 2–11
];
module.exports = { MUTATIONS };
```

- [ ] **Step 4: Write the CLI**

```js
if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const final = args.includes('--final');
  const asJson = args.includes('--json');
  const quiet = args.includes('--quiet');

  if (!file) {
    console.error('Usage: node validate_study_spec.js <spec.json> [--final] [--json] [--quiet]');
    process.exit(1);
  }

  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { ok, findings } = validate(spec, { final });

  if (asJson) {
    process.stdout.write(JSON.stringify({ ok, findings }, null, 2) + '\n');
  } else if (!quiet) {
    for (const f of findings) {
      console.error(`${f.severity}  ${f.code}  ${f.path}\n        ${f.message}`);
    }
    console.error(ok ? 'PASS' : `FAIL — ${findings.filter((x) => x.severity === 'ERROR').length} error(s)`);
  }
  process.exit(ok ? 0 : 1);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run && node src/lib/study-spec/validate_study_spec.js src/lib/study-spec/example_study_spec.json --final`
Expected: all tests PASS; the CLI prints `PASS` and exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(spec): CLI and mutation harness proving every guard fires"
```

---

## Verification

1. `npx tsc --noEmit`, `npm run lint`, `npm test` — all clean.
2. `node src/lib/study-spec/validate_study_spec.js src/lib/study-spec/example_study_spec.json --final` exits 0.
3. Every code in Tasks 2–11 has a mutation, and each mutation fires its own code — enforced by the coverage test in Task 12, so a rotted guard fails CI.
4. Deliberately break the example by hand in three ways and confirm the message tells you what to do, not merely that something is wrong.

## What Plans 2–4 cover

| Plan | Contents |
|---|---|
| **2 — Renderers** | Shared formatting library; CRF, SAP and Shell Tables renderers for the patient-level families; Protocol Understanding via the existing vendored builder; golden-file tests. |
| **3 — Ingest** | Protocol → draft spec via Claude, high-stakes fields carrying confidence and a source quote; G0 sign-off. |
| **4 — App surface** | `study_specs` table and RLS; the sign-off page; validation findings in the UI; four downloads; version stamping. |
