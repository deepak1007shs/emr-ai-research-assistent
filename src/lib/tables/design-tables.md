# Which tables a design requires

The tables each study design must report, and what an examiner checks in each.
Edit this file to change which tables a design gets; `design-tables.ts` reads
these rows and nothing else.

Transcribed from the house reference "Results Table Formats, Five Families",
Table 79. It is the companion to `../sap/test-rules.md`: that file decides which
analysis a row gets, this one decides which tables the document contains.

**Columns.**

- `design` - the design family, as the analysis plan declares it. The last row,
  `any`, catches a design the plan does not classify, and gives it the tables
  every comparative study needs.
- `roles` - the table roles the design requires, semicolon separated, in the
  order they are printed. A role this version cannot yet build is still listed:
  the guard then says the design needs a table nobody can draw yet, which is the
  only honest thing to say about it.
- `baseline_p` - `no` where the baseline table must carry no significance test.
  In a randomised design the groups differ by chance alone, so a p value there
  tests the randomisation rather than the study, and an examiner will say so.
- `check` - what an examiner checks. Printed under the block.

| design | roles | baseline_p | check |
|---|---|---|---|
| pre_post | flow; descriptive; summary; effect_unadjusted | yes | There is no control group, so the change cannot be attributed to the intervention. Report the change with its confidence interval, never the two means alone, and state how many were lost between the measurements. |
| randomised_trial | flow; descriptive; summary; effect_unadjusted; effect_adjusted; sensitivity; subgroup; adverse_events | no | The intention-to-treat analysis is the primary one. Subgroup claims rest on the interaction p value, not on which subgroup happens to be significant. |
| non_inferiority_trial | flow; descriptive; summary; effect_unadjusted; non_inferiority; sensitivity; adverse_events | no | Judged against the margin, not against a null of no difference. Report the per-protocol analysis alongside intention to treat, because dropout biases towards non-inferiority. |
| crossover_trial | flow; descriptive; summary; effect_unadjusted; carryover | no | Carryover must be tested and reported before the two periods are combined. The analysis is on within-participant differences. |
| cluster_trial | flow; descriptive; summary; effect_unadjusted; icc | no | An analysis that ignores clustering gives confidence intervals that are far too narrow. Report the intracluster correlation coefficient whatever the result, because the next trial needs it for its sample size. |
| factorial_trial | flow; descriptive; summary; interaction; effect_unadjusted | no | The interaction is reported first. Main effects can only be interpreted on their own when the interaction is not significant. |
| cohort | descriptive; incidence; summary; effect_unadjusted; effect_adjusted; dose_response; attrition | yes | Report person-time, not counts alone, wherever the length of follow-up varies. Use modified Poisson rather than logistic regression when the outcome is common. |
| case_control | descriptive; distribution; effect_unadjusted; effect_adjusted; matched; dose_response | yes | Only the odds ratio is valid: risk, relative risk and incidence cannot be estimated from case-control sampling. A matched design must be analysed as matched pairs. |
| cross_sectional | descriptive; prevalence; summary; effect_unadjusted; effect_adjusted | yes | A prevalence ratio, not an odds ratio, where the condition is common. Exposure and outcome are measured together, so no temporal claim can be made. |
| descriptive_epidemiology | descriptive; prevalence; standardised; trend | yes | A crude rate cannot be compared between populations with different age structures. Always name the standard population used. |
| diagnostic_accuracy | descriptive; two_by_two; accuracy; roc; cutoffs | yes | Predictive values depend on the prevalence in the population tested and do not transfer to another setting. Name the reference standard. |
| agreement | descriptive; cross_classification; agreement | yes | Correlation is not agreement. A method-comparison study reports Bland-Altman limits, never a correlation coefficient, and states whether those limits are clinically acceptable. |
| questionnaire_validation | descriptive; internal_consistency | yes | An item-total correlation below 0.30, or an alpha that rises when an item is removed, has to be shown and explained rather than quietly dropped. |
| meta_analysis | prisma; study_characteristics; risk_of_bias; pooled; publication_bias | yes | The pooled estimate means nothing without the heterogeneity statistics. State which model was used and why, and report the risk-of-bias subgroup. |
| survival | descriptive; survival_summary; life_table; effect_unadjusted; effect_adjusted; ph_test | yes | A Cox model presented without a proportional hazards check invites a viva question. Numbers at risk belong under every survival curve. |
| any | descriptive; summary; effect_unadjusted; effect_adjusted | yes | Every comparative study reports who was in it, what happened to them, and the effect with its confidence interval, before anything else. |
