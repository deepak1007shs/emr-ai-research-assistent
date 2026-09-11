# Decision table A: the effect measure the design owes

The design decides what kind of number states the result, and it decides it
before anything is known about the outcome's distribution. That order is the
rule: design first, then data type (decision table B), then, for a binary
outcome, how common the event is (decision table C).

`Key` is `<design class>|<data type>`, matched exactly. Design classes are
`trial`, `cohort`, `cross_sectional`, `case_control`, `diagnostic` and `other`;
`*` matches any. The first row whose key matches wins, so put the specific rows
above the general ones.

`Never` is printed nowhere. It is what check S4-2 refuses.

| Key | Situation | Effect measure | Absolute measure | Never |
|---|---|---|---|---|
| trial\|continuous | Trial, continuous outcome | Mean difference | | |
| trial\|binary | Trial, binary outcome | Risk ratio | Risk difference, and the number needed to treat | Odds ratio, where the outcome is common |
| cohort\|binary | Cohort, binary outcome | Risk ratio | Risk difference | Odds ratio, where the outcome is common |
| cross_sectional\|binary | Cross-sectional, binary outcome | Prevalence ratio | Prevalence difference | Odds ratio |
| case_control\|binary | Case-control | Odds ratio | | Risk ratio, which a case-control study cannot estimate |
| diagnostic\|* | Diagnostic accuracy | Sensitivity, specificity, positive and negative predictive values, likelihood ratios and the area under the curve, each with a 95% confidence interval | Calibration, as a calibration plot with the Brier score | The area under the curve alone; predictive values carried to a setting with a different prevalence |
| *\|time_to_event | Time to event | Hazard ratio | Median survival by group, and the restricted mean survival time where the hazards are not proportional | Proportions that ignore time; one minus the Kaplan-Meier estimate where a competing event exists |
| *\|count | Counts over person-time | Incidence rate ratio | Rate difference | |
| *\|continuous | Continuous outcome | Mean difference | | |
| *\|binary | Binary outcome | Risk ratio | Risk difference | |
| *\|ordinal | Ordinal outcome | Difference in distribution | Median difference with a 95% confidence interval | Treating the scores as if the gaps between them were equal |
| *\|nominal | Nominal outcome | Difference in proportions | | |
