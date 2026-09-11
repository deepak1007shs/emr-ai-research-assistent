# What each test assumes, how it is checked, and what is done when it fails

Two things read this file. A table's footnote takes the fallback, so that the
plan says in advance what will be run instead. A model's fit table takes the
checks, one row each, so that the assumption is reported with a statistic and a
verdict rather than asserted.

`Key` is matched against the model or test named in the Analysis Map, as a
lower-cased substring, first match wins. Put the specific keys first:
`log-binomial` before `regression`.

`Checks` and `Reported` are semicolon-separated lists; each becomes one row of
the fit table.

| Key | Assumption and how it is checked | If it fails | Reported |
|---|---|---|---|
| mixed model | Normal residuals (Shapiro-Wilk on the residuals); equal variance across levels (Levene); normal random effects; convergence | Simplify the random effects, or transform the outcome | Log-likelihood; AIC and BIC; marginal and conditional R-squared; variance components; intraclass correlation; convergence |
| log-binomial | Convergence; dispersion (Pearson chi-square divided by degrees of freedom, near 1); at least 10 events per covariate; no separation | Modified Poisson regression with robust variance; Firth penalised likelihood where the model separates | Log-likelihood; AIC and BIC; deviance divided by degrees of freedom; Pearson chi-square divided by degrees of freedom; pseudo R-squared; iterations to convergence; events; clusters |
| modified poisson | Robust variance, which is required and not optional; at least 10 events per covariate | Firth penalised likelihood where the model separates | Log-likelihood; AIC and BIC; pseudo R-squared; events; clusters; robust variance used |
| logistic | Linearity in the logit; no separation; at least 10 events per covariate; calibration (Hosmer-Lemeshow) | Firth penalised likelihood; fewer covariates | Log-likelihood; AIC and BIC; pseudo R-squared; Hosmer-Lemeshow statistic; events per covariate; convergence |
| cox | Proportional hazards (Schoenfeld residuals); censoring unrelated to the outcome | A time-varying effect, or stratification on the offending covariate | Log-likelihood; AIC; concordance; Schoenfeld global test; events; convergence |
| poisson | Mean equal to variance; an offset for time at risk | Negative binomial regression | Log-likelihood; AIC and BIC; deviance divided by degrees of freedom; pseudo R-squared |
| negative binomial | Over-dispersion accounted for; an offset for time at risk | Refit as Poisson where the dispersion parameter is near zero | Log-likelihood; AIC and BIC; dispersion parameter |
| ordinal | Proportional odds (the score or likelihood-ratio test); no separation | Partial proportional odds, or a multinomial model | Log-likelihood; AIC and BIC; proportional-odds test; convergence |
| linear regression | Linearity, independence, normal residuals and equal variance; collinearity by the variance inflation factor; influential points by Cook's distance | Transform the outcome; robust standard errors; report the sensitivity to influential points | R-squared and adjusted R-squared; residual standard error; largest variance inflation factor; largest Cook's distance; observations |
| t-test | Normality (Shapiro-Wilk and a Q-Q plot); equal variances (Levene) | Welch's t-test; Mann-Whitney with the Hodges-Lehmann difference | |
| chi-square | An expected count of 5 or more in every cell | Fisher's exact test | |
| mann-whitney | Independent observations; the two distributions have a similar shape, so the Hodges-Lehmann estimate reads as a median difference | Report the stochastic superiority instead of a median difference | |
| fisher | Independent observations | | |
| correlation | Linearity and normality for Pearson; a monotone relation for Spearman | Spearman rank correlation | |
| kaplan-meier | Censoring unrelated to the outcome | Report the competing risk explicitly | |
