# What a study must record, whatever its protocol says

The variables a study of a given kind has to record for its own analysis to
stand, whether or not its protocol remembered to mention them. Edit this file to
change what is required; `design-variables.ts` reads these rows and nothing else.

This is the companion to `../tables/design-tables.md`. That file says which
tables a design owes; this one says which variables it owes. Both exist because a
protocol's omissions pass silently through everything downstream: the plan
declares what the protocol names, the form collects what the plan declares, and
nobody asks what the protocol should have named.

**Columns.**

- `design` - the design family this applies to, `trial` for any randomised
  design, or `any` for every study.
- `when` - words that must appear somewhere in the study's title, design, setting
  or aim for the requirement to apply, separated by semicolons. `always` where it
  applies to every study of that design. This is what keeps a surgical
  requirement off a questionnaire study: residual disease matters in cancer
  surgery and nowhere else, and a rule that fires everywhere is a rule people
  learn to ignore.
- `requires` - the variable, named as a plan would name it.
- `match` - words that identify it in the plan's own labels, separated by
  semicolons. A plan may call it something else, and usually does: completeness
  of cytoreduction, R status and residual disease are one variable.
- `why` - what the study loses without it. Printed in the finding.

| design | when | requires | match | why |
|---|---|---|---|---|
| any | surg; operat; resection; excision; anaesth; anesth | ASA physical status grade | asa; physical status; anaesthetic risk; anesthetic risk | Perioperative complications are the outcome of most surgical studies and baseline fitness is their strongest confounder. Without it a difference in complications cannot be separated from a difference in who was operated on. |
| any | surg; operat; resection; excision | Total operative time | operat; surgery duration; procedure duration; theatre time | Length of surgery predicts complications more strongly than almost anything the surgeon chooses. A study that times one step and not the whole operation cannot adjust for it. |
| any | surg; operat; resection; excision + blood loss; haemorrhage; hemorrhage; bleeding; transfus; complication | Intraoperative blood transfusion | transfus; blood product; packed cell | Transfusion is both an outcome of bleeding and a cause of harm, and it is recorded in every theatre register, so leaving it out is a loss with no cost attached. |
| any | surg; operat; resection; excision + complication; morbidit; postoperative; post-operative; recovery | Reoperation within 30 days | reoperat; return to theatre; re-exploration; relaparotomy | A complication severe enough to need a second operation is the one an examiner asks about first, and it is inside the thirty-day window most surgical outcomes already use. |
| any | surg; operat; resection; excision + complication; morbidit; postoperative; post-operative; recovery; length of stay; hospital stay | Readmission within 30 days | readmi; re-admi | A patient discharged early and readmitted has not had a shorter stay. Without this the length of stay comparison can be read the wrong way round. |
| any | cytoreduct; debulk; tumour resection; tumor resection; oncolog; cancer surg | Residual disease after resection | residual; completeness of cytoreduction; r0; r1; r2; cc score; margin status | The strongest prognostic factor in cancer surgery. Any survival or recurrence comparison that does not hold it constant is comparing operations and completeness at the same time, and cannot say which did the work. |
| any | cancer; oncolog; chemotherap; tumour; tumor | Time from surgery to the start of adjuvant therapy | adjuvant; time to chemo; chemotherapy start; interval to treatment | A larger operation that causes complications delays chemotherapy, and the delay costs survival. It is the real harm of a surgical trial in cancer, and it is invisible unless it is timed. |
| any | cancer; oncolog; tumour; tumor | Histological subtype and grade | histolog; subtype; grade; differentiation | Outcome in cancer follows the tumour as much as the treatment. A comparison that does not describe the tumour cannot show the arms were alike. |
| trial | always | Adverse events by arm | adverse; harm; safety; side effect; toxicit | A trial reports what its intervention cost as well as what it achieved. A benefit reported without harms is half a result and no committee accepts it. |
| trial | always | Protocol deviation or non-adherence | deviation; adherence; complian; per-protocol; as treated | The per-protocol analysis a trial owes cannot be run without knowing who departed from the protocol and how. |
| cluster_trial | always | Cluster identifier | cluster; centre; center; ward; unit id; site | Every estimate in a cluster trial is computed within clusters. Without the identifier the analysis cannot be run at all. |
| crossover_trial | always | Sequence and period | sequence; period; order of treatment; washout | A crossover is analysed on within-patient differences by period. Neither the carryover test nor the treatment effect can be computed without them. |
| cohort | follow; incidence; survival; time to; mortality; month; year | Length of follow-up per participant | follow-up; person-time; person year; duration of follow | Incidence needs person-time. Counts alone assume everyone was followed equally long, which in a cohort is almost never true. |
| cohort | follow; incidence; survival; time to; mortality; month; year | Loss to follow-up | lost to follow; withdraw; dropout; attrition | A cohort that cannot say who left cannot say whether those who left were different, and that is the question asked of every cohort. |
| case_control | always | How the exposure was ascertained | ascertain; recall; interview; record review; source of exposure | Recall differs between cases and controls, which is the bias a case-control study is judged on. It cannot be discussed if it was not recorded. |
| case_control | matched; matching | The matching variables | match | A matched design must be analysed as matched pairs, and the pairing is lost if what they were matched on was never recorded. |
| survival | always | Date of the event, or of last contact where it did not occur | date of event; last follow; censor; date of death; date of recurrence | Time to event is computed from these two dates. A survival analysis without them has no time axis. |
| survival | always | Reason for censoring | censor; reason for withdrawal; lost | Censoring must be independent of the outcome for any survival estimate to be valid, and that cannot be argued without knowing why each patient was censored. |
| diagnostic_accuracy | always | The reference standard result | reference standard; gold standard; histopath; final diagnosis; confirm | Sensitivity and specificity are measured against the reference standard. Without it there is nothing to be accurate about. |
| diagnostic_accuracy | always | Blinding of the index test assessor | blind; mask; independent read | An index test read by someone who knows the reference standard overstates its accuracy, and the reader must be told whether that was prevented. |
| diagnostic_accuracy | always | Indeterminate or uninterpretable results | indetermin; uninterpret; not assessable; inconclusive | Tests that could not be read are usually dropped, which inflates accuracy. They have to be counted to be reported. |
| agreement | always | The identity of each observer or rater | observer; rater; reader; assessor | Agreement is measured between named observers. Which reading came from whom is the analysis. |
| cross_sectional | always | Non-response or refusal | non-response; refus; declin; response rate | A prevalence estimate is only as good as its response rate, and those who refuse differ from those who agree. |
| questionnaire_validation | always | The individual item responses | item; question; q1; response to each | Cronbach's alpha and the item-total correlations are computed from the items. A total score alone cannot produce either. |
| meta_analysis | always | Risk of bias per included study | risk of bias; quality; rob; jadad; newcastle | A pooled estimate is read against the quality of what was pooled, and the risk-of-bias subgroup is the first thing an examiner looks for. |
| pre_post | always | Loss between the two measurements | lost; withdraw; dropout; completed both; attrition | A before-and-after study with no control has only its own completeness to argue from, so how many were lost between the two measurements is the whole of its internal validity. |
