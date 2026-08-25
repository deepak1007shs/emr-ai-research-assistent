import { describe, expect, it } from "vitest";
import { validateSap } from "./validate.ts";
import type { SapSpec } from "./types.ts";

const outcome = (what: string) => ({
  what,
  how: "the surgeon's record",
  instrument: "study proforma, item 27",
  when: "the index operation",
  units: "Yes / No",
  domain: "clinical" as const,
});

const clean = (): SapSpec => ({
  title: "A study",
  design: "prospective observational cohort",
  guideline: "STROBE",
  aim: "To estimate the conversion rate and identify associated factors.",
  sample_size: 125,
  expected_events: 100,
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion of operations are converted?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
  ],
  variables: [
    { name: "Conversion", data_type: "binary", unit_coding: "Yes / No", role: "outcome" },
    { name: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    {
      name: "Operative duration", data_type: "continuous", unit_coding: "Minutes", role: "mediator",
      exclusion_reason: "It lies on the path being measured.",
    },
  ],
  analyses: [
    {
      objective_id: "P1", label: "P1 - rate", outcome: outcome("Intraoperative conversion"),
      predictors: "(single-group estimate)", data_type: "binary", comparison: "single_group",
      paired: false, table_ref: "T1",
    },
    {
      objective_id: "S1", label: "S1 - factors", outcome: outcome("Intraoperative conversion"),
      predictors: "Age", data_type: "binary", comparison: "adjusted",
      paired: false, table_ref: "T2",
    },
  ],
});

const codes = (spec: SapSpec) => validateSap(spec).findings.map((f) => f.code);

describe("validateSap", () => {
  it("passes a clean plan", () => {
    const { ok, findings } = validateSap(clean());
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
    expect(ok).toBe(true);
  });

  it("OBJ01 - not exactly one primary objective", () => {
    const s = clean();
    s.objectives[1].tier = "primary";
    expect(codes(s)).toContain("OBJ01");
  });

  it("OBJ03 - a word that cannot be measured survived the rewrite", () => {
    const s = clean();
    s.objectives[0].question = "To study the factors involved in conversion";
    expect(codes(s)).toContain("OBJ03");
  });

  it("OBJ04 - the objective still claims causation", () => {
    const s = clean();
    s.objectives[1].question = "Which factors are leading to conversion?";
    expect(codes(s)).toContain("OBJ04");
  });

  it("MAP01 - an objective with no row in the map", () => {
    const s = clean();
    s.analyses = s.analyses.filter((a) => a.objective_id !== "S1");
    expect(codes(s)).toContain("MAP01");
  });

  it("MAP02 - a row naming an objective that does not exist", () => {
    const s = clean();
    s.analyses[0].objective_id = "P9";
    expect(codes(s)).toContain("MAP02");
  });

  it("OUT01 - an outcome that does not answer all five questions", () => {
    const s = clean();
    s.analyses[0].outcome.instrument = "";
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("OUT01");
    expect(findings.find((f) => f.code === "OUT01")?.message).toContain("instrument");
  });

  it("ADJ01 - a mediator in the predictor list", () => {
    const s = clean();
    s.analyses[1].predictors = "Age, Operative duration";
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("ADJ01");
    expect(findings.find((f) => f.code === "ADJ01")?.message).toContain("removes the effect");
  });

  it("ADJ01 - a collider in the predictor list", () => {
    const s = clean();
    s.variables.push({
      name: "Postoperative complication", data_type: "binary", unit_coding: "Yes / No",
      role: "collider", exclusion_reason: "It is caused by conversion.",
    });
    s.analyses[1].predictors = "Age, Postoperative complication";
    expect(codes(s)).toContain("ADJ01");
  });

  it("ADJ03 - more predictors than the events afford", () => {
    const s = clean();
    s.expected_events = 10;
    s.analyses[1].predictors = "Age, BMI, previous surgery";
    expect(codes(s)).toContain("ADJ03");
  });

  it("TEST01 - no rule covers the row", () => {
    const s = clean();
    s.analyses[0].data_type = "count";
    s.analyses[0].comparison = "agreement";
    expect(codes(s)).toContain("TEST01");
  });

  it("TEST02 - an override with no reason", () => {
    const s = clean();
    s.analyses[0].test_override = "Something unusual";
    expect(codes(s)).toContain("TEST02");
  });

  it("TBL03 - tables not numbered in row order", () => {
    const s = clean();
    s.analyses[1].table_ref = "T7";
    expect(codes(s)).toContain("TBL03");
  });

  it("an error stops the plan; a warning does not", () => {
    const withWarning = clean();
    withWarning.objectives[0].question = "To study the conversion rate";
    expect(validateSap(withWarning).ok).toBe(true);

    const withError = clean();
    withError.analyses[0].outcome.units = "";
    expect(validateSap(withError).ok).toBe(false);
  });
});
