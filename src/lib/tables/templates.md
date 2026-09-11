# Appendix A4: which tables an outcome owes, and in what order

This file is why the table set is pinned. The same protocol used to produce
sixteen tables on one run and twenty on the next, because the model was asked
each time which tables to draw. It is not asked any more: the outcome's
situation is looked up here, and the tables it names are drawn in the order it
writes them.

`Key` is the situation, chosen by code from the outcome's data type, how often
it is measured, what its values are expected to look like, and whether it is a
safety outcome or an exploratory question.

`Tables` is a comma-separated list of table kinds, drawn in this order. `fit`
attaches to the table before it and takes that table's number with a letter.
`figure` is numbered in its own sequence.

| Key | Situation | Tables |
|---|---|---|
| continuous_repeated | Continuous, measured three times or more | summary, unadjusted, per_time_point, rate_of_change, fit, figure, overlap, adjusted, fit |
| continuous_single | Continuous, one comparison | summary, unadjusted, overlap, adjusted, fit |
| skewed_continuous | Continuous and right-skewed | summary_test, adjusted, fit |
| binary_common | Binary, expected in one in ten or more | ratio, fit |
| binary_rare | Binary, expected in fewer than one in ten | ratio, fit |
| binary_few_events | Binary, too few events to model | proportions |
| time_to_event | Time to an event | survival, overlap, cox, fit |
| time_to_event_competing | Time to an event, with a competing event | cumulative_incidence, overlap, cox, fit |
| count_outcome | Counts | summary, unadjusted, adjusted, fit |
| diagnostic | A test against a reference standard | two_by_two, accuracy, calibration |
| prediction | A score built to predict an outcome | prediction_model, calibration |
| safety | Harms, reported and not modelled | safety |
| correlation | Two continuous variables | correlation |
| subgroup | An effect asked separately within levels of something | subgroup |
| estimation | One group, one value estimated | summary |

The sensitivity table is not in this list. It is always the last table of the
primary block, whatever the primary outcome's situation, and 6.7 makes that a
placement rule rather than a template.
