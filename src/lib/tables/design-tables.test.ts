import { describe, expect, it } from "vitest";
import { designRule, loadDesignRules } from "./design-tables.ts";
import { buildAnalyticTables, unbuildableRoles } from "./blocks.ts";
import { validateTables } from "./validate.ts";
import type { DesignFamily, SapRegistry } from "../sap/types.ts";
import type { ShellTablesSpec } from "./types.ts";

/**
 * A study is not judged against another study's document.
 *
 * The catalogue says which tables each design owes. These tests hold it to
 * that: a design whose tables this version cannot draw must say so out loud,
 * because a document quietly missing the table its design is judged on is worse
 * than one that admits the gap.
 */

const groups = ["Exposed", "Unexposed"];

function plan(design: DesignFamily): SapRegistry {
  return {
    title: "A study",
    sample_size: 400,
    expected_events: 40,
    design_family: design,
    objectives: [{ id: "P1", tier: "primary", question: "Is the exposure associated with the outcome?" }],
    variables: [
      { id: "var_exposure", label: "Exposure", data_type: "binary", unit_coding: "Exposed / Unexposed", role: "predictor" },
      { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    ],
    outcomes: [
      {
        id: "out_event", what: "The outcome", how: "from the record", instrument: "proforma",
        when: "at one year", units: "Yes / No", domain: "clinical", source_variable_ids: [],
      },
    ],
    subgroups: [{ subgroup: "Age over 65", how_tested: "An interaction term." }],
    populations: [
      { name: "Full analysis set", definition: "Everyone enrolled." },
      { name: "Complete case set", definition: "Everyone with the outcome recorded." },
    ],
    rules: {
      software: "R", normality: "Shapiro-Wilk.", continuous_summary: "Mean (SD).",
      categorical_summary: "n (%).", significance: "Two sided, p < 0.05.",
      effect_estimates: "Every estimate with a 95% confidence interval.",
      missing_data: "Complete case, with a tipping point analysis.",
      multiplicity: "The primary outcome is confirmatory.", reproducibility: "A fixed seed.",
    },
    analyses: [
      {
        objective_ids: ["P1"], label: "P1 - the outcome", outcome_ids: ["out_event"],
        exposure_ids: ["var_exposure"], adjust_for_ids: ["var_age"],
        data_type: "binary", comparison: "two_groups", pairing: "none",
        design_family: design, table_ids: ["T1"],
      },
    ],
  };
}

const ALL = loadDesignRules()
  .map((rule) => rule.design)
  .filter((design) => design !== "any") as DesignFamily[];

describe("the catalogue", () => {
  it("covers every design family the plan can declare", () => {
    // A design the plan can name and the catalogue cannot is one that would
    // silently fall to the generic row and get a trial's document.
    expect(ALL.length).toBe(15);
    for (const design of ALL) {
      expect(designRule(design).design, `${design} has no row`).toBe(design);
      expect(designRule(design).roles.length, `${design} requires no tables`).toBeGreaterThan(0);
      expect(designRule(design).check, `${design} has no examiner note`).not.toBe("");
    }
  });

  it("falls back to the generic row for a plan that never classified itself", () => {
    const rule = designRule(undefined);
    expect(rule.design).toBe("any");
    expect(rule.roles).toContain("outcome");
    expect(rule.roles).toContain("effect_adjusted");
  });

  it("forbids a p value on the baseline table of every randomised design", () => {
    const randomised = ALL.filter((d) => d.endsWith("_trial"));
    expect(randomised.length).toBeGreaterThan(3);
    for (const design of randomised) {
      expect(designRule(design).baselineP, `${design} allows a baseline p value`).toBe(false);
    }
    expect(designRule("cohort").baselineP).toBe(true);
  });
});

describe("what each design produces", () => {
  it.each(ALL)("%s builds the roles it can, and names the ones it cannot", (design) => {
    const sap = plan(design);
    const built = new Set(buildAnalyticTables(sap, groups).map((t) => t.role));
    const owed = designRule(design).roles;
    const cannot = new Set(unbuildableRoles(sap));

    for (const role of owed) {
      if (cannot.has(role) || role === "descriptive" || role === "distribution" || role === "repeated") {
        continue;
      }
      expect(built.has(role), `${design} owes a ${role} table and did not build one`).toBe(true);
    }
  });

  it("TBL23 - a trial that prespecifies no subgroups is told so", () => {
    const sap = plan("randomised_trial");
    delete sap.subgroups;
    const spec: ShellTablesSpec = {
      title: "A trial", labels: {}, groups,
      tables: buildAnalyticTables(sap, groups).map((t, i) => ({ ...t, number: i + 1 })),
    };
    const found = validateTables(spec, sap).findings.find((f) => f.code === "TBL23");
    expect(found?.message).toContain("prespecifies no subgroups");
  });

  it("a trial gets a participant-flow table and a cohort does not", () => {
    const roles = (d: DesignFamily) =>
      new Set(buildAnalyticTables(plan(d), groups).map((t) => t.role));
    expect(roles("randomised_trial").has("flow")).toBe(true);
    expect(roles("cohort").has("flow")).toBe(false);
  });

  it("TBL24 - a randomised trial's baseline table may not carry a p value", () => {
    const sap = plan("randomised_trial");
    const spec: ShellTablesSpec = {
      title: "A trial",
      labels: {},
      groups,
      tables: [
        {
          number: 1, block: "descriptive" as const, role: "descriptive" as const,
          title: "Baseline characteristics by arm (n = 400)",
          columns: ["Variable", ...groups, "P value"],
          rows: [{ variable_id: "var_age", label: "Age", kind: "variable" as const }],
          test_applied: "Independent t-test.",
        },
        ...buildAnalyticTables(sap, groups),
      ].map((t, i) => ({ ...t, number: i + 1 })),
    };
    const found = validateTables(spec, sap).findings.find((f) => f.code === "TBL24");
    expect(found?.message).toContain("tests the randomisation rather than the study");
  });

  it("TBL25 - a design owed a table nothing can draw says so", () => {
    const sap = plan("diagnostic_accuracy");
    const spec: ShellTablesSpec = {
      title: "A diagnostic study",
      labels: {},
      groups,
      tables: [
        {
          number: 1, block: "descriptive" as const, role: "descriptive" as const,
          title: "Characteristics of those tested (n = 400)",
          columns: ["Variable", "n (%)"],
          rows: [{ variable_id: "var_age", label: "Age", kind: "variable" as const }],
        },
        ...buildAnalyticTables(sap, groups),
      ].map((t, i) => ({ ...t, number: i + 1 })),
    };
    const found = validateTables(spec, sap).findings.find((f) => f.code === "TBL25");
    expect(found?.message).toContain("two by two");
    expect(found?.message).toContain("Name the reference standard");
    expect(found?.severity).toBe("WARN");
  });
});
