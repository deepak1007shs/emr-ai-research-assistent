# How a plan and a form get built

The order the four stages run in, what each one asks a model and what it works
out for itself, and where each finding comes from. Written from the code in
`run.ts`, `sap/build.ts`, `tables/build.ts` and `crf/build.ts`; if this file and
those disagree, they are right and this is stale.

Nothing here is a prompt. `slots.ts` reads `table-slots.md`, `choose-test.ts`
reads `test-rules.md`, and the knowledge files are loaded into the model's
system prompt. This file is read by people.

## The chain

    review  ->  sap  ->  tables  ->  crf

Four stages, each needing the one before it. `plan.ts` holds the order and the
prerequisites; `run.ts` runs them and writes progress to a row in `jobs`, so a
build survives the tab being closed.

Asking for the plan runs three of them: **sap, tables, crf**. The tables are
Section 6 of the plan and are laid out from it, and the form collects exactly
what those tables report, so the three are one piece of work. The check that
proves the form matches the tables cannot run unless both exist.

| Stage | Needs | Writes | Why it cannot come earlier |
|---|---|---|---|
| review | the uploaded protocol | `reviews` | it is what the investigator answers, and the answers outrank the protocol |
| sap | a review | `sap_plans` | the plan is written against the review's findings and those answers |
| tables | a plan | `shell_tables` | the tables report what the plan analyses |
| crf | a plan | `crf_forms` | the form collects what the tables report |

## What each stage asks a model, and what it works out

Eleven model calls exist in the application. Ten are the chain: six build a
plan and its tables, two build the form, one reviews the protocol, one reads a
spreadsheet. The eleventh is `revise/build.ts`, which is not part of a build.

Everything else is code, and the split is deliberate: a model is asked for
judgements about the study, and code is asked for anything that can be derived,
because a derivation asked twice can be answered two ways.

### review - one call

`protocol/analyze.ts` reads the protocol against the knowledge files and returns
the issues, each with the correction it needs. It assigns no severity: a review
reports issues, not findings.

### sap - four calls

1. **The frame** (`sap/build.ts`) - objectives as answerable questions,
   outcomes, and the variable list. This is the backbone: the form collects it
   and the tables report it.
2. **The map** (`sap/map-stage.ts`) - one row per objective, naming the outcome,
   the predictors and the data type. The test itself is *not* asked for: it is
   read from `test-rules.md` by `choose-test.ts`, so the same design and data
   type always get the same test and the plan cannot invent one.
3. **The rules** (`sap/rules-stage.ts`) - populations, missing data,
   multiplicity, interim looks, the assumption checks each planned test needs.
   None of these renders as a section of its own. They surface in the footnotes
   and in what the tables are allowed to say.
4. **The coverage check** (`sap/coverage.ts`) - the protocol read back against
   the finished plan. The only place in the application that looks at the
   protocol again, so a variable the protocol describes and the plan missed is
   invisible without it. It is caught rather than fatal: a plan with no coverage
   check is worth more than no plan.

### tables - two calls, and the rest is arithmetic

1. **The layout** (`tables/build.ts`) - the descriptive tables only, plus the
   categories of every categorical outcome and the time points of every repeated
   measure. Those categories become rows, and this is the one place they exist
   as a list: the plan records them as prose, and prose cannot be read as rows.
   This was tried the other way and gave two rows of nonsense for years.
2. **The coverage check** (`tables/coverage.ts`) - the protocol against the
   finished table set.

Between them, code does the rest:

- `buildAnalyticTables` turns each analysis row into the tables it owes, from
  `design-tables.md` and `test-rules.md`. Every table that reports an outcome is
  built this way; the model never writes one.
- `mergeTables` puts the model's descriptive tables and the built analytic ones
  into reading order and numbers them from 1. Two tables with the same grid are
  merged here, keeping the earlier block and both objectives' links, and an
  empty grid is dropped.
- `assignSlots` gives each table its slot from `table-slots.md`.
- `markUnavailable` marks the rows a collected dataset cannot fill, where one is
  attached. It is a set difference, so it is taken and not asked.

### crf - two calls

1. **The form** (`crf/build.ts`) - the sections and their fields, grouped by
   role and timepoint.
2. **The fields it left out** - `requiredFields` computes what the plan needs
   and the form lacks; where that list is not empty, a second call adds them.
   The list is computed, not asked: the form is not trusted to notice its own
   omissions.

Then code again: `resolveRollCall` works out which field holds each variable
from the form itself, and `assignColumnNames` gives every variable one datasheet
name, so the plan, the form and the tables call one thing one word.

## What is checked, and by whom

| Code | Runs on | Asks |
|---|---|---|
| `MAP` | the plan | is the plan internally complete: every objective mapped, every test covered by a rule, every covariate declared |
| `REF` | the plan | does everything the plan names resolve to something it declares |
| `COV` | the plan | did the protocol describe something the plan missed |
| `TBL` | the tables | 35 checks: numbering, denominators, an absolute measure beside every ratio, a table for every objective, an objective for every table, every declared variable reported somewhere |
| `TBLCOV` | the tables | did the protocol call for a table the plan does not own |
| `CRF` | the form | does the form collect what the plan analyses, and nothing it can compute |
| `ROLL` | the form | does every variable resolve to exactly one field |
| `DATA` | a spreadsheet | what a cleaning pass found and would not change on its own |

An `ERROR` does not stop the chain. A document that reports its own problems is
worth more than no document, and a form that fails must not cost the plan its
tables.

## Where a spreadsheet fits

A dataset can be attached at the review or at the plan. It changes nothing about
what the plan says the study should do: the plan is written from the protocol.
What it adds is which of the plan's variables nobody actually collected, so the
tables can mark those rows and the investigator finds out now rather than at
analysis.

One model call reads the sheet (`data/interpret.ts`), and it is asked only what
a column means. Every correction is code, and there is a hard line through
`data/clean.ts`: whitespace, a category spelled two ways, a unit repeated in
every cell are applied and logged; a number that looks like a sentinel, a value
matching no category, a row appearing twice are reported and left alone. A
silent edit to research data is indistinguishable from fabrication when somebody
audits the thesis.

## What a rebuild changes

The rendering is deterministic: downloading a plan built months ago gives
today's layout, because the renderers read the stored spec.

The stages are not. None of the ten calls sets a temperature or a seed, so a
rebuild returns the same substance in different words, and the objective set can
shift. A rebuild inserts a new row rather than replacing one, so the plan that
was downloaded last week stays downloadable.
