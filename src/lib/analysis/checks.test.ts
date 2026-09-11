import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { AnalysisRow, FactsSheet } from "../study/types.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "../variables/build.ts";
import { buildExploratory } from "../variables/exploratory.ts";
import { buildAnalysis } from "./build.ts";
import { step4Checks } from "./checks.ts";

const parts = (facts: FactsSheet = idaPreg) => {
  const objectives = buildObjectives(facts);
  const { variables } = buildVariables(facts, objectives);
  const { outcomes } = buildExploratory(facts, objectives, variables);
  return { objectives, rows: buildAnalysis(facts, objectives, variables, outcomes).rows };
};
const run = (rows: AnalysisRow[], facts: FactsSheet = idaPreg) =>
  step4Checks(facts, parts(facts).objectives, rows);
const said = (rows: AnalysisRow[], id: string, facts: FactsSheet = idaPreg) =>
  run(rows, facts).find((r) => r.id === id)!;

describe("Step 4 checks", () => {
  it("passes every check on the worked example", () => {
    expect(run(parts().rows).filter((r) => !r.pass)).toEqual([]);
  });

  it("S4-1 catches an objective with no analysis", () => {
    const rows = parts().rows.filter((r) => r.objective !== "S2");
    expect(said(rows, "S4-1").failing).toEqual(["S2"]);
  });

  it("S4-2 catches a half-planned outcome with no exception recorded", () => {
    const rows = parts().rows.map((r) =>
      r.objective === "P1a" ? { ...r, adjusted: null } : r,
    );
    expect(said(rows, "S4-2").failing).toEqual(["P1a"]);
  });

  it("S4-2 allows the two exceptions the process names", () => {
    expect(said(parts().rows, "S4-2").pass).toBe(true);
  });

  it("S4-3 catches an odds ratio for an outcome that is not rare", () => {
    const rows = parts().rows.map((r) =>
      r.objective === "S1"
        ? { ...r, effect_measure: "Odds ratio", expected_frequency: 0.45 }
        : r,
    );
    expect(said(rows, "S4-3").pass).toBe(false);
    expect(said(rows, "S4-3").failing).toEqual(["S1"]);
  });

  it("S4-3 allows an odds ratio where the outcome really is rare", () => {
    const rows = parts().rows.map((r) =>
      r.objective === "S1"
        ? { ...r, effect_measure: "Odds ratio", expected_frequency: 0.03 }
        : r,
    );
    expect(said(rows, "S4-3").pass).toBe(true);
  });

  it("S4-3 catches a binary row with a model and no fallback", () => {
    const rows = parts().rows.map((r) =>
      r.objective === "S1" && r.adjusted
        ? { ...r, adjusted: { ...r.adjusted, fallback: null } }
        : r,
    );
    expect(said(rows, "S4-3").failing).toEqual(["S1"]);
  });

  it("S4-4 catches a row that does not say what one row of the data is", () => {
    const rows = parts().rows.map((r) =>
      r.objective === "P1b" ? { ...r, count: "" } : r,
    );
    expect(said(rows, "S4-4").failing).toEqual(["P1b"]);
  });

  it("S4-5 catches a model the sample cannot carry", () => {
    const small: FactsSheet = {
      ...idaPreg,
      sample_size: { ...idaPreg.sample_size, per_group: 8 },
    };
    expect(said(parts(small).rows, "S4-5", small).pass).toBe(false);
  });

  it("S4-5 says nothing where the sample size is unknown", () => {
    const unsized: FactsSheet = {
      ...idaPreg,
      sample_size: { ...idaPreg.sample_size, per_group: null },
    };
    expect(said(parts(unsized).rows, "S4-5", unsized).pass).toBe(true);
  });
});
