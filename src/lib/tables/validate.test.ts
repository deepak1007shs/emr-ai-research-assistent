import { describe, expect, it } from "vitest";
import { validateTables } from "./validate.ts";
import { tablesFixture } from "./fixture.ts";
import type { ShellTablesSpec } from "./types.ts";

const clean = () => structuredClone(tablesFixture) as ShellTablesSpec;
const codes = (s: ShellTablesSpec) => validateTables(s).findings.map((f) => f.code);

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

  it("TBL14 - the plan sends an analysis to a table that does not exist", () => {
    const s = clean();
    const sap = {
      title: "t", design: "d", guideline: "STROBE", aim: "a",
      objectives: [], variables: [],
      analyses: [
        {
          objective_id: "P1", label: "P1", predictors: "", data_type: "binary" as const,
          comparison: "single_group" as const, paired: false, table_ref: "T9",
          outcome: { what: "x", how: "y", instrument: "z", when: "t", units: "u", domain: "clinical" as const },
        },
      ],
    };
    const findings = validateTables(s, sap).findings;
    expect(findings.map((f) => f.code)).toContain("TBL14");
    expect(findings.find((f) => f.code === "TBL14")?.message).toContain("never be reported");
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
