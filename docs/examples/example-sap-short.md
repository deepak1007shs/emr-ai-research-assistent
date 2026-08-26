<!--
  Generated from the reference study by src/lib/render/sap-md.ts, the same
  renderer the app uses. The short plan: objectives, outcomes and the analysis map.
  Do not edit by hand: regenerate it, or the example and the application will
  describe different documents.
-->

# STATISTICAL ANALYSIS PLAN

*Objectives, outcomes and the analysis map*

**Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia**

*prospective observational cohort. Department of General Surgery, AIIMS Jodhpur*

---

## Objectives as Answerable Questions

*Every objective is phrased as a question, because a question forces you to name an outcome and a predictor, which is exactly what the statistics need.*

### Aim

To estimate the rate of intraoperative conversion during elective TAPP repair of ventral hernia, and to identify the factors associated with it.

### Primary objective(s)

- **P1:** What proportion of operations are converted intraoperatively to an alternative technique?

### Secondary objectives

- **S1:** Which factors are associated with conversion?
- **S2:** Does operative duration differ between converted and completed cases?

---

## Outcomes

*An outcome is not defined until five questions are answered: what exactly is measured, how, using which instrument, at what time, and in which units.*

| Outcome | How it is measured | Instrument | When | Units |
|---|---|---|---|---|
| Intraoperative conversion | the surgeon's decision to abandon TAPP dissection | study proforma, item 27 | the index operation | proportion (%) with 95% CI |
| Operative duration | skin incision to skin closure | theatre clock | the index operation | minutes |

---

## Analysis Map

*One row per objective, or per group of objectives that share an analysis. Every question is linked to its analysis, unadjusted and adjusted, AND to the empty results tables it will fill.*

| Objective | Outcome | Predictor(s) | Data type | Statistical analysis -> Table # |
|---|---|---|---|---|
| P1 - rate of intraoperative conversion | Intraoperative conversion, at the index operation, from study proforma, item 27 | None (single-group estimation) | binary, rare outcome | Unadjusted: Proportion with exact (Clopper-Pearson) 95% CI. Adjusted: not applicable to this question -> Table 3 |
| S1 - factors associated with conversion | Intraoperative conversion, at the index operation, from study proforma, item 27 | Previous abdominal surgery; adjust for Age, Body mass index | binary, rare outcome | Unadjusted: Proportions with exact 95% CI, and the crude OR. Adjusted: Multivariable binary logistic regression, adjusted OR with 95% CI -> Table 4 |
| S2 - operative duration by conversion status | Operative duration, at the index operation, from theatre clock | Intraoperative conversion | continuous, skewed | Unadjusted: Mann-Whitney U; median (IQR) per group and Hodges-Lehmann median difference with 95% CI. Adjusted: not planned - not planned at this sample size; the adjusted model is already exploratory on the primary outcome -> Table 5 |

**Why each analysis.**

- **Proportion with exact (Clopper-Pearson) 95% CI:** One group and one proportion, estimated rather than tested.
- **Proportions with exact 95% CI, and the crude OR:** A binary outcome with confounders held constant.
- **Mann-Whitney U; median (IQR) per group and Hodges-Lehmann median difference with 95% CI:** Skewed data, where a mean would mislead.

**What must not be done.**

- **Proportion with exact (Clopper-Pearson) 95% CI:** A Wald interval: it misbehaves when the count is small or the proportion near 0 or 1.
- **Proportions with exact 95% CI, and the crude OR:** Choosing the confounders by looking at their p values.
- **Mann-Whitney U; median (IQR) per group and Hodges-Lehmann median difference with 95% CI:** A mean difference, which a skewed distribution misrepresents.

**Degrees of freedom.**

Expected events: 10. At ten events per degree of freedom the model affords 1 predictor, but 2 are named. The adjusted model is therefore declared exploratory here, before the data arrive, rather than discovered at analysis.

**Not adjusted for.**

- Operative duration is a mediator. It lies on the path between operative difficulty and conversion, so adjusting for it would remove the effect being measured.
- Postoperative complication is a collider. It is caused by conversion, so conditioning on it would create a spurious association.

Neither enters any model.

---

*Generated from the study specification. Do not edit this document: change the specification and rebuild, or the analysis plan, the case record form and the shell tables will disagree.*
