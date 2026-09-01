import { describe, expect, it } from "vitest";
import { validateSap } from "./validate.ts";
import type { SapSpec } from "./types.ts";
import { sapFixture } from "./fixture.ts";
import { outcomeDefinition } from "./types.ts";
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
  // Coherent on purpose: 32 conversions in 400 operations is 8%, which is the
  // "rare" the analysis rows declare, and affords three predictors at ten
  // events each. A plan whose arithmetic disagrees with its own rows is what
  // FRQ01 and ADJ03 exist to catch, so the clean plan must not do it.
  sample_size: 400,
  expected_events: 32,
  objectives: [
    { id: "P1", tier: "primary", question: "What proportion of operations are converted?" },
    { id: "S1", tier: "secondary", question: "Which factors are associated with conversion?" },
  ],
  variables: [
    { id: "var_conversion", label: "Conversion", data_type: "binary", unit_coding: "Yes / No", role: "outcome" },
    // A surgical study owes its patients' baseline fitness, which STU03 asks for.
    { id: "var_asa", label: "ASA physical status grade", data_type: "ordinal", unit_coding: "I / II / III / IV", role: "descriptor" },
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
      objective_ids: ["P1"], label: "P1 - rate", outcome_ids: ["out_conversion"],
      exposure_ids: [], adjust_for_ids: [], data_type: "binary",
      comparison: "single_group", pairing: "none", frequency: "rare", table_ids: ["T1"],
    },
    {
      objective_ids: ["S1"], label: "S1 - factors", outcome_ids: ["out_conversion"],
      exposure_ids: [], adjust_for_ids: ["var_age"], data_type: "binary",
      comparison: "adjusted", pairing: "none", frequency: "rare", table_ids: ["T2"],
    },
  ],
  // Internally consistent with the variables and analyses above: a plan whose
  // sections disagree with each other is what these guards exist to catch, so
  // the baseline they are measured against must not.
  priority_confounder_ids: ["var_age"],
  // Named to match what the rule table chooses for the rows above: both halves
  // of every plan, because that is what the guard checks.
  assumption_checks: [
    {
      test: "Proportion with exact (Clopper-Pearson) 95% CI",
      assumption: "One group, and every patient counted once",
      how_checked: "Design check.",
      if_violated: "Account for the clustering.",
      example: "Each operation contributes one conversion outcome.",
    },
    {
      test: "Proportions with exact 95% CI, and the crude OR",
      assumption: "Every patient counted once in each proportion",
      how_checked: "Design check.",
      if_violated: "Account for the clustering.",
      example: "One operation, one row.",
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
    s.analyses = s.analyses.filter((a) => !a.objective_ids.includes("S1"));
    expect(codes(s)).toContain("MAP01");
  });

  it("REF05 - a predictor that is not a declared variable", () => {
    const s = clean();
    s.analyses[1].adjust_for_ids = ["var_does_not_exist"];
    expect(codes(s)).toContain("REF05");
  });

  it("REF03 - two variables sharing a label, so one concept has two identities", () => {
    const s = clean();
    s.variables[1].label = "Conversion";
    expect(codes(s)).toContain("REF03");
  });

  it("MAP02 - a row naming an objective that does not exist", () => {
    const s = clean();
    s.analyses[0].objective_ids = ["P9"];
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
    s.analyses[1].adjust_for_ids = ["var_age", "var_duration"];
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
    s.analyses[1].adjust_for_ids = ["var_age", "var_complication"];
    expect(codes(s)).toContain("ADJ01");
  });

  it("ADJ03 - more predictors than the events afford", () => {
    const s = clean();
    s.expected_events = 10;
    s.variables.push(
      { id: "var_bmi", label: "BMI", data_type: "continuous", unit_coding: "kg/m2", role: "confounder" },
      { id: "var_prev", label: "Previous surgery", data_type: "binary", unit_coding: "Yes / No", role: "confounder" },
    );
    s.analyses[1].adjust_for_ids = ["var_age", "var_bmi", "var_prev"];
    expect(codes(s)).toContain("ADJ03");
  });

  it("ADJ03 - counts every adjusted model, not only the first", () => {
    const s = clean();
    s.variables.push(
      { id: "var_bmi", label: "BMI", data_type: "continuous", unit_coding: "kg/m2", role: "confounder" },
      { id: "var_prev", label: "Previous surgery", data_type: "binary", unit_coding: "Yes / No", role: "confounder" },
    );
    // The first adjusted row stays within its budget; a later one does not.
    s.analyses.push({
      ...structuredClone(s.analyses[1]),
      objective_ids: ["S1"],
      label: "S1 - a second model",
      adjust_for_ids: ["var_age", "var_bmi", "var_prev"],
      table_ids: ["T3"],
    });
    s.expected_events = 10;
    const found = validateSap(s).findings.filter((f) => f.code === "ADJ03");
    expect(found.length, JSON.stringify(found)).toBeGreaterThan(0);
    expect(found.some((f) => f.message.includes("S1 - a second model") || f.message.includes("S1"))).toBe(true);
  });

  it("ADJ05 - an adjusted model with no expected event count to check it against", () => {
    const s = clean();
    delete s.expected_events;
    expect(codes(s)).toContain("ADJ05");
  });

  it("FRQ01 - the row and the sample size calculation disagree", () => {
    const s = clean();
    s.expected_events = 200; // 200 in 400 is half, which is not rare
    const found = validateSap(s).findings.find((f) => f.code === "FRQ01");
    expect(found?.message).toContain("50%");
    expect(found?.severity).toBe("WARN");
  });

  it("FRQ02 - nothing says how common the event is, and nothing can work it out", () => {
    const s = clean();
    delete s.expected_events;
    delete s.sample_size;
    for (const a of s.analyses) a.frequency = "unknown";
    expect(codes(s)).toContain("FRQ02");
  });

  it("OUT03 - an outcome no analysis reports", () => {
    const s = clean();
    s.outcomes.push({
      id: "out_stay",
      what: "Postoperative length of stay",
      how: "from the case record",
      instrument: "proforma",
      when: "discharge",
      units: "Whole days",
      domain: "clinical",
      source_variable_ids: [],
    });
    const found = validateSap(s).findings.find((f) => f.code === "OUT03");
    expect(found?.message).toContain("collected and never used");
  });

  it("STU01 - the design is written out but never classified", () => {
    const s = clean();
    delete (s as { design_family?: unknown }).design_family;
    expect(codes(s)).toContain("STU01");
  });

  it("STU02 - the prose and the classification disagree", () => {
    const s = clean();
    s.design = "a matched case-control study of conversion";
    s.design_family = "cohort";
    const found = validateSap(s).findings.find((f) => f.code === "STU02");
    expect(found?.message).toContain("case control");
  });

  it("TEST03 - the analysis ignores that the same patient was measured again", () => {
    const s = clean();
    s.analyses[1].pairing = "repeated";
    // An override is the only way past the rule table, and it must not be a way
    // past this: the table can have a gap, and this is what notices.
    s.analyses[1].test_override = "Independent t-test on each care phase";
    s.analyses[1].override_reason = "Planted for the test.";
    const found = validateSap(s).findings.find((f) => f.code === "TEST03");
    expect(found?.message).toContain("as though it came from a different patient");
    expect(found?.severity).toBe("ERROR");
  });

  it("TEST03 - and is satisfied by a mixed model", () => {
    const s = clean();
    s.analyses[1].pairing = "repeated";
    expect(codes(s)).not.toContain("TEST03");
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

  it("TBL01 - a row whose results have nowhere to go", () => {
    const s = clean();
    s.analyses[1].table_ids = [];
    const findings = validateSap(s).findings;
    expect(findings.map((f) => f.code)).toContain("TBL01");
    expect(findings.find((f) => f.code === "TBL01")?.message).toContain("nowhere to go");
  });

  it("MAP02 - a row that answers no objective at all", () => {
    const s = clean();
    s.analyses[0].objective_ids = [];
    expect(codes(s)).toContain("MAP02");
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
    s.analyses[0].outcome_ids = [s.variables[0].id];
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

describe("outcomeDefinition", () => {
  it("joins the five fragments into sentences, not into a stutter", () => {
    const said = outcomeDefinition({
      id: "out_x",
      what: "Intraoperative conversion",
      how: "the surgeon's decision to abandon TAPP dissection",
      instrument: "study proforma, item 27",
      when: "the index operation",
      units: "proportion (%) with 95% CI",
      domain: "clinical",
      source_variable_ids: [],
    });

    expect(said).toBe(
      "The surgeon's decision to abandon TAPP dissection. Recorded from study proforma, item 27, at the index operation. Reported in proportion (%) with 95% CI.",
    );
    // No lowercase word left stranded after a full stop.
    expect(said).not.toMatch(/\.\s+[a-z]/);
  });

  it("says nothing when the outcome answers nothing", () => {
    expect(
      outcomeDefinition({
        id: "out_x", what: "x", how: "", instrument: "", when: "", units: "",
        domain: "clinical", source_variable_ids: [],
      }),
    ).toBe("");
  });
});
