import type { CrfSpec } from "./types.ts";

/** The TAPP form from the approved example, used by the tests. */
export const crfFixture: CrfSpec = {
  title: "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  institution: "Department of General Surgery, AIIMS Jodhpur",
  labels: {
    var_age: "Age",
    var_sex: "Sex",
    var_height: "Height",
    var_weight: "Weight",
    var_bmi: "Body mass index",
    var_adhesion: "Adhesion severity",
    var_surgery_date: "Date of surgery",
    var_discharge_date: "Date of discharge",
    var_los: "Postoperative length of stay",
    var_conversion: "Intraoperative conversion",
    out_conversion: "Intraoperative conversion",
  },
  visits: ["Baseline (Pre-op)", "Intra-op", "Day 1-3", "Discharge", "1 Month"],
  capture_pattern:
    "Prospective, single-arm observational cohort. Baseline history abstracted from case files at enrolment; all intraoperative and postoperative data collected prospectively.",
  data_elements: [
    { element: "Demographic details", visits: ["Baseline (Pre-op)"] },
    { element: "Conversion, type and reason", visits: ["Intra-op"] },
    { element: "Postoperative complications", visits: ["Day 1-3", "Discharge", "1 Month"] },
  ],
  roll_call: [
    { role: "primary_outcome", ref_id: "out_conversion", field_variable_id: "var_conversion", where: "Intra-op" },
    { role: "confounder", ref_id: "var_age", field_variable_id: "var_age", where: "Baseline" },
  ],
  collected_once: ["Demographics", "Comorbidity", "Operative details"],
  collected_repeatedly: ["Postoperative complications"],
  identifiers: [
    { label: "Study subject ID", type: "Number", unit: "" },
    { label: "Date of enrollment", type: "Date" },
  ],
  sections: [
    {
      letter: "A",
      title: "Demographics & Identification",
      visit: "Baseline (Pre-op)",
      fields: [
        { variable_id: "var_age", label: "Age", type: "Number", unit: "years" },
        { variable_id: "var_sex", label: "Sex", type: "Single-select", options: ["Male", "Female"] },
        { variable_id: "var_height", label: "Height", type: "Number", unit: "cm" },
        { variable_id: "var_weight", label: "Weight", type: "Number", unit: "kg" },
        {
          variable_id: "var_prev",
          label: "Previous abdominal surgery",
          type: "Single-select",
          options: ["Yes", "No"],
        },
        {
          variable_id: "var_asa",
          label: "ASA physical status grade",
          type: "Single-select",
          options: ["I", "II", "III", "IV"],
        },
      ],
      note: "Body mass index is calculated from height and weight. Do not enter it here.",
    },
    {
      letter: "B",
      title: "Intraoperative Details",
      visit: "Intra-op",
      fields: [
        { variable_id: "var_surgery_date", label: "Date of surgery", type: "Date", mask: "DD/MM/YYYY" },
        { variable_id: "var_adhesion", label: "Adhesion severity", type: "Single-select", options: ["I", "II", "III", "IV"] },
        {
          variable_id: "var_duration",
          label: "Operative duration",
          type: "Number",
          unit: "minutes",
          note: "Skin incision to skin closure, from the theatre clock.",
        },
        {
          variable_id: "var_conversion",
          label: "Intraoperative conversion",
          type: "Single-select",
          options: ["Yes", "No"],
          primary_outcome: true,
        },
        { variable_id: "var_discharge_date", label: "Date of discharge", type: "Date", mask: "DD/MM/YYYY" },
      ],
      // One heading over two blocks that share nothing else, which is what a
      // sub-section is for. Adhesion severity is graded independently by two
      // surgeons, so each gets a line: a single line cannot hold a
      // disagreement, and the disagreement is what an agreement study measures.
      sections: [
        {
          letter: "",
          title: "Adhesion grading, scored independently",
          fields: [
            {
              variable_id: "var_adhesion",
              label: "Adhesion severity",
              type: "Single-select",
              options: ["I", "II", "III", "IV"],
              respondents: ["R1", "R2"],
            },
          ],
          note: "Each surgeon grades without seeing the other's answer.",
        },
      ],
    },
  ],
  derived: [
    {
      variable_id: "var_bmi",
      name: "Body mass index",
      from_variable_ids: ["var_height", "var_weight"],
      how: "Weight in kg divided by height in metres squared",
    },
    {
      variable_id: "var_los",
      name: "Postoperative length of stay",
      from_variable_ids: ["var_surgery_date", "var_discharge_date"],
      how: "Discharge date minus surgery date, in whole days",
    },
  ],
};
