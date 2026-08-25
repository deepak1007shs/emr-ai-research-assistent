import type { ShellTablesSpec } from "./types.ts";

/** Shaped after the DrUtkarsh results document, with the cells empty. */
export const tablesFixture: ShellTablesSpec = {
  title: "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  groups: ["Converted", "Completed as TAPP"],
  tables: [
    {
      number: 1,
      block: "descriptive",
      kind: "descriptive",
      title: "Demographic profile of adults undergoing TAPP repair by conversion status (n = 125)",
      columns: [
        "Variable",
        "Converted (n = ) n (%)",
        "Completed as TAPP (n = ) n (%)",
        "Total (n = 125) n (%)",
        "P value",
      ],
      rows: [
        { label: "Age (years)", heading: true },
        { label: "Mean ± SD", indent: true },
        { label: "Age group", heading: true },
        { label: "< 40 years", indent: true },
        { label: "40 to 60 years", indent: true },
        { label: "> 60 years", indent: true },
        { label: "Sex", heading: true },
        { label: "Male", indent: true },
        { label: "Female", indent: true },
        { label: "Body mass index (kg/m2)", heading: true },
        { label: "Mean ± SD", indent: true },
      ],
      test_applied:
        "Independent t-test for continuous variables; Pearson chi-square, or Fisher exact where any expected cell is under 5, for categorical variables.",
    },
    {
      number: 2,
      block: "descriptive",
      kind: "descriptive",
      title: "Comorbidity and risk factors by conversion status (n = 125)",
      columns: [
        "Variable",
        "Converted (n = ) n (%)",
        "Completed as TAPP (n = ) n (%)",
        "Total (n = 125) n (%)",
        "P value",
      ],
      rows: [
        { label: "Diabetes mellitus" },
        { label: "Hypertension" },
        { label: "Smoking status", heading: true },
        { label: "Current", indent: true },
        { label: "Former", indent: true },
        { label: "Never", indent: true },
        { label: "Previous abdominal surgery" },
      ],
      test_applied: "Pearson chi-square test, or Fisher exact where any expected cell is under 5.",
    },
    {
      number: 3,
      block: "primary",
      kind: "distribution",
      title: "Rate of intraoperative conversion (n = 125)",
      columns: ["Outcome", "n", "%", "95% CI"],
      rows: [
        { label: "Converted to another technique" },
        { label: "Completed as TAPP" },
      ],
      test_applied: "Clopper-Pearson exact 95% confidence interval for a single proportion.",
    },
    {
      number: 4,
      block: "secondary",
      kind: "effect",
      title: "Factors associated with intraoperative conversion (n = 125)",
      columns: [
        "Predictor",
        "Unadjusted OR (95% CI)",
        "P value",
        "Adjusted OR (95% CI)",
        "P value",
      ],
      rows: [
        { label: "Age (per 1 year increase)" },
        { label: "Body mass index (per 1 kg/m2 increase)" },
        { label: "Previous abdominal surgery (yes versus no)" },
        { label: "Adhesion severity (per Zuhlke grade)" },
      ],
      test_applied:
        "Univariable then multivariable binary logistic regression. The adjusted model is exploratory: at 10 expected events it affords one predictor.",
      footnote: "Reference category for previous abdominal surgery is No.",
    },
    {
      number: 5,
      block: "exploratory",
      kind: "comparative",
      title: "Operative duration by conversion status (n = 125)",
      columns: [
        "Variable",
        "Converted (n = )",
        "Completed as TAPP (n = )",
        "Median difference (95% CI)",
        "P value",
      ],
      rows: [{ label: "Operative duration (minutes), median (IQR)" }],
      test_applied: "Mann-Whitney U test, with a Hodges-Lehmann median difference.",
    },
  ],
};
