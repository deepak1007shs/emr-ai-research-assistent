import { describe, expect, it } from "vitest";
import { markUnavailable } from "./unavailable.ts";
import type { ShellTablesSpec } from "./types.ts";

/**
 * What the collected data cannot fill.
 *
 * A set difference, so code decides it rather than a model. Nothing is dropped
 * and no table is renumbered: the plan is still the plan, and a dataset that
 * arrives later fills the gaps without the document changing shape.
 */
const spec = (): ShellTablesSpec =>
  ({
    title: "A study",
    labels: { var_age: "Age", var_asa: "ASA grade" },
    groups: [],
    tables: [
      {
        number: 1,
        block: "descriptive",
        role: "descriptive",
        title: "Baseline",
        columns: ["Variable", "Total"],
        rows: [
          { variable_id: "var_age", label: "", kind: "variable" },
          { variable_id: "var_asa", label: "", kind: "variable" },
          { label: "Mean ± SD", kind: "category", indent: true },
        ],
      },
      {
        number: 2,
        block: "secondary",
        role: "effect",
        title: "Nobody recorded any of this",
        columns: ["Variable", "Effect"],
        rows: [{ variable_id: "var_asa", label: "", kind: "variable" }],
      },
    ],
  }) as unknown as ShellTablesSpec;

describe("marking what the data cannot fill", () => {
  it("marks a row whose variable has no column", () => {
    const marked = markUnavailable(spec(), { var_age: "age_yrs" });
    expect(marked.tables[0].rows[0].unavailable).toBeUndefined();
    expect(marked.tables[0].rows[1].unavailable).toBeTruthy();
  });

  it("leaves a row that is not a variable alone", () => {
    // "Mean ± SD" is a sub-row of the row above it, not something collected.
    const marked = markUnavailable(spec(), { var_age: "age_yrs" });
    expect(marked.tables[0].rows[2].unavailable).toBeUndefined();
  });

  it("marks a table the data fills none of", () => {
    const marked = markUnavailable(spec(), { var_age: "age_yrs" });
    expect(marked.tables[1].unavailable).toBeTruthy();
    expect(marked.tables[0].unavailable).toBeUndefined();
  });

  it("marks nothing when no data is attached", () => {
    // An unmapped study must not read as a study missing everything.
    const marked = markUnavailable(spec(), {});
    for (const table of marked.tables) {
      expect(table.unavailable).toBeUndefined();
      for (const row of table.rows) expect(row.unavailable).toBeUndefined();
    }
  });

  it("drops nothing and renumbers nothing", () => {
    const before = spec();
    const marked = markUnavailable(before, { var_age: "age_yrs" });
    expect(marked.tables.map((t) => t.number)).toEqual([1, 2]);
    expect(marked.tables[0].rows).toHaveLength(3);
  });
});
