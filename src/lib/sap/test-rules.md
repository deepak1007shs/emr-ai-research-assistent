# Which analysis, and why

The rules the SAP applies when it plans an analysis. Edit this file to change
how analyses are chosen; `choose-test.ts` reads these rows and nothing else.

Each row is matched in the order written, and the first row that matches wins.

**Match keys.** `data_type` and `comparison` are required. The rest narrow a
match and accept `any`:

- `pairing` - `none` (independent), `paired` (the same patients twice),
  `repeated` (three or more measurements per patient).
- `skewed` - `true` where the outcome is known to be skewed.
- `frequency` - for a binary outcome, whether the event is `common` (roughly
  over 10%) or `rare`. It decides whether an odds ratio may be reported as if
  it were a risk ratio, which is one of the commonest errors in a thesis.

**What a row returns.** Not a test name but a small plan:

- `unadjusted` - the estimate and its interval, before any adjustment.
- `adjusted` - the model that holds confounders constant, or `-` where
  adjustment does not apply to this shape of question.
- `avoid` - what must NOT be done here, and why, or `-`. A plan that only says
  what to do lets the commonest mistake through in silence.
- `measures` - the estimates the effect table prints, one to a row, separated
  by semicolons, or `-` where the question has no effect table. `unadjusted`
  is prose for a statistician to read; this is the same decision in a form the
  table builder can lay out, so the effect measure is never invented. Every one
  of them is printed beside a 95% confidence interval, which is a column of the
  table rather than part of the name.

| data_type | comparison | pairing | skewed | frequency | unadjusted | adjusted | avoid | why | measures |
|---|---|---|---|---|---|---|---|---|---|
| binary | single_group | any | any | any | Proportion with exact (Clopper-Pearson) 95% CI | - | A Wald interval: it misbehaves when the count is small or the proportion near 0 or 1 | One group and one proportion, estimated rather than tested | Proportion (%) |
| binary | two_groups | paired | any | any | McNemar test; matched-pair risk difference with 95% CI | Conditional logistic regression, adjusted OR with 95% CI | An unpaired test: it ignores the pairing and overstates precision | The same patients measured twice | Risk difference (matched pairs); Matched odds ratio |
| binary | two_groups | any | any | common | Risk difference (Newcombe) and risk ratio, each with 95% CI; proportions with exact 95% CI per group | Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson with robust variance where it fails to converge | An odds ratio: with a common outcome it is not a risk ratio and overstates the effect | A common binary outcome, where the risk difference is what a clinician can act on | Risk ratio; Risk difference; Number needed to treat |
| binary | two_groups | any | any | rare | Proportion with exact 95% CI per group; risk difference (Newcombe); odds ratio with 95% CI, Haldane-Anscombe correction where a cell is zero | Binary logistic regression, adjusted OR with 95% CI; Firth penalisation where events are few or separation appears | Reading the odds ratio as a risk ratio without saying the outcome is rare | A rare binary outcome, where the odds ratio approximates the risk ratio | Odds ratio; Risk difference; Number needed to treat |
| binary | two_groups | any | any | any | Chi-square, Fisher exact where any expected cell is under 5; risk difference (Newcombe) with 95% CI | Binary logistic regression, adjusted OR with 95% CI | Reporting a p value with no effect estimate beside it | Two groups and a binary outcome, with the event frequency not yet known | Risk difference; Risk ratio |
| binary | many_groups | any | any | any | Chi-square across groups, Fisher exact where cells are sparse | Binary logistic regression with the group as a factor, adjusted OR with 95% CI | A pairwise test per group with no correction for the number of comparisons | One binary outcome across three or more groups | Risk difference against the reference group; Risk ratio against the reference group |
| binary | association | any | any | common | Risk ratio with 95% CI (log-binomial, or modified Poisson with robust variance) | Log-binomial regression, adjusted risk ratio with 95% CI | An odds ratio, for the reason above | A common binary outcome regressed on a predictor | Risk ratio per unit |
| binary | association | any | any | any | Univariable binary logistic regression, OR with 95% CI | Multivariable binary logistic regression, adjusted OR with 95% CI | Entering more predictors than the events afford | A binary outcome regressed on a predictor | Odds ratio per unit |
| binary | adjusted | any | any | common | Risk difference and risk ratio, each with 95% CI | Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson where it fails to converge | An odds ratio with a common outcome | A common binary outcome with confounders held constant | Risk ratio; Risk difference; Number needed to treat |
| binary | adjusted | any | any | any | Proportions with exact 95% CI, and the crude OR | Multivariable binary logistic regression, adjusted OR with 95% CI | Choosing the confounders by looking at their p values | A binary outcome with confounders held constant | Odds ratio; Risk difference |
| continuous | single_group | any | true | any | Median (IQR), with a bootstrap 95% CI for the median | - | A mean, which a skewed distribution misrepresents | One skewed group, described rather than compared | Median |
| continuous | single_group | any | any | any | Mean (SD) with 95% CI | - | - | One group, described rather than compared | Mean |
| continuous | two_groups | repeated | any | any | - | Linear mixed-effects model, random intercept per patient, fixed effects group, time and their interaction; estimated marginal means with 95% CI | Repeated-measures ANOVA: it drops every patient with a single missing time point | A measure repeated at three or more time points | Group by time interaction; Estimated marginal mean difference at each time point |
| continuous | two_groups | paired | true | any | Wilcoxon signed-rank test; Hodges-Lehmann median difference with 95% CI | Linear mixed-effects model on the paired measurements | A paired t-test on skewed differences | Paired and skewed | Hodges-Lehmann median difference |
| continuous | two_groups | paired | any | any | Paired t-test; mean difference with 95% CI | Linear mixed-effects model on the paired measurements | An unpaired test, which ignores the pairing | The same patients before and after | Mean difference (paired) |
| continuous | two_groups | any | true | any | Mann-Whitney U; median (IQR) per group and Hodges-Lehmann median difference with 95% CI | Quantile (median) regression, or linear regression on the log scale where that is interpretable | A mean difference, which a skewed distribution misrepresents | Skewed data, where a mean would mislead | Hodges-Lehmann median difference |
| continuous | two_groups | any | any | any | Independent t-test, Welch where variances differ; mean difference with 95% CI | Multivariable linear regression, adjusted mean difference with 95% CI | Reporting a p value with no mean difference beside it | Two independent groups, both approximately normal | Mean difference |
| continuous | many_groups | any | true | any | Kruskal-Wallis test, with Dunn post-hoc where it is significant | Quantile regression with the group as a factor | Repeated pairwise tests with no correction | Three or more groups, skewed | Median difference against the reference group |
| continuous | many_groups | any | any | any | One-way ANOVA, with Tukey post-hoc where it is significant | Multivariable linear regression with the group as a factor | Repeated pairwise t-tests with no correction | Three or more independent groups, approximately normal | Mean difference against the reference group |
| continuous | association | any | any | any | Univariable linear regression, mean difference with 95% CI | Multivariable linear regression, adjusted mean difference with 95% CI | Reading a coefficient without checking the residuals | A continuous outcome regressed on a predictor | Mean difference per unit |
| continuous | adjusted | any | any | any | Group means (SD) and the crude mean difference | Multivariable linear regression, adjusted mean difference with 95% CI | Adjusting for a variable on the causal path | A continuous outcome with confounders held constant | Mean difference |
| continuous | correlation | any | true | any | Spearman rank correlation with a bootstrap 95% CI | - | Pearson, which assumes both are near normal | Two continuous variables, at least one skewed | Spearman rank correlation coefficient |
| continuous | correlation | any | any | any | Pearson correlation with 95% CI | - | Reading correlation as agreement | Two continuous variables, both approximately normal | Pearson correlation coefficient |
| continuous | agreement | any | any | any | Intraclass correlation coefficient with Bland-Altman bias and limits of agreement | - | A correlation coefficient, which measures association and not agreement | Agreement between methods or raters | Intraclass correlation coefficient; Bland-Altman bias; Upper limit of agreement; Lower limit of agreement |
| ordinal | two_groups | paired | any | any | Wilcoxon signed-rank test; median (IQR) at each occasion | Ordinal mixed-effects model | Treating the scores as interval and taking a mean | Ordered categories, paired | Median difference (paired) |
| ordinal | two_groups | any | any | any | Mann-Whitney U; median (IQR) per group | Ordinal logistic regression, adjusted common OR with 95% CI; the proportional-odds assumption is checked | A mean and SD of an ordered scale | Ordered categories compared between two independent groups | Common odds ratio; Median difference |
| ordinal | many_groups | any | any | any | Kruskal-Wallis test, with Dunn post-hoc where it is significant | Ordinal logistic regression with the group as a factor | A mean of an ordered scale | Ordered categories across three or more groups | Common odds ratio against the reference group |
| ordinal | association | any | any | any | Spearman rank correlation, or Jonckheere-Terpstra for an ordered trend | Ordinal logistic regression, adjusted common OR with 95% CI | Treating the categories as equally spaced numbers | An ordered outcome regressed on a predictor | Spearman rank correlation coefficient; Common odds ratio per unit |
| ordinal | agreement | any | any | any | Weighted kappa with 95% CI | - | Unweighted kappa, which counts a near miss as a total disagreement | Agreement on an ordered scale | Weighted kappa |
| nominal | two_groups | any | any | any | Chi-square, Fisher exact where any expected cell is under 5 | Multinomial logistic regression, adjusted OR with 95% CI | Collapsing categories after seeing the data | A nominal outcome across groups | Odds ratio for each category against the reference category |
| nominal | agreement | any | any | any | Cohen kappa with 95% CI | - | Percentage agreement alone, which ignores chance | Agreement on unordered categories | Cohen kappa |
| count | two_groups | any | any | any | Rate per unit time with exact (Poisson) 95% CI per group; rate ratio with 95% CI | Poisson regression, negative binomial where the variance exceeds the mean; adjusted rate ratio with 95% CI | Poisson without checking for overdispersion, which understates the standard errors | Counts compared between groups | Rate ratio; Rate difference |
| count | association | any | any | any | Univariable Poisson regression, rate ratio with 95% CI | Poisson or negative binomial regression, adjusted rate ratio with 95% CI | Ignoring excess zeros, which need a zero-inflated model | Counts regressed on a predictor | Rate ratio per unit |
| time_to_event | two_groups | any | any | any | Kaplan-Meier curves with the log-rank test; median survival with 95% CI | Cox proportional-hazards regression, adjusted HR with 95% CI; the assumption is checked on Schoenfeld residuals | Kaplan-Meier where a competing event prevents the outcome: use cumulative incidence and Fine-Gray | Time to an event, compared between two groups | Hazard ratio; Difference in median survival; Difference in restricted mean survival time |
| time_to_event | association | any | any | any | Univariable Cox regression, HR with 95% CI | Multivariable Cox regression, adjusted HR with 95% CI; proportional hazards checked on Schoenfeld residuals | Reporting a hazard ratio without testing proportional hazards | Time to an event with a predictor | Hazard ratio per unit |
| time_to_event | adjusted | any | any | any | Kaplan-Meier by group, with the log-rank test | Multivariable Cox regression, adjusted HR with 95% CI; a time-varying covariate or a stratified model where the assumption fails | Ignoring a competing risk | Time to an event with confounders held constant | Hazard ratio |
| any | descriptive | any | any | any | Frequencies (n, %) for categorical, and mean (SD) or median (IQR) for continuous | - | A significance test: this row is described, not compared | Described, not tested | - |
