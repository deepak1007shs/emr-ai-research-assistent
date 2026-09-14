import { describe, expect, it } from "vitest";
import { buildSap } from "./build.ts";
import { idaPreg } from "../facts/fixture.ts";
import { elastography } from "../facts/fixture-diagnostic.ts";
import { vishal } from "../facts/fixture-vishal.ts";
import { gateB } from "../checks/step7.ts";
import type { FactsSheet } from "../study/types.ts";

/**
 * Every analysis the map names points at a table.
 *
 * The association branch added a screen table - one row per factor, the
 * unadjusted look at each - and the step that writes table numbers back into
 * the map was never told about it. So every association objective printed its
 * unadjusted test "to T", with no number, and S7-12 passed: it checked that
 * each number was a real table after throwing away the numbers that were empty.
 * A check that discards the failures before looking cannot fail.
 */

const shapes = [
  ["IDA-PREG", idaPreg],
  ["elastography", elastography],
  ["a cohort asking about associations", vishal],
] as const;

describe.each(shapes)("the map's table numbers, %s", (_name, facts) => {
  const build = buildSap(facts);

  it("gives every unadjusted and adjusted analysis a table", () => {
    for (const row of build.analysis) {
      if (row.unadjusted) expect(row.unadjusted.table, `${row.objective} unadjusted`).not.toBe("");
      if (row.adjusted) expect(row.adjusted.table, `${row.objective} adjusted`).not.toBe("");
    }
  });

  it("points only at tables Section 6 draws", () => {
    const numbers = new Set(build.tables.map((t) => t.number));
    for (const row of build.analysis) {
      for (const n of [row.unadjusted?.table, row.adjusted?.table]) {
        if (n) expect(numbers.has(n), `${row.objective} -> T${n}`).toBe(true);
      }
    }
  });

  it("passes S7-12", () => {
    expect(build.checks.find((c) => c.id === "S7-12")?.pass).toBe(true);
  });
});

describe("S7-12", () => {
  it("fails when an analysis has lost its table number", () => {
    // A plan that passes, with one number taken away, so the missing number is
    // the only thing that can fail it.
    const build = buildSap(idaPreg);
    expect(gateB(build).find((c) => c.id === "S7-12")?.pass).toBe(true);

    const row = build.analysis.find((r) => r.unadjusted)!;
    const analysis = build.analysis.map((r) =>
      r === row ? { ...r, unadjusted: { ...r.unadjusted!, table: "" } } : r,
    );
    const result = gateB({ ...build, analysis }).find((c) => c.id === "S7-12");
    expect(result?.pass).toBe(false);
    expect(result?.failing.join(" ")).toContain(row.objective);
  });

  it("does not ask an exploratory model for a fit table", () => {
    // Appendix B gives fit tables to primary and secondary models only, so an
    // empty fit number is the rule, not a gap.
    const build = buildSap(idaPreg);
    const exploratory = build.analysis.filter(
      (r) => r.adjusted && r.objective.startsWith("E"),
    );
    expect(exploratory.length).toBeGreaterThan(0);
    expect(exploratory.every((r) => r.adjusted!.fit_table === "")).toBe(true);
    expect(gateB(build).find((c) => c.id === "S7-12")?.pass).toBe(true);
  });
});

describe("table kinds no fixture draws", () => {
  const numbered = (facts: FactsSheet, objective: string) => {
    const row = buildSap(facts).analysis.find((r) => r.objective === objective)!;
    return [row.unadjusted?.table ?? null, row.adjusted?.table ?? null];
  };

  it("numbers the distribution table of an ordered outcome", () => {
    const ordinal = { ...idaPreg, primary: { ...idaPreg.primary, type: "ordinal" as const } };
    const [unadjusted] = numbered(ordinal, "P1a");
    expect(unadjusted).toBeTruthy();
  });

  it("numbers both halves of a prediction model from the one table", () => {
    // P1b, the trajectory, gets no table of its own in a prediction study: the
    // template draws one model per outcome. S7-12 reports that rather than
    // hiding it, and it is left for a decision about what that table is.
    const prediction = { ...idaPreg, question_type: "prediction" as const };
    const [unadjusted, adjusted] = numbered(prediction, "P1a");
    expect(unadjusted).toBeTruthy();
    expect(adjusted).toBe(unadjusted);
  });
});
