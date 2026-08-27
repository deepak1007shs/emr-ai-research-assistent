# Shell tables

A shell table is the table the results will fill, with the cells empty. Everything
a filled table carries is decided now, so that when the data arrive nothing is
left to choose: the columns, the row order, the denominator in the title, the
test named underneath.

## What you lay out, and what is laid out for you

The analytic tables are built from the analysis plan by code, not by you. For
every analysis row the plan already fixes the incidence table, the crude effect,
the adjusted model ladder, the subgroup table and the sensitivity table, because
each of those is a consequence of the row rather than a judgement. You will not
see them, you do not number them, and you must not write them.

**You lay out three kinds of table**, which need judgement code cannot supply:

- `descriptive` - who was in the study. Age, age group where it helps, sex,
  comorbidity, risk factors, and any baseline value the protocol singles out,
  described by group. This is the table a reader checks before believing
  anything else, and it is yours alone.
- `distribution` - one outcome's categories and how many fall in each, where a
  category breakdown is worth a table of its own: a severity grade, a stage, a
  cause of death.
- `repeated` - a measure recorded at several time points, with the time points
  as rows. Only the protocol says what the time points are, which is why this
  one is yours.

## How a table is built

**Columns.** For a descriptive table: `Variable`, then one column per group
carrying its own n, then `Total`, then `P value`. Write the group wording exactly
as the `groups` list gives it, so every table in the document names the arms the
same way.

**Rows.** A variable with sub-parts becomes a heading row followed by indented
rows: `Age (years)` as a heading, then `Mean +/- SD`; `Sex` as a heading, then
each level. A single-line variable is one plain row. Set `variable_id` on the
heading row of a variable, or on a plain single-line row, and leave `label`
empty there: the wording is read from the plan, so a table cannot call a
variable something the form does not call it. Categories and sub-rows carry a
`label` and no id.

**Row kind.** `variable` for a variable, `category` for one of its levels.

**Titles** end with the denominator in brackets, always:
`Maternal and antenatal characteristics by allocated PEEP level (n = 100)`.
A table without its n cannot be read on its own.

**Tests.** A descriptive table with a p-value column names the test underneath.
Copy it from the plan; never choose one yourself. The plan carries the test it
chose on every analysis row, and the reason it chose it.

**Numbering.** Do not number your tables against the plan's `table_id`. Number
them from 1 in the order you print them; they are renumbered once your tables
and the generated ones are merged.

## What a finished primary block looks like

This is what the analytic half produces, so that you can see what your
descriptive tables sit beside and avoid duplicating any of it. A trial of two
PEEP levels with a binary primary outcome:

| Table | Job | Rows | Columns |
|---|---|---|---|
| Incidence | the outcome by arm, with denominators | the arms | `n / N`, `% (95% CI)` |
| Unadjusted effect | the crude estimate | Risk ratio, Risk difference, Number needed to treat | Estimate, 95% CI, P value |
| Adjusted effect | what the adjustment did | the predictors | Unadjusted risk ratio (95% CI), P value, Adjusted risk ratio (95% CI), P value |
| Subgroups | effect modification | the prespecified subgroups | per-arm n/N (%), risk ratio (95% CI), **Interaction p** |
| Sensitivity | the same question, analysed other ways | each analysis population, then the missing-data best and worst case | risk ratio (95% CI), risk difference (95% CI) |

Note what the effect measure is. For a common binary outcome it is a risk ratio
and a risk difference, never an odds ratio: an odds ratio is not a risk ratio and
overstates the effect. That decision is the plan's, and it is already made.

Note also that no column is ever called Model 1, Model 2 or Model 3. The
adjusted table puts the unadjusted and the adjusted estimate on the same row for
each predictor, so the two can be compared by eye.

## How the wording must read

Everything here is printed into a Word document handed to a postgraduate and read
by an examiner.

**Never use an em dash or an en dash.** Write a comma, a full stop, a colon, or a
plain hyphen.

**Never use these words and phrases.** They are the vocabulary of generated text
and they make a document look automated:

delve, leverage, robust, seamless, comprehensive, holistic, testament, tapestry,
landscape, realm, navigate, underscore, pivotal, crucial, vital, myriad,
plethora, paramount, furthermore, moreover, additionally, notably, importantly,
unlock, elevate, harness, foster, embark, meticulous, intricate, nuanced,
multifaceted, cutting-edge, game-changer, deep dive, "it is important to note",
"it is worth noting", "when it comes to", "at the end of the day".

**Also avoid** smart quotes, the ellipsis character, and decorative bullets and
arrows. Use straight quotes and three full stops.

Keep the tables simple to read. A table a supervisor cannot follow at a glance
will be redrawn by hand, and then it no longer matches the plan.
