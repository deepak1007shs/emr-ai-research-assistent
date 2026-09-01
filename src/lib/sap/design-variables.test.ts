import { describe, expect, it } from "vitest";
import { loadVariableRules, unmetRequirements } from "./design-variables.ts";
import { sapFixture } from "./fixture.ts";
import type { SapSpec } from "./types.ts";

/**
 * What a study must record, whatever its protocol said.
 *
 * A rule that fires on every study is a rule people learn to scroll past, so
 * these tests are as much about silence as about findings: residual disease
 * must be demanded of cancer surgery and of nothing else.
 */

/**
 * A study of a given kind, with nothing of another kind left in it.
 *
 * The words the rules read are the title, the design, the aim and the assembled
 * question, so all four are replaced together. Spreading the surgical fixture
 * and overriding three of them left the fourth still talking about hernia
 * repair, and a questionnaire study was asked for its patients' ASA grades.
 */
const study = (over: Partial<SapSpec> = {}): SapSpec =>
  ({
    ...structuredClone(sapFixture),
    title: "A study",
    design: "a study",
    aim: "To find something out",
    picot: { ...sapFixture.picot, assembled_question: "A question about something" },
    ...over,
  }) as SapSpec;

const names = (spec: SapSpec) => unmetRequirements(spec).map((r) => r.requires);

const surgical = (over: Partial<SapSpec> = {}) =>
  study({
    title: "Cytoreductive surgery for advanced ovarian cancer",
    design: "parallel-group randomised trial",
    design_family: "randomised_trial",
    aim: "To compare complications after two extents of tumour resection",
    variables: [
      { id: "var_arm", label: "Trial arm", data_type: "binary", unit_coding: "A / B", role: "predictor" },
    ],
    outcomes: [],
    analyses: [],
    ...over,
  });

describe("what the design requires", () => {
  it("reads, and every rule says what is lost without it", () => {
    const rules = loadVariableRules();
    expect(rules.length).toBeGreaterThan(20);
    for (const r of rules) {
      expect(r.requires, JSON.stringify(r)).toBeTruthy();
      expect(r.match.length, `${r.requires} can never be matched`).toBeGreaterThan(0);
      expect(r.why.length, `${r.requires} does not say what is lost`).toBeGreaterThan(40);
    }
  });

  it("asks cancer surgery for the residual disease it left behind", () => {
    expect(names(surgical())).toContain("Residual disease after resection");
  });

  it("and asks a questionnaire study for none of it", () => {
    const asked = names(
      study({
        title: "Validation of a quality of life questionnaire",
        design: "questionnaire validation study",
        design_family: "questionnaire_validation",
        aim: "To assess the internal consistency of a new instrument",
        variables: [],
        outcomes: [],
        analyses: [],
      }),
    );
    expect(asked).not.toContain("Residual disease after resection");
    expect(asked).not.toContain("ASA physical status grade");
    expect(asked).toContain("The individual item responses");
  });

  it("counts a requirement met however the plan words it", () => {
    // One variable under three names: the question is whether the concept is
    // there, not whether it was given the name this file happens to use.
    for (const label of ["Completeness of cytoreduction", "R status", "Residual disease"]) {
      const spec = surgical();
      spec.variables.push({
        id: "var_x", label, data_type: "nominal", unit_coding: "R0 / R1 / R2", role: "confounder",
      });
      expect(names(spec), label).not.toContain("Residual disease after resection");
    }
  });

  it("finds it in the coding where the label does not say it", () => {
    const spec = surgical();
    spec.variables.push({
      id: "var_x", label: "Cytoreduction outcome", data_type: "nominal",
      unit_coding: "R0 / R1 / R2", role: "confounder",
    });
    expect(names(spec)).not.toContain("Residual disease after resection");
  });

  it("does not read a word out of the middle of another one", () => {
    // "harm" sits inside "pharmacologically", and a plain substring test once
    // concluded from it that a trial had recorded its adverse events.
    const spec = surgical();
    spec.outcomes = [
      {
        id: "out_x", what: "Ductus arteriosus", how: "treated pharmacologically or surgically",
        instrument: "record", when: "day 3", units: "Yes / No",
        domain: "clinical", source_variable_ids: [],
      },
    ];
    expect(names(spec)).toContain("Adverse events by arm");
  });

  it("holds every randomised design to what a trial owes, not the parallel-group one alone", () => {
    for (const family of ["randomised_trial", "non_inferiority_trial", "cluster_trial"] as const) {
      expect(names(surgical({ design_family: family })), family).toContain("Adverse events by arm");
    }
    expect(names(study({ design_family: "cohort", variables: [], outcomes: [], analyses: [] })))
      .not.toContain("Adverse events by arm");
  });

  it("asks a cohort for its person-time and who it lost", () => {
    const asked = names(
      study({
        design_family: "cohort",
        aim: "To measure the incidence of the outcome over twelve months of follow-up",
        variables: [], outcomes: [], analyses: [],
      }),
    );
    expect(asked).toContain("Length of follow-up per participant");
    expect(asked).toContain("Loss to follow-up");
  });

  it("asks a diagnostic study what it was accurate against", () => {
    expect(names(study({ design_family: "diagnostic_accuracy", variables: [], outcomes: [], analyses: [] })))
      .toContain("The reference standard result");
  });

  it("and leaves a cohort alone where nothing is followed over time", () => {
    // A cohort whose outcome is measured at the index operation has no
    // person-time to report, and asking for it would be noise.
    const asked = names(
      study({
        design_family: "cohort",
        aim: "To estimate the proportion converted during the operation",
        variables: [], outcomes: [], analyses: [],
      }),
    );
    expect(asked).not.toContain("Length of follow-up per participant");
  });

  it("asks nothing of a plan that never said what design it is", () => {
    // Everything keyed to a family stays silent; only the `any` rules can fire,
    // and those need the study's own words to match.
    const spec = study({ design_family: undefined, variables: [], outcomes: [], analyses: [] });
    expect(names(spec)).not.toContain("Adverse events by arm");
  });
});
