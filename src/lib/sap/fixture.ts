import type { SapSpec } from "./types.ts";

/**
 * The TAPP study, matching the approved example document.
 *
 * Shared by the Word renderer's tests and the on-screen preview's, so the two
 * are held to the same document rather than to two hand-written copies.
 */
export const sapFixture: SapSpec = {
  title:
    "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  design: "prospective observational cohort",
  setting: "Department of General Surgery, AIIMS Jodhpur",
  guideline: "STROBE",
  picot: {
    framework: "PECOT",
    population: "Adults undergoing elective TAPP repair of a ventral hernia.",
    intervention_or_exposure:
      "Patient, hernia and intraoperative factors present at the time of surgery.",
    comparator: "Internal contrasts within the cohort; there is no unexposed group.",
    outcome: "Intraoperative conversion to an alternative technique.",
    time: "The index operation, with follow-up to 30 days.",
    assembled_question:
      "Among adults undergoing elective TAPP ventral hernia repair, what proportion are converted intraoperatively, and which patient, hernia and operative factors are associated with conversion?",
  },
  aim: "To estimate the rate of intraoperative conversion during elective TAPP repair of ventral hernia, and to identify the factors associated with it.",
  hypothesis:
    "Larger defects, denser adhesions and less surgeon experience are associated with a higher risk of intraoperative conversion.",
  estimand: {
    treatment_condition: "Elective TAPP repair as planned at the start of the operation.",
    population: "All enrolled patients in whom TAPP was started.",
    endpoint: "Conversion to an alternative technique during the index operation.",
    intercurrent_strategy:
      "Treatment policy: an operation abandoned for an unrelated reason is still counted as it occurred.",
    summary_measure: "Proportion with 95% CI, and adjusted odds ratios with 95% CI.",
  },
  sample_size: 125,
  expected_events: 10,
  sample_size_note:
    "Powered for precision rather than for a comparison: an assumed conversion rate of 8% with 5% absolute precision at 95% confidence gives 113, inflated to 125 for 10% incomplete records. TODO: confirm the assumed rate against the unit's own audit.",
  priority_confounder_ids: ["var_age", "var_bmi", "var_prev"],
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion of operations are converted intraoperatively to an alternative technique?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
    { id: "S2", tier: "secondary", question: "Does operative duration differ between converted and completed cases?" },
  ],
  variables: [
    { id: "var_conversion", label: "Intraoperative conversion", data_type: "binary", unit_coding: "Yes / No", role: "outcome" },
    { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    { id: "var_bmi", label: "Body mass index", data_type: "continuous", unit_coding: "kg/m2", role: "confounder" },
    { id: "var_prev", label: "Previous abdominal surgery", data_type: "binary", unit_coding: "Yes / No", role: "confounder" },
    {
      id: "var_duration", label: "Operative duration", data_type: "continuous", unit_coding: "Minutes", role: "mediator",
      exclusion_reason: "It lies on the path between operative difficulty and conversion, so adjusting for it would remove the effect being measured.",
    },
    {
      id: "var_complication", label: "Postoperative complication", data_type: "binary", unit_coding: "Yes / No", role: "collider",
      exclusion_reason: "It is caused by conversion, so conditioning on it would create a spurious association.",
    },
  ],
  outcomes: [
    {
      id: "out_conversion",
      what: "Intraoperative conversion",
      how: "the surgeon's decision to abandon TAPP dissection",
      instrument: "study proforma, item 27",
      when: "the index operation",
      units: "proportion (%) with 95% CI",
      domain: "clinical",
      source_variable_ids: ["var_conversion"],
    },
    {
      id: "out_duration",
      what: "Operative duration",
      how: "skin incision to skin closure",
      instrument: "theatre clock",
      when: "the index operation",
      units: "minutes",
      domain: "clinical",
      source_variable_ids: ["var_duration"],
    },
  ],
  analyses: [
    {
      objective_id: "P1", label: "P1 - conversion rate", outcome_id: "out_conversion",
      predictor_ids: [], data_type: "binary", comparison: "single_group",
      paired: false, table_id: "T1",
    },
    {
      objective_id: "S1", label: "S1 - factors, adjusted", outcome_id: "out_conversion",
      predictor_ids: ["var_age", "var_bmi", "var_prev"], data_type: "binary", comparison: "adjusted",
      paired: false, table_id: "T2",
    },
    {
      objective_id: "S2", label: "S2 - operative duration", outcome_id: "out_duration",
      predictor_ids: ["var_conversion"], data_type: "continuous", comparison: "two_groups",
      paired: false, skewed: true, table_id: "T3",
    },
  ],
  rules: {
    software: "IBM SPSS Statistics version 23.",
    normality: "Shapiro-Wilk with histogram and Q-Q inspection, before choosing a parametric test.",
    continuous_summary: "Mean +/- SD when normal, median (IQR) when skewed.",
    categorical_summary: "Frequency (percentage).",
    significance: "Two sided, p < 0.05.",
    effect_estimates: "Every estimate reported with a 95% confidence interval, not a bare p value.",
    missing_data:
      "Complete case while missingness is under 5%, multiple imputation by chained equations otherwise. Last observation carried forward is not used.",
    multiplicity:
      "The primary outcome is confirmatory. Secondary outcomes are supportive and reported with unadjusted intervals; exploratory analyses use Benjamini-Hochberg.",
    reproducibility: "A fixed random seed is set and reported for any stochastic procedure.",
  },
  populations: [
    {
      name: "Full analysis set",
      definition: "Every enrolled patient in whom the TAPP approach was begun.",
    },
    {
      name: "Complete case set",
      definition: "Those with the primary outcome and all priority confounders recorded.",
    },
  ],
  baseline_comparison:
    "Baseline characteristics are summarised by conversion status. This is a cohort, so the comparison is descriptive and the p values are read as signals rather than as tests of balance.",
  intercurrent_events: [
    {
      event: "Operation abandoned before dissection for an anaesthetic reason",
      strategy: "Treatment policy: counted as it occurred, and flagged in a sensitivity analysis.",
    },
  ],
  testing_hierarchy:
    "The conversion rate is tested first. The adjusted model is reported next and is exploratory at this event count, so no alpha is spent on it.",
  subgroups: [
    {
      subgroup: "Recurrent versus primary hernia",
      how_tested: "An interaction term in the adjusted model, not a within-subgroup p value.",
    },
  ],
  interim: "Single final analysis; no interim looks.",
  steps: [
    { step: "Step 1", what: "Describe every variable by the rules above, and report the conversion rate with its 95% CI." },
    { step: "Step 2", what: "Compare each candidate predictor against conversion, unadjusted, for a crude estimate." },
    { step: "Step 3", what: "Enter the priority confounders into a binary logistic model, respecting ten events per predictor." },
    { step: "Step 4", what: "Repeat the primary analysis under the complete case and imputed sets to check it holds." },
  ],
  assumption_checks: [
    {
      test: "Multivariable binary logistic regression, adjusted OR with 95% CI",
      assumption: "At least ten outcome events per predictor",
      how_checked: "Count conversions and divide by the number of model terms.",
      if_violated: "Reduce to the priority confounders, or use penalised (Firth) regression.",
      example: "At 10 expected conversions the model affords one predictor, so the adjusted model is declared exploratory.",
    },
    {
      test: "Mann-Whitney U; median (IQR) and Hodges-Lehmann difference",
      assumption: "The two distributions have a similar shape",
      how_checked: "Compare the histograms of the converted and completed groups.",
      if_violated: "Read the result as a shift in distribution rather than a difference in medians.",
      example: "Operative duration is right skewed in the converted group.",
    },
  ],
};