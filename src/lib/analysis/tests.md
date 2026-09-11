# Decision table B: the test the outcome's data type owes

`Key` is `<data type>/<shape of the comparison>`, matched exactly. The shapes
are `two_groups`, `many_groups`, `paired`, `repeated`, `single`, `pair`,
`competing`, `diagnostic` and `prediction`.

A prediction row is the one place the data may choose the variables. Every other
row takes them from clinical knowledge and enters them together, because a
variable that improves prediction can wreck a causal estimate.

An empty cell means there is none: a paired continuous outcome has no adjusted
model in this table, and a correlation has no adjusted model at all.

Nor does a diagnostic row. These rows used to name calibration - the slope,
calibration in the large, the Brier score - as the adjusted model, and the first
real diagnostic protocol through the rebuild, an MRI measurement against
histopathology, was given a calibration table for every objective. Calibration
asks whether predicted probabilities are right, and a single measurement read at
a cut-off predicts no probability. It belongs to a model built to predict, which
is the `prediction` rows. The optimism correction stays, as the fallback of the
cut-off: a cut-off chosen in these data looks better here than it will anywhere
else.

A repeated outcome's unadjusted row is deliberately descriptive. Testing a
trajectory one visit at a time is k tests for one question, and rule 4.13
refuses it; the trajectory is tested once, in the adjusted model, by the
group-by-time term.

| Key | Situation | Unadjusted test | Unadjusted fallback | Adjusted model | Adjusted fallback |
|---|---|---|---|---|---|
| continuous/two_groups | Continuous, two independent groups | Independent t-test | Welch's t-test where the variances differ; Mann-Whitney with the Hodges-Lehmann difference where the outcome is skewed | Linear regression, as analysis of covariance with the baseline value | |
| continuous/many_groups | Continuous, more than two groups | One-way analysis of variance | Kruskal-Wallis where the outcome is skewed | Linear regression | |
| continuous/paired | Continuous, the same person measured twice | Paired t-test | Wilcoxon signed-rank where the differences are skewed | | |
| continuous/repeated | Continuous, measured three times or more | Descriptive at each visit, with no p value | | Linear mixed model on the repeated measurements in long format, one row per participant per visit: fixed effects for group, visit, the group-by-visit interaction and the baseline value; a random intercept for each participant; visit entered as a category; an unstructured covariance matrix; missing visits assumed missing at random | Generalised estimating equations where the question is about the group average rather than about a participant; simplify the random effects, or transform the outcome, where the model will not converge |
| continuous/single | Continuous, one group | Mean with a 95% confidence interval | Median with the interquartile range where the outcome is skewed | | |
| continuous/pair | Two continuous variables | Pearson correlation with a 95% confidence interval | Spearman correlation where either is skewed | | |
| binary/two_groups | Binary, independent groups | Chi-square test | Fisher's exact test where any expected count is below 5 | Log-binomial regression | Modified Poisson regression with robust variance |
| binary/many_groups | Binary, more than two groups | Chi-square test | Fisher's exact test where any expected count is below 5 | Log-binomial regression | Modified Poisson regression with robust variance |
| binary/paired | Binary, the same person twice | McNemar's test | Exact McNemar where the discordant pairs are few | Conditional logistic regression | |
| binary/repeated | Binary, measured three times or more | Proportion at each visit, with no p value | | Generalised estimating equations with a group-by-time term, robust variance clustered on the person | Random-intercept logistic regression |
| binary/single | Binary, one group | Proportion with a 95% confidence interval, by the Wilson method | | | |
| binary/prediction | A score built to predict a yes-or-no outcome | Discrimination: the C-statistic with a 95% confidence interval | | Logistic regression with the predictors chosen by LASSO, the penalty tuned by cross-validation, and the coefficients reported on the retained predictors | Ridge or elastic net where the predictors are strongly correlated |
| time_to_event/prediction | A score built to predict the time to an event | Discrimination: Harrell's C with a 95% confidence interval | | Cox regression with the predictors chosen by LASSO, the penalty tuned by cross-validation | Ridge or elastic net where the predictors are strongly correlated |
| continuous/prediction | A score built to predict a measured number | Discrimination: the root mean squared error and R-squared | | Linear regression with the predictors chosen by LASSO, the penalty tuned by cross-validation | Ridge or elastic net where the predictors are strongly correlated |
| binary/diagnostic | An index test against a reference standard | Sensitivity, specificity, predictive values and likelihood ratios with exact binomial confidence intervals, and the area under the curve with a DeLong interval | | | |
| ordinal/two_groups | Ordinal | Mann-Whitney test | Jonckheere-Terpstra where the groups are ordered and a trend is asked for | Cumulative-link (ordinal) regression | |
| ordinal/many_groups | Ordinal, more than two groups | Kruskal-Wallis test | Jonckheere-Terpstra where the groups are ordered | Cumulative-link (ordinal) regression | |
| ordinal/repeated | Ordinal, measured three times or more | Descriptive at each visit, with no p value | | Cumulative-link mixed model with a group-by-time term | |
| ordinal/single | Ordinal, one group | Median with the interquartile range | | | |
| count/two_groups | Counts | Comparison of rates | | Poisson regression with an offset for time at risk | Negative binomial regression where the variance is well above the mean; a zero-inflated model only where the group that could never have the event can be described in clinical words |
| count/repeated | Counts, measured three times or more | Rate at each visit, with no p value | | Poisson mixed model with a group-by-time term and an offset | Negative binomial mixed model |
| count/single | Counts, one group | Rate with a 95% confidence interval | | | |
| time_to_event/two_groups | Time to event | Kaplan-Meier curves with the log-rank test, and the median survival by group | | Cox proportional-hazards regression | Where the hazards are not proportional: the restricted mean survival time to a fixed horizon, or hazard ratios by time period, or stratification on the offending covariate where it is a nuisance variable, or a treatment-by-time interaction |
| time_to_event/competing | Time to event, with a competing event | Cumulative incidence functions by group, with Gray's test | | Cause-specific Cox regression, for a question about mechanism, or a Fine-Gray subdistribution model, for a question about prognosis | |
| time_to_event/single | Time to event, one group | Kaplan-Meier curve with the median survival | | | |
| nominal/two_groups | Nominal with more than two categories | Chi-square test | Fisher's exact test where any expected count is below 5 | Multinomial logistic regression | |
| nominal/single | Nominal, one group | Proportions with 95% confidence intervals | | | |
| ordinal/paired | Ordinal, the same person twice | Wilcoxon signed-rank test | | Cumulative-link mixed model with a random intercept for each participant | |
| ordinal/pair | Two ordered scales | Spearman rank correlation with a 95% confidence interval | | | |
| ordinal/diagnostic | An ordered index test against a reference standard | The area under the ROC curve with a DeLong interval, and sensitivity and specificity at each cut of the scale | Bootstrap optimism correction where the cut-off was chosen in these data | | |
| ordinal/prediction | A score built to predict an ordered outcome | Discrimination: the C-statistic with a 95% confidence interval | | Cumulative-link regression with the predictors chosen by LASSO, the penalty tuned by cross-validation | Ridge or elastic net where the predictors are strongly correlated |
| count/many_groups | Counts, more than two groups | Comparison of rates across the groups | Kruskal-Wallis on the rates where the counts are very skewed | Poisson regression with an offset for time at risk | Negative binomial regression where the variance is well above the mean |
| count/paired | Counts, the same person twice | Wilcoxon signed-rank test on the paired counts | | Poisson mixed model with a random intercept for each participant and an offset | Negative binomial mixed model |
| count/pair | A count against a measured number | Spearman rank correlation with a 95% confidence interval | | | |
| count/diagnostic | A count as an index test against a reference standard | The area under the ROC curve with a DeLong interval, and sensitivity and specificity at the cut-off | Bootstrap optimism correction where the cut-off was chosen in these data | | |
| count/prediction | A score built to predict a count | Discrimination: the root mean squared error | | Poisson regression with the predictors chosen by LASSO, the penalty tuned by cross-validation | Negative binomial where the variance is well above the mean |
| nominal/many_groups | Nominal, more than two groups | Chi-square test | Fisher's exact test where any expected count is below 5 | Multinomial logistic regression | |
| nominal/paired | Nominal, the same person twice | Stuart-Maxwell test of marginal homogeneity | | Conditional multinomial logistic regression, keeping each set together | |
| nominal/repeated | Nominal, measured three times or more | The distribution at each visit, with no p value | | Multinomial generalised estimating equations with a group-by-visit term, robust variance clustered on the participant | |
| nominal/prediction | A score built to predict an unordered outcome | Discrimination: the multiclass C-statistic | | Multinomial logistic regression with the predictors chosen by LASSO | |
| binary/pair | Two yes-or-no variables | The phi coefficient with a 95% confidence interval, and the odds ratio beside it | | | |
| continuous/diagnostic | A measured number as an index test against a reference standard | The area under the ROC curve with a DeLong interval, and sensitivity and specificity at the cut-off | Bootstrap optimism correction where the cut-off was chosen in these data | | |
| time_to_event/many_groups | Time to event, more than two groups | Kaplan-Meier curves with the log-rank test across the groups, and the median survival by group | | Cox proportional-hazards regression | Where the hazards are not proportional: the restricted mean survival time to a fixed horizon, or stratification on the offending covariate |
| time_to_event/paired | Time to event, matched or within-person | Stratified log-rank test within the matched sets | | Cox regression stratified on the matched set, or a shared-frailty model | |
| nominal/pair | Two unordered categorical variables | Cramer's V with a 95% confidence interval | | | |
