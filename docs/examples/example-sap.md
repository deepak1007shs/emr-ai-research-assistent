# STATISTICAL ANALYSIS PLAN

**Factors Associated with Intraoperative Conversion during Transabdominal
Preperitoneal (TAPP) Repair of Ventral Hernia - A Prospective Observational
Cohort Study**

---

## Section 1 - Objectives as Answerable Questions

### Aim

To estimate the rate of intraoperative conversion during elective TAPP repair of
ventral hernia, and to identify the preoperative and intraoperative factors
associated with conversion.

### Primary objective(s)

- **P1:** In adults undergoing elective TAPP ventral hernia repair, what
  proportion of operations are converted intraoperatively to an alternative
  technique (IPOM, TARM, TAR or open repair)?

### Secondary objectives

- **S1:** Which preoperative and intraoperative factors are associated with
  conversion?
- **S2:** Does operative duration differ between converted and completed cases?
- **S3:** Does postoperative length of stay differ between converted and completed
  cases?
- **S4:** Among converted cases, what are the type of and reason for conversion?

---

## Section 2 - Analysis Map

*One row per objective. Every question is linked to its test AND to the empty
results table it will fill.*

| Objective | Outcome | Predictor(s) | Data type | Statistical test → Table # |
|---|---|---|---|---|
| **P1** - conversion rate | Intraoperative conversion, at the index operation, from the surgeon's record | (single-group estimate) | binary | Proportion with 95% CI (Clopper-Pearson exact) → T3 |
| **S1** - factors, unadjusted | Intraoperative conversion | Age, BMI, ASA grade, previous abdominal surgery, defect size, EHS width band, adhesion severity, surgeon experience | binary | Chi-square, Fisher exact where any expected cell <5; t-test or Mann-Whitney U for continuous predictors → T4 |
| **S1** - factors, adjusted | Intraoperative conversion | Age, BMI, previous abdominal surgery | binary | Binary logistic regression, OR with 95% CI, **exploratory only** → T5 |
| **S2** - operative duration | Operative duration, incision to closure, in minutes | Conversion status | continuous | Independent t-test if normal, otherwise Mann-Whitney U → T6 |
| **S3** - length of stay | Postoperative stay in days, derived from discharge date minus surgery date | Conversion status | continuous, skewed | Mann-Whitney U; median (IQR) and Hodges-Lehmann difference → T7 |
| **S4** - conversion detail | Type of and reason for conversion | (descriptive) | nominal | Frequencies (n, %), denominator the converted cases only → T8 |

**Why each test.** A single group and one proportion gives an exact binomial
interval, exact rather than Wald because about 10 events are expected. Two
categorical variables unpaired gives chi-square, with Fisher when cells are
sparse, which they often will be here. A binary outcome with predictors gives
logistic regression. A skewed continuous outcome gives a rank test, because a mean
length of stay would mislead.

**Degrees of freedom.** Expected conversions: 125 x 0.08 = **10 events**. At 10
events per degree of freedom the model affords **one** predictor, so the adjusted
model is declared exploratory here, before the data arrive, rather than discovered
at analysis.

**Not adjusted for.** *Operative duration* is a mediator, lying on the path
between operative difficulty and conversion; adjusting for it would remove the
effect being measured. *Postoperative complication* is a collider, caused by
conversion; conditioning on it would create a spurious association. Neither enters
any model.

---

*Generated from the study specification. Do not edit this document: change the
specification and rebuild, or the analysis plan, the case record form and the
shell tables will disagree.*
