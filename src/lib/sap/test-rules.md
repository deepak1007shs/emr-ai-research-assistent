# Which test, and why

The rules the SAP applies when it names a statistical test. Edit this file to
change how tests are chosen; `choose-test.ts` reads these rows and nothing else.

Each row is matched on **data type** and **comparison**, in the order written.
The first row that matches wins. `paired` and `skewed` narrow a match further.

| data_type | comparison | paired | skewed | test | why |
|---|---|---|---|---|---|
| binary | single_group | any | any | Proportion with 95% CI (Clopper-Pearson exact) | One group and one proportion. Exact rather than Wald, because the expected count is usually small |
| binary | two_groups | false | any | Chi-square, Fisher exact where any expected cell <5 | Two categorical variables, unpaired |
| binary | two_groups | true | any | McNemar test | The same patients measured twice; an unpaired test would ignore the pairing |
| binary | many_groups | any | any | Chi-square across groups, Fisher exact where cells are sparse | One categorical outcome across three or more groups |
| binary | association | any | any | Univariable binary logistic regression, OR with 95% CI | A binary outcome regressed on a predictor |
| binary | adjusted | any | any | Multivariable binary logistic regression, adjusted OR with 95% CI | A binary outcome with confounders held constant |
| continuous | single_group | any | any | Mean (SD) with 95% CI, or median (IQR) if skewed | One group, described rather than compared |
| continuous | two_groups | false | false | Independent t-test | Two independent groups, both approximately normal |
| continuous | two_groups | false | true | Mann-Whitney U; median (IQR) and Hodges-Lehmann difference | Skewed data, where a mean would mislead |
| continuous | two_groups | true | false | Paired t-test | The same patients before and after |
| continuous | two_groups | true | true | Wilcoxon signed-rank test | Paired and skewed |
| continuous | many_groups | any | false | One-way ANOVA | Three or more independent groups, approximately normal |
| continuous | many_groups | any | true | Kruskal-Wallis test | Three or more groups, skewed |
| continuous | association | any | any | Linear regression, mean difference with 95% CI | A continuous outcome regressed on a predictor |
| continuous | adjusted | any | any | Multivariable linear regression, adjusted mean difference with 95% CI | A continuous outcome with confounders held constant |
| continuous | correlation | any | false | Pearson correlation | Two continuous variables, both approximately normal |
| continuous | correlation | any | true | Spearman rank correlation | Two continuous variables, at least one skewed |
| continuous | agreement | any | any | Intraclass correlation coefficient with Bland-Altman limits of agreement | Agreement between methods or raters, not association |
| ordinal | two_groups | false | any | Mann-Whitney U | Ordered categories compared between two independent groups |
| ordinal | two_groups | true | any | Wilcoxon signed-rank test | Ordered categories, paired |
| ordinal | many_groups | any | any | Kruskal-Wallis test | Ordered categories across three or more groups |
| ordinal | association | any | any | Ordinal logistic regression, common OR with 95% CI | An ordered outcome regressed on a predictor |
| ordinal | agreement | any | any | Weighted kappa | Agreement on an ordered scale, where near-misses matter |
| nominal | two_groups | any | any | Chi-square, Fisher exact where any expected cell <5 | A nominal outcome across groups |
| nominal | agreement | any | any | Cohen kappa | Agreement on unordered categories |
| count | two_groups | any | any | Poisson or negative binomial regression, rate ratio with 95% CI | Counts, with negative binomial when overdispersed |
| count | association | any | any | Poisson or negative binomial regression, rate ratio with 95% CI | Counts regressed on a predictor |
| time_to_event | two_groups | any | any | Kaplan-Meier with log-rank test | Time to an event, comparing two groups |
| time_to_event | association | any | any | Cox proportional hazards regression, HR with 95% CI | Time to an event with predictors; the proportional-hazards assumption must be checked |
| time_to_event | adjusted | any | any | Cox proportional hazards regression, adjusted HR with 95% CI | As above, with confounders |
| any | descriptive | any | any | Frequencies (n, %) | Described, not tested |
