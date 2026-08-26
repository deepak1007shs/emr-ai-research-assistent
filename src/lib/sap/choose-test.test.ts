import { describe, expect, it } from "vitest";
import { chooseTest, degreesOfFreedomNote, loadRules } from "./choose-test.ts";
import type { AnalysisRow } from "./types.ts";

/**
 * The application plans the analysis, not the model.
 *
 * Given the same study these rules must give the same plan every time, and a
 * plan is more than a test name: the unadjusted estimate, the model that holds
 * confounders constant, and what must not be done. The last of those is what
 * stops the commonest errors, so it is tested as hard as the first.
 */

const row = (over: Partial<AnalysisRow>): AnalysisRow => ({
  objective_ids: ["P1"],
  label: "P1",
  outcome_ids: ["out_x"],
  exposure_ids: [],
  adjust_for_ids: [],
  data_type: "binary",
  comparison: "single_group",
  pairing: "none",
  table_ids: ["T1"],
  ...over,
});

describe("the rule table", () => {
  it("reads, and every row returns a plan rather than a test name", () => {
    const rules = loadRules();
    expect(rules.length).toBeGreaterThan(30);
    for (const rule of rules) {
      expect(rule.unadjusted, JSON.stringify(rule)).toBeTruthy();
      expect(rule.why, JSON.stringify(rule)).toBeTruthy();
    }
  });

  it("covers every data type the plan can declare", () => {
    const rules = loadRules();
    for (const type of ["binary", "continuous", "ordinal", "nominal", "count", "time_to_event"]) {
      expect(rules.some((r) => r.data_type === type), type).toBe(true);
    }
  });
});

describe("a common binary outcome", () => {
  it("is reported as a risk ratio and a risk difference", () => {
    const plan = chooseTest(
      row({ comparison: "two_groups", frequency: "common", exposure_ids: ["var_arm"] }),
    )!;
    expect(plan.unadjusted).toContain("Risk difference");
    expect(plan.unadjusted).toContain("risk ratio");
    expect(plan.adjusted).toContain("Log-binomial");
  });

  it("and the odds ratio is ruled out, with the reason", () => {
    // The commonest error in a thesis: an OR read as a risk when the outcome
    // is common overstates the effect.
    const plan = chooseTest(
      row({ comparison: "two_groups", frequency: "common", exposure_ids: ["var_arm"] }),
    )!;
    expect(plan.avoid).toContain("odds ratio");
    expect(plan.avoid).toContain("overstates");
  });
});

describe("a rare binary outcome", () => {
  it("keeps the odds ratio, and says a zero cell needs a correction", () => {
    const plan = chooseTest(
      row({ comparison: "two_groups", frequency: "rare", exposure_ids: ["var_arm"] }),
    )!;
    expect(plan.unadjusted).toContain("odds ratio");
    expect(plan.unadjusted).toContain("Haldane-Anscombe");
    expect(plan.adjusted).toContain("Firth");
  });
});

describe("repeated measurements", () => {
  it("get a mixed model, and rule out repeated-measures ANOVA", () => {
    const plan = chooseTest(
      row({ data_type: "continuous", comparison: "two_groups", pairing: "repeated" }),
    )!;
    expect(plan.adjusted).toContain("mixed-effects");
    expect(plan.avoid).toContain("Repeated-measures ANOVA");
    // The reason matters: it is why the model is preferred, not a style choice.
    expect(plan.avoid).toContain("missing time point");
  });
});

describe("the plans that have no adjusted half", () => {
  it("a single proportion is estimated, never modelled", () => {
    const plan = chooseTest(row({ comparison: "single_group" }))!;
    expect(plan.unadjusted).toContain("Clopper-Pearson");
    expect(plan.adjusted).toBeNull();
  });

  it("agreement is measured, not adjusted", () => {
    const plan = chooseTest(row({ data_type: "continuous", comparison: "agreement" }))!;
    expect(plan.unadjusted).toContain("Bland-Altman");
    expect(plan.adjusted).toBeNull();
    expect(plan.avoid).toContain("correlation");
  });
});

describe("skew and pairing", () => {
  it("skewed continuous data get a rank method, not a mean", () => {
    const plan = chooseTest(
      row({ data_type: "continuous", comparison: "two_groups", skewed: true }),
    )!;
    expect(plan.unadjusted).toContain("Hodges-Lehmann");
    expect(plan.avoid).toContain("mean difference");
  });

  it("paired data get a paired method, and an unpaired one is ruled out", () => {
    const plan = chooseTest(
      row({ data_type: "continuous", comparison: "two_groups", pairing: "paired" }),
    )!;
    expect(plan.unadjusted).toContain("Paired t-test");
    expect(plan.avoid).toContain("unpaired");
  });
});

describe("time to event", () => {
  it("names Cox and requires the assumption to be checked", () => {
    const plan = chooseTest(
      row({ data_type: "time_to_event", comparison: "association" }),
    )!;
    expect(plan.adjusted).toContain("Cox");
    expect(plan.adjusted).toContain("Schoenfeld");
  });

  it("rules out Kaplan-Meier where a competing event prevents the outcome", () => {
    const plan = chooseTest(row({ data_type: "time_to_event", comparison: "two_groups" }))!;
    expect(plan.avoid).toContain("competing");
    expect(plan.avoid).toContain("Fine-Gray");
  });
});

describe("when nothing covers a row", () => {
  it("returns null rather than a plausible guess", () => {
    expect(chooseTest(row({ data_type: "count", comparison: "agreement" }))).toBeNull();
  });

  it("an override wins, and carries its reason", () => {
    const plan = chooseTest(
      row({ test_override: "Firth logistic regression", override_reason: "Separation is expected." }),
    )!;
    expect(plan.unadjusted).toBe("Firth logistic regression");
    expect(plan.overridden).toBe(true);
    expect(plan.why).toContain("Separation");
  });
});

describe("degreesOfFreedomNote", () => {
  it("says the model is exploratory when the events do not afford it", () => {
    const { overfits, note } = degreesOfFreedomNote(10, 3);
    expect(overfits).toBe(true);
    expect(note).toContain("exploratory");
  });

  it("and says it is supported when they do", () => {
    const { overfits, note } = degreesOfFreedomNote(100, 3);
    expect(overfits).toBe(false);
    expect(note).toContain("adequately supported");
  });
});
