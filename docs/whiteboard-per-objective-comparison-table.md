# Reading of the sketch: one comparison table per objective

This is my reading of the hand-drawn diagram, written down so you can correct it
before anything is built. Nothing in the code has been changed.

## What the drawing says

```
  Primary objective
        |
        |---> outcome  ----(I/E - C)----.
        |                               |
        |                               v      v
        |                         +----------+---------+-----------+
        |                         |  GP A    |  GP-B   |  P-Value  |
        '---> Predictor  ------>  +----------+---------+-----------+
                                  |          |         |           |
                                  |          |         |           |
                                  +----------+---------+-----------+

  For each objective
        |
        '---> Similar map
                  |
                  '---> In new DOCX
```

Read left to right, the four statements I take from it:

1. **An objective decomposes into two things**: its *outcome* and its
   *predictor*. The two arrows out of the "Primary objective" box are that
   split.

2. **`(I/E - C)` becomes the two group columns.** Two arrows leave `(I/E - C)`
   and land on `GP A` and `GP-B` respectively. So the Intervention / Exposure
   arm becomes Group A, and the Comparator becomes Group B. The column headings
   are not generic - they are named from that objective's own I/E and C.

3. **The predictor becomes the row stub.** The arrow from "Predictor" enters the
   left-hand (unlabelled) column of the table. So each predictor of that
   objective is a row.

4. **One such table per objective, in a new DOCX.** "For each objective ->
   Similar map -> In new DOCX." The primary objective is drawn as the worked
   example; every other objective gets the same shape.

## The table, stated plainly

For each objective, one table:

| (blank stub) | GP A | GP-B | P-Value |
|---|---|---|---|
| *predictor 1* | | | |
| *predictor 2* | | | |

- **Column 1** - the objective's predictor(s), one per row.
- **Column 2 and 3** - the two groups, named from that objective's I/E and C.
- **Column 4** - the p-value for that row's comparison between the two groups.

## Where this differs from what the app prints today

The current Analysis Map is **one row per objective**, and the row names the
test and the shell table number:

| Objective | Outcome | Predictor(s) | Data type | Statistical test -> Table |

The sketch is **one table per objective**, and the table holds the comparison
itself rather than a pointer to it. These are not the same artefact. The sketch
looks like a results-shaped layout (groups across the top, predictors down the
side), where the Analysis Map is a plan-shaped layout.

## Four things the drawing does not settle

I would rather ask than guess:

1. **What goes in the cells?** The outcome arrow runs into `(I/E - C)`, which
   suggests the cells hold the outcome summarised in each group. But the rows
   are predictors. So either the cells hold *the predictor* summarised per group
   (a classic "characteristics by group" table), or they hold *the outcome* per
   group with one row per predictor level. I read it as the first, but it is the
   one place two readings survive.

2. **Is there an effect column?** Only `P-Value` is drawn. No effect measure, no
   confidence interval. The house rule so far has been that an interval is
   reported alongside every estimate, so I want to know whether the omission is
   deliberate.

3. **Adjusted, unadjusted, or both?** Not in the sketch. Today each objective
   carries an unadjusted test and, where it is warranted, an adjusted model. One
   table with one p-value column cannot hold both.

4. **Objectives with no two groups.** A correlation objective, a diagnostic
   accuracy objective and a single-group estimation objective have no I/E and no
   C, so `GP A` and `GP-B` have nothing to be named from. Vishal's protocol has
   objectives of this kind. What should their table look like?

## "In new DOCX"

Two readings, and I do not know which:

- a **new section** inside the existing SAP .docx, alongside Section 1,
  Section 2 and the Analysis Map; or
- a **separate document** from the SAP - a third deliverable beside the plan and
  the form.

## Status

Nothing built, nothing changed. Confirm the reading above - especially point 1
on the cell contents, and whether this replaces the Analysis Map or sits beside
it - and I will turn it into a design.
