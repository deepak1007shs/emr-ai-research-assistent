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

  it("the primary outcome gets one table for itself, and others beside it", () => {
    const roles = clean()
      .tables.filter((t) => (t.fills ?? []).includes("P1"))
      .map((t) => t.role);
    // One table for the outcome, carrying the groups and the estimates
    // together; the tables beside it have different rows, not fragments of it.
    expect(roles.filter((r) => r === "outcome")).toHaveLength(1);
    expect(roles).toContain("sensitivity");
  });

  it("TBL21 - the primary outcome has no table showing what happened", () => {
    const s = clean();
    s.tables = s.tables.filter(
      (t) => !((t.fills ?? []).includes("P1") && t.role === "outcome"),
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
    const t = roled(s, "outcome");
    t.role = "subgroup";
    t.columns = ["Subgroup", "Estimate", "95% CI", "P value"];
    expect(codes(s, sap())).toContain("TBL22");
  });

  it("TBL20 - the table names an estimate the plan did not choose", () => {
    const s = clean();
    const t = roled(s, "outcome");
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
    delete roled(s, "outcome").test_applied;
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
    // The shape where the estimates are the rows: a correlation or an
    // agreement, which has no groups to put across the top.
    const t = roled(s, "outcome");
    t.columns = ["Measure", "Estimate", "P value"];
    t.rows = [{ label: "Spearman rho", kind: "measure" }];
    expect(codes(s)).toContain("TBL12");
  });

  it("TBL13 - adjusted reported with no unadjusted beside it", () => {
    const s = clean();
    s.tables = s.tables.filter((t) => t.role !== "outcome");
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

/**
 * Two rules from the skill this application reproduces, which it did not hold
 * itself to. Both are things a supervisor catches on the first read.
 */
describe("an absolute measure beside a ratio", () => {
  it("objects to a ratio reported with no absolute measure", () => {
    // "Give the absolute measure alongside any ratio." An odds ratio of 2.4
    // with no risk difference beside it is the commonest way a thesis
    // overstates an effect: it reads as a finding rather than as arithmetic.
    // The fixture's own adjusted table does this, which is the point.
    expect(codes(clean(), sap())).toContain("TBL32");
  });

  it("is satisfied by a risk difference", () => {
    const spec = clean();
    for (const table of spec.tables) {
      if (/odds ratio/i.test(table.columns.join(" "))) {
        table.columns = [...table.columns, "Risk difference (95% CI)"];
      }
    }
    expect(codes(spec, sap())).not.toContain("TBL32");
  });

  it("is satisfied by a number needed to treat", () => {
    const spec = clean();
    for (const table of spec.tables) {
      if (/odds ratio/i.test(table.columns.join(" "))) {
        table.columns = [...table.columns, "NNT"];
      }
    }
    expect(codes(spec, sap())).not.toContain("TBL32");
  });

  it("says nothing about a table that reports no ratio at all", () => {
    // Checked per table, not across the spec: the fixture has other tables
    // that do report a ratio, and they are supposed to be raised.
    const spec = clean();
    const table = roled(spec, "descriptive");
    table.columns = ["Variable", "Converted", "Completed", "P value"];
    const raised = validateTables(spec, sap())
      .findings.filter((f) => f.code === "TBL32")
      .map((f) => f.message);
    expect(raised.some((m) => m.startsWith(`Table ${table.number} `))).toBe(false);
  });
});

describe("a non-inferiority trial", () => {
  const nonInferiority = () => {
    const plan = sap();
    plan.design_family = "non_inferiority_trial";
    return plan;
  };

  it("is asked for both populations, because non-inferiority is claimed on both", () => {
    const plan = nonInferiority();
    plan.populations = [{ name: "Intention-to-treat", definition: "All randomised." }];
    expect(codes(clean(), plan)).toContain("TBL34");
  });

  it("and the per-protocol set alone is not enough either", () => {
    const plan = nonInferiority();
    plan.populations = [{ name: "Per-protocol set", definition: "Adherent, no major deviation." }];
    expect(codes(clean(), plan)).toContain("TBL34");
  });

  it("says nothing once both are named", () => {
    const plan = nonInferiority();
    plan.populations = [
      { name: "Full analysis set", definition: "All randomised, as randomised." },
      { name: "Per-protocol set", definition: "Adherent, no major deviation." },
    ];
    expect(codes(clean(), plan)).not.toContain("TBL34");
  });

  it("says nothing to a superiority trial with one population", () => {
    // The per-protocol set is supportive everywhere else. Demanding it of every
    // design would be a rule about nothing.
    const plan = sap();
    plan.populations = [{ name: "Full analysis set", definition: "All randomised." }];
    expect(codes(clean(), plan)).not.toContain("TBL34");
  });
});

describe("a variable no table reports", () => {
  it("is raised, because it is either a missing analysis or a wasted field", () => {
    // The form already refuses to collect what nothing analyses. The tables did
    // not refuse to leave a declared variable unreported, so a field could be
    // collected, declared, and printed nowhere.
    const plan = sap();
    plan.variables.push({
      id: "var_never_reported",
      label: "Serum widget",
      data_type: "continuous",
      unit_coding: "ng/mL",
      role: "descriptor",
    });
    expect(codes(clean(), plan)).toContain("TBL33");
  });

  it("says nothing about a variable a table does report", () => {
    // Age is a row of the demographics table and a covariate of the adjusted
    // model, so it reaches a reader twice over.
    const raised = validateTables(clean(), sap())
      .findings.filter((f) => f.code === "TBL33")
      .map((f) => f.message)
      .join(" ");
    expect(raised).not.toContain('"Age"');
  });

  it("excuses what an analysis compares, which heads the columns", () => {
    // Found on the stored plans: a trial whose every table split its columns by
    // the allocated arm was told the allocated arm went unreported.
    const plan = sap();
    plan.variables.push({
      id: "var_arm",
      label: "Trial arm",
      data_type: "binary",
      unit_coding: "TAPP; TEP",
      role: "descriptor",
    });
    plan.analyses[0].exposure_ids = ["var_arm"];

    const raised = validateTables(clean(), plan)
      .findings.filter((f) => f.code === "TBL33")
      .map((f) => f.message)
      .join(" ");
    expect(raised).not.toContain("Trial arm");
  });

  it("but not one predictor of a model that names many", () => {
    // A long exposure list is a predictor set, and a predictor set belongs in
    // the rows of the model table. Excusing those would hide what this looks
    // for.
    const plan = sap();
    plan.variables.push({
      id: "var_widget",
      label: "Serum widget",
      data_type: "continuous",
      unit_coding: "ng/mL",
      role: "descriptor",
    });
    plan.analyses[0].exposure_ids = ["var_widget", "var_age", "var_sex"];

    expect(codes(clean(), plan)).toContain("TBL33");
  });

  it("excuses what a derived value is computed from", () => {
    // Height and weight are collected so a body mass index can be checked
    // against them. Demanding a table for each would be asking the plan to
    // report its own arithmetic.
    const raised = validateTables(clean(), sap())
      .findings.filter((f) => f.code === "TBL33")
      .map((f) => f.message)
      .join(" ");
    expect(raised).not.toContain("Height");
    expect(raised).not.toContain("Weight");
  });
});
