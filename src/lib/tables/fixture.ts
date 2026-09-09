import { sapFixture } from "../sap/fixture.ts";
import { buildAnalyticTables, mergeTables } from "./blocks.ts";
import { assignSlots } from "./slots.ts";
import type { ShellTable, ShellTablesSpec } from "./types.ts";

/**
 * Shaped after the DrUtkarsh results document, with the cells empty.
 *
 * Only the descriptive half is written out. The analytic tables are generated
 * from the analysis plan exactly as they are in a real build, so the fixture
 * cannot drift from what the pipeline actually produces: if the block rules
 * change, this changes with them.
 */

const groups = ["Converted", "Completed as TAPP"];

const described: ShellTable[] = [
  {
    number: 1,
    block: "descriptive",
    role: "descriptive",
    slot: "A1",
    title: "Demographic profile of adults undergoing TAPP repair by conversion status (n = 125)",
    columns: [
      "Variable",
      "Converted (n = ) n (%)",
      "Completed as TAPP (n = ) n (%)",
      "Total (n = 125) n (%)",
      "P value",
    ],
    rows: [
      { variable_id: "var_age", label: "Age (years)", kind: "variable", heading: true },
      { label: "Mean ± SD", kind: "category", indent: true },
      { variable_id: "var_age_group", label: "Age group", kind: "variable", heading: true },
      { label: "< 40 years", kind: "category", indent: true },
      { label: "40 to 60 years", kind: "category", indent: true },
      { label: "> 60 years", kind: "category", indent: true },
      { variable_id: "var_sex", label: "Sex", kind: "variable", heading: true },
      { label: "Male", kind: "category", indent: true },
      { label: "Female", kind: "category", indent: true },
      { variable_id: "var_bmi", label: "Body mass index (kg/m2)", kind: "variable", heading: true },
      { label: "Mean ± SD", kind: "category", indent: true },
    ],
    test_applied:
      "Independent t-test for continuous variables; Pearson chi-square, or Fisher exact where any expected cell is under 5, for categorical variables.",
  },
  {
    number: 2,
    block: "descriptive",
    role: "descriptive",
    slot: "A2",
    title: "Comorbidity and risk factors by conversion status (n = 125)",
    columns: [
      "Variable",
      "Converted (n = ) n (%)",
      "Completed as TAPP (n = ) n (%)",
      "Total (n = 125) n (%)",
      "P value",
    ],
    rows: [
      { label: "Diabetes mellitus", kind: "variable" },
      { label: "Hypertension", kind: "variable" },
      { label: "Smoking status", kind: "variable", heading: true },
      { label: "Current", kind: "category", indent: true },
      { label: "Former", kind: "category", indent: true },
      { label: "Never", kind: "category", indent: true },
      { label: "Previous abdominal surgery", kind: "variable" },
    ],
    test_applied: "Pearson chi-square test, or Fisher exact where any expected cell is under 5.",
  },
];

export const tablesFixture: ShellTablesSpec = {
  title: "Factors Associated with Intraoperative Conversion during TAPP Repair of Ventral Hernia",
  // Copied from the plan's registry by code, exactly as a real build copies it.
  // Hand-writing them here would let the fixture prove a link the pipeline does
  // not actually make.
  labels: Object.fromEntries([
    ...sapFixture.variables.map((v) => [v.id, v.label]),
    ...sapFixture.outcomes.map((o) => [o.id, o.what]),
    // The objectives too, which is what the coverage check names.
    ...sapFixture.objectives.map((o) => [o.id, o.question]),
  ]),
  groups,
  // Copied from the plan by code, exactly as a real build copies them, and
  // printed once under the block they govern.
  multiplicity: sapFixture.rules.multiplicity,
  missing_data: sapFixture.rules.missing_data,
  analysis_population: `${sapFixture.populations[0].name} - ${sapFixture.populations[0].definition} Missing data: ${sapFixture.rules.missing_data}`,
  tables: assignSlots(
    mergeTables(described, buildAnalyticTables(sapFixture, groups), sapFixture),
    sapFixture.objectives.map((o) => o.id),
  ),
};
