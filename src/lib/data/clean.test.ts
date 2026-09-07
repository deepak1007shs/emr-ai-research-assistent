import { describe, expect, it } from "vitest";
import { clean } from "./clean.ts";
import type { Grid, Interpretation } from "./types.ts";

/**
 * The rules that touch real data.
 *
 * Two kinds of change and a hard line between them. A correction that cannot
 * alter what a value means is applied and written to the log. Anything that
 * could - an implausible number, a value in no category, a duplicated record -
 * is left exactly as it was and reported, because a silent edit to research
 * data is indistinguishable from fabrication when the thesis is examined.
 */

const grid: Grid = {
  sheet: "Data",
  rows: [
    ["Sr no", "Age (yrs)", "Sex", "Comment"],
    ["1", " 34 ", "m", "seen  in OPD"],
    ["2", "51", "Male", "NA"],
    ["3", "NA", "F", "referred"],
    ["4", "999", "female", ""],
    ["5", "29 years", "X", ""],
  ],
};

const interpretation: Interpretation = {
  columns: [
    { index: 0, variable_id: "", clean_name: "sr_no", meaning: "Serial number", unit: "", categories: [] },
    { index: 1, variable_id: "var_age", clean_name: "age", meaning: "Age", unit: "years", categories: [] },
    {
      index: 2,
      variable_id: "",
      clean_name: "sex",
      meaning: "Sex",
      unit: "",
      categories: [
        { canonical: "Male", spellings: ["m", "male"] },
        { canonical: "Female", spellings: ["f", "female"] },
      ],
    },
    { index: 3, variable_id: "", clean_name: "comment", meaning: "Free note", unit: "", categories: [] },
  ],
};

const run = (columns: Record<string, string> = {}) =>
  clean(grid, 0, interpretation, { columns });

describe("what is corrected", () => {
  it("trims a value and collapses the spaces inside it", () => {
    const { rows, changes } = run();
    expect(rows[0][1]).toBe("34");
    expect(rows[0][3]).toBe("seen in OPD");
    expect(changes.some((c) => c.rule === "whitespace")).toBe(true);
  });

  it("writes one spelling for one category, as text and never as a code", () => {
    const { rows } = run();
    expect(rows.map((r) => r[2])).toEqual(["Male", "Male", "Female", "Female", "X"]);
  });

  it("empties a marker that stands for nothing recorded", () => {
    const { rows } = run();
    expect(rows[2][1]).toBe("");
    expect(rows[1][3]).toBe("");
  });

  it("takes a unit off a number, because the column already carries it", () => {
    expect(run().rows[4][1]).toBe("29");
  });

  it("renames a mapped column to the name the plan and the form already use", () => {
    const { headers } = clean(grid, 0, interpretation, { columns: { var_age: "age_yrs" } });
    expect(headers).toEqual(["sr_no", "age_yrs", "sex", "comment"]);
  });
});

describe("what is only reported", () => {
  it("leaves a value belonging to no category alone, and says so", () => {
    const { rows, findings } = run();
    expect(rows[4][2]).toBe("X");
    expect(findings.find((f) => f.code === "DATA03")?.column).toBe("sex");
  });

  it("does not touch an implausible number", () => {
    const { rows, findings } = run();
    expect(rows[3][1]).toBe("999");
    expect(findings.some((f) => f.code === "DATA02")).toBe(true);
  });
});

describe("the change log", () => {
  it("records every change with the row a person can go and look at", () => {
    const { changes } = run();
    for (const change of changes) {
      expect(change.before).not.toBe(change.after);
      expect(change.row).toBeGreaterThan(1);
      expect(change.column).toBeTruthy();
      expect(change.rule).toBeTruthy();
    }
  });

  it("replays onto the original to give the cleaned sheet exactly", () => {
    // The property that makes the cleaning auditable rather than trusted.
    const { headers, rows, changes } = run();
    const replayed = grid.rows.slice(1).map((row) => [...row]);
    for (const change of changes) {
      const column = headers.indexOf(change.column);
      replayed[change.row - 2][column] = change.after;
    }
    expect(replayed.map((r) => r.map((c) => c.trim()))).toEqual(rows);
  });
});

describe("the same file twice", () => {
  it("cleans to the same sheet", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
