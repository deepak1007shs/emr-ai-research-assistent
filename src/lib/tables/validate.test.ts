import { describe, expect, it } from "vitest";
import { validateTables } from "./validate.ts";
import type { SapRegistry } from "../sap/types.ts";
import { tablesFixture } from "./fixture.ts";
import type { ShellTablesSpec } from "./types.ts";

const clean = () => structuredClone(tablesFixture) as ShellTablesSpec;
const codes = (s: ShellTablesSpec, plan?: SapRegistry) =>
  validateTables(s, plan).findings.map((f) => f.code);

const sap = (): SapRegistry => ({
  title: "A study",
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion convert?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
    { id: "S2", tier: "secondary", question: "Does operative duration differ?" },
  ],
  variables: [
    { id: "var_age", label: "Age (years)", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    {
      id: "var_age_group",
      label: "Age group",
      data_type: "ordinal",
      unit_coding: "< 40 / 40 to 60 / > 60",
      role: "descriptor",
    },
    { id: "var_sex", label: "Sex", data_type: "binary", unit_coding: "Male / Female", role: "confounder" },
    {
      id: "var_bmi",
      label: "Body mass index (kg/m2)",
      data_type: "continuous",
      unit_coding: "kg/m2",
      role: "confounder",
    },
  ],
  outcomes: [
    {
      id: "out_conversion",
      what: "Intraoperative conversion",
      how: "the surgeon's record",
      instrument: "proforma",
      when: "the index operation",
      units: "Yes / No",
      domain: "clinical",
      source_variable_ids: [],
    },
  ],
  analyses: [
    {
      objective_ids: ["P1"],
      label: "P1 - rate",
      outcome_ids: ["out_conversion"],
      exposure_ids: [], adjust_for_ids: [],
      data_type: "binary",
      comparison: "single_group",
      pairing: "none" as const,
      table_ids: ["T2"],
    },
    {
      objective_ids: ["S1"],
      label: "S1 - factors",
      outcome_ids: ["out_conversion"],
      exposure_ids: [], adjust_for_ids: ["var_age"],
      data_type: "binary",
      comparison: "adjusted",
      pairing: "none" as const,
      table_ids: ["T3"],
    },
    {
      objective_ids: ["S2"],
      label: "S2 - operative duration",
      outcome_ids: ["out_conversion"],
      exposure_ids: [], adjust_for_ids: [],
      data_type: "continuous",
      comparison: "two_groups",
      pairing: "none" as const,
      table_ids: ["T4"],
    },
  ],
});

describe("validateTables", () => {
  it("passes the fixture", () => {
    const { ok, findings } = validateTables(clean());
    expect(findings.filter((f) => f.severity === "ERROR"), JSON.stringify(findings, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("TBL01 - tables not numbered contiguously", () => {
    const s = clean();
    s.tables[2].number = 9;
    expect(codes(s)).toContain("TBL01");
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
    delete s.tables[3].test_applied;
    expect(codes(s)).toContain("TBL09");
  });

  it("TBL11 - a column called Model 1", () => {
    const s = clean();
    s.tables[3].columns[3] = "Model 2";
    expect(codes(s)).toContain("TBL11");
  });

  it("TBL12 - an effect size with no confidence interval", () => {
    const s = clean();
    s.tables[3].columns[1] = "Unadjusted OR";
    const findings = validateTables(s).findings;
    expect(findings.map((f) => f.code)).toContain("TBL12");
    expect(findings.find((f) => f.code === "TBL12")?.message).toContain("precision");
  });

  it("TBL13 - adjusted reported with no unadjusted beside it", () => {
    const s = clean();
    s.tables[3].columns = ["Predictor", "Adjusted OR (95% CI)", "P value"];
    expect(codes(s)).toContain("TBL13");
  });

  it("TBL14 - an analysis no table reports", () => {
    const s = clean();
    // The table that reported P1 now says it reports nothing.
    s.tables[2].fills = [];
    const findings = validateTables(s, sap()).findings;
    expect(findings.map((f) => f.code)).toContain("TBL14");
    expect(findings.find((f) => f.code === "TBL14")?.message).toContain("never be reported");
  });

  it("TBL19 - two tables claiming the same analysis", () => {
    const s = clean();
    s.tables[3].fills = ["P1"];
    expect(codes(s, sap())).toContain("TBL19");
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
    // Table 4 says it reports S1, whose outcome is conversion, not this one.
    s.tables[3].outcome_id = "out_other";
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
    s.tables[3].adjusted_for = ["var_op_duration"];
    const findings = validateTables(s, p).findings;
    expect(findings.map((f) => f.code)).toContain("TBL17");
    expect(findings.find((f) => f.code === "TBL17")?.message).toContain("removes part of the effect");
  });

  it("TBL18 - the table adjusts for something the plan never listed", () => {
    const s = clean();
    const p = sap();
    // S1 lists var_age only; table 4, which reports S1, adjusts for two.
    s.tables[3].adjusted_for = ["var_age", "var_bmi"];
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
