import { describe, expect, it } from "vitest";
import {
  binaryModels,
  effectMeasures,
  matchKey,
  parseTable,
  tests,
} from "./decision-tables.ts";

describe("the decision tables", () => {
  it("reads a table whose cells contain escaped pipes", () => {
    const rows = parseTable(
      "| Key | Test |\n|---|---|\n| trial\\|continuous | t-test |\n",
    );
    expect(rows).toEqual([{ Key: "trial|continuous", Test: "t-test" }]);
  });

  it("loads all three tables", () => {
    expect(effectMeasures().length).toBeGreaterThan(8);
    expect(tests().length).toBeGreaterThan(15);
    expect(binaryModels()).toHaveLength(5);
  });

  it("prefers the specific row to the general one", () => {
    // Both `case_control|binary` and `*|binary` match; the design must win,
    // because a case-control study cannot estimate a risk ratio at all.
    expect(matchKey(effectMeasures(), "case_control|binary")!["Effect measure"])
      .toBe("Odds ratio");
    expect(matchKey(effectMeasures(), "cohort|binary")!["Effect measure"])
      .toBe("Risk ratio");
  });

  it("falls through to the general row where no design matches", () => {
    expect(matchKey(effectMeasures(), "other|continuous")!["Effect measure"])
      .toBe("Mean difference");
  });

  it("never tests a trajectory one visit at a time", () => {
    const repeated = tests().filter((r) => r.Key.endsWith("/repeated"));
    expect(repeated.length).toBeGreaterThan(2);
    for (const row of repeated) {
      expect(row["Unadjusted test"]).toContain("no p value");
      expect(row["Adjusted model"]).toMatch(/group-by-time|group-by-visit/);
    }
  });

  it("gives every binary model a named fallback, or says why it has none", () => {
    for (const row of binaryModels()) {
      expect(row.Model.length).toBeGreaterThan(0);
      expect(row["Effect measure"].length).toBeGreaterThan(0);
    }
  });

  it("returns nothing rather than a wrong row for a key it does not hold", () => {
    expect(matchKey(tests(), "text/two_groups")).toBeNull();
  });
});
