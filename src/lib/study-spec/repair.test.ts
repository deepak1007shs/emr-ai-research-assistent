import { describe, expect, it } from "vitest";
import { deterministicRepairs, stageFor, stagesNeeded } from "./repair.ts";
import type { StudySpec } from "./types.ts";
import exampleJson from "./example_study_spec.json";

const example = () => structuredClone(exampleJson) as unknown as StudySpec;

describe("stageFor", () => {
  it("routes each finding to the stage that owns it", () => {
    expect(stageFor("STU02")).toBe("stage1");
    expect(stageFor("ELG02")).toBe("stage1");
    expect(stageFor("OBJ01")).toBe("stage1b");
    expect(stageFor("OUT09")).toBe("stage1b");
    expect(stageFor("SS03")).toBe("stage1c");
    expect(stageFor("VAR05")).toBe("stage2");
    expect(stageFor("CRF08")).toBe("stage2");
    expect(stageFor("TEST04")).toBe("stage3");
    expect(stageFor("TBL07")).toBe("stage3");
  });

  it("asks for only the stages the errors actually touch", () => {
    const findings = [
      { code: "TEST04", severity: "ERROR" as const, path: "", message: "" },
      { code: "TBL09", severity: "ERROR" as const, path: "", message: "" },
      { code: "VAR15", severity: "WARN" as const, path: "", message: "" },
    ];
    // One stage, not five, and the warning does not drag a stage in.
    expect(stagesNeeded(findings)).toEqual(["stage3"]);
  });

  it("keeps stages in pipeline order when several are needed", () => {
    const findings = [
      { code: "TEST04", severity: "ERROR" as const, path: "", message: "" },
      { code: "OBJ01", severity: "ERROR" as const, path: "", message: "" },
    ];
    expect(stagesNeeded(findings)).toEqual(["stage1b", "stage3"]);
  });
});

describe("deterministicRepairs", () => {
  it("leaves a clean specification alone", () => {
    const { applied } = deterministicRepairs(example());
    expect(applied).toEqual([]);
  });

  it("renumbers tables that are not contiguous", () => {
    const spec = example();
    spec.tables[0].number = 7;
    const { spec: fixed, applied } = deterministicRepairs(spec);
    expect(fixed.tables.map((t) => t.number)).toEqual([1, 2, 3, 4, 5]);
    expect(applied.join(" ")).toContain("renumbered the tables");
  });

  it("resequences two fields sharing a position", () => {
    const spec = example();
    const inSection = spec.variables.filter((v) => v.crf?.section_id === "sec_screening");
    inSection[0].crf!.order = inSection[1].crf!.order;
    const { spec: fixed, applied } = deterministicRepairs(spec);
    const orders = fixed.variables
      .filter((v) => v.crf?.section_id === "sec_screening")
      .map((v) => v.crf!.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(applied.join(" ")).toContain("resequenced");
  });

  it("adds the screening log a flow-diagram guideline needs", () => {
    const spec = example();
    spec.variables = spec.variables.filter((v) => v.id !== "var_screening_outcome");
    const { spec: fixed, applied } = deterministicRepairs(spec);
    expect(fixed.variables.some((v) => /screen/i.test(v.label))).toBe(true);
    expect(applied.join(" ")).toContain("screening-log");
  });

  it("canonicalises an effect measure written as prose", () => {
    const spec = example();
    spec.analyses[0].effect_measure = "Odds ratio (OR) with 95% CI";
    const { spec: fixed } = deterministicRepairs(spec);
    expect(fixed.analyses[0].effect_measure).toBe("odds_ratio");
  });

  it("does not mutate the specification it was given", () => {
    const spec = example();
    spec.tables[0].number = 9;
    deterministicRepairs(spec);
    expect(spec.tables[0].number).toBe(9);
  });
});
