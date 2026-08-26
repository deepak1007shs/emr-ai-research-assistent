<!--
  Generated from the reference study by src/lib/render/sap-md.ts, the same
  renderer the app uses. Do not edit by hand: regenerate it, or the example and
  the application will describe different documents.
-->

# STATISTICAL ANALYSIS PLAN

**Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia**

*prospective observational cohort. Department of General Surgery, AIIMS Jodhpur*

---

## PECOT

*The clinical question decomposed. This is what every objective, variable and test below must trace back to.*

| | |
|---|---|
| **P - Population** | Adults undergoing elective TAPP repair of a ventral hernia. |
| **E - Exposure** | Patient, hernia and intraoperative factors present at the time of surgery. |
| **C - Comparator** | Internal contrasts within the cohort; there is no unexposed group. |
| **O - Outcome** | Intraoperative conversion to an alternative technique. |
| **T - Time / type of study** | The index operation, with follow-up to 30 days. |

**Assembled question.** Among adults undergoing elective TAPP ventral hernia repair, what proportion are converted intraoperatively, and which patient, hernia and operative factors are associated with conversion?

---

## Section 1 - Objectives as Answerable Questions

*Every objective is phrased as a question, because a question forces you to name an outcome and a predictor, which is exactly what the statistics need.*

### Aim

To estimate the rate of intraoperative conversion during elective TAPP repair of ventral hernia, and to identify the factors associated with it.

### Hypothesis

Larger defects, denser adhesions and less surgeon experience are associated with a higher risk of intraoperative conversion.

### Primary estimand (ICH E9(R1))

*The estimand, not the test, is what the study is trying to estimate.*

| | |
|---|---|
| **Treatment condition** | Elective TAPP repair as planned at the start of the operation. |
| **Population** | All enrolled patients in whom TAPP was started. |
| **Endpoint** | Conversion to an alternative technique during the index operation. |
| **Intercurrent-event strategy** | Treatment policy: an operation abandoned for an unrelated reason is still counted as it occurred. |
| **Population-level summary** | Proportion with 95% CI, and adjusted odds ratios with 95% CI. |

### Primary objective(s)

- **P1:** What proportion of operations are converted intraoperatively to an alternative technique?

### Secondary objectives

- **S1:** Which factors are associated with conversion?
- **S2:** Does operative duration differ between converted and completed cases?

---

## Section 2 - Variable Table

*One row per variable. Once the data type and the role are set, the correct test follows almost mechanically. Grouped by role: outcomes first, then predictors, then confounders, then descriptors.*

| Variable | Data type | Unit / coding | Role in analysis |
|---|---|---|---|
| Intraoperative conversion | binary | Yes / No | outcome |
| Age | continuous | Years | confounder |
| Body mass index | continuous | kg/m2 | confounder |
| Previous abdominal surgery | binary | Yes / No | confounder |
| Operative duration | continuous | Minutes | mediator |
| Postoperative complication | binary | Yes / No | collider |

**Priority confounders for adjustment.** Age, Body mass index, Previous abdominal surgery. Respecting about ten outcome events per variable.

---

## Section 3 - Analysis Map

*One row per objective. Every question is linked to its test AND to the empty results table it will fill.*

| Objective | Outcome | Predictor(s) | Data type | Statistical test -> Table # |
|---|---|---|---|---|
| P1 - conversion rate | Intraoperative conversion, at the index operation, from study proforma, item 27 | (single-group estimate) | binary | Proportion with 95% CI (Clopper-Pearson exact) -> Table 3 |
| S1 - factors, adjusted | Intraoperative conversion, at the index operation, from study proforma, item 27 | Age, Body mass index, Previous abdominal surgery | binary | Multivariable binary logistic regression, adjusted OR with 95% CI -> Table 4 |
| S2 - operative duration | Operative duration, at the index operation, from theatre clock | Intraoperative conversion | continuous | Mann-Whitney U; median (IQR) and Hodges-Lehmann difference -> Table 5 |

**How each outcome is defined.**

- **Intraoperative conversion.** The surgeon's decision to abandon TAPP dissection. Recorded from study proforma, item 27, at the index operation. Reported in proportion (%) with 95% CI.
- **Operative duration.** Skin incision to skin closure. Recorded from theatre clock, at the index operation. Reported in minutes.

**Why each test.**

- **Proportion with 95% CI (Clopper-Pearson exact):** One group and one proportion. Exact rather than Wald, because the expected count is usually small.
- **Multivariable binary logistic regression, adjusted OR with 95% CI:** A binary outcome with confounders held constant.
- **Mann-Whitney U; median (IQR) and Hodges-Lehmann difference:** Skewed data, where a mean would mislead.

**Degrees of freedom.**

Expected events: 10. At ten events per degree of freedom the model affords 1 predictor, but 3 are named. The adjusted model is therefore declared exploratory here, before the data arrive, rather than discovered at analysis.

**Not adjusted for.**

- Operative duration is a mediator. It lies on the path between operative difficulty and conversion, so adjusting for it would remove the effect being measured.
- Postoperative complication is a collider. It is caused by conversion, so conditioning on it would create a spurious association.

Neither enters any model.

---

## Section 4 - General Statistical Rules

*Fixed upfront so they are never re-decided after seeing the data.*

- **Software.** IBM SPSS Statistics version 23.
- **Normality.** Shapiro-Wilk with histogram and Q-Q inspection, before choosing a parametric test.
- **Continuous data.** Mean +/- SD when normal, median (IQR) when skewed.
- **Categorical data.** Frequency (percentage).
- **Significance.** Two sided, p < 0.05.
- **Effect estimates.** Every estimate reported with a 95% confidence interval, not a bare p value.
- **Missing data.** Complete case while missingness is under 5%, multiple imputation by chained equations otherwise. Last observation carried forward is not used.
- **Multiplicity.** The primary outcome is confirmatory. Secondary outcomes are supportive and reported with unadjusted intervals; exploratory analyses use Benjamini-Hochberg.
- **Reproducibility.** A fixed random seed is set and reported for any stochastic procedure.

**Sample size.** Powered for precision rather than for a comparison: an assumed conversion rate of 8% with 5% absolute precision at 95% confidence gives 113, inflated to 125 for 10% incomplete records. TODO: confirm the assumed rate against the unit's own audit.

### Analysis populations (who is analysed)

| Population | Definition |
|---|---|
| Full analysis set | Every enrolled patient in whom the TAPP approach was begun. |
| Complete case set | Those with the primary outcome and all priority confounders recorded. |

### Baseline comparison

Baseline characteristics are summarised by conversion status. This is a cohort, so the comparison is descriptive and the p values are read as signals rather than as tests of balance.

### Intercurrent events

*These change what is being estimated. Missing data is a separate problem, handled by the rule above.*

| Event | Strategy |
|---|---|
| Operation abandoned before dissection for an anaesthetic reason | Treatment policy: counted as it occurred, and flagged in a sensitivity analysis. |

### Multiplicity and testing hierarchy

The conversion rate is tested first. The adjusted model is reported next and is exploratory at this event count, so no alpha is spent on it.

### Subgroup and interaction analyses

*Pre-specified. Effect modification is tested by an interaction term, never by comparing within-subgroup p values.*

| Subgroup | How it is tested |
|---|---|
| Recurrent versus primary hernia | An interaction term in the adjusted model, not a within-subgroup p value. |

### Interim analyses and stopping rules

Single final analysis; no interim looks.

---

## Section 5 - Step-by-Step Analysis Flow

*The ladder for the primary objective. The same ladder works for almost any design.*

- **Step 1.** Describe every variable by the rules above, and report the conversion rate with its 95% CI.
- **Step 2.** Compare each candidate predictor against conversion, unadjusted, for a crude estimate.
- **Step 3.** Enter the priority confounders into a binary logistic model, respecting ten events per predictor.
- **Step 4.** Repeat the primary analysis under the complete case and imputed sets to check it holds.

---

## Section 5A - Assumption Checking

*The assumptions belong to the test that was chosen, so only the assumptions the planned tests actually make are listed.*

### Multivariable binary logistic regression, adjusted OR with 95% CI

| Assumption | How it will be checked | If violated | Clinical example |
|---|---|---|---|
| At least ten outcome events per predictor | Count conversions and divide by the number of model terms. | Reduce to the priority confounders, or use penalised (Firth) regression. | At 10 expected conversions the model affords one predictor, so the adjusted model is declared exploratory. |

### Mann-Whitney U; median (IQR) and Hodges-Lehmann difference

| Assumption | How it will be checked | If violated | Clinical example |
|---|---|---|---|
| The two distributions have a similar shape | Compare the histograms of the converted and completed groups. | Read the result as a shift in distribution rather than a difference in medians. | Operative duration is right skewed in the converted group. |

---

## Section 6 - Shell (Dummy) Tables

Every empty results table the thesis will contain, in the order it will appear, is laid out in the Shell Tables document that accompanies this plan. Cells stay blank until the data arrive, and each table names the test that produced it.

---

*Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.*
