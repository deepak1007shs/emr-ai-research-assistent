import { describe, expect, it } from "vitest";
import { groupFindings, severityOf, tableNumberIn } from "./findings.ts";
import type { Finding } from "../sap/validate.ts";

/**
 * Twelve problems in a flat list is a wall. These hold the arrangement that
 * turns it into three things to decide.
 */

const f = (code: string, severity: Finding["severity"], message: string): Finding => ({
  code,
  severity,
  message,
});

describe("severityOf", () => {
  it("calls an error something that must be fixed", () => {
    expect(severityOf(f("TBL16", "ERROR", "x"))).toBe("Must fix");
    expect(severityOf(f("TBL18", "WARN", "x"))).toBe("Should fix");
  });
});

describe("tableNumberIn", () => {
  it("finds the table a finding is about", () => {
    expect(tableNumberIn("Table 4 reports the wrong outcome.")).toBe(4);
    expect(tableNumberIn("S1 is reported by both Table 12 and Table 5.")).toBe(12);
  });

  it("returns nothing when a finding names no table", () => {
    // Then the card does not link, rather than linking somewhere wrong.
    expect(tableNumberIn("No missing-data method is stated.")).toBeNull();
  });
});

describe("groupFindings", () => {
  it("gathers a rule's findings under the rule", () => {
    const groups = groupFindings([
      f("TBL19", "ERROR", "S1 is reported by both Table 4 and Table 5."),
      f("TBL19", "ERROR", "S2 is reported by both Table 7 and Table 8."),
      f("TBL04", "WARN", "Table 3 does not carry its denominator."),
    ]);

    expect(groups.map((g) => g.code)).toEqual(["TBL19", "TBL04"]);
    expect(groups[0].issues).toHaveLength(2);
    expect(groups[0].issues[0].tableNumber).toBe(4);
  });

  it("puts what must be fixed first, then the fullest group", () => {
    const groups = groupFindings([
      f("W1", "WARN", "a"),
      f("E1", "ERROR", "b"),
      f("E2", "ERROR", "c"),
      f("E2", "ERROR", "d"),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["E2", "E1", "W1"]);
  });

  it("titles a group by what its findings share", () => {
    const groups = groupFindings([
      f("TBL08", "WARN", "Table 1 does not carry its denominator."),
      f("TBL08", "WARN", "Table 2 does not carry its denominator."),
    ]);
    // "Table" then a number, so the shared opening is one word: too little to
    // describe anything, and the first message is used instead.
    expect(groups[0].title).toContain("denominator");
  });

  it("uses a shared opening when there is a real one", () => {
    const groups = groupFindings([
      f("REF05", "ERROR", "The analysis plan adjusts for var_age, which is not declared."),
      f("REF05", "ERROR", "The analysis plan adjusts for var_bmi, which is not declared."),
    ]);
    expect(groups[0].title).toBe("The analysis plan adjusts for");
  });

  it("keeps a lone finding's whole message as the title", () => {
    const groups = groupFindings([f("MAP08", "ERROR", "Interim analyses are not mentioned.")]);
    expect(groups[0].title).toBe("Interim analyses are not mentioned.");
  });

  it("says nothing about nothing", () => {
    expect(groupFindings([])).toEqual([]);
  });
});
