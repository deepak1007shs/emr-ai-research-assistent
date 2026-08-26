import { describe, expect, it } from "vitest";
import { validateSap } from "./validate.ts";
import type { SapSpec } from "./types.ts";
import { sapFixture } from "./fixture.ts";
import { isLinkable } from "./types.ts";

const outcome = (id: string, what: string) => ({
  id,
  what,
  how: "the surgeon's record",
  instrument: "study proforma, item 27",
  when: "the index operation",
  units: "Yes / No",
  domain: "clinical" as const,
  source_variable_ids: ["var_conversion"],
});

const clean = (): SapSpec => ({
  ...structuredClone(sapFixture),
  title: "A study",
  aim: "To estimate the conversion rate and identify associated factors.",
  sample_size: 125,
  expected_events: 100,
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion of operations are converted?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
  ],
  variables: [
    { id: "var_conversion", label: "Conversion", data_type: "binary", unit_coding: "Yes / No", role: "outcome" },
    { id: "var_age", label: "Age", data_type: "continuous", unit_coding: "Years", role: "confounder" },
    {
      id: "var_duration", label: "Operative duration", data_type: "continuous",
      unit_coding: "Minutes", role: "mediator",
      exclusion_reason: "It lies on the path being measured.",
    },
  ],
  outcomes: [outcome("out_conversion", "Intraoperative conversion")],
  analyses: [
    {
      objective_id: "P1", label: "P1 - rate", outcome_id: "out_conversion",
      predictor_ids: [], data_type: "binary", comparison: "single_group",
      paired: false, table_id: "T1",
    },
    {
      objective_id: "S1", label: "S1 - factors", outcome_id: "out_conversion",
      predictor_ids: ["var_age"], data_type: "binary", comparison: "adjusted",
      paired: false, table_id: "T2",
    },
  ],
  // Internally consistent with the variables and analyses above: a plan whose
  // sections disagree with each other is what these guards exist to catch, so
  // the baseline they are measured against must not.
  priority_confounder_ids: ["var_age"],
  assumption_checks: [
    {
      test: "Proportion with 95% CI (Clopper-Pearson exact)",
      assumption: "One group, and every patient counted once",
      how_checked: "Design check.",
      if_violated: "Account for the clustering.",
      example: "Each operation contributes one conversion outcome.",
    },
    {
      test: "Multivariable binary logistic regression, adjusted OR with 95% CI",
      assumption: "At least ten outcome events per predictor",
      how_checked: "Count conversions and divide by the model terms.",
      if_violated: "Reduce the predictors, or use Firth regression.",
      example: "At 100 expected events the model affords ten predictors.",
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

  it("REF05 - a predictor that is not a declared variable", () => {
    const s = clean();
    s.analyses[1].predictor_ids = ["var_does_not_exist"];
    expect(codes(s)).toContain("REF05");
  });

  it("REF03 - two variables sharing a label, so one concept has two identities", () => {
    const s = clean();
    s.variables[1].label = "Conversion";
    expect(codes(s)).toContain("REF03");
  });

  it("MAP02 - a row naming an objective that does not exist", () => {
    const s = clean();
    s.analyses[0].objective_id = "P9";
    expect(codes(s)).toContain("MAP02");
  });

  it("OUT01 - an outcome that does not answer all five questions", () => {
    const s = clean();
    s.outcomes[0].instrument = "";
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("OUT01");
    expect(findings.find((f) => f.code === "OUT01")?.message).toContain("instrument");
  });

  it("ADJ01 - a mediator in the predictor list, caught by id not spelling", () => {
    const s = clean();
    s.analyses[1].predictor_ids = ["var_age", "var_duration"];
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("ADJ01");
    expect(findings.find((f) => f.code === "ADJ01")?.message).toContain("removes the effect");
  });

  it("ADJ01 - a collider in the predictor list", () => {
    const s = clean();
    s.variables.push({
      id: "var_complication", label: "Postoperative complication", data_type: "binary",
      unit_coding: "Yes / No", role: "collider", exclusion_reason: "It is caused by conversion.",
    });
    s.analyses[1].predictor_ids = ["var_age", "var_complication"];
    expect(codes(s)).toContain("ADJ01");
  });

  it("ADJ03 - more predictors than the events afford", () => {
    const s = clean();
    s.expected_events = 10;
    s.variables.push(
      { id: "var_bmi", label: "BMI", data_type: "continuous", unit_coding: "kg/m2", role: "confounder" },
      { id: "var_prev", label: "Previous surgery", data_type: "binary", unit_coding: "Yes / No", role: "confounder" },
    );
    s.analyses[1].predictor_ids = ["var_age", "var_bmi", "var_prev"];
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
    s.analyses[1].table_id = "T7";
    expect(codes(s)).toContain("TBL03");
  });

  it("an error stops the plan; a warning does not", () => {
    const withWarning = clean();
    withWarning.objectives[0].question = "To study the conversion rate";
    expect(validateSap(withWarning).ok).toBe(true);

    const withError = clean();
    withError.outcomes[0].units = "";
    expect(validateSap(withError).ok).toBe(false);
  });
});

describe("one id names one thing", () => {
  it("REF11 - a variable and an outcome sharing an id", () => {
    const s = clean();
    s.outcomes[0].id = s.variables[0].id;
    s.analyses[0].outcome_id = s.variables[0].id;
    expect(codes(s)).toContain("REF11");
  });

  it("REF12 - two outcomes measuring the same thing", () => {
    const s = clean();
    s.outcomes.push({ ...s.outcomes[0], id: "out_copy" });
    expect(codes(s)).toContain("REF12");
  });
});

describe("isLinkable", () => {
  it("accepts a plan whose variables and outcomes carry ids", () => {
    expect(isLinkable(clean())).toBe(true);
  });

  it("refuses a plan built before the documents were linked", () => {
    const s = clean() as unknown as { variables: { id?: string }[] };
    delete s.variables[0].id;
    expect(isLinkable(s as never)).toBe(false);
  });

  it("refuses nothing at all", () => {
    expect(isLinkable(null)).toBe(false);
  });
});

describe("the route map is complete", () => {
  it("MAP04 - an estimand with no endpoint", () => {
    const s = clean();
    s.estimand.endpoint = "";
    expect(codes(s)).toContain("MAP04");
  });

  it("MAP06 - no missing-data method, which is the one chosen after the fact", () => {
    const s = clean();
    s.rules.missing_data = "  ";
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("MAP06");
    expect(findings.find((f) => f.code === "MAP06")?.message).toContain("not a method");
  });

  it("MAP08 - interim analyses unmentioned, which is not the same as none", () => {
    const s = clean();
    s.interim = "";
    expect(codes(s)).toContain("MAP08");
  });

  it("MAP11 - nobody has said who is analysed", () => {
    const s = clean();
    s.populations = [];
    expect(codes(s)).toContain("MAP11");
  });

  it("MAP14 - a test the plan chooses whose assumptions are never stated", () => {
    const s = clean();
    s.assumption_checks = [];
    expect(codes(s)).toContain("MAP14");
  });

  it("MAP15 - assumptions for a test this study does not run", () => {
    const s = clean();
    s.assumption_checks = [
      {
        test: "Cox proportional-hazards regression",
        assumption: "Proportional hazards",
        how_checked: "Schoenfeld residuals",
        if_violated: "Time-varying covariate",
        example: "Not applicable to this study.",
      },
    ];
    expect(codes(s)).toContain("MAP15");
  });

  it("MAP17 - a mediator named as a priority confounder", () => {
    const s = clean();
    const mediator = s.variables.find((v) => v.role === "mediator")!;
    s.priority_confounder_ids = [mediator.id];
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("MAP17");
    expect(findings.find((f) => f.code === "MAP17")?.message).toContain("remove part of the effect");
  });

  it("passes the fixture, which is a complete route map", () => {
    const findings = validateSap(clean()).findings.filter((f) => f.severity === "ERROR");
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
  });
});
