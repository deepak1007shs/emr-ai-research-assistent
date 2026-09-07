# The plan is written against the data that exists

## Why

A spreadsheet can be attached and cleaned, and the analysis plan takes no notice
of it. The plan is written from the protocol alone, so it declares variables the
data may not contain, and the shell tables lay out analyses nobody can run. The
investigator finds out at analysis, which is the worst moment to find out.

Three decisions, taken:

- **The plan declares a variable the data lacks, and records that it lacks it.**
  The protocol is the authority on what the study intends to measure. A plan
  that quietly shrank to fit the spreadsheet would hide the most useful thing
  this comparison can say: that an objective is at risk.
- **Building the plan re-reads the attached dataset.** Data attached before a
  plan has no variable mapping, because there were no variables to map to. One
  button gives a plan written against real columns, a sheet mapped to it, and
  tables that know what is missing.
- **A table keeps every row and marks the ones the data cannot fill**, on the
  row and in the findings.

## The flow

```
attach data     cleaned once; columns keep names of their own
build the plan  1. the profile is given to the plan builder
                2. the dataset is re-read against the plan's new variables
                3. the tables mark what the data cannot fill
```

One extra model call, and only when a dataset is attached.

## 1. What the plan builder is shown

`buildSapSpec` gains `data?: DatasetProfile | null`, rendered by a `dataBlock`
beside the existing `decisionsBlock` and `unresolvedBlock` in
`src/lib/protocol/answers.ts`, which those two already establish the shape for.

Per column: the name, what it looks like, filled and missing counts, and up to
ten distinct values for category columns only. Capped at 250 columns, and where
a sheet has more the block **says how many were left out**. No silent
truncation: a plan written against a sheet it was shown half of, with nothing
saying so, is worse than one written against no sheet at all.

The instruction: declare the variables the protocol calls for. Where the data
holds a column for one, say so. Where it does not, declare the variable anyway
and say the data does not contain it.

## 2. The dataset is re-read against the plan

Still inside the same job, after the plan is stored: read the original file back
from storage, re-run `interpretDataset` with the new registry, `clean`, and
`buildWorkbook`, and update the dataset row. The cleaned workbook is rebuilt
with the plan's datasheet names.

Failure here must not lose the plan. It is caught and reported the way the
coverage check already is: a plan with an unmapped dataset is worth more than no
plan.

## 3. Which variables have no column is decided by code

With the mapping stored, code compares the plan's declared variables against it.
Every variable with no column becomes a finding on the plan (`DATA10`). The
model informs; code checks, as everywhere else here.

`TableRow` gains `unavailable?: string`. `buildTablesSpec` takes the mapping and
marks any row whose `variable_id` is absent from it. The renderer prints the
reason beside the row label, so the table keeps its full shape and the reader
sees what today's dataset cannot fill.

## 4. The rail says the plan predates the data

A `behindData` flag beside `behindAnswers` in `src/lib/workspace/rail.ts`,
computed the same way: the plan's `created_at` against the newest ready
dataset's. Same badge, its own wording.

## Testing

- `dataBlock` returns nothing without a dataset, names the columns with one, and
  states the count when it truncates.
- A plan built with a profile is asked to declare what the data lacks; a plan
  built without one is unchanged, which the source-grep idiom in
  `answers.test.ts` already checks for the other two blocks.
- `DATA10` fires for a declared variable with no column and not for one with a
  column.
- A table row whose variable has no column carries a reason; one that does, does
  not. Read from the rendered `.docx`, not the helper.
- A failed re-map leaves the plan intact and the job reporting it.

## Verification

`npx vitest run`, `npx tsc --noEmit`, `npx eslint`, `npx next build` — 609
passing today. Then a real spreadsheet through the running app, reading the
plan's Section 2 and Section 6 for what it says about the missing columns.
