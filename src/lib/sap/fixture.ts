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
  guideline: "STROBE",
  aim: "To estimate the rate of intraoperative conversion during elective TAPP repair of ventral hernia, and to identify the factors associated with it.",
  sample_size: 125,
  expected_events: 10,
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
};
