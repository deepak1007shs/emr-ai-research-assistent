import { describe, expect, it } from "vitest";
import { validateTables } from "./validate.ts";
import type { SapRegistry } from "../sap/types.ts";
import { tablesFixture } from "./fixture.ts";
import { sapFixture } from "../sap/fixture.ts";
import type { ShellTablesSpec } from "./types.ts";

const clean = () => structuredClone(tablesFixture) as ShellTablesSpec;
const codes = (s: ShellTablesSpec, plan?: SapRegistry) =>
  validateTables(s, plan).findings.map((f) => f.code);

/**
 * Tables are found by the job they do, not by where they sit. One outcome now
 * owns a block of them, so a position is not a stable way to name one.
 */
const roled = (s: ShellTablesSpec, role: string) => s.tables.find((t) => t.role === role)!;
const renumber = (s: ShellTablesSpec) => s.tables.forEach((t, i) => (t.number = i + 1));

/** The plan the fixture is generated from. */
const sap = (): SapRegistry => structuredClone(sapFixture) as SapRegistry;

describe("validateTables", () => {
  it("passes the fixture", () => {
    const { ok, findings } = validateTables(clean(), sap());
    expect(findings.filter((f) => f.severity === "ERROR"), JSON.stringify(findings, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("TBL01 - tables not numbered contiguously", () => {
    const s = clean();
    s.tables[2].number = 9;
    expect(codes(s)).toContain("TBL01");
  });

  it("the primary outcome gets a block of tables, not one table", () => {
    const roles = clean()
      .tables.filter((t) => (t.fills ?? []).includes("P1"))
      .map((t) => t.role);
    expect(roles).toContain("summary");
    expect(roles).toContain("sensitivity");
    expect(roles.length).toBeGreaterThan(1);
  });

  it("TBL21 - the primary outcome has no table showing what happened", () => {
    const s = clean();
    // Both of the tables that could show it: the whole cohort and the split by
    // group. Either alone satisfies the requirement, which is the point.
    s.tables = s.tables.filter(
      (t) =>
        !((t.fills ?? []).includes("P1") && (t.role === "summary" || t.role === "distribution")),
    );
    renumber(s);
    expect(codes(s, sap())).toContain("TBL21");
  });

  it("TBL23 - subgroups are planned but never tabulated", () => {
    const s = clean();
    s.tables = s.tables.filter((t) => t.role !== "subgroup");
    renumber(s);
    const p = sap();
    p.subgroups = [{ subgroup: "Recurrent versus primary hernia", how_tested: "An interaction term." }];
    expect(codes(s, p)).toContain("TBL23");
  });

  it("TBL22 - a subgroup table read from within-subgroup p values", () => {
    const s = clean();
    const t = roled(s, "effect_unadjusted");
    t.role = "subgroup";
    t.columns = ["Subgroup", "Estimate", "95% CI", "P value"];
    expect(codes(s, sap())).toContain("TBL22");
  });

  it("TBL20 - the table names an estimate the plan did not choose", () => {
    const s = clean();
    const t = roled(s, "effect_unadjusted");
    // The plan chose a median difference for this skewed outcome.
    t.rows = [{ label: "Risk ratio", kind: "measure" }];
    const findings = validateTables(s, sap()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL20");
    expect(findings.find((f) => f.code === "TBL20")?.message).toContain("not what the plan chose");
  });

  it("TBL02 - blocks out of order", () => {
    const s = clean();
    s.tables[0].block = "exploratory";
    expect(codes(s)).toContain("TBL02");
  });

  it("TBL03 - no baseline table", () => {
    const s = clean();
    s.tables = s.tables.filter((t) => t.block !== "descriptive");
    s.tables.forEach((t, i) => (t.number = i + 1));
    expect(codes(s)).toContain("TBL03");
  });

  it("TBL04 - nothing reports the primary outcome", () => {
    const s = clean();
    s.tables = s.tables.filter((t) => t.block !== "primary");
    s.tables.forEach((t, i) => (t.number = i + 1));
    expect(codes(s)).toContain("TBL04");
  });

  it("TBL09 - a comparison with no named test", () => {
    const s = clean();
    delete roled(s, "effect_unadjusted").test_applied;
    expect(codes(s)).toContain("TBL09");
  });

  it("TBL11 - a column called Model 1", () => {
    const s = clean();
    roled(s, "effect_adjusted").columns[1] = "Model 2";
    expect(codes(s)).toContain("TBL11");
  });

  it("TBL11 - a model that holds nothing constant", () => {
    const s = clean();
    roled(s, "effect_adjusted").models![0].adds = [];
    expect(codes(s)).toContain("TBL11");
  });

  it("a model is named for what it holds constant, not by a number", () => {
    const models = roled(clean(), "effect_adjusted").models!;
    expect(models.every((m) => m.adds.length)).toBe(true);
    expect(models.some((m) => /^model\s*\d/i.test(m.name))).toBe(false);
  });

  it("TBL12 - an effect size with no confidence interval", () => {
    const s = clean();
    roled(s, "effect_adjusted").columns[1] = "Unadjusted OR";
    const findings = validateTables(s).findings;
    expect(findings.map((f) => f.code)).toContain("TBL12");
    expect(findings.find((f) => f.code === "TBL12")?.message).toContain("precision");
  });

  it("TBL12 - estimates as rows with no interval column", () => {
    const s = clean();
    const t = roled(s, "effect_unadjusted");
    t.columns = ["Measure", "Estimate", "P value"];
    expect(codes(s)).toContain("TBL12");
  });

  it("TBL13 - adjusted reported with no unadjusted beside it", () => {
    const s = clean();
    s.tables = s.tables.filter((t) => t.role !== "effect_unadjusted");
    // Nor an unadjusted column on the table itself.
    roled(s, "effect_adjusted").columns = ["Predictor", "Adjusted OR (95% CI)", "P value"];
    renumber(s);
    expect(codes(s)).toContain("TBL13");
  });

  it("TBL14 - an analysis no table reports", () => {
    const s = clean();
    // Nothing reports P1 any more.
    for (const t of s.tables) t.fills = t.fills?.filter((id) => id !== "P1");
    const findings = validateTables(s, sap()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL14");
    expect(findings.find((f) => f.code === "TBL14")?.message).toContain("never be reported");
  });

  it("TBL19 - two tables doing the same job for one analysis", () => {
    const s = clean();
    const t = roled(s, "sensitivity");
    s.tables.push({ ...structuredClone(t), number: s.tables.length + 1 });
    expect(codes(s, sap())).toContain("TBL19");
  });

  it("TBL19 - several tables for one analysis are fine when the jobs differ", () => {
    const forP1 = clean().tables.filter((t) => (t.fills ?? []).includes("P1"));
    expect(forP1.length).toBeGreaterThan(1);
    expect(codes(clean(), sap())).not.toContain("TBL19");
  });

  it("REF08 - a row reports a variable the plan does not declare", () => {
    const s = clean();
    s.tables[0].rows[0].variable_id = "var_invented";
    expect(codes(s, sap())).toContain("REF08");
  });

  it("TBL16 - a table and the analysis it reports measure different outcomes", () => {
    const s = clean();
    const p = sap();
    p.outcomes.push({
      id: "out_other",
      what: "Postoperative length of stay",
      how: "from the case record",
      instrument: "proforma",
      when: "discharge",
      units: "Whole days",
      domain: "clinical",
      source_variable_ids: [],
    });
    // This table says it reports S1, whose outcome is conversion, not this one.
    roled(s, "effect_adjusted").outcome_id = "out_other";
    const findings = validateTables(s, p).findings;
    expect(findings.map((f) => f.code)).toContain("TBL16");
    expect(findings.find((f) => f.code === "TBL16")?.message).toContain("measures");
  });

  it("TBL17 - the adjusted column adjusts for a mediator", () => {
    const s = clean();
    const p = sap();
    p.variables.push({
      id: "var_op_duration",
      label: "Operative duration",
      data_type: "continuous",
      unit_coding: "Minutes",
      role: "mediator",
    });
    roled(s, "effect_adjusted").models = [
      { name: "Adjusted", adds: ["var_age", "var_op_duration"] },
    ];
    const findings = validateTables(s, p).findings;
    expect(findings.map((f) => f.code)).toContain("TBL17");
    expect(findings.find((f) => f.code === "TBL17")?.message).toContain("removes part of the effect");
  });

  it("TBL18 - the table adjusts for something the plan never listed", () => {
    const s = clean();
    const p = sap();
    // S1 lists age and BMI; this model adds sex, which the plan never named.
    roled(s, "effect_adjusted").models![0].adds = ["var_age", "var_bmi", "var_sex"];
    const findings = validateTables(s, p).findings;
    expect(findings.map((f) => f.code)).toContain("TBL18");
    expect(findings.find((f) => f.code === "TBL18")?.severity).toBe("WARN");
  });

  it("keeps the cells empty: a shell is not a result", () => {
    // Nothing in the spec carries a value; the renderer draws blanks.
    const s = clean();
    for (const t of s.tables) {
      for (const r of t.rows) {
        expect(Object.keys(r).sort()).not.toContain("value");
      }
    }
  });
});
