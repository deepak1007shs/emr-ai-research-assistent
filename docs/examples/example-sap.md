# STATISTICAL ANALYSIS PLAN

**Factors Associated with Intraoperative Conversion during Transabdominal
Preperitoneal (TAPP) Repair of Ventral Hernia - A Prospective Observational
Cohort Study**

---

## Section 0 - Study at a Glance

*A 30-second summary. If a reader sees only this box, they should be able to say
what the study is.*

| Item | Your study |
|---|---|
| Title | Factors associated with intraoperative conversion during TAPP repair of ventral hernia |
| Design (one line) | Single-centre prospective observational cohort; single-arm. Internal comparison between converted and completed cases. |
| Population | Adults 18-75 years undergoing elective TAPP repair of a primary, incisional, recurrent or lumbar ventral hernia at a tertiary centre. |
| What is measured | Baseline demographics and comorbidity; hernia characteristics (EHS classification, defect size); previous abdominal surgery; intraoperative findings including adhesion severity; conversion, its type and its reason; operative duration; postoperative pain, complications and length of stay. |
| Primary outcome | Proportion of cases converted intraoperatively from TAPP to an alternative technique, with 95% CI. |
| Main comparison | Primary aim is estimation of the overall conversion rate (single group). Internal comparison: converted versus completed cases, to identify associated factors. |
| Sample size | 125. Cochran single-proportion formula, n = Z²pq/d² with p = 0.08 (departmental register, 7/81 cases), d = 0.05, Z = 1.96, giving 114, plus 10% attrition. Valid for the conversion-rate estimate only; the factor comparisons are not powered. |

### PICOT

*The clinical question decomposed. This is what every objective, variable and test
below must trace back to.*

| | Element | For this study |
|---|---|---|
| **P** | Population | Adults 18-75 years undergoing elective TAPP repair of a ventral hernia at a tertiary centre, enrolled preoperatively. |
| **E** | Exposure | Patient, hernia and operative factors present before or at surgery: age, BMI, ASA grade, previous abdominal surgery, defect size, EHS width band, adhesion severity, surgeon experience. |
| **C** | Comparator | Cases completed as TAPP. No external comparator; the comparison is internal. |
| **O** | Outcome | Intraoperative conversion to an alternative technique (IPOM, TARM, TAR or open repair), as the primary binary endpoint. |
| **T** | Timing | Conversion ascertained at the index operation; participants followed to 1 month postoperatively for secondary outcomes. |

*The frame is PECO rather than PICO: the investigator allocates nothing, and the
exposures are factors already present.*

---

## Section 1 - Objectives as Answerable Questions

### Aim

To estimate the rate of intraoperative conversion during elective TAPP repair of
ventral hernia, and to identify the preoperative and intraoperative factors
associated with conversion.

### Primary objective(s)

- **P1:** In adults undergoing elective TAPP ventral hernia repair, what
  proportion of operations are converted intraoperatively to an alternative
  technique?

> **Read word by word.** The protocol writes *"to study the factors leading to
> conversion"*. *Study* is not measurable and becomes **estimate**, because the
> sample size is a precision calculation. *Factors* must be named, or they cannot
> be collected. *Leading to* claims causation that a cohort cannot support, and
> becomes **associated with**.

**Outcome for P1, answering the five questions**

| Question | Answer |
|---|---|
| What exactly will be measured? | Whether the operation was converted from TAPP to an alternative technique |
| How will it be measured? | The operating surgeon's intraoperative decision to abandon TAPP dissection |
| Using which instrument? | Study proforma, intraoperative section, item 27, completed in theatre |
| At what time? | At the index operation |
| In which units? | Proportion (%) with 95% CI |

*Rank: primary. Domain: clinical.*

### Secondary objectives

- **S1:** Which preoperative and intraoperative factors are independently
  associated with conversion?
- **S2:** Does operative duration differ between converted and completed cases?
- **S3:** Does postoperative length of stay differ between converted and completed
  cases?
- **S4:** Among converted cases, what are the type of and reason for conversion?

| Objective | Outcome | Instrument | Time point | Units | Rank | Domain |
|---|---|---|---|---|---|---|
| S1 | Conversion, by factor | Proforma item 27 | Index operation | Yes / No | Secondary | Clinical |
| S2 | Operative duration | Theatre clock, incision to closure | Index operation | Minutes | Secondary | Clinical |
| S3 | Postoperative stay | Hospital record, derived from two dates | Discharge | Days | Secondary | Economic |
| S4 | Type and reason for conversion | Proforma items 28 and 30 | Index operation | Category | Secondary | Clinical |

---

## Section 2 - Variable Table

*One row per variable. Once data type and role are set, the correct test follows
almost mechanically. Grouped by role: outcomes, then predictors, then confounders,
then descriptors.*

| Variable | Data type | Unit / coding | Role in analysis |
|---|---|---|---|
| Intraoperative conversion | binary | Yes / No | **Outcome (primary)** |
| Type of conversion | nominal | IPOM / TARM / TAR / Open | Outcome (secondary) |
| Reason for conversion | nominal | Adhesions / Bleeding / Peritoneal tear / Poor visibility / Technical | Outcome (secondary) |
| Operative duration | continuous | Minutes | Outcome (secondary) |
| Postoperative length of stay | continuous, derived | Days (discharge date minus surgery date) | Outcome (secondary) |
| Defect size | continuous | cm | Predictor |
| EHS width band | nominal, derived | W1 <4 cm / W2 4-10 cm / W3 >10 cm | Predictor |
| Adhesion severity | ordinal | Zuhlke grade I-IV | Predictor |
| Previous abdominal surgery | binary | Yes / No | Predictor |
| Surgeon experience | binary | Consultant / Trainee | Predictor, effect modifier |
| Age | continuous | Years | Confounder |
| Body mass index | continuous, derived | kg/m² (weight / height²) | Confounder |
| ASA physical status | ordinal | I / II / III | Confounder |
| Sex | binary | Male / Female | Descriptor |
| Hernia type | nominal | Primary / Incisional / Recurrent / Lumbar | Descriptor |
| Diabetes mellitus | binary | Yes / No | Descriptor |
| Smoking status | nominal | Current / Former / Never | Descriptor |

**Not adjusted for, and why.** *Operative duration* is a **mediator**: it lies on
the path between operative difficulty and conversion, so adjusting for it would
remove the effect being measured. *Postoperative complication* is a **collider**:
it is caused by conversion, so conditioning on it would create a spurious
association. Neither enters any model.

---

## Section 3 - Analysis Map (the heart of the plan)

*One row per objective. Every question is linked to its test AND to the empty
results table it will fill.*

| Objective | Outcome | Predictor(s) | Data type | Statistical test → Table # |
|---|---|---|---|---|
| **P1** - conversion rate | Conversion | (single-group estimate) | binary | Proportion with 95% CI (Clopper-Pearson exact) → T3 |
| **S1** - factors, unadjusted | Conversion | Each candidate predictor in turn | binary | Chi-square, Fisher exact where any expected cell <5; t-test or Mann-Whitney for continuous predictors → T4 |
| **S1** - factors, adjusted | Conversion | Age, BMI, previous abdominal surgery | binary | Binary logistic regression (OR with 95% CI), **exploratory only** → T5 |
| **S1** - effect modification | Conversion | Surgeon experience | binary | Stratified estimate; interaction term reported, not interpreted as confirmatory → T6 |
| **S2** - operative duration | Operative duration | Conversion status | continuous | Independent t-test if normal, otherwise Mann-Whitney U → T7 |
| **S3** - length of stay | Postoperative stay | Conversion status | continuous, skewed | Mann-Whitney U; median (IQR) and Hodges-Lehmann difference → T8 |
| **S4** - conversion detail | Type and reason | (descriptive) | nominal | Frequencies (n, %) among converted cases only → T9 |

**Why each test, in one line.** A single group and one proportion gives an exact
binomial interval, and *exact* rather than Wald because roughly 10 events are
expected. Two categorical variables unpaired gives chi-square, with Fisher when
cells are sparse, which they will often be here. A binary outcome with predictors
gives logistic regression. A skewed continuous outcome gives a rank test, because
a mean length of stay would mislead.

**Degrees of freedom check.** Expected conversions: 125 x 0.08 = **10 events**. At
10 events per degree of freedom the model affords **one** predictor. The adjusted
model is therefore declared exploratory here, before the data arrive, rather than
discovered at analysis.

---

## Section 4 - General Statistical Rules (stated once)

**Analysis populations (who is analysed)**

| Population | Definition | Used for |
|---|---|---|
| Full analysis set | All enrolled patients who underwent the index operation | All analyses |
| Converted subset | Patients converted intraoperatively | Type and reason for conversion (S4) |

**Multiplicity and testing hierarchy**

P1 is the only confirmatory analysis. S1 to S4 are supportive, reported with
confidence intervals and **not adjusted for multiplicity**, and must not be
written up as confirmatory findings.

**Reporting rules**

- Every estimate carries a **95% confidence interval**. A p-value alone is not reported.
- P-values to 2 decimal places, or 4 when below 0.05.
- Two-sided tests, alpha 0.05.
- Continuous data: mean (SD) if normal, median (IQR) if not. Categorical: n (%).
- Software and version stated in the results.
- Reporting follows **STROBE**, with the flow diagram.

**Missing data**

Amount and pattern reported per variable. Complete-case analysis for the primary
outcome, which should be complete since conversion is ascertained in theatre.
Multiple imputation only if a predictor exceeds 5% missing, reported as a
sensitivity analysis.

---

## Section 5 - Step-by-Step Analysis Flow

1. **Lock the database** and record the date. Every analysis after it is an amendment.
2. **Build the STROBE flow**: screened, eligible, declined, enrolled, analysed.
3. **Describe the cohort** (T1, T2). No significance testing of baseline differences.
4. **Check assumptions** as set out in Section 5A. Record which branch was taken.
5. **Estimate the primary outcome** (P1): conversion rate with exact 95% CI → T3.
6. **Test each predictor unadjusted** (S1) → T4.
7. **Fit the exploratory adjusted model** (S1) → T5. Label exploratory.
8. **Test effect modification** by surgeon experience → T6.
9. **Analyse secondary outcomes** S2, S3 → T7, T8.
10. **Describe conversions** (S4), denominator the converted cases → T9.
11. **Sensitivity analysis**: repeat step 5 excluding conversions for reasons
    unrelated to technique.
12. **Assemble the tables** in order and check each figure against the output.

---

## Section 5A - Assumption Checking

| Assumption | Where it applies | How it is checked | If it fails |
|---|---|---|---|
| Normality | Operative duration, by group | Shapiro-Wilk plus a histogram; not the test alone | Mann-Whitney U |
| Equal variance | Operative duration t-test | Levene's test | Welch t-test |
| Expected cell count ≥5 | Every chi-square | Expected counts table | Fisher exact test |
| Linearity of the logit | Continuous predictors in logistic regression | Box-Tidwell, or categorise | Categorise the predictor |
| No multicollinearity | Adjusted model | Variance inflation factor <5 | Drop one of the pair |
| Events per variable ≥10 | Adjusted model | 10 events / degrees of freedom | Reduce predictors; already declared exploratory |
| Independence | All | By design, one record per patient | Not applicable |

---

## Section 6 - Shell (Dummy) Tables

| Table | Title | Test applied |
|---|---|---|
| T1 | Baseline demographic and clinical characteristics | Descriptive only |
| T2 | Hernia and operative characteristics | Descriptive only |
| T3 | Rate of intraoperative conversion | Clopper-Pearson exact 95% CI |
| T4 | Candidate factors by conversion status, unadjusted | Chi-square / Fisher; t-test / Mann-Whitney |
| T5 | Factors associated with conversion, adjusted (exploratory) | Binary logistic regression |
| T6 | Conversion by surgeon experience | Stratified, with interaction term |
| T7 | Operative duration by conversion status | t-test or Mann-Whitney U |
| T8 | Postoperative length of stay by conversion status | Mann-Whitney U |
| T9 | Type of and reason for conversion, converted cases only | Descriptive only |

*Full shell tables with empty cells are provided as a separate document.*

---

## Section 7 - "Needs Checking" Flags

| # | Flag | Who decides |
|---|---|---|
| 1 | At 10 expected events the adjusted model affords one predictor. Confirm it is labelled exploratory, or increase the sample size. | Guide |
| 2 | Confirm operative duration is treated as a mediator and excluded from all models. | Guide |
| 3 | The protocol gives no source for the 10% attrition allowance. Confirm or replace. | Investigator |
| 4 | Confirm the denominator for type and reason of conversion is converted cases, not the whole cohort. | Investigator |
| 5 | Adhesion severity is not defined in the protocol. The Zuhlke grade is adopted here; confirm. | Guide |

---

*Generated from the study specification. Do not edit this document: change the
specification and rebuild, or the analysis plan, the case record form and the
shell tables will disagree.*
