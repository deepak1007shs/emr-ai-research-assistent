# Statistical Analysis Plan

**Factors associated with intraoperative conversion during transabdominal
preperitoneal (TAPP) repair of ventral hernia: a prospective observational cohort
study**

| | |
|---|---|
| SAP version | 1.0 |
| Date finalised | |
| Prepared by | |
| Approved by (guide) | |
| Built from | Protocol v2, and the investigator's answers to the protocol review |

*Finalise, date and sign this plan before database lock. Any change after that date
is an amendment, recorded with its version, reason and approver.*

---

## Section 1. Study at a glance

| Item | This study |
|---|---|
| Design | Prospective observational cohort, single centre |
| Reporting guideline | STROBE |
| Question frame | PECO (no intervention is allocated by the investigator) |
| Population | Adults 18 to 75 years undergoing elective TAPP repair of a ventral hernia |
| Exposure under study | Patient, hernia and operative factors present before or at surgery |
| Main comparison | Converted cases versus cases completed as TAPP |
| Sample size | 125 (114 by calculation, plus 10% for attrition) |
| What may be claimed | **Association only.** A cohort of this design cannot establish that any factor causes conversion |

---

## Section 2. Objectives, read word by word

Each objective is taken apart and rewritten so that every word is measurable. An
objective that cannot be rewritten this way cannot be analysed.

### Primary objective

> *As written in the protocol:* "To study the factors leading to conversion during
> TAPP repair of ventral hernia."

| Word in the objective | What it must mean before it can be analysed |
|---|---|
| "study" | Not measurable. Replaced with **estimate**, since the protocol's sample size is a precision calculation for a single proportion |
| "factors" | Which factors? Named explicitly in Section 5. An unnamed factor cannot be collected |
| "leading to" | Over-claims causation. A cohort of this size supports **association**, so the wording becomes *associated with* |
| "conversion" | Defined below, with the exact alternative techniques that count |

**Rewritten:** To estimate the proportion of elective TAPP ventral hernia repairs
converted intraoperatively to an alternative technique, and to identify the
patient, hernia and operative factors associated with conversion.

### Secondary objectives

1. To compare operative time between converted and completed cases.
2. To compare postoperative length of stay between converted and completed cases.
3. To describe the type of and reason for conversion among converted cases.

---

## Section 3. Every outcome answers five questions

An outcome is not defined until all five are answered. A blank in any column is a
question the data collector will answer differently each time.

### Primary outcome

| Question | Answer |
|---|---|
| **What exactly will be measured?** | Whether the operation was converted from TAPP to an alternative technique |
| **How will it be measured?** | The operating surgeon's intraoperative decision to abandon TAPP dissection and complete by IPOM, TARM, TAR or open repair |
| **Using which instrument?** | Study proforma, intraoperative section, completed in theatre |
| **At what time?** | At the index operation |
| **In which units?** | Proportion (%) with 95% confidence interval |

---

## Section 4. The objective, outcome and variable map

This table is the spine of the plan. Everything downstream reads from it: the case
record form collects exactly these variables, and the shell tables report exactly
these outcomes.

| Objective | Outcome | Variable type | Measurement method | Instrument | Unit | Time point |
|---|---|---|---|---|---|---|
| Estimate conversion rate | Intraoperative conversion | Binary | Surgeon's intraoperative decision | Study proforma, item 27 | Yes / No | Index operation |
| Identify associated factors | Intraoperative conversion | Binary | As above | Study proforma, item 27 | Yes / No | Index operation |
| Compare operative time | Operative duration | Continuous | Skin incision to skin closure | Theatre clock | Minutes | Index operation |
| Compare length of stay | Postoperative stay | Continuous, derived | Discharge date minus surgery date | Hospital record | Days | Discharge |
| Describe conversion type | Type of conversion | Nominal | Surgeon's record of the technique used | Study proforma, item 28 | IPOM / TARM / TAR / Open | Index operation |
| Describe conversion reason | Reason for conversion | Nominal | Surgeon's record of the reason | Study proforma, item 30 | Adhesions / Bleeding / Peritoneal tear / Poor visibility / Technical | Index operation |

---

## Section 5. Outcomes classified twice

Every outcome is classified by **rank**, which decides what the study is powered
for, and by **domain**, which decides how it is reported.

| Outcome | Rank | Domain |
|---|---|---|
| Intraoperative conversion | Primary | Clinical |
| Operative duration | Secondary | Clinical |
| Postoperative length of stay | Secondary | Economic (resource use) |
| Type of conversion | Secondary | Clinical |
| Reason for conversion | Secondary | Clinical |
| Postoperative pain at 24 h | Secondary | Patient-reported |
| Seroma on ultrasound at 1 month | Secondary | Radiological |
| Serum CRP at 48 h | Secondary | Laboratory |

---

## Section 6. Variables and confounders

The role decides what may be adjusted for. This is a causal judgement, not a
statistical one, and it is the part a guide must confirm.

| Role | Variables |
|---|---|
| **Outcome** | Conversion (yes/no) |
| **Candidate predictors** | Age, BMI, ASA grade, previous abdominal surgery, hernia width (EHS band), defect size, adhesion score, surgeon experience |
| **Confounders to adjust for** | Age, BMI, previous abdominal surgery |
| **Effect modifier to test** | Surgeon experience (consultant versus trainee) |
| **Not adjusted for: mediator** | Operative duration. It lies on the path between difficulty and conversion; adjusting for it would remove the effect being measured |
| **Not adjusted for: collider** | Postoperative complication. It is caused by conversion, so conditioning on it would create a spurious association |

**Degrees of freedom check.** Expected conversions: 125 x 0.08 = **10 events**.
At 10 events per degree of freedom the model affords **one** predictor. The
multivariable model is therefore declared **exploratory**, and the primary
analysis is the unadjusted estimate. This is stated here rather than discovered
at analysis.

---

## Section 7. Which test, and why

The test is chosen from the study type, the outcome's data type, the comparison
being made, and whether the observations are paired. Nothing here is a matter of
preference.

| # | Outcome | Data type | Comparison | Test | Why this test |
|---|---|---|---|---|---|
| 1 | Conversion rate | Binary | None, a single proportion | **Clopper-Pearson exact 95% CI** | One group, one proportion, and an exact interval is correct when the expected count is small (about 10) |
| 2 | Conversion by ASA grade | Binary | Two independent groups | **Pearson chi-square**, Fisher exact if any expected cell is under 5 | Two categorical variables, unpaired. With 10 events, expected cells will often be small, so Fisher is likely |
| 3 | Conversion by age | Binary outcome, continuous predictor | Association | **Univariable logistic regression**, odds ratio with 95% CI | A binary outcome regressed on a continuous predictor |
| 4 | Conversion, adjusted | Binary | Association, adjusted | **Multivariable logistic regression**, exploratory only | See the degrees of freedom check in Section 6. Reported as exploratory, never as the primary result |
| 5 | Operative duration | Continuous | Two independent groups | **Independent t-test** if both groups are normal, otherwise **Mann-Whitney U** | Normality is judged by Shapiro-Wilk plus a histogram, not by the test alone |
| 6 | Length of stay | Continuous, right-skewed | Two independent groups | **Mann-Whitney U**, reported as median (IQR) and a Hodges-Lehmann median difference | Length of stay is skewed by definition; a mean would mislead |
| 7 | Type and reason for conversion | Nominal | None, descriptive | **Frequencies and percentages** among converted cases only | Denominator is the converted cases, not the whole cohort. Stating this prevents the commonest reporting error here |

**Rules that apply to every test above**

- Every estimate is reported with a **95% confidence interval**, never a p-value alone.
- P-values to two decimal places, or four when below 0.05.
- Two-sided, alpha 0.05.
- Secondary outcomes are **not adjusted for multiplicity** and are therefore
  supportive, not confirmatory. This is stated so that a secondary finding is not
  later written up as if it were primary.

---

## Section 8. Step-by-step analysis flow

Run in this order. Each step names what is produced.

1. **Lock the database.** Record the date. Every analysis after it is an amendment.
2. **Build the participant flow.** Screened, eligible, declined, enrolled, analysed.
   Produces the STROBE flow diagram.
3. **Describe the cohort.** Table 1: all baseline variables by conversion status,
   with no significance testing of baseline differences.
4. **Check the assumptions the tests need.** Normality for continuous outcomes
   (Shapiro-Wilk and a histogram); expected cell counts for every chi-square.
   Record what was found and which branch was taken.
5. **Estimate the primary outcome.** Conversion rate with an exact 95% CI.
   Produces Table 3.
6. **Test each candidate predictor unadjusted.** Chi-square or Fisher for
   categorical, t-test or Mann-Whitney for continuous, univariable logistic for
   the odds ratio. Produces Table 4.
7. **Fit the exploratory adjusted model.** Logistic regression on the confounders
   named in Section 6. Report as exploratory. Produces Table 5.
8. **Analyse the secondary outcomes** in the order listed in Section 4.
9. **Describe conversions.** Type and reason, denominator the converted cases.
10. **Run the sensitivity analysis.** Repeat step 5 excluding cases converted for
    reasons unrelated to technique.
11. **Handle missing data.** Report the amount and pattern per variable. Complete
    case for the primary outcome, which should be complete. Multiple imputation
    only if any predictor exceeds 5% missing.
12. **Assemble the tables** in the order of Section 4, and check each figure
    against the analysis output before writing anything.

---

## Section 9. Needs checking with the guide

These are decisions the protocol did not settle. They are listed rather than
silently chosen.

1. The multivariable model affords one predictor at 10 events. Confirm that the
   adjusted analysis is labelled exploratory, or increase the sample size.
2. Confirm that operative duration is treated as a mediator and therefore not
   adjusted for.
3. Confirm the 5% missing-data threshold for imputation.
4. Confirm that the conversion denominator for type and reason is converted cases,
   not the whole cohort.

---

*Generated from the study specification. Do not edit this document: change the
specification and rebuild, or the analysis plan, the case record form and the
shell tables will disagree.*
