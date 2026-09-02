# The analysis blueprint

The blueprint is not the results chapter. It is the plan for the results
chapter: every table that will appear, in order, and for each one what runs down
the left side, what runs across the top, the statistic inside each cell, the
test applied, and what will be done when a value is missing.

It is not drawn as a grid. An empty grid does not say what belongs in it, and
the one this replaced was unreadable: twenty-eight rows labelled "" and
"Mean +/- SD", meaningful only to someone who could resolve ids they could not
see. Everything a filled table carries is still decided now, but it is said in
words.

## What you lay out, and what is laid out for you

The analytic tables are built from the analysis plan by code, not by you. For
every analysis row the plan already fixes the incidence table, the crude effect,
the adjusted model ladder, the subgroup table and the sensitivity table, because
each of those is a consequence of the row rather than a judgement. You will not
see them, you do not number them, and you must not write them.

**You lay out two kinds of table**, which need judgement code cannot supply, and
you supply one list:

- `descriptive` - who was in the study. Age, age group where it helps, sex,
  comorbidity, risk factors, and any baseline value the protocol singles out,
  described by group. This is the table a reader checks before believing
  anything else, and it is yours alone.
- `repeated` - a measure recorded at several time points, with the time points
  as rows. Only the protocol says what the time points are, which is why this
  one is yours.

And separately, two lists, because the plan records both as prose and neither
can be read as rows:

- `outcome_categories` - the categories of every categorical outcome: the
  organisms, the severity grades, the causes of death. The plan says
  "Binary (dead/alive), reported as a percentage per group", which splits into
  nonsense.
- `outcome_timepoints` - the points every repeated measure was recorded at, in
  order. The plan says "every 5 minutes during each phase of each session",
  which is a rule and not a list. Write the points the rule produces.

Both become the rows of that outcome's table, which code builds. An outcome left
out of either is an outcome whose table has one unnamed row.

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

**Missing data.** Every table says what will be done when a value is not there,
decided now and specific to the variables in that table: which are structural
blanks that leave the denominator rather than counting as missing, which are
derived and left missing when an input is missing rather than estimated from the
other, which are expected to exceed twenty per cent missing and are therefore
described but not modelled. Handling decided after the data are seen is a
reaction to the results, and reads as one.

**Naming.** The statistic, then what is being described, then the population or
the grouping variable: "Distribution of comorbid conditions among the study
population (n = 120)". Never name a table after a statistical test, and never
begin one with "Table showing".

## What a finished primary block looks like

This is what the analytic half produces, so that you can see what your
descriptive tables sit beside and avoid duplicating any of it. A trial of two
PEEP levels with a binary primary outcome:

| Table | Job | Rows | Columns |
|---|---|---|---|
| Outcome | the outcome, whole | the outcome, or its categories | the arms, `Total`, then Risk ratio (95% CI), Risk difference (95% CI), Number needed to treat (95% CI), P value |
| Adjusted effect | what the adjustment did | the predictors | Unadjusted risk ratio (95% CI), P value, Adjusted risk ratio (95% CI), P value |
| Subgroups | effect modification | the prespecified subgroups | per-arm n/N (%), risk ratio (95% CI), **Interaction p** |
| Sensitivity | the same question, analysed other ways | each analysis population, then the missing-data best and worst case | risk ratio (95% CI), risk difference (95% CI) |

One outcome is one table. The whole-cohort count is the `Total` column and the
estimates are the right-hand columns, so a reader sees the effect beside the
numbers it was computed from rather than three pages away.

A study asking what predicts something is laid out the other way round: the
candidate predictors are the rows and the outcome's groups are the columns, split
into a categorical table and a numerical one because the cell and the test both
differ. That is one table of twenty-six rows, not twenty-six tables. Code decides
which way round from the question; you do not write either of them.

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
