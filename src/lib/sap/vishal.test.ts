import { describe, expect, it } from "vitest";
import { vishal } from "../facts/fixture-vishal.ts";
import { buildSap } from "./build.ts";

/**
 * The second real study, pinned against the plan a statistician wrote for it.
 *
 * A prospective cohort of patients with extremity vascular trauma, asking which
 * factors are associated with amputation within 30 days and how accurately MESS,
 * GANGA, serum lactate and the duration of ischaemia predict it.
 *
 * The plan this application first built for it estimated eleven proportions,
 * fitted no model, and left thirteen correctly read covariates unused. Every
 * one of its forty-three checks passed. The assertions here are taken from the
 * analysis plan written for the study by hand, and they are the ones no check
 * in this build could make: not "is the document consistent" but "does it
 * answer the question the protocol asks".
 *
 * The table assertions live with the association templates; what is pinned here
 * is Section 1 and the Analysis Map.
 */

const build = buildSap(vishal);
const row = (id: string) => build.analysis.find((r) => r.objective === id)!;
const objective = (id: string) => build.objectives.find((o) => o.id === id)!;
const covariatesOf = (id: string) =>
  (row(id).adjusted?.covariates ?? []).map((c) => c.var);

describe("the primary question is a question about factors", () => {
  it("asks what the title asks", () => {
    // It used to ask "What is the proportion with amputation?", on a protocol
    // titled "factors affecting the rates of amputations".
    const question = objective("P1").question.toLowerCase();
    expect(question).toContain("associated with");
    expect(question).not.toContain("what is the proportion");
    for (const factor of ["ischaemia", "mechanism", "level"]) {
      expect(question, factor).toContain(factor);
    }
  });

  it("carries the three factors as predictors, and holds the confounders constant", () => {
    expect(row("P1").predictors).toEqual([
      "ischemia_duration",
      "mechanism_of_injury",
      "level_of_vascular_injury",
    ]);

    // Age, sex, shock and lactate, and nothing else. The Facts Sheet's own
    // covariate list is global and holds thirteen; applied whole to every
    // objective it fitted ten terms on sixteen events, where the plan written
    // for this study fits four.
    expect(covariatesOf("P1")).toEqual([
      "age",
      "sex",
      "shock_at_presentation",
      "serum_lactate",
    ]);
    const held = covariatesOf("P1");
    // And nothing is both estimated and held constant.
    for (const factor of row("P1").predictors) {
      expect(held, factor).not.toContain(factor);
    }
  });

  it("fits a risk-ratio model, not a proportion and not an odds ratio", () => {
    expect(row("P1").exception).toBeNull();
    expect(row("P1").effect_measure).toMatch(/risk ratio|prevalence ratio/i);
    expect(row("P1").adjusted?.model).toMatch(/log-binomial|modified poisson/i);
    expect(row("P1").adjusted?.fallback).toMatch(/modified poisson|robust/i);
    expect(row("P1").unadjusted?.test).not.toMatch(/wilson/i);
  });

  it("screens each factor by the test that factor's data type owes", () => {
    const screen = row("P1").unadjusted!.test.toLowerCase();
    // A category against a yes-or-no outcome is a chi-square; a duration in
    // hours is a t-test. One row of decision table B could name only one.
    expect(screen).toContain("chi-square");
    expect(screen).toMatch(/t-test|mann-whitney/);
  });

  it("says the model cannot carry every factor at this event count", () => {
    // About sixteen amputations in a hundred and ten patients. The reference
    // caps the adjusted model at two or three factors for the same reason.
    expect(build.todos.join(" ")).toMatch(/events per term|events per covariate/i);
  });
});

describe("the accuracy objective is a ROC analysis", () => {
  const accuracy = () =>
    build.analysis.find((r) =>
      r.unadjusted?.test.toLowerCase().includes("area under the roc curve"),
    );

  it("asks how well the scores identify amputation", () => {
    const asked = build.objectives.find((o) => o.question.toLowerCase().includes("how well"));
    expect(asked, "an objective asking how well the scores identify amputation").toBeDefined();
  });

  it("reports the area under the curve and compares the curves", () => {
    const found = accuracy();
    expect(found, "a row reporting the area under the ROC curve").toBeDefined();
    expect(found!.unadjusted!.test).toMatch(/delong/i);
    expect(found!.predictors).toEqual([
      "mess_total_score",
      "ganga_total_score",
      "serum_lactate",
      "ischemia_duration",
    ]);
  });

  it("never reports a phi coefficient for a continuous score", () => {
    // Four continuous scores against a binary outcome were analysed with the
    // phi coefficient, which is a measure of association between two yes-or-no
    // variables, because the decision tables had no key for the pairing.
    expect(JSON.stringify(build.analysis)).not.toContain("phi coefficient");
  });
});

describe("the other objectives", () => {
  it("analyses the complication grade by amputation status, not as a harm tally", () => {
    const complications = build.analysis.find((r) =>
      r.outcome.includes("complication"),
    )!;
    expect(complications.exception).not.toBe("safety");
    expect(complications.predictors).toContain("amputation");
  });

  it("asks the salvage and revision questions of their four factors", () => {
    // The outcome variable is named from the chain's wording, as every
    // non-diagnostic outcome is: Step 2 derives it from the measure beneath.
    for (const name of ["salvageability", "revision_amputation"]) {
      const found = build.analysis.find((r) => r.outcome.includes(name));
      expect(found, name).toBeDefined();
      expect(found!.predictors, name).toEqual([
        "ischemia_duration",
        "mechanism_of_injury",
        "fasciotomy_done",
        "level_of_vascular_injury",
      ]);
      expect(found!.exception, name).toBeNull();
      expect(found!.adjusted?.model, name).toMatch(/log-binomial|modified poisson/i);
    }
  });

  it("leaves no objective estimating a proportion of nothing", () => {
    const estimating = build.analysis.filter((r) => r.exception === "estimation");
    expect(estimating.map((r) => r.objective)).toEqual([]);
  });
});

describe("the plan as a whole", () => {
  it("builds the same document twice", () => {
    expect(JSON.stringify(buildSap(vishal).analysis)).toBe(
      JSON.stringify(build.analysis),
    );
  });
});
