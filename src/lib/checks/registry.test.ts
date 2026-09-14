import { describe, expect, it } from "vitest";
import { CHECKS, checkById, checksAt, checksAtGate } from "./registry.ts";

/**
 * The registry against the written process.
 *
 * The point of a list of checks is that nothing falls off it. The ids below are
 * transcribed from the process document's own table, so a check removed in code
 * fails here rather than passing in silence - which is the way a check list
 * actually decays.
 */
const FROM_THE_DOCUMENT = [
  "G-A1", "G-A2", "G-A3", "G-A4",
  "S1-1", "S1-2", "S1-3", "S1-4", "S1-5",
  "S2-1", "S2-2", "S2-3", "S2-4", "S2-5",
  "S3-1",
  "S4-1", "S4-2", "S4-3", "S4-4", "S4-5", "S4-6", "S4-7", "S4-8",
  "S5-1", "S5-2", "S5-3",
  "S6-1", "S6-2", "S6-3", "S6-4", "S6-5", "S6-6",
  "S7-1", "S7-2", "S7-3", "S7-4", "S7-5", "S7-6",
  "S7-8", "S7-9", "S7-10", "S7-11", "S7-12",
  "CRF-1", "CRF-2", "CRF-3",
  "C7-1", "C7-2", "C7-3", "C7-4",
];

describe("the check registry", () => {
  it("holds every check the process names, and no others", () => {
    expect([...CHECKS.map((c) => c.id)].sort()).toEqual([...FROM_THE_DOCUMENT].sort());
  });

  it("gives each check one id", () => {
    const ids = CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no S7-7, because that check runs after the form exists", () => {
    // The process numbers the CRF check 7 in the Step 7 list and then runs it
    // after Step 8. It is held here as C7-1 to C7-4 rather than as a seventh
    // Step 7 check, so nothing waits for a form that has not been built.
    expect(checkById("S7-7")).toBeUndefined();
    expect(checksAtGate("C")).toHaveLength(4);
  });

  it("states what every check does as a sentence, which its failure will quote", () => {
    // Not a length: a rule is as long as the rule is, and "Every value cell is
    // blank." is the whole of S6-1. What matters is that it reads as a
    // statement, because the failure message is built from it.
    for (const check of CHECKS) {
      expect(check.rule[0], check.id).toBe(check.rule[0].toUpperCase());
      expect(check.rule.endsWith("."), check.id).toBe(true);
    }
  });

  it("blocks at every gate, because a gate that warns is not a gate", () => {
    for (const gate of ["A", "B", "C"] as const) {
      const checks = checksAtGate(gate);
      expect(checks.length, gate).toBeGreaterThan(0);
      for (const check of checks) expect(check.type, check.id).toBe("block");
    }
  });

  it("warns only where the process says to warn", () => {
    // Two from the process, both at Step 4, plus the terminology check at Step
    // 8. S4-6 is the one addition, and it warns for the same reason the other
    // two do: it names a decision the investigator has to take, not a fault in
    // the plan. Everything else stops the next step.
    expect(CHECKS.filter((c) => c.type === "warn").map((c) => c.id)).toEqual([
      "S4-4",
      "S4-5",
      "S4-6",
      "S4-8",
      "CRF-2",
    ]);
  });

  it("finds the checks of a step", () => {
    expect(checksAt("step2").map((c) => c.id)).toEqual([
      "S2-1", "S2-2", "S2-3", "S2-4", "S2-5",
    ]);
    expect(checksAt("stage1").every((c) => c.gate === "A")).toBe(true);
  });
});
