import { describe, expect, it } from "vitest";
import { rowLabels } from "./describe.ts";
import type { ShellTable } from "./types.ts";

const table = (rows: ShellTable["rows"]): ShellTable => ({
  number: 1,
  block: "descriptive",
  role: "descriptive",
  title: "Baseline characteristics by study group",
  columns: ["Variable", "Group A", "Group B", "p"],
  rows,
});

/**
 * A row is a line a reader puts one number on.
 *
 * The rows arrive as a variable and the sub-rows under it, which is what the
 * data are; what a reader needs is one line per number. They were folded into
 * the parent's brackets and are split back out here, because "Sex (male,
 * female)" is one line where a form has two cells to fill.
 */
describe("a sub-row", () => {
  const named = (id: string, fallback: string) =>
    ({ var_sex: "Sex", var_age: "Age" })[id] ?? fallback;

  it("takes its parent's name and its own line", () => {
    const said = rowLabels(
      table([
        { variable_id: "var_sex", label: "", kind: "variable" },
        { label: "Male", kind: "category", indent: true },
        { label: "Female", kind: "category", indent: true },
      ]),
      named,
    );
    expect(said).toEqual(["Sex - Male", "Sex - Female"]);
  });

  it("leaves no bare parent row above it, which would have nothing to fill", () => {
    const said = rowLabels(
      table([
        { variable_id: "var_age", label: "Age", kind: "variable" },
        { label: "Mean +/- SD", kind: "category", indent: true },
      ]),
      named,
    );
    expect(said).toEqual(["Age - Mean +/- SD"]);
  });

  it("is named from the registry when the row above has no wording", () => {
    // The failure the fold was written for: a row carrying only an id, drawn
    // straight, gave "" followed by "Mean +/- SD".
    const said = rowLabels(
      table([
        { variable_id: "var_age", label: "", kind: "variable" },
        { label: "Median (IQR)", kind: "category", indent: true },
      ]),
      named,
    );
    expect(said).toEqual(["Age - Median (IQR)"]);
  });

  it("stands alone where there is no parent to take a name from", () => {
    const said = rowLabels(
      table([{ label: "Mean +/- SD", kind: "category", indent: true }]),
      named,
    );
    expect(said).toEqual(["Mean +/- SD"]);
  });

  it("keeps a variable that has no sub-rows exactly as it is", () => {
    const said = rowLabels(
      table([{ variable_id: "var_sex", label: "", kind: "variable" }]),
      named,
    );
    expect(said).toEqual(["Sex"]);
  });

  it("carries the not-collected mark to each line, not into the middle of one", () => {
    const said = rowLabels(
      table([
        { variable_id: "var_sex", label: "", kind: "variable", unavailable: "not collected" },
        { label: "Male", kind: "category", indent: true },
        { label: "Female", kind: "category", indent: true },
      ]),
      named,
    );
    expect(said).toEqual(["Sex - Male - not collected", "Sex - Female - not collected"]);
  });
});
