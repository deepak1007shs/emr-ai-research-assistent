# Association and accuracy objectives

Design, 12 September 2026.

## Why

Dr Vishal's protocol asks which factors are associated with amputation after
extremity vascular trauma, and how well MESS, GANGA, lactate and ischaemia time
predict it. The plan this application built for it estimated eleven proportions
and fitted no model. Twenty-one tables, every check passing, and not one of them
answered the question the title asks.

The reading was not at fault. It read the design as a cohort, the question type
as an association, thirteen covariates with their time points, an expected
frequency of 0.15, and it flagged the sample-size formula as wrong. It even
wrote the six exposures out in full - "The observed exposures are: duration of
ischaemia, mechanism of injury..." - as prose, inside the `intervention` field,
because there was nowhere else to put them. Nothing reads that sentence.

Five causes, in the order they bite:

1. **The Facts Sheet cannot express an observational study.** It holds groups,
   outcomes and covariates. "Covariate" means hold this constant. There is no
   field meaning "the factor whose association is being estimated".
2. **`groups` carries three jobs** - who is compared, whether anything is
   compared, and what the table columns are. `groups: []` answered "nothing" to
   all three, so `shapeOf` returned `single`, every row took the `estimation`
   exception, and Step 1 wrote "What is the proportion with amputation?".
3. **Facts that were read are never consumed.** `question_type` is read in two
   places, both testing only `=== "prediction"`, so `"association"` behaves
   exactly like `"effect"`. `exposure_fixed_at_baseline` is read once, guarded
   by `groups.length >= 2`, so for a single-cohort study it never fires.
4. **The decision tables have no predictor dimension.** `tests.md` is keyed
   `<outcome data type>/<shape>`. "Continuous score against a binary outcome" -
   which is the whole of the ROC secondary - has no key, so it fell to
   `binary/pair` and four continuous scores came out as a phi coefficient.
5. **The checks confirm consistency, not correctness.** The title-promise check
   is the one written to catch exactly this, and `kept` for an association is
   satisfied by the design being `cohort`. It passes on a plan that estimates
   nothing but proportions. The "frequency" promise is kept by the defect
   itself, since the defect gives every objective `comparison: "single group"`.

## What changes

### The one new fact

Every outcome chain gains two fields:

```ts
kind: "comparison" | "association" | "accuracy" | "estimation";
exposures: { measure: VariableName; at: Timepoint | null; reference: string | null }[];
```

| kind | The question | Exposures |
|---|---|---|
| `comparison` | groups compared, as a trial compares arms | empty |
| `association` | factors compared within one cohort | the factors |
| `accuracy` | how well measured values identify the outcome | the index measures |
| `estimation` | one number, with no comparison at all | empty |

`question_type` stays and becomes advisory. The chain's `kind` is what the rules
read, because the question belongs to the objective and not to the study: one
protocol asks an association of its primary and an accuracy of its first
secondary, and the reference document says so in its own words - "the comparator
differs by objective, not one fixed group".

### The steps

| Step | Change |
|---|---|
| 1 objectives | An association asks "Is X associated with A, B and C, after adjustment for D?"; an accuracy asks "How well do A and B identify X?" |
| 2 variables | Each exposure takes the role `exposure` for its objective. Today only the arm ever does |
| 4 analysis | New shape `exposure`. Unadjusted: one test per factor from a new decision table `screen.md`, keyed `<outcome type>\|<exposure type>`. Adjusted: decision table C unchanged - for a common binary outcome it already names log-binomial with modified Poisson robust variance as its fallback. Covariates: the adjustment set minus the exposures |
| 4 accuracy | `study/diagnostic.ts` keys on the chain's kind rather than `facts.design`, so an accuracy objective inside a cohort reaches the ROC branch that already exists |
| 6 tables | Two template rows: `association` gives screen, ratio_difference, overlap, adjusted, fit; `accuracy_objective` gives accuracy and delong |
| 5 rules | Holm within an accuracy family, Benjamini-Hochberg for the exploratory family, and the univariate screen declared hypothesis-generating rather than counted as k tests |

### The checks

- **Title promise** reads objects. An association is kept only where some
  objective carries exposures and an adjusted model or a written exception; an
  accuracy is kept by a chain of kind `accuracy`, so a cohort with a ROC
  secondary is no longer told its design cannot support the claim.
- **`isSafety`** applies only to a chain with no exposures. A complication grade
  analysed by amputation status has one, and stops being a safety tally.
- **New `S4-9`**: every objective whose chain carries exposures has an adjusted
  model or a written exception. This is the check that would have caught the
  whole failure on the day it happened.
- **Gate A** stops an observational design whose chains carry no exposures at
  all, rather than building a prevalence survey from it.

### Compatibility

The new fields are required of the model and carry zod defaults - `kind`
defaults to `comparison`, `exposures` to empty - so the two stored readings
still parse and IDA-PREG stays byte-identical. The input fingerprint changes on
purpose: the schema is part of what the model receives.

## How it is proved

Dr Vishal's reading becomes a committed fixture, and his Analysis Map is pinned
row by row against the reference document: P1 with its three exposures, four
covariates and a risk-ratio model; S1 as AUC with a Youden cut-off and DeLong
pairwise comparison; S2 by its four factors; S3 as an ordinal grade by
amputation status; E1, E3 and E4. Each fix is disabled in turn to confirm its
test fails. The IDA-PREG acceptance test is the control and does not move.

## Order of work

1. Schema, zod defaults, fingerprint.
2. Steps 1 and 4 read `kind`; the association branch.
3. `screen.md` and the association templates.
4. Accuracy objectives route to the ROC branch.
5. The three checks and Gate A.
6. Re-read Vishal, rebuild, compare against the reference document.

## The risk

All of it rests on the model filling `exposures` reliably. Where an
observational protocol yields none, Gate A stops and asks rather than producing
the document this design exists to prevent.
