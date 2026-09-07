import { describe, expect, it } from "vitest";
import { missingFindings } from "./remap.ts";
import type { SapRegistry } from "../sap/types.ts";

/**
 * Which variables the data does not hold is a set difference, so code decides
 * it. A model asked for one will sometimes get it wrong, and getting it wrong
 * here means telling an investigator their study is fine when it is not.
 */
const plan = (): SapRegistry => ({
  title: "A study",
  objectives: [],
  variables: [
    { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "years", role: "descriptor" },
    { id: "var_asa", label: "ASA grade", data_type: "ordinal", unit_coding: "I/II", role: "confounder" },
  ],
  outcomes: [],
  analyses: [],
});

describe("variables the data does not hold", () => {
  it("names the ones with no column", () => {
    const found = missingFindings(plan(), { var_age: "age_yrs" });
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("ASA grade");
    expect(found[0].code).toBe("DATA10");
  });

  it("says why it matters rather than only that it happened", () => {
    const [finding] = missingFindings(plan(), {});
    expect(finding.message).toMatch(/unrunnable|until/i);
  });

  it("finds nothing when every variable has a column", () => {
    expect(missingFindings(plan(), { var_age: "age_yrs", var_asa: "asa" })).toEqual([]);
  });

  it("is a warning, not an error", () => {
    // The data may simply not have been collected yet. Only the investigator
    // knows whether that is a hole or a stage of the study.
    expect(missingFindings(plan(), {})[0].severity).toBe("WARN");
  });
});
