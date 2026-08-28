# Which analysis, and why

The rules the SAP applies when it plans an analysis. Edit this file to change
how analyses are chosen; `choose-test.ts` reads these blocks and nothing else.

Each block is matched in the order written, and the first that matches wins.

## What a block is matched on

The heading carries the five facts that decide the analysis, in order:

    ## data_type | comparison | pairing | frequency | design

- `data_type` - what kind of thing the outcome is.
- `comparison` - what is being compared: one group estimated, two groups, three
  or more, an outcome regressed on a predictor, the same with confounders held
  constant, a correlation, an agreement, or nothing tested at all.
- `pairing` - how the measurements relate. `none` for independent observations,
  `paired` for the same patient measured twice, `repeated` for three or more
  occasions in the same patient. Repetition beats everything else: a trajectory
  is a trajectory whether or not confounders are held constant, so those blocks
  are written first.
- `frequency` - for a binary outcome, whether the event is `common` (roughly
  over 10%) or `rare`. It decides whether an odds ratio may stand in for a risk
  ratio. Where the plan leaves it open the builder fills it from the expected
  events over the sample size, because the sample size calculation already
  assumed a rate.
- `design` - the study's design family, where the design decides which estimate
  is valid rather than the data alone. Only an odds ratio is estimable from
  case-control sampling; a cross-sectional study measures prevalence and not
  risk. Those blocks are written above the frequency ones, because the design is
  the stronger fact.

`any` matches anything. Correlation and agreement blocks are written above the
repeated block on purpose: two raters measuring one patient is repetition of a
different kind, and a mixed model is not what it needs.

## What a block returns

- `why` - the one line that explains the choice, printed under the analysis map.
- `summary` - how the data are described in the descriptive table.
- `normality` - the test that decides between the two branches, and the rule.
  Present only where the choice arises.
- `parametric` / `nonparametric` - the two branches, each with its own
  `statistic`, `effect`, `adjusted` model and `measures`. A plan is written
  before any data exist, so nobody can know yet whether a distribution will be
  normal: the plan names both and states the switch, rather than guessing. An
  outcome already known to be skewed may still commit to one branch, by setting
  `skewed` on its analysis row and saying why.
- `test` - used instead of the two branches where normality does not arise.
- `statistic` - the shape the test statistic prints in, with its degrees of
  freedom. `effect` - the effect size that must accompany it. A p value with
  neither says nothing about how big anything was.
- `post_hoc` - the pairwise test and its correction, for three or more groups.
  Reported only after a significant omnibus test.
- `adjusted` - the model that holds confounders constant.
- `measures` - the estimates the effect table prints, one to a row, separated by
  semicolons. `unadjusted` is prose for a statistician to read; this is the same
  decision in a form the table builder can lay out, so the effect measure is
  never invented.
- `avoid` - what must not be done here, and why. A plan that only says what to
  do lets the commonest mistake through in silence.
- `assumptions` / `adjusted_assumptions` - one per line as
  `assumption :: how it is checked :: what to do if it fails`. Kept apart
  because an adjusted model's assumptions are not the unadjusted estimate's, and
  a plan that states one has checked half.

## binary | any | repeated | any | any

why: A binary outcome recorded at three or more occasions in the same patient
summary: n (%) per group, with an exact 95% CI for each proportion
test: -
  statistic: -
  effect: -
post_hoc: -
adjusted: Mixed-effects logistic regression with a random intercept per patient, or generalised estimating equations with an exchangeable working correlation and robust standard errors; fixed effects group, time and their interaction
measures: Group by time interaction; Odds ratio at each time point
avoid: Chi-square or ordinary logistic regression: both treat repeated measurements of one patient as though they came from different patients, and return intervals far too narrow
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | single_group | any | any | any

why: One group and one proportion, estimated rather than tested
summary: n (%) per group, with an exact 95% CI for each proportion
test: Proportion with exact (Clopper-Pearson) 95% CI
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
measures: Proportion (%)
avoid: A Wald interval: it misbehaves when the count is small or the proportion near 0 or 1
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering

## binary | two_groups | paired | any | any

why: The same patients measured twice
summary: n (%) per group, with an exact 95% CI for each proportion
test: McNemar test; matched-pair risk difference with 95% CI
  statistic: chi-square(1)
  effect: Matched odds ratio
post_hoc: -
adjusted: Conditional logistic regression, adjusted OR with 95% CI
measures: Matched odds ratio; Risk difference (matched pairs)
avoid: An unpaired test: it ignores the pairing and overstates precision
assumptions:
  - Each pair is independent of every other pair :: Design check :: Account for the clustering
  - Enough discordant pairs :: Count the discordant cells; under 25, use the exact binomial form :: Use the exact McNemar test
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | two_groups | any | any | case_control

why: A case-control study, where the odds ratio is the only valid estimate
summary: n (%) per group, with an exact 95% CI for each proportion
test: Odds ratio with 95% CI from the 2 x 2 table, Haldane-Anscombe correction where a cell is zero
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI
measures: Odds ratio
avoid: A risk ratio, a risk difference or an incidence: case-control sampling fixes the ratio of cases to controls, so absolute risk is not estimable from it
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | two_groups | any | any | cross_sectional

why: A cross-sectional study, where what is measured is prevalence rather than risk
summary: n (%) per group, with an exact 95% CI for each proportion
test: Prevalence difference and prevalence ratio, each with 95% CI; prevalence with exact 95% CI per group
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted prevalence ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Prevalence ratio; Prevalence difference
avoid: An odds ratio, which overstates the effect where the condition is common, and any wording that implies the exposure came first
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | two_groups | any | any | randomised_trial

why: A randomised trial, where risk is estimable whatever the event rate turns out to be
summary: n (%) per group, with an exact 95% CI for each proportion
test: Risk difference (Newcombe) and risk ratio, each with 95% CI; proportions with exact 95% CI per arm
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Risk ratio; Risk difference; Number needed to treat
avoid: An odds ratio: allocation is random and follow-up complete, so risk is estimable and there is no reason to report odds
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | two_groups | any | any | cohort

why: A cohort followed forward, where risk is estimable directly
summary: n (%) per group, with an exact 95% CI for each proportion
test: Risk difference (Newcombe) and risk ratio, each with 95% CI; incidence per group
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Risk ratio; Risk difference; Number needed to harm
avoid: An odds ratio, and counts with no person-time where the length of follow-up varies between participants
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | two_groups | any | common | any

why: A common binary outcome, where the risk difference is what a clinician can act on
summary: n (%) per group, with an exact 95% CI for each proportion
test: Risk difference (Newcombe) and risk ratio, each with 95% CI; proportions with exact 95% CI per group
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Risk ratio; Risk difference; Number needed to treat
avoid: An odds ratio: with a common outcome it is not a risk ratio and overstates the effect
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | two_groups | any | rare | any

why: A rare binary outcome, where the odds ratio approximates the risk ratio
summary: n (%) per group, with an exact 95% CI for each proportion
test: Proportion with exact 95% CI per group; risk difference (Newcombe); odds ratio with 95% CI, Haldane-Anscombe correction where a cell is zero
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Binary logistic regression, adjusted OR with 95% CI; Firth penalisation where events are few or separation appears
measures: Odds ratio; Risk difference; Number needed to treat
avoid: Reading the odds ratio as a risk ratio without saying the outcome is rare
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | two_groups | any | any | any

why: Two groups and a binary outcome, with the event frequency not yet known
summary: n (%) per group, with an exact 95% CI for each proportion
test: Chi-square, Fisher exact where any expected cell is under 5; risk difference (Newcombe) with 95% CI
  statistic: chi-square(df)
  effect: Cramer's V
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Risk ratio; Risk difference
avoid: Reporting a p value with no effect estimate beside it
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - No expected cell count below 5 :: Inspect the expected counts, not the observed ones :: Use Fisher's exact test, or collapse categories decided before the data were seen
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | many_groups | any | any | any

why: One binary outcome across three or more groups
summary: n (%) per group, with an exact 95% CI for each proportion
test: Chi-square across groups, Fisher exact where cells are sparse
  statistic: chi-square(df)
  effect: Cramer's V
post_hoc: Pairwise chi-square with Bonferroni adjustment, and only after a significant omnibus test
adjusted: Binary logistic regression with the group as a factor, adjusted OR with 95% CI
measures: Odds ratio against the reference group; Risk difference against the reference group
avoid: A pairwise test per group with no correction for the number of comparisons
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - No expected cell count below 5 :: Inspect the expected counts, not the observed ones :: Use Fisher's exact test, or collapse categories decided before the data were seen
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | association | any | any | case_control

why: A case-control study, where the odds ratio is the only valid estimate
summary: n (%) per group, with an exact 95% CI for each proportion
test: Odds ratio with 95% CI from the 2 x 2 table, Haldane-Anscombe correction where a cell is zero
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI
measures: Odds ratio
avoid: A risk ratio, a risk difference or an incidence: case-control sampling fixes the ratio of cases to controls, so absolute risk is not estimable from it
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | association | any | any | cross_sectional

why: A cross-sectional study, where what is measured is prevalence rather than risk
summary: n (%) per group, with an exact 95% CI for each proportion
test: Prevalence difference and prevalence ratio, each with 95% CI; prevalence with exact 95% CI per group
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted prevalence ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Prevalence ratio; Prevalence difference
avoid: An odds ratio, which overstates the effect where the condition is common, and any wording that implies the exposure came first
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | association | any | common | any

why: A common binary outcome regressed on a predictor
summary: n (%) per group, with an exact 95% CI for each proportion
test: Risk ratio with 95% CI (log-binomial, or modified Poisson with robust variance)
  statistic: Wald chi-square(df)
  effect: Deviance explained
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI
measures: Risk ratio per unit
avoid: An odds ratio, for the reason above
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders

## binary | association | any | any | any

why: A binary outcome regressed on a predictor
summary: n (%) per group, with an exact 95% CI for each proportion
test: Univariable binary logistic regression, OR with 95% CI
  statistic: Wald chi-square(df)
  effect: Nagelkerke R-squared, and the area under the ROC curve
post_hoc: -
adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI
measures: Odds ratio per unit
avoid: Entering more predictors than the events afford
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | adjusted | any | any | case_control

why: A case-control study, where the odds ratio is the only valid estimate
summary: n (%) per group, with an exact 95% CI for each proportion
test: Odds ratio with 95% CI from the 2 x 2 table, Haldane-Anscombe correction where a cell is zero
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI
measures: Odds ratio
avoid: A risk ratio, a risk difference or an incidence: case-control sampling fixes the ratio of cases to controls, so absolute risk is not estimable from it
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## binary | adjusted | any | any | cross_sectional

why: A cross-sectional study, where what is measured is prevalence rather than risk
summary: n (%) per group, with an exact 95% CI for each proportion
test: Prevalence difference and prevalence ratio, each with 95% CI; prevalence with exact 95% CI per group
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted prevalence ratio with 95% CI; modified Poisson with robust variance where it fails to converge
measures: Prevalence ratio; Prevalence difference
avoid: An odds ratio, which overstates the effect where the condition is common, and any wording that implies the exposure came first
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | adjusted | any | common | any

why: A common binary outcome with confounders held constant
summary: n (%) per group, with an exact 95% CI for each proportion
test: Risk difference and risk ratio, each with 95% CI
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Log-binomial regression, adjusted risk ratio with 95% CI; modified Poisson where it fails to converge
measures: Risk ratio; Risk difference; Number needed to treat
avoid: An odds ratio with a common outcome
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The model converges :: Inspect the convergence report :: Use modified Poisson with robust variance, which converges where log-binomial does not
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## binary | adjusted | any | any | any

why: A binary outcome with confounders held constant
summary: n (%) per group, with an exact 95% CI for each proportion
test: Proportions with exact 95% CI, and the crude OR
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI
measures: Odds ratio; Risk difference
avoid: Choosing the confounders by looking at their p values
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## continuous | correlation | any | any | any

why: Two continuous variables, and how strongly they move together. Which test is used follows the normality check reported in the descriptive table, not the sample size
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
normality: Shapiro-Wilk on the variable, read with a histogram and a Q-Q plot. p >= 0.05 uses the parametric row; p < 0.05 uses the non-parametric row
parametric: Pearson correlation with 95% CI
  statistic: t(df)
  effect: r, and r-squared as the variance shared
  measures: Pearson correlation coefficient
nonparametric: Spearman rank correlation with a bootstrap 95% CI
  statistic: t(df)
  effect: rho
  measures: Spearman rank correlation coefficient
post_hoc: -
avoid: Reading correlation as agreement; and pearson, which assumes both are near normal
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - Both variables are approximately normal :: Shapiro-Wilk on each, with a scatter plot :: Report Spearman instead
  - The relationship is linear :: Inspect the scatter plot before computing anything :: Report Spearman, or model the curve
  - The relationship is monotonic :: Inspect the scatter plot :: Describe the shape rather than reporting one coefficient

## continuous | agreement | any | any | any

why: Agreement between methods or raters
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
test: Intraclass correlation coefficient with Bland-Altman bias and limits of agreement
  statistic: F(df1, df2)
  effect: Intraclass correlation coefficient
post_hoc: -
measures: Intraclass correlation coefficient; Bland-Altman bias; Upper limit of agreement; Lower limit of agreement
avoid: A correlation coefficient, which measures association and not agreement
assumptions:
  - The raters are a random sample of raters, where the result is to generalise :: State the ICC form used, two-way random or mixed, and agreement or consistency :: State the restricted interpretation
  - The differences are unrelated to the magnitude :: Bland-Altman plot of difference against mean :: Log-transform, or report proportional limits of agreement

## continuous | any | repeated | any | any

why: A measure repeated at three or more occasions in the same patient. The repetition decides the model, whether or not confounders are held constant
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
test: -
  statistic: -
  effect: -
post_hoc: -
adjusted: Linear mixed-effects model, random intercept per patient; fixed effects group, time and their interaction, and any confounder the plan names; estimated marginal means with 95% CI
measures: Group by time interaction; Estimated marginal mean difference at each time point
avoid: Repeated-measures ANOVA, which drops every patient with one missing time point; and a separate test at each time point, which multiplies the comparisons and pretends the measurements came from different patients
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption

## continuous | single_group | any | any | any

why: One group, described rather than compared. Which test is used follows the normality check reported in the descriptive table, not the sample size
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
normality: Shapiro-Wilk on the variable, read with a histogram and a Q-Q plot. p >= 0.05 uses the parametric row; p < 0.05 uses the non-parametric row
parametric: Mean (SD) with 95% CI
  statistic: -
  effect: The estimate itself, with its 95% CI
  measures: Mean
nonparametric: Median (IQR), with a bootstrap 95% CI for the median
  statistic: -
  effect: The estimate itself, with its 95% CI
  measures: Median
post_hoc: -
avoid: A mean, which a skewed distribution misrepresents
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering

## continuous | two_groups | paired | any | any

why: The same patients measured before and after. Which test is used follows the normality check reported in the descriptive table, not the sample size
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
normality: Shapiro-Wilk on the paired differences, not on either occasion, read with a histogram and a Q-Q plot. p >= 0.05 uses the parametric row; p < 0.05 uses the non-parametric row
parametric: Paired t-test; mean difference with 95% CI
  statistic: t(df)
  effect: Cohen's dz
  adjusted: Linear mixed-effects model on the paired measurements
  measures: Mean difference (paired)
nonparametric: Wilcoxon signed-rank test; Hodges-Lehmann median difference with 95% CI
  statistic: W
  effect: r = Z / sqrt(N)
  adjusted: Linear mixed-effects model on the paired measurements
  measures: Hodges-Lehmann median difference
post_hoc: -
avoid: An unpaired test, which ignores the pairing; and a paired t-test on skewed differences
assumptions:
  - Each pair is independent of every other pair :: Design check :: Account for the clustering
  - The paired differences are approximately normal :: Shapiro-Wilk on the differences, not on either occasion :: Report the Wilcoxon signed-rank row instead
  - The distribution of the differences is symmetric :: Histogram of the paired differences :: Report the sign test, which assumes only a median
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption

## continuous | two_groups | any | any | any

why: Two independent groups and a continuous outcome. Which test is used follows the normality check reported in the descriptive table, not the sample size
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
normality: Shapiro-Wilk in each group, read with a histogram and a Q-Q plot. p >= 0.05 uses the parametric row; p < 0.05 uses the non-parametric row
parametric: Independent t-test, Welch where variances differ; mean difference with 95% CI
  statistic: t(df)
  effect: Cohen's d
  adjusted: Multivariable linear regression, adjusted mean difference with 95% CI
  measures: Mean difference
nonparametric: Mann-Whitney U; median (IQR) per group and Hodges-Lehmann median difference with 95% CI
  statistic: U
  effect: r = Z / sqrt(N)
  adjusted: Quantile (median) regression, or linear regression on the log scale where that is interpretable
  measures: Hodges-Lehmann median difference
post_hoc: -
avoid: Reporting a p value with no mean difference beside it; and a mean difference, which a skewed distribution misrepresents
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - Each group is approximately normal :: Shapiro-Wilk in each group, read with a histogram and a Q-Q plot :: Report the non-parametric row instead
  - The two groups have similar variance :: Levene's test :: Use the Welch correction, which does not assume it
  - The two distributions have a similar shape :: Compare the histograms of the two groups :: Read the result as a shift in distribution rather than a difference in medians
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The residuals are approximately normal :: Q-Q plot of the residuals :: Transform the outcome, or use quantile regression
  - The residual variance is constant :: Residuals against fitted values :: Use robust standard errors
  - No severe collinearity :: Variance inflation factor above 5 is a warning, above 10 a problem :: Drop one of a collinear pair, decided on clinical grounds

## continuous | many_groups | any | any | any

why: Three or more independent groups and a continuous outcome. Which test is used follows the normality check reported in the descriptive table, not the sample size
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
normality: Shapiro-Wilk in each group, read with a histogram and a Q-Q plot. p >= 0.05 uses the parametric row; p < 0.05 uses the non-parametric row
parametric: One-way ANOVA
  statistic: F(df1, df2)
  effect: eta-squared
  adjusted: Multivariable linear regression with the group as a factor
  measures: Mean difference against the reference group
nonparametric: Kruskal-Wallis test
  statistic: H(df)
  effect: epsilon-squared
  adjusted: Quantile regression with the group as a factor
  measures: Median difference against the reference group
post_hoc: Tukey honestly significant difference after ANOVA; Dunn's test with Bonferroni adjustment after Kruskal-Wallis
avoid: Repeated pairwise t-tests with no correction; and repeated pairwise tests with no correction
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - Each group is approximately normal :: Shapiro-Wilk in each group, with a Q-Q plot of the residuals :: Report the Kruskal-Wallis row instead
  - The groups have similar variance :: Levene's test :: Use Welch's ANOVA with the Games-Howell post hoc test
  - The groups have a similar distribution shape :: Compare the histograms :: Read the result as a shift in distribution
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The residuals are approximately normal :: Q-Q plot of the residuals :: Transform the outcome, or use quantile regression
  - The residual variance is constant :: Residuals against fitted values :: Use robust standard errors
  - No severe collinearity :: Variance inflation factor above 5 is a warning, above 10 a problem :: Drop one of a collinear pair, decided on clinical grounds

## continuous | association | any | any | any

why: A continuous outcome regressed on a predictor
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
test: Univariable linear regression, mean difference with 95% CI
  statistic: F(df1, df2) for the model, t(df) per coefficient
  effect: R-squared and adjusted R-squared
post_hoc: -
adjusted: Multivariable linear regression, adjusted mean difference with 95% CI
measures: Mean difference per unit
avoid: Reading a coefficient without checking the residuals
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The residuals are approximately normal :: Q-Q plot of the residuals :: Transform the outcome, or use quantile regression
  - The residual variance is constant :: Residuals against fitted values :: Use robust standard errors
  - No severe collinearity :: Variance inflation factor above 5 is a warning, above 10 a problem :: Drop one of a collinear pair, decided on clinical grounds
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The residuals are approximately normal :: Q-Q plot of the residuals :: Transform the outcome, or use quantile regression
  - The residual variance is constant :: Residuals against fitted values :: Use robust standard errors
  - No severe collinearity :: Variance inflation factor above 5 is a warning, above 10 a problem :: Drop one of a collinear pair, decided on clinical grounds

## continuous | adjusted | any | any | any

why: A continuous outcome with confounders held constant
summary: Mean +/- SD where the distribution allows it, median (IQR) where it does not
test: Group means (SD) and the crude mean difference
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
adjusted: Multivariable linear regression, adjusted mean difference with 95% CI
measures: Mean difference
avoid: Adjusting for a variable on the causal path
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The residuals are approximately normal :: Q-Q plot of the residuals :: Transform the outcome, or use quantile regression
  - The residual variance is constant :: Residuals against fitted values :: Use robust standard errors
  - No severe collinearity :: Variance inflation factor above 5 is a warning, above 10 a problem :: Drop one of a collinear pair, decided on clinical grounds

## ordinal | agreement | any | any | any

why: Agreement on an ordered scale
summary: Median (IQR), and n (%) in each category
test: Weighted kappa with 95% CI
  statistic: -
  effect: Weighted kappa
post_hoc: -
measures: Weighted kappa
avoid: Unweighted kappa, which counts a near miss as a total disagreement
assumptions:
  - Each subject is rated once by each rater :: Design check :: Account for the repeated ratings
  - The categories are the ones agreed before rating :: Design check :: Do not collapse categories after seeing the disagreement

## ordinal | any | repeated | any | any

why: An ordered outcome recorded at three or more occasions in the same patient
summary: Median (IQR), and n (%) in each category
test: -
  statistic: -
  effect: -
post_hoc: -
adjusted: Ordinal mixed-effects model, proportional odds with a random intercept per patient; fixed effects group, time and their interaction
measures: Group by time interaction; Common odds ratio at each time point
avoid: Treating the occasions as independent groups, and taking a mean of an ordered scale
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption

## ordinal | two_groups | paired | any | any

why: Ordered categories, paired
summary: Median (IQR), and n (%) in each category
test: Wilcoxon signed-rank test; median (IQR) at each occasion
  statistic: W
  effect: r = Z / sqrt(N)
post_hoc: -
adjusted: Ordinal mixed-effects model
measures: Median difference (paired)
avoid: Treating the scores as interval and taking a mean
assumptions:
  - Each pair is independent of every other pair :: Design check :: Account for the clustering
  - The distribution of the differences is symmetric :: Histogram of the paired differences :: Report the sign test, which assumes only a median
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption

## ordinal | two_groups | any | any | any

why: Ordered categories compared between two independent groups
summary: Median (IQR), and n (%) in each category
test: Mann-Whitney U; median (IQR) per group
  statistic: U
  effect: r = Z / sqrt(N)
post_hoc: -
adjusted: Ordinal logistic regression, adjusted common OR with 95% CI; the proportional-odds assumption is checked
measures: Common odds ratio; Median difference
avoid: A mean and SD of an ordered scale
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The two distributions have a similar shape :: Compare the histograms of the two groups :: Read the result as a shift in distribution rather than a difference in medians
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## ordinal | many_groups | any | any | any

why: Ordered categories across three or more groups
summary: Median (IQR), and n (%) in each category
test: Kruskal-Wallis test
  statistic: H(df)
  effect: epsilon-squared
post_hoc: Dunn's test with Bonferroni adjustment
adjusted: Ordinal logistic regression with the group as a factor
measures: Common odds ratio against the reference group
avoid: A mean of an ordered scale
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The groups have a similar distribution shape :: Compare the histograms :: Read the result as a shift in distribution
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## ordinal | association | any | any | any

why: An ordered outcome regressed on a predictor
summary: Median (IQR), and n (%) in each category
test: Spearman rank correlation, or Jonckheere-Terpstra for an ordered trend
  statistic: t(df)
  effect: rho
post_hoc: -
adjusted: Ordinal logistic regression, adjusted common OR with 95% CI
measures: Common odds ratio per unit; Spearman rank correlation coefficient
avoid: Treating the categories as equally spaced numbers
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The relationship is monotonic :: Inspect the scatter plot :: Describe the shape rather than reporting one coefficient
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## nominal | agreement | any | any | any

why: Agreement on unordered categories
summary: n (%) per category
test: Cohen kappa with 95% CI
  statistic: -
  effect: Cohen's kappa
post_hoc: -
measures: Cohen kappa
avoid: Percentage agreement alone, which ignores chance
assumptions:
  - Each subject is rated once by each rater :: Design check :: Account for the repeated ratings
  - The categories are the ones agreed before rating :: Design check :: Do not collapse categories after seeing the disagreement

## nominal | two_groups | any | any | any

why: A nominal outcome across groups
summary: n (%) per category
test: Chi-square, Fisher exact where any expected cell is under 5
  statistic: chi-square(df)
  effect: Cramer's V
post_hoc: -
adjusted: Multinomial logistic regression, adjusted OR with 95% CI
measures: Odds ratio for each category against the reference category
avoid: Collapsing categories after seeing the data
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - No expected cell count below 5 :: Inspect the expected counts, not the observed ones :: Use Fisher's exact test, or collapse categories decided before the data were seen
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - At least ten outcome events per predictor :: Count the events and divide by the number of model terms :: Reduce to the prespecified confounders, or use Firth penalisation
  - The log odds are linear in each continuous predictor :: Box-Tidwell test, or compare against a categorised form :: Model the predictor in categories or with a spline
  - No separation and no severe collinearity :: Inspect the standard errors, and the variance inflation factors :: Use Firth penalisation, or drop one of a collinear pair

## count | any | repeated | any | any

why: A count recorded at three or more occasions in the same patient
summary: Median (IQR), and the rate per unit of person-time
test: -
  statistic: -
  effect: -
post_hoc: -
adjusted: Mixed-effects Poisson regression with a random intercept per patient, negative binomial where the variance exceeds the mean; fixed effects group, time and their interaction
measures: Group by time interaction; Rate ratio at each time point
avoid: Poisson regression that ignores the clustering within a patient, which understates every standard error
adjusted_assumptions:
  - The random effect is correctly specified :: Compare a random intercept against a random slope by likelihood ratio :: Fit the richer structure
  - The residuals are approximately normal at each level :: Q-Q plot of the residuals and of the random effects :: Transform the outcome, or fit a generalised mixed model
  - Data are missing at random :: Compare those with and without complete series on baseline characteristics :: Report a sensitivity analysis under a departure from that assumption
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## count | two_groups | any | any | any

why: Counts compared between groups
summary: Median (IQR), and the rate per unit of person-time
test: Rate per unit time with exact (Poisson) 95% CI per group; rate ratio with 95% CI
  statistic: Wald chi-square(df)
  effect: Deviance explained
post_hoc: -
adjusted: Poisson regression, negative binomial where the variance exceeds the mean; adjusted rate ratio with 95% CI
measures: Rate ratio; Rate difference
avoid: Poisson without checking for overdispersion, which understates the standard errors
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## count | association | any | any | any

why: Counts regressed on a predictor
summary: Median (IQR), and the rate per unit of person-time
test: Univariable Poisson regression, rate ratio with 95% CI
  statistic: Wald chi-square(df)
  effect: Deviance explained
post_hoc: -
adjusted: Poisson or negative binomial regression, adjusted rate ratio with 95% CI
measures: Rate ratio per unit
avoid: Ignoring excess zeros, which need a zero-inflated model
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model
adjusted_assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
  - The variance equals the mean :: Compare them, and inspect the deviance over its degrees of freedom :: Fit a negative binomial model
  - No excess of zeros :: Compare the observed count of zeros with the expected :: Fit a zero-inflated model

## time_to_event | two_groups | any | any | any

why: Time to an event, compared between two groups
summary: Events / N, and median survival with 95% CI
test: Kaplan-Meier curves with the log-rank test; median survival with 95% CI
  statistic: chi-square(df)
  effect: Hazard ratio
post_hoc: Pairwise log-rank with Bonferroni adjustment, where there are more than two groups
adjusted: Cox proportional-hazards regression, adjusted HR with 95% CI; the assumption is checked on Schoenfeld residuals
measures: Hazard ratio; Difference in median survival; Difference in restricted mean survival time
avoid: Kaplan-Meier where a competing event prevents the outcome: use cumulative incidence and Fine-Gray
assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable
adjusted_assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable

## time_to_event | association | any | any | any

why: Time to an event with a predictor
summary: Events / N, and median survival with 95% CI
test: Univariable Cox regression, HR with 95% CI
  statistic: Wald chi-square(df), and the score (log-rank) test
  effect: Harrell's c-statistic
post_hoc: -
adjusted: Multivariable Cox regression, adjusted HR with 95% CI; proportional hazards checked on Schoenfeld residuals
measures: Hazard ratio per unit
avoid: Reporting a hazard ratio without testing proportional hazards
assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable
adjusted_assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable

## time_to_event | adjusted | any | any | any

why: Time to an event with confounders held constant
summary: Events / N, and median survival with 95% CI
test: Kaplan-Meier by group, with the log-rank test
  statistic: chi-square(df)
  effect: Hazard ratio
post_hoc: -
adjusted: Multivariable Cox regression, adjusted HR with 95% CI; a time-varying covariate or a stratified model where the assumption fails
measures: Hazard ratio
avoid: Ignoring a competing risk
assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable
adjusted_assumptions:
  - Censoring is independent of the outcome :: Compare those censored with those still at risk :: Report a sensitivity analysis under informative censoring
  - Hazards are proportional over time :: Schoenfeld residuals against time, and log-minus-log curves :: Fit a time-varying coefficient or stratify on the offending variable

## any | descriptive | any | any | any

why: Described, not tested
summary: n (%) for a categorical variable; mean +/- SD or median (IQR) for a continuous one
test: Frequencies (n, %) for categorical, and mean (SD) or median (IQR) for continuous
  statistic: -
  effect: The estimate itself, with its 95% CI
post_hoc: -
avoid: A significance test: this row is described, not compared
assumptions:
  - Independence of observations :: Design check: one measurement per patient, and no patient in two groups :: Use a mixed-effects model or generalised estimating equations, which allow for the clustering
