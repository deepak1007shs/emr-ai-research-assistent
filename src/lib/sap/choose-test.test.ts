import { describe, expect, it } from "vitest";
import type { DesignFamily } from "./types.ts";
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
  it("reads, and every rule returns a plan rather than a test name", () => {
    const rules = loadRules();
    expect(rules.length).toBeGreaterThan(30);
    for (const rule of rules) {
      expect(rule.why, JSON.stringify(rule)).toBeTruthy();
      expect(rule.summary, JSON.stringify(rule)).toBeTruthy();
      // Something must be planned: a test, or a model where the estimate is
      // only meaningful once confounders are held constant.
      const named =
        rule.parametric?.test ||
        rule.nonparametric?.test ||
        rule.parametric?.adjusted ||
        rule.nonparametric?.adjusted;
      expect(named, JSON.stringify(rule)).toBeTruthy();
    }
  });

  it("every rule says what it assumes and how that is checked", () => {
    for (const rule of loadRules()) {
      const all = [...rule.assumptions, ...rule.adjusted_assumptions];
      expect(all.length, `${rule.data_type}/${rule.comparison} assumes nothing`).toBeGreaterThan(0);
      for (const a of all) {
        expect(a.assumption, JSON.stringify(a)).toBeTruthy();
        expect(a.how_checked, JSON.stringify(a)).toBeTruthy();
        expect(a.if_violated, JSON.stringify(a)).toBeTruthy();
      }
    }
  });

  it("a test that prints a p value also names its statistic and its effect size", () => {
    // Table 80 of the house reference: an inferential table carries the test
    // statistic with its degrees of freedom, the p value and an effect size.
    for (const rule of loadRules()) {
      for (const branch of [rule.parametric, rule.nonparametric]) {
        if (!branch?.statistic) continue;
        expect(
          branch.effect,
          `${rule.data_type}/${rule.comparison}: "${branch.test}" prints ${branch.statistic} with no effect size`,
        ).toBeTruthy();
      }
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
    // One minus Kaplan-Meier counts a patient who died of something else as
    // though they could still have the outcome.
    expect(plan.avoid).toContain("cumulative incidence function");
  });

  it("names the competing-risks model by the question, not by the data", () => {
    // The deck's rule and the app's: cause-specific for a question about
    // mechanism, Fine-Gray for a question about a patient's prognosis. They
    // estimate different quantities and are not expected to agree.
    const plan = chooseTest(row({ data_type: "time_to_event", comparison: "two_groups" }))!;
    expect(plan.adjusted).toContain("cause-specific Cox");
    expect(plan.adjusted).toContain("Fine-Gray");
  });

  it("offers a measure that needs no proportional-hazards assumption", () => {
    const plan = chooseTest(row({ data_type: "time_to_event", comparison: "two_groups" }))!;
    const ph = plan.assumptions.find((a) => a.assumption.includes("proportional"))!;
    expect(ph.if_violated).toContain("restricted mean survival time");
    expect(ph.if_violated).toContain("fixed in advance");
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

describe("the design decides which estimate is valid", () => {
  const binary = (over: Partial<AnalysisRow>) =>
    chooseTest(row({ data_type: "binary", comparison: "two_groups", ...over }))!;

  it("a case-control study reports an odds ratio, whatever the event rate", () => {
    const plan = binary({ design_family: "case_control", frequency: "common" });
    expect(plan.measures).toEqual(["Odds ratio"]);
    expect(plan.avoid).toContain("case-control sampling fixes the ratio of cases to controls");
  });

  it("a cross-sectional study reports prevalence, not risk", () => {
    const plan = binary({ design_family: "cross_sectional" });
    expect(plan.measures[0]).toBe("Prevalence ratio");
    expect(plan.unadjusted).toContain("Prevalence");
    expect(plan.avoid).toContain("implies the exposure came first");
  });

  it("a trial reports a risk ratio even where the rate was never stated", () => {
    const plan = binary({ design_family: "randomised_trial", frequency: "unknown" });
    expect(plan.measures).toContain("Risk ratio");
    expect(plan.measures).not.toContain("Odds ratio");
  });

  it("a cohort reports the number needed to harm rather than to treat", () => {
    expect(binary({ design_family: "cohort" }).measures).toContain("Number needed to harm");
  });

  it("a design nothing is known about still gets a plan", () => {
    const plan = binary({});
    expect(plan.measures.length).toBeGreaterThan(0);
  });
});

describe("a repeated measure decides its own model", () => {
  // The temperature of one baby across three care phases is one baby three
  // times. The table used to match `pairing` under two_groups alone, so a
  // trajectory that also adjusted for confounders fell to ordinary regression
  // and was planned as though every reading came from a different baby.
  const repeated = (over: Partial<AnalysisRow>) =>
    chooseTest(row({ pairing: "repeated", ...over }))!;

  it.each(["two_groups", "adjusted", "many_groups", "association", "single_group"] as const)(
    "a continuous measure repeated under %s gets a mixed model",
    (comparison) => {
      const plan = repeated({ data_type: "continuous", comparison });
      expect(plan.adjusted).toMatch(/mixed-effects/i);
      expect(plan.measures[0]).toContain("Group by time interaction");
    },
  );

  it("a binary outcome repeated gets a mixed model or GEE, never a chi-square", () => {
    const plan = repeated({ data_type: "binary", comparison: "many_groups" });
    expect(plan.adjusted).toMatch(/mixed-effects logistic|estimating equations/i);
    expect(plan.avoid).toContain("intervals far too narrow");
  });

  it("an ordered and a counted outcome too", () => {
    expect(repeated({ data_type: "ordinal", comparison: "adjusted" }).adjusted).toMatch(/mixed-effects/i);
    expect(repeated({ data_type: "count", comparison: "two_groups" }).adjusted).toMatch(/mixed-effects/i);
  });

  it("but agreement and correlation are not trajectories, and keep their own rows", () => {
    // They sit above the repeated row on purpose: two raters measuring the same
    // patient is repetition of a different kind, and a mixed model is not what
    // it needs.
    expect(repeated({ data_type: "continuous", comparison: "agreement" }).unadjusted).toContain(
      "Intraclass correlation",
    );
    expect(repeated({ data_type: "continuous", comparison: "correlation" }).unadjusted).toContain(
      "Pearson",
    );
  });

  it("and a measure taken once is still analysed as one measure", () => {
    const plan = chooseTest(row({ data_type: "continuous", comparison: "adjusted", pairing: "none" }))!;
    expect(plan.adjusted).toContain("Multivariable linear regression");
  });
});

describe("the rule table does not contradict itself", () => {
  // Every family of estimate a row can name, so that the model a row chooses
  // can be compared with the estimates it says the table will print. The
  // written-out name is matched whatever its case; the abbreviation is matched
  // case sensitively, because "or" is also an English word and "regression, or
  // linear regression" is not an odds ratio.
  const FAMILIES: [string, RegExp[]][] = [
    ["odds ratio", [/\bodds ratios?\b/i, /\bORs?\b/]],
    ["risk ratio", [/\brisk ratios?\b/i, /\bRRs?\b/]],
    ["prevalence ratio", [/\bprevalence ratios?\b/i, /\bPRs?\b/]],
    ["hazard ratio", [/\bhazard ratios?\b/i, /\bHRs?\b/]],
    ["rate ratio", [/\brate ratios?\b/i, /\bIRRs?\b/]],
    ["risk difference", [/\brisk differences?\b/i]],
    ["mean difference", [/\bmean differences?\b/i]],
    ["median difference", [/\bmedian differences?\b/i]],
  ];
  const familiesIn = (text: string) =>
    FAMILIES.filter(([, res]) => res.some((re) => re.test(text))).map(([name]) => name);
  const familyOf = (text: string) => familiesIn(text)[0];

  it("the estimate a row's adjusted model gives is one the row says it prints", () => {
    // The adjusted table heads its column with the first measure and names the
    // model underneath. A row whose model estimates something else would print
    // a heading its own footnote contradicts, which is how a log-binomial model
    // came to sit under a column labelled risk difference.
    for (const rule of loadRules()) {
      for (const branch of [rule.parametric, rule.nonparametric]) {
        const family = familyOf(branch?.adjusted ?? "");
        if (!family) continue;
        const headline = branch!.measures[0] ?? "";
        expect(
          familyOf(headline),
          `${rule.data_type}/${rule.comparison}/${rule.design}: the model gives a ${family} but the table leads with "${headline}"`,
        ).toBe(family);
      }
    }
  });

  // There is deliberately no test that a row never prints an estimate its own
  // avoid column names. The avoid column is prose explaining a mistake, and it
  // names the right estimate while forbidding the wrong one: "an odds ratio:
  // with a common outcome it is not a risk ratio" rules out the odds ratio and
  // mentions the risk ratio in the same breath. Keyword matching cannot tell
  // those apart, which is why TBL20 compares what a table prints against the
  // measures list and only quotes the avoid column in its message.
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

/**
 * The baseline value, in the studies that measure one.
 *
 * The deck's first fork on a measured outcome: was it also measured at
 * baseline? Almost every trial measures it, so ANCOVA is almost always the
 * right answer, and comparing change scores is the commoner and weaker choice.
 */
describe("a measured outcome in a trial", () => {
  const trial = (design: DesignFamily) =>
    chooseTest(
      row({ data_type: "continuous", comparison: "two_groups", design_family: design }),
    )!;

  it("adjusts by ANCOVA, with the baseline value as a covariate", () => {
    const designs: DesignFamily[] = [
      "randomised_trial",
      "non_inferiority_trial",
      "cluster_trial",
      "factorial_trial",
      "pre_post",
    ];
    for (const design of designs) {
      expect(trial(design).adjusted, design).toContain("ANCOVA");
      expect(trial(design).adjusted, design).toContain("baseline value as a covariate");
    }
  });

  it("rules out the change score and the final value alone", () => {
    expect(trial("randomised_trial").avoid).toContain("change scores");
    expect(trial("randomised_trial").avoid).toContain("final values alone");
  });

  it("says which of those apply, since half the outcomes have no baseline", () => {
    // Drain output cannot be measured before the drain exists. Told flatly not
    // to "throw the baseline away", a plan for it is being lectured about a
    // value nobody could have recorded.
    const said = trial("randomised_trial").avoid!;
    expect(said).toContain("Where the outcome was measured at baseline");
    expect(said).toContain("Where it was not");
    // And the trap that replaces it: POD 1 output is after the dressing went on.
    expect(said).toContain("recorded after the intervention began");
  });

  it("rules out testing the baseline balance, which tests the randomisation", () => {
    expect(trial("randomised_trial").avoid).toContain("tests the randomisation");
  });

  it("leaves an observational study on plain linear regression", () => {
    // ANCOVA is for a study that measured the outcome before and after. A
    // cohort is not one by default, and a rule that claimed otherwise would be
    // naming a model the study cannot fit.
    const cohort = chooseTest(
      row({ data_type: "continuous", comparison: "two_groups", design_family: "cohort" }),
    )!;
    expect(cohort.adjusted).toContain("Multivariable linear regression");
    expect(cohort.adjusted).not.toContain("ANCOVA");
  });
});
