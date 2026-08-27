import { describe, expect, it } from "vitest";
import { buildAnalyticTables } from "./blocks.ts";
import { validateTables } from "./validate.ts";
import type { SapRegistry } from "../sap/types.ts";
import type { ShellTablesSpec, TableRole } from "./types.ts";

/**
 * The trial that showed the old model up.
 *
 * A two-arm trial with a common binary primary outcome. Asked to lay this out,
 * the model produced one table with one row reporting an odds ratio, which is
 * the estimate the rule table names as the thing to avoid for a common outcome.
 * Everything needed to lay it out correctly was already in the plan.
 */
function peep(): SapRegistry {
  return {
    title: "PEEP 7 versus PEEP 5 during delivery room resuscitation",
    sample_size: 100,
    expected_events: 40,
    objectives: [
      {
        id: "P1",
        tier: "primary",
        question: "Does a PEEP of 7 reduce delivery room intubation compared with a PEEP of 5?",
      },
    ],
    variables: [
      {
        id: "var_peep",
        label: "Allocated PEEP level",
        data_type: "binary",
        unit_coding: "PEEP 7 cm H2O / PEEP 5 cm H2O",
        role: "predictor",
      },
      { id: "var_ga", label: "Gestational age stratum", data_type: "ordinal", unit_coding: "Weeks", role: "confounder" },
      { id: "var_mode", label: "Mode of delivery", data_type: "binary", unit_coding: "Vaginal / Caesarean", role: "confounder" },
      { id: "var_bw", label: "Birth weight", data_type: "continuous", unit_coding: "Grams", role: "confounder" },
    ],
    outcomes: [
      {
        id: "out_intubation",
        what: "Delivery room intubation within the first 20 minutes of life",
        how: "the resuscitation record",
        instrument: "proforma",
        when: "20 minutes of life",
        units: "Yes / No",
        domain: "clinical",
        source_variable_ids: ["var_peep"],
      },
    ],
    analyses: [
      {
        objective_ids: ["P1"],
        label: "P1 - delivery room intubation",
        outcome_ids: ["out_intubation"],
        exposure_ids: ["var_peep"],
        adjust_for_ids: ["var_ga", "var_mode", "var_bw"],
        data_type: "binary",
        comparison: "two_groups",
        pairing: "none",
        frequency: "common",
        table_ids: ["T1"],
      },
    ],
    populations: [
      { name: "Intention to treat (primary)", definition: "Every randomised infant, in the arm allocated." },
      { name: "Per protocol", definition: "Infants who received the allocated PEEP throughout." },
    ],
    subgroups: [
      { subgroup: "Gestational age under 28 weeks", how_tested: "An interaction term." },
      { subgroup: "Mode of delivery", how_tested: "An interaction term." },
    ],
    rules: {
      software: "R",
      normality: "Shapiro-Wilk.",
      continuous_summary: "Mean (SD).",
      categorical_summary: "n (%).",
      significance: "Two sided, p < 0.05.",
      effect_estimates: "Every estimate with a 95% confidence interval.",
      missing_data: "Complete case, with a best case and worst case tipping point analysis.",
      multiplicity: "The primary outcome is confirmatory.",
      reproducibility: "A fixed seed.",
    },
  };
}

const groups = ["PEEP 7 cm H2O", "PEEP 5 cm H2O"];
const build = () => buildAnalyticTables(peep(), groups);
const roleOf = (role: TableRole) => build().find((t) => t.role === role)!;

const spec = (): ShellTablesSpec => {
  const tables = [
    {
      number: 0,
      block: "descriptive" as const,
      role: "descriptive" as const,
      title: "Maternal and antenatal characteristics by allocated PEEP level (n = 100)",
      columns: ["Variable", ...groups, "Total", "P value"],
      rows: [{ variable_id: "var_ga", label: "Gestational age stratum", kind: "variable" as const }],
      test_applied: "Pearson chi-square test.",
    },
    ...build(),
  ].map((t, i) => ({ ...t, number: i + 1 }));
  return { title: "PEEP", labels: {}, groups, tables };
};

describe("the block a primary outcome gets", () => {
  it("is five tables, not one", () => {
    expect(build().map((t) => t.role)).toEqual([
      "summary",
      "effect_unadjusted",
      "effect_adjusted",
      "subgroup",
      "sensitivity",
    ]);
  });

  it("reports the incidence with its denominators, by arm", () => {
    const table = roleOf("summary");
    expect(table.columns).toEqual(["Group", "n / N", "% (95% CI)"]);
    // The arms come from the exposure's own coding, not from the group list.
    expect(table.rows.map((r) => r.label)).toEqual(["PEEP 7 cm H2O", "PEEP 5 cm H2O"]);
  });

  it("prints the estimates the rule table chose, and never an odds ratio", () => {
    const table = roleOf("effect_unadjusted");
    expect(table.rows.map((r) => r.label)).toEqual([
      "Risk ratio (PEEP 7 cm H2O vs PEEP 5 cm H2O)",
      "Risk difference (PEEP 7 cm H2O vs PEEP 5 cm H2O)",
      "Number needed to treat (PEEP 7 cm H2O vs PEEP 5 cm H2O)",
    ]);
    expect(table.rows.every((r) => r.kind === "measure")).toBe(true);
    expect(table.columns).toContain("95% CI");
    // Only the footnote may mention one, and only to rule it out.
    expect([...table.columns, ...table.rows.map((r) => r.label)].join(" ")).not.toMatch(
      /odds ratio/i,
    );
  });

  it("says what the plan ruled out, under the table", () => {
    expect(roleOf("effect_unadjusted").footnote).toContain("odds ratio");
  });

  it("puts the crude and the adjusted estimate on one row, per predictor", () => {
    const table = roleOf("effect_adjusted");
    expect(table.columns).toEqual([
      "Predictor",
      "Unadjusted risk ratio (95% CI)",
      "P value",
      "Adjusted risk ratio (95% CI)",
      "P value",
    ]);
    expect(table.models).toEqual([
      { name: "Adjusted", adds: ["var_ga", "var_mode", "var_bw"] },
    ]);
    expect(table.columns.join(" ")).not.toMatch(/Model\s*\d/);
    // The predictors are the rows, named by id so the wording comes from the plan.
    expect(table.rows.map((r) => r.variable_id)).toEqual([
      "var_peep",
      "var_ga",
      "var_mode",
      "var_bw",
    ]);
    expect(table.footnote).toContain("holds constant");
    expect(table.footnote).toContain("ten events per degree of freedom");
  });

  it("reads effect modification from an interaction, not a within-subgroup p", () => {
    const table = roleOf("subgroup");
    expect(table.columns).toContain("Interaction p");
    expect(table.rows.map((r) => r.label)).toEqual([
      "Gestational age under 28 weeks",
      "Mode of delivery",
    ]);
    expect(table.footnote).toContain("not powered");
  });

  it("repeats the primary analysis every way the plan said it would", () => {
    const labels = roleOf("sensitivity").rows.map((r) => r.label);
    expect(labels[0]).toContain("Intention to treat");
    expect(labels).toContain("Per protocol");
    expect(labels).toContain("Adjusted estimate, against the unadjusted");
    expect(labels.some((l) => l.includes("tipping point"))).toBe(true);
  });

  it("passes its own guards", () => {
    const { findings } = validateTables(spec(), peep());
    expect(
      findings.filter((f) => f.severity === "ERROR"),
      JSON.stringify(findings, null, 2),
    ).toEqual([]);
  });

  it("TBL20 - an odds ratio planted on a common outcome is caught", () => {
    const s = spec();
    const table = s.tables.find((t) => t.role === "effect_unadjusted")!;
    table.rows = [{ label: "Odds ratio", kind: "measure" }];
    const findings = validateTables(s, peep()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL20");
    expect(findings.find((f) => f.code === "TBL20")?.message).toContain("overstates the effect");
  });
});
