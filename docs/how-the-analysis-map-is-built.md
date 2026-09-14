# How this app builds the Analysis Map

A description of what the code actually does today. Nothing here is a proposal.
Everything is in `src/lib/analysis/`, and the file and line are given so you can
read the code beside the claim.

---

## 1. Where it sits

The Analysis Map is **Step 4** of the nine-step process. It is the hinge of the
whole plan:

```
  ONE model call                      then nothing but code
  ------------                        --------------------------------
  facts/extract.ts                    Step 1  objectives/     objectives with IDs
       |                              Step 2  variables/      master variable list
       v                              Step 3  variables/      exploratory outcomes
  Locked Protocol Facts Sheet   --->  Step 4  analysis/       THE ANALYSIS MAP
                                      Step 5  rules/          populations, assumptions
                                      Step 6  tables/         shell tables + numbers
                                      Step 7  checks/         Gate A, Gate B
                                      Step 8  crf/            the form
```

**No model is called at Step 4.** The map is built by `buildAnalysis()`
(`src/lib/analysis/build.ts:280`) from the Facts Sheet, the objectives and the
variable list. The same Facts Sheet always produces the same map, byte for byte.

Every table in Section 6 exists because a row of this map asked for it. Every
row exists because Step 1 wrote an objective.

---

## 2. One objective, one row

`buildAnalysis` is a single loop: `for (const objective of objectives)`. One
pass, one row pushed. There is no path that folds two objectives into one row
and no path that gives one objective two rows.

Each row is an `AnalysisRow` (`src/lib/study/types.ts`):

| Field | What it holds |
|---|---|
| `objective` | the objective ID from Step 1 (P1a, S2, E3 …) |
| `outcome` | one variable name |
| `predictors` | the arm, plus this objective's own factors |
| `data_type` | from the variable, not from the objective's wording |
| `unit_of_analysis` | per participant, per eye, per lesion |
| `count` | "1 value per participant", "4 readings per participant" |
| `expected_frequency` | for a binary outcome; `null` is a TODO, never a guess |
| `effect_measure` | from decision table A or C |
| `absolute` | the absolute measure printed beside every ratio |
| `unadjusted` | test + named fallback + table number |
| `adjusted` | model + fallback + covariate list + table + fit table |
| `exception` | `estimation`, `safety`, `too_few_events`, `diagnostic`, or null |

---

## 3. The cascade: three decision tables, in a fixed order

The order is a rule, not a convenience: **the design picks the effect measure,
then the data type picks the test, then — for a binary outcome only — how common
the event is picks the model.**

The tables are markdown files, read at build time by `parseTable`
(`src/lib/analysis/decision-tables.ts`). They are data, not code, so a
statistical decision can be read and corrected without touching a function.

### A — `effect-measures.md`: what kind of number states the result

Keyed `<design class>|<data type>`. The design class comes from `DESIGN_CLASS`
(`build.ts:43`), which collapses eighteen design families into six columns:
`trial`, `cohort`, `case_control`, `cross_sectional`, `diagnostic`, `other`.

Gives `Effect measure` and `Absolute measure`.

### B — `tests.md`: which test

Keyed `<data type>/<shape of the comparison>`. This is the important one, and
§4 below is entirely about how the shape is decided.

Gives `Unadjusted test`, `Unadjusted fallback`, `Adjusted model`,
`Adjusted fallback`.

**If the exact combination is not in the table**, the code does *not* drop the
objective. It falls back to the nearest row for the same data type
(`<type>/two_groups`, then `<type>/single`) and writes a TODO naming what it
substituted (`build.ts:339-353`). Dropping the objective was tried and was
worse: it left a question in Section 1 with no analysis and no table.

### B2 — `screen.md`: one test per factor

Table B is keyed only on the *outcome's* type. That is enough for a trial, where
the comparison is the arm and the arm is one thing. It is not enough for an
observational study asking "which of these factors is the outcome associated
with", where the factors are a duration in hours, a mechanism with two
categories and an anatomical level with several.

B2 is keyed `<outcome type>|<factor type>`, and `screenOf()` (`build.ts:675`)
reads it **once per factor** and builds the sentence:

> One factor at a time: independent t-test for duration of ischemia, chi-square
> test for mechanism of injury and …

The last row of B2 is a stated `*|*` fallback, and matching it raises a TODO
rather than passing silently.

### C — `binary-models.md`: which risk model

For a binary outcome only, and skipped for `paired`, `diagnostic` and
`prediction` shapes, whose model is fixed by something other than frequency
(`build.ts:414`).

Keyed on how common the event is: `rare` (<10%) → odds ratio from logistic;
`common` → risk ratio from log-binomial; `clustered`; `unknown`; `few_events`.

The events-per-covariate floor is ten. It is counted against **this objective's
own terms** — its adjustment set plus its own factors — not against the Facts
Sheet's whole covariate list (`build.ts:425-432`). A study naming thirteen
factors fits four in one model; dividing its events by thirteen condemned every
model it had.

Below the floor there are two behaviours, and the difference matters:

- an **arm comparison** swaps to the penalised model;
- an **association** keeps the risk-ratio family and gets a TODO telling the
  investigator to carry fewer factors (`build.ts:437-447`). Swapping the model
  there would answer a different question — a penalised odds ratio where the
  protocol, the sample size and the title all ask for a risk ratio.

---

## 4. `shapeOf()` — the single most consequential decision

`build.ts:125`. Half of table B's key. Read top to bottom; **first match wins**,
and the order is the rule:

| # | Condition | Shape |
|---|---|---|
| 1 | the exploratory idea is a correlation | `pair` |
| 2 | `design === "diagnostic_accuracy"` | `diagnostic` |
| 3 | `chain.kind === "accuracy"` and it has factors | `diagnostic` |
| 4 | `chain.kind === "association"` and it has factors | `exposure` |
| 5 | `question_type === "prediction"` | `prediction` |
| 6 | time-to-event **with a competing event** | `competing` |
| 7 | the objective is a shape (trajectory) question | `repeated` |
| 8 | crossover design, or matched allocation | `paired` |
| 9 | more than two groups | `many_groups` |
| 10 | exactly two groups | `two_groups` |
| 11 | otherwise | `single` |

Two things worth noticing about that order.

**Rows 3 and 4 come before rows 9-11.** What the outcome *says it is asked
about* is read before anything is counted from the number of arms. This is the
fix for the failure that produced your Vishal plan: a cohort study has no arms,
so counting groups said "nothing is compared", every objective fell to `single`,
took the estimation exception, and eleven questions were answered with a
proportion and a confidence interval while thirteen correctly-read covariates
went into no model at all.

**Row 6 comes before row 7 and before the group counts.** A competing event
changes the analysis more than the number of groups does. One minus the
Kaplan-Meier estimate overstates the risk whenever something else can get there
first.

---

## 5. The adjustment set is per objective, not global

`adjustmentSet()` (`build.ts:194`). The Facts Sheet's covariate list is global;
the adjustment set is per outcome. It is built in four passes:

1. **The baseline value of this outcome**, where the outcome has one — "its
   strongest predictor". Skipped where that variable is this objective's own
   outcome.
2. **What this objective names**: `chain.covariates` if it has any, otherwise
   the global `facts.covariates`. The per-objective list exists because applying
   the global list whole adjusted a cohort's primary for ten factors on sixteen
   events, where the plan written for that study adjusts for four.
3. **Minus three exclusions**: any other outcome's baseline; anything already in
   the set; and **this objective's own factors** — a study asking whether
   amputation is associated with the duration of ischaemia cannot hold the
   duration of ischaemia constant while it asks.
4. **Plus the stratification factors** of a stratified randomisation, whether or
   not anyone listed them as covariates.

Each covariate carries its own `reason` string, and an inferred covariate says
so: *"A confounder added at Stage 1. The protocol does not name it, and the
investigator has been asked to confirm it."*

The set is emptied entirely for an exception row, for any exploratory row, and
for a trajectory model in a randomised trial (`build.ts:580`) — randomisation is
what makes the bare model enough there.

---

## 6. The four exceptions

An exception means the row deliberately has no adjusted model.

| Exception | When | What the row says |
|---|---|---|
| `safety` | `isSafety()`, `build.ts:121` | "Safety outcome: reported, not modelled." |
| `estimation` | `chain.kind === "estimation"`, or shape `single` with no factors | "Estimation objective: interval, no p value." |
| `too_few_events` | below the events-per-covariate floor | "Too few events to fit a model: descriptive only." |
| `diagnostic` | the diagnostic branch | the accuracy note |

`isSafety` deserves a note, because it was wrong. It used to be a regex on the
outcome's name — `/adverse|safety|harm|complication/`. That filed
"post-operative complications graded by Clavien-Dindo and compared between the
patients who lost a limb and those who did not" as a harm tally: one row, no
grades, no model. It now requires the regex **and** `chain.exposures.length === 0`.
An outcome the study asks a question of has factors, and that is the difference
the wording alone cannot see.

A safety row is also compared only where there is something to compare against:
two or more groups get Fisher's exact test with a Newcombe interval; a single
cohort gets Wilson proportions, because a risk difference in a one-group study
names a difference from nothing (`build.ts:607-620`).

---

## 7. The diagnostic branch

`diagnosticRow()` (`build.ts:740`), kept apart from the main loop because almost
nothing in that loop applies: no exposure effect, so no adjusted model, no
adjustment set, no frequency-chosen risk model, no group term.

It tells three questions apart using facts the reading already records
(`src/lib/study/diagnostic.ts`):

| Question | Test taken from | Reads as |
|---|---|---|
| **accuracy** | `<index type>/diagnostic` | sensitivity and specificity with exact binomial intervals; where several index tests are read on the same people, their AUCs compared by DeLong's test |
| **correlation** | `ordinal/pair` | Spearman rank correlation of each index test with the grade |
| **comparison** | `<type>/two_groups` | the index values compared between the reference standard's results |

Before this existed, all three were analysed with the accuracy row and
calibration as the adjusted model — which gave *the correlation of a measurement
with the Gleason score* a two-by-two table.

Where one participant contributes several lesions, every accuracy interval comes
from a bootstrap that resamples participants rather than lesions.

---

## 8. Modifiers applied to the model sentence

After the tables have spoken, the model string is edited by rules that are about
the *design*, not the outcome. Each one exists because its absence produced a
sentence that named something that does not exist:

| Rule | Line | Effect |
|---|---|---|
| no baseline measurement | 356-405 | strips ", as analysis of covariance with the baseline value" — naming ANCOVA promises a column that cannot be filled |
| skewed continuous outcome | 474 | "… on the log scale", effect becomes a ratio of geometric means |
| repeated readings per participant | 521 | adds a random intercept per participant |
| more than one unit per participant | 521 | same, worded for eyes / lesions / teeth |
| cluster trial | 535 | adds robust (sandwich) variance clustered on the randomised unit |
| multicentre repeated | 512 | random intercept per participant **and per centre** |
| **fewer than two groups** | 543 | strips "fixed effects for group, visit, the group-by-visit interaction" → "fixed effects for visit"; "with a group-by-time term" → "with time as a fixed effect" |

That last row is the one your earlier screenshots caught: "group by time" in a
study with one group names an interaction with nothing.

---

## 9. What goes in `predictors`

`build.ts:568`:

```
predictors = [ the arm, if the study has two or more groups ]
           + [ this chain's own factors — confirmatory rows only ]
           + [ the exploratory idea's other variables — exploratory rows only ]
```

The `explore ? [] :` split matters. An exploratory question is asked of the
primary's *outcome*, not of its *factors*. Appended to both, every exploratory
row in a cohort study carried the primary's three factors beside its own.

---

## 10. A gap is a TODO, never a guess

`buildAnalysis` returns `{ rows, todos }`. Nothing in Step 4 asks a model to
settle a judgement, and nothing invents a default. Where a decision is owed, the
plan writes a bold `TODO:` addressed to the investigator and carries on. The
ones it raises:

- an exposure defined during follow-up (immortal time bias);
- a cluster trial's cluster count, average size and assumed ICC;
- a data-type/shape combination the tables do not cover;
- a binary outcome with no stated expected frequency;
- an observational comparison with no stated balance method — matching on the
  propensity score, IPTW, stratification or adjustment — plus the balance table
  with standardised mean differences;
- a competing-risks model not chosen between cause-specific and Fine-Gray;
- a count outcome not declared zero-inflated or negative binomial;
- a correlation naming a variable the study does not collect;
- a factor pairing that fell to B2's `*|*` row;
- too many terms for the events available.

---

## 11. What Step 4 does *not* decide

**Table numbers.** Every `table` and `fit_table` field is set to `""` here.
Numbering happens in Step 6, which is the only place that knows the order tables
are printed in. Appendix B gives fit tables to the primary and secondary model
tables and to no exploratory one, and Step 6 applies that.

**Table layout.** The columns and rows of the shell tables are Step 6's
(`src/lib/tables/build.ts`) — including whether a table is split by group, which
is where the `GP A | GP-B` question from your sketch actually lives.

---

## 12. How it is rendered, and how it is policed

**Rendered** in three places, all reading the same `AnalysisRow[]`:
`src/lib/sap/markdown.ts`, `src/lib/sap/docx.ts`,
`src/components/sap-document.tsx`. Columns:

| Objective | Outcome | Predictor(s) | Data type | Statistical test → Table |

with the test cell in the fixed order rule 4.9 gives: unadjusted (and its
fallback) → then adjusted (model + covariates + fit table) → then the exception
note. All names printed as labels, never as the identifiers code uses.

**Policed** by `src/lib/analysis/checks.ts`, S4-1 to S4-8:

| ID | What it proves |
|---|---|
| S4-1 | every primary and secondary objective has a row, so will have a table |
| S4-2 | every outcome has an unadjusted and an adjusted entry, or a written exception |
| S4-3 | every binary row states measure, model and fallback, with an absolute measure beside the ratio |
| S4-4 | every row states its unit of analysis and how many values each participant gives |
| S4-5 | every adjusted model is within the events-per-covariate cap the sample can carry |
| S4-6 | no outcome cuts an ordered scale into two |
| S4-7 | no adjusted model holds constant anything measured after the exposure |
| S4-8 | the effect the sample size assumed is the effect the analysis estimates |

Plus S1-5 from Step 1, which proves every objective the protocol *stated* reaches
a row that reports its outcome and estimates its factors — or is a recorded
decision. That check exists because a trauma cohort stating five objectives got a
plan answering three, and nothing could ask where the other two went.

---

## 13. The short version

1. One objective in, one row out. No folding, no splitting.
2. Design → effect measure. Data type + shape → test. Frequency → binary model.
   In that order, from markdown tables, not from code.
3. `shapeOf` decides the shape, and it reads *what the objective says it asks*
   before it counts arms. That ordering is the difference between a cohort study
   getting models and getting eleven proportions.
4. The adjustment set is built per objective and excludes that objective's own
   factors.
5. Where a judgement is owed, it writes a TODO to the investigator. It never
   asks a model and never guesses.
6. Table numbers and table layout are Step 6's, not Step 4's.
