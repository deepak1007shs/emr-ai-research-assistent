import type { CrfSpec } from "./types.ts";

/** The TAPP form from the approved example, used by the tests. */
export const crfFixture: CrfSpec = {
  title: "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  institution: "Department of General Surgery, AIIMS Jodhpur",
  visits: ["Baseline (Pre-op)", "Intra-op", "Day 1-3", "Discharge", "1 Month"],
  capture_pattern:
    "Prospective, single-arm observational cohort. Baseline history abstracted from case files at enrolment; all intraoperative and postoperative data collected prospectively.",
  data_elements: [
    { element: "Demographic details", visits: ["Baseline (Pre-op)"] },
    { element: "Conversion, type and reason", visits: ["Intra-op"] },
    { element: "Postoperative complications", visits: ["Day 1-3", "Discharge", "1 Month"] },
  ],
  roll_call: [
    { role: "primary_outcome", variable: "Intraoperative conversion", field: "Conversion to another technique", where: "Intra-op" },
    { role: "confounder", variable: "Age", field: "Age", where: "Baseline" },
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
        { label: "Age", type: "Number", unit: "years" },
        { label: "Sex", type: "Single-select", options: ["Male", "Female"] },
        { label: "Height", type: "Number", unit: "cm" },
        { label: "Weight", type: "Number", unit: "kg" },
      ],
      note: "Body mass index is calculated from height and weight. Do not enter it here.",
    },
    {
      letter: "B",
      title: "Intraoperative Details",
      visit: "Intra-op",
      fields: [
        { label: "Date of surgery", type: "Date", mask: "DD/MM/YYYY" },
        { label: "Adhesion severity", type: "Single-select", options: ["I", "II", "III", "IV"] },
        {
          label: "Conversion to another technique",
          type: "Single-select",
          options: ["Yes", "No"],
          primary_outcome: true,
        },
        { label: "Date of discharge", type: "Date", mask: "DD/MM/YYYY" },
      ],
    },
  ],
  derived: [
    {
      name: "Body mass index",
      from: ["Height", "Weight"],
      how: "Weight in kg divided by height in metres squared",
    },
    {
      name: "Postoperative length of stay",
      from: ["Date of surgery", "Date of discharge"],
      how: "Discharge date minus surgery date, in whole days",
    },
  ],
};
