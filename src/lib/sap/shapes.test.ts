import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet } from "../study/types.ts";
import { effectMeasures } from "../analysis/decision-tables.ts";
import { blockers, buildSap, warnings } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";

/**
 * Study shapes other than the worked example.
 *
 * The worked example is a two-arm randomised trial with a repeated continuous
 * primary, and everything in this build passed on it before any of these ran.
 * Each one below found something: an observational plan whose objectives were
 * assigned to no analysis population, a family whose only member was a safety
 * outcome and which therefore printed no multiplicity line, and a check that
 * read "Time to haemoglobin of 11.0 g/dL or above" as a filled-in cell.
 *
 * This is the fixture form of the rule the repository already keeps: the
 * fixtures pass while the real documents fail. Real protocols are not all
 * IDA-PREG, and the ones that are not are where the build breaks.
 */

const observational: FactsSheet = {
  ...idaPreg,
  design: "cohort",
  frame: "PECO",
  guideline: "STROBE",
  title:
    "Association of intravenous iron with the rise in haemoglobin in pregnancy: a cohort study",
  allocation: { ratio: "", block: null, strata: [], matched: null },
};

const singleGroup: FactsSheet = {
  ...observational,
  design: "cross_sectional",
  title: "Prevalence of iron-deficiency anaemia in pregnancy: a cross-sectional study",
  groups: [],
  exploratory_ideas: [],
};

const timeToEvent: FactsSheet = {
  ...idaPreg,
  title:
    "Time to correction of anaemia with intravenous versus oral iron: a randomised controlled trial",
  primary: {
    ...idaPreg.primary,
    what: "Time to haemoglobin of 11.0 g/dL or above",
    type: "time_to_event",
    unit: "days",
    time: ["W6"],
    distribution: "unknown",
  },
  secondary: [idaPreg.secondary[2]],
  exploratory_ideas: [],
};

const threeArms: FactsSheet = {
  ...idaPreg,
  groups: [
    { code: "FCM", label: "IV ferric carboxymaltose" },
    { code: "Oral", label: "Oral ferrous ascorbate" },
    { code: "Sucrose", label: "IV iron sucrose" },
  ],
  allocation: { ratio: "1:1:1", block: 6, strata: [], matched: null },
};

const stratified: FactsSheet = {
  ...idaPreg,
  allocation: { ...idaPreg.allocation, strata: ["residence"] },
};

const competingRisk: FactsSheet = {
  ...idaPreg,
  title: "Time to relapse of anaemia after intravenous versus oral iron: a randomised controlled trial",
  primary: {
    ...idaPreg.primary,
    what: "Time to relapse of anaemia",
    type: "time_to_event",
    unit: "days",
    time: ["W6"],
    distribution: "unknown",
    expected_frequency: 0.3,
    competing_event: "death from any cause",
  },
  secondary: [idaPreg.secondary[2]],
  exploratory_ideas: [],
};

const diagnostic: FactsSheet = {
  ...idaPreg,
  design: "diagnostic_accuracy",
  frame: "PECO",
  guideline: "STARD",
  groups: [],
  allocation: { ratio: "", block: null, strata: [], matched: null },
  title: "Diagnostic accuracy of serum ferritin against bone marrow iron in pregnancy",
  primary: {
    ...idaPreg.primary,
    what: "Serum ferritin below 30 ng/mL",
    how: "Serum ferritin below 30 ng/mL, against bone marrow iron staining",
    type: "binary",
    unit: "Yes / No",
    time: ["D0"],
    measures: ["serum_ferritin"],
    distribution: "unknown",
    expected_frequency: 0.4,
  },
  secondary: [],
  exploratory_ideas: [],
};

const clusterTrial: FactsSheet = {
  ...idaPreg,
  design: "cluster_trial",
  title:
    "A cluster-randomised trial of an iron supplementation programme across antenatal clinics",
};

const shapes: [string, FactsSheet][] = [
  ["an observational cohort", observational],
  ["a single-group cross-sectional study", singleGroup],
  ["a time-to-event primary outcome", timeToEvent],
  ["three arms", threeArms],
  ["stratified randomisation", stratified],
  ["a competing event", competingRisk],
  ["a cluster-randomised trial", clusterTrial],
];

describe.each(shapes)("%s", (_name, facts) => {
  it("builds without a blocking check", () => {
    const build = buildSap(facts);
    expect(blockers(build).map((c) => `${c.id}: ${c.message}`)).toEqual([]);
  });

  it("renders, and renders the same way twice", () => {
    const first = renderSapMarkdown(buildSap(facts));
    expect(first.length).toBeGreaterThan(2000);
    expect(renderSapMarkdown(buildSap(facts))).toBe(first);
  });

  it("gives every family present a multiplicity line", () => {
    const { objectives, rules } = buildSap(facts);
    for (const family of new Set(objectives.map((o) => o.family))) {
      expect(rules.multiplicity[family], family).toBeTruthy();
    }
  });

  it("draws at least one table for every objective it asks", () => {
    const { objectives, tables } = buildSap(facts);
    for (const objective of objectives) {
      expect(
        tables.some((t) => t.fills.includes(objective.id)),
        objective.id,
      ).toBe(true);
    }
  });
});

describe("what each shape is owed", () => {
  it("gives an observational study a cohort and no randomised sets", () => {
    const { rules } = buildSap(observational);
    expect(rules.populations.map((p) => p.name)).toEqual(["Analysis cohort"]);
    // The objectives are named on it, which is what check S5-1 reads.
    expect(rules.populations[0].definition).toContain("P1a");
  });

  it("tests an observational study's baseline and a trial's not at all", () => {
    expect(buildSap(observational).tables[0].footnote).toContain("chi-square");
    expect(buildSap(idaPreg).tables[0].footnote).toContain("not tested");
  });

  it("gives a single-group study estimates and nothing to compare against", () => {
    const build = buildSap(singleGroup);
    // Every level question becomes an estimate with an interval and no p value.
    for (const row of build.analysis.filter((r) => !r.objective.endsWith("b"))) {
      expect(row.exception, row.objective).toBeTruthy();
      expect(row.adjusted, row.objective).toBeNull();
      expect(row.predictors, row.objective).toEqual([]);
    }
    // The trajectory question survives, because one group still moves over
    // time. What it loses is the interaction with a group that is not there.
    const shape = build.analysis.find((r) => r.objective === "P1b")!;
    expect(shape.adjusted!.model).toContain("fixed effects for visit and");
    expect(shape.adjusted!.model).not.toContain("group-by-visit");
  });

  it("counts a harm rather than differencing it where there is one group", () => {
    const safety = buildSap(singleGroup).analysis.find((r) => r.exception === "safety")!;
    expect(safety.unadjusted!.test).toContain("Wilson");
    expect(safety.effect_measure).toBe("Proportion");
  });

  it("plans Kaplan-Meier and Cox for a time-to-event outcome", () => {
    const build = buildSap(timeToEvent);
    const primary = build.analysis.find((r) => r.objective === "P1")!;
    expect(primary.unadjusted!.test).toContain("Kaplan-Meier");
    expect(primary.adjusted!.model).toContain("Cox");
    expect(primary.effect_measure).toBe("Hazard ratio");
  });

  it("keeps the secondary family's note where its only member is a safety outcome", () => {
    // The family exists, so the heading exists, so the note line has to.
    const { rules } = buildSap(timeToEvent);
    expect(rules.multiplicity.secondary).toContain("safety outcome");
  });

  it("compares three arms with the many-group tests", () => {
    const build = buildSap(threeArms);
    const primary = build.analysis.find((r) => r.objective === "P1a")!;
    expect(primary.unadjusted!.test).toContain("analysis of variance");
    expect(build.tables[0].columns).toHaveLength(4);
  });

  it("puts the stratification factors into the adjusted model", () => {
    const build = buildSap(stratified);
    const primary = build.analysis.find((r) => r.objective === "P1a")!;
    expect(primary.adjusted!.covariates.map((c) => c.var)).toContain("residence");
  });

  it("warns rather than blocks where the sample cannot carry the adjustment", () => {
    // Five expected events and two covariates. The model becomes Firth, which
    // is what the few-event case is for, and the count is still a warning: it
    // is true, it is important, and it is not a reason to refuse to render.
    // The investigator either enlarges the study or drops a covariate, and
    // both are decisions rather than corrections.
    const rare: FactsSheet = {
      ...idaPreg,
      secondary: idaPreg.secondary.map((o, i) =>
        i === 0 ? { ...o, expected_frequency: 0.04 } : o,
      ),
    };
    const build = buildSap(rare);
    expect(blockers(build)).toEqual([]);
    expect(warnings(build).map((c) => c.id)).toEqual(["S4-5"]);
  });
});

/**
 * The rules in `Regression Model Apply.pptx`, which is a decision tree keyed on
 * the outcome column. Every one of these was checked against the deck slide by
 * slide, and each test names the branch it comes from.
 */
describe("the model-choice deck", () => {
  it("branch 1: names ANCOVA only where the outcome has a baseline", () => {
    const primary = buildSap(idaPreg).analysis.find((r) => r.objective === "P1a")!;
    expect(primary.adjusted!.model).toContain("analysis of covariance");

    // Blood loss, operating time, a single post-operative score: measured once,
    // at the end. Calling that ANCOVA promises a column nothing can fill.
    const noBaseline: FactsSheet = {
      ...idaPreg,
      primary: {
        ...idaPreg.primary,
        what: "Intraoperative blood loss",
        time: ["W6"],
        measures: ["haemoglobin"],
      },
      visit_schedule: idaPreg.visit_schedule.map((v) =>
        v.timepoint === "D0"
          ? { ...v, measures: v.measures.filter((m) => m !== "haemoglobin") }
          : v,
      ),
    };
    const plain = buildSap(noBaseline).analysis.find((r) => r.objective === "P1")!;
    expect(plain.adjusted!.model).toBe("Linear regression");
  });

  it("branch 2: plans Firth where the events are too few, whatever the frequency", () => {
    const few: FactsSheet = {
      ...idaPreg,
      secondary: idaPreg.secondary.map((o, i) =>
        i === 0 ? { ...o, expected_frequency: 0.04 } : o,
      ),
    };
    const s1 = buildSap(few).analysis.find((r) => r.objective === "S1")!;
    expect(s1.adjusted!.model).toContain("Firth");
  });

  it("branch 2: keeps the rows of a cluster trial out of an individual test", () => {
    const build = buildSap(clusterTrial);
    const primary = build.analysis.find((r) => r.objective === "P1a")!;
    expect(primary.unadjusted!.test).toContain("cluster-level summary measures");
    expect(primary.adjusted!.model).toContain("clustered on the randomised unit");
    expect(primary.unit_of_analysis).toContain("inside a randomised cluster");
    expect(build.todos.join(" ")).toContain("how many clusters were randomised");
  });

  it("branch 3: asks about the zeros rather than choosing a count model blind", () => {
    const counts: FactsSheet = {
      ...idaPreg,
      primary: {
        ...idaPreg.primary,
        what: "Number of transfusion episodes",
        type: "count",
        unit: "episodes",
        time: ["W6"],
      },
      secondary: [],
      exploratory_ideas: [],
    };
    const build = buildSap(counts);
    const primary = build.analysis.find((r) => r.objective === "P1")!;
    expect(primary.adjusted!.model).toContain("Poisson");
    expect(primary.adjusted!.fallback).toContain("Negative binomial");
    expect(build.todos.join(" ")).toContain("could never have the event");
    expect(build.todos.join(" ")).toContain("AIC");
  });

  it("branch 6: a survival table gives the median, the intervals and the follow-up", () => {
    const survival = buildSap(timeToEvent).tables.find((t) => t.kind === "survival")!;
    const labels = survival.rows.map((r) => r.label);

    // The three a survival table is read for.
    expect(labels).toContain(
      "Median time to haemoglobin of 11.0 g/dL or above, days (95% CI)",
    );
    expect(labels).toContain("Survival at week 6, % (95% CI)");
    expect(labels).toContain("Median follow-up, days (95% CI)");

    // And the denominators they are read against.
    expect(labels).toContain("Participants, n");
    expect(labels).toContain("Events, n (%)");
    expect(labels).toContain("Censored, n (%)");

    // Items down the side, arms across the top, so any number of time points
    // fits without the table growing a column for each.
    expect(survival.columns).toEqual(["Item", "FCM", "Oral"]);
  });

  it("branch 6: says the median follow-up is not the median of the follow-up times", () => {
    // Taking it that way shortens it by everyone who had the event early,
    // which is exactly the group with the least follow-up.
    const survival = buildSap(timeToEvent).tables.find((t) => t.kind === "survival")!;
    expect(survival.footnote).toContain("reverse Kaplan-Meier");
    expect(survival.footnote).toContain("not as the median of the observed follow-up times");
    expect(survival.footnote).toContain("crosses 50 per cent");
  });

  it("branch 6: gives a survival table one row per follow-up point", () => {
    const yearly: FactsSheet = {
      ...timeToEvent,
      timepoints: ["Y0", "Y1", "Y3", "Y5"],
      visit_schedule: [
        { timepoint: "Y0", label: "Enrolment", measures: ["haemoglobin"] },
        { timepoint: "Y1", label: "Year 1", measures: ["haemoglobin"] },
        { timepoint: "Y3", label: "Year 3", measures: ["haemoglobin"] },
        { timepoint: "Y5", label: "Year 5", measures: ["haemoglobin"] },
      ],
      primary: { ...timeToEvent.primary, time: ["Y1", "Y3", "Y5"] },
    };
    const labels = buildSap(yearly)
      .tables.find((t) => t.kind === "survival")!
      .rows.map((r) => r.label);
    expect(labels).toContain("Survival at year 1, % (95% CI)");
    expect(labels).toContain("Survival at year 3, % (95% CI)");
    expect(labels).toContain("Survival at year 5, % (95% CI)");
  });

  it("branch 6: a competing-risks table gives both incidences and the follow-up", () => {
    const table = buildSap(competingRisk).tables.find(
      (t) => t.kind === "cumulative_incidence",
    )!;
    const labels = table.rows.map((r) => r.label);
    expect(labels).toContain("Median follow-up, days (95% CI)");
    expect(labels).toContain(
      "Cumulative incidence of time to relapse of anaemia at week 6, % (95% CI)",
    );
    expect(labels).toContain(
      "Cumulative incidence of death from any cause at week 6, % (95% CI)",
    );
    expect(labels).toContain("Censored without either event, n (%)");
  });

  it("branch 6: never reports one minus the Kaplan-Meier where something can intervene", () => {
    const build = buildSap(competingRisk);
    const table = build.tables.find((t) => t.kind === "cumulative_incidence")!;
    expect(table.title).toContain("Cumulative incidence");
    expect(table.title).toContain("death from any cause");
    expect(build.tables.some((t) => t.kind === "survival")).toBe(false);
  });

  it("branch 6: makes the investigator pre-specify which hazard ratio is meant", () => {
    expect(buildSap(competingRisk).todos.join(" ")).toContain(
      "Say which competing-risks model",
    );
  });

  it("branch 6: names the restricted mean survival time when the hazards are not", () => {
    const build = buildSap({ ...competingRisk, primary: { ...competingRisk.primary, competing_event: null } });
    const primary = build.analysis.find((r) => r.objective === "P1")!;
    expect(primary.unadjusted!.test).toContain("Kaplan-Meier");
    expect(primary.adjusted!.model).toContain("Cox");
    expect(primary.adjusted!.fallback).toContain("restricted mean survival time");
  });

  it("the diagnostic branch reports accuracy, not a summary and not calibration", () => {
    const kinds = buildSap(diagnostic).tables.map((t) => t.kind);
    expect(kinds).toContain("two_by_two");
    expect(kinds).toContain("accuracy");
    // Calibration asks whether predicted probabilities are right, and a
    // measurement read at a cut-off predicts none. It belongs to prediction.
    expect(kinds).not.toContain("calibration");
    expect(kinds).not.toContain("summary");
  });

  it("the diagnostic branch warns that predictive values do not travel", () => {
    const accuracy = buildSap(diagnostic).tables.find((t) => t.kind === "accuracy")!;
    expect(accuracy.footnote).toContain("do not transfer");
    expect(accuracy.rows.map((r) => r.label)).toContain("Negative predictive value");
  });

  it("branch 1: names generalised estimating equations as the repeated alternative", () => {
    // Both are correct and answer slightly different questions. A plan that
    // names only one has taken a decision it did not say it was taking.
    const shape = buildSap(idaPreg).analysis.find((r) => r.objective === "P1b")!;
    expect(shape.adjusted!.fallback).toContain("Generalised estimating equations");
    expect(shape.adjusted!.fallback).toContain("group average");
  });

  it("branch 2: keeps a matched set together", () => {
    const matched: FactsSheet = {
      ...idaPreg,
      design: "case_control",
      frame: "PECO",
      guideline: "STROBE",
      title: "Determinants of iron-deficiency anaemia in pregnancy: a matched case-control study",
      allocation: {
        ratio: "",
        block: null,
        strata: [],
        matched: "1 case to 2 controls, matched on age and gestational age",
      },
      secondary: [idaPreg.secondary[0]],
      exploratory_ideas: [],
    };
    const s1 = buildSap(matched).analysis.find((r) => r.objective === "S1")!;
    expect(s1.unadjusted!.test).toContain("McNemar");
    expect(s1.adjusted!.model).toContain("Conditional logistic");
  });

  it("asks how an observational comparison will make its groups alike", () => {
    const todos = buildSap(observational).todos.join(" ");
    expect(todos).toContain("propensity score");
    expect(todos).toContain("standardised mean differences");
    // A randomised trial is not asked: randomisation is the answer.
    expect(buildSap(idaPreg).todos.join(" ")).not.toContain("propensity score");
  });

  it("catches an ordered scale cut into a yes or no", () => {
    // The seventh of the eight commonest mistakes. A modified Rankin score of
    // 0 to 5 reported as "good outcome, yes or no" keeps one distinction out
    // of five, and nothing in the finished document shows the other four.
    const dichotomised: FactsSheet = {
      ...idaPreg,
      measures: [
        ...idaPreg.measures,
        {
          name: "mrs",
          label: "Modified Rankin score",
          type: "ordinal",
          unit: null,
          options: ["0", "1", "2", "3", "4", "5"],
          block: null,
          derived_from: [],
          recipe: null,
        },
      ],
      visit_schedule: idaPreg.visit_schedule.map((v) =>
        v.timepoint === "W6" ? { ...v, measures: [...v.measures, "mrs"] } : v,
      ),
      secondary: [
        ...idaPreg.secondary,
        {
          what: "Good functional outcome",
          how: "Modified Rankin score of 2 or below at week 6",
          instrument: "modified Rankin scale",
          time: ["W6"],
          unit: "Yes / No",
          type: "binary",
          kind: "comparison",
          exposures: [],
          covariates: [],
          distribution: "unknown",
          expected_frequency: 0.5,
          competing_event: null,
          measures: ["mrs"],
        },
      ],
    };
    const failed = warnings(buildSap(dichotomised)).map((c) => c.id);
    expect(failed).toContain("S4-6");
    // And it does not fire on a laboratory threshold, which is not a scale.
    expect(warnings(buildSap(idaPreg)).map((c) => c.id)).not.toContain("S4-6");
  });

  it("counts events, not participants, where a model is limited by events", () => {
    // 400 people, 3% event rate, two covariates: twelve events cannot carry
    // two, and counting the 400 hides it.
    const thin: FactsSheet = {
      ...idaPreg,
      sample_size: { ...idaPreg.sample_size, per_group: 200 },
      primary: {
        ...idaPreg.primary,
        what: "Time to relapse of anaemia",
        type: "time_to_event",
        unit: "days",
        time: ["W6"],
        expected_frequency: 0.03,
      },
      secondary: [],
      exploratory_ideas: [],
    };
    expect(warnings(buildSap(thin)).map((c) => c.id)).toContain("S4-5");
  });
});

/**
 * The seven factors that decide the model, each fixed before any data is seen.
 * Factor 1 is decision table B and is exercised everywhere above; these are the
 * other six, and the mixed-model specification that goes with factor 5.
 */
describe("the seven factors", () => {
  it("2: never holds constant something measured after the exposure", () => {
    // A mediator sits on the path from the exposure to the outcome, and
    // adjusting for it removes the effect being estimated. Nothing in the
    // finished document shows that it happened.
    const mediated: FactsSheet = {
      ...idaPreg,
      covariates: [
        { measure: "adherence", at: "W4", inferred: false },
        ...idaPreg.covariates,
      ],
    };
    const build = buildSap(mediated);
    expect(blockers(build).map((c) => c.id)).toContain("S4-7");
    expect(blockers(build).find((c) => c.id === "S4-7")!.message).toContain(
      "mediator",
    );
    expect(blockers(buildSap(idaPreg)).map((c) => c.id)).not.toContain("S4-7");
  });

  it("2: lets the data choose the variables for a prediction question only", () => {
    const predicting: FactsSheet = {
      ...idaPreg,
      question_type: "prediction",
      design: "prognostic_model",
      frame: "PECO",
      guideline: "TRIPOD",
      title: "A score to predict failure of oral iron in pregnancy",
      primary: {
        ...idaPreg.primary,
        what: "Failure to reach haemoglobin of 11.0 g/dL by week 6",
        type: "binary",
        unit: "Yes / No",
        time: ["W6"],
        expected_frequency: 0.35,
      },
      secondary: [],
      exploratory_ideas: [],
    };
    const build = buildSap(predicting);
    const primary = build.analysis.find((r) => r.objective === "P1")!;
    expect(primary.adjusted!.model).toContain("LASSO");
    expect(primary.unadjusted!.test).toContain("C-statistic");
    expect(build.tables.map((t) => t.kind)).toContain("calibration");

    // And an effect question never gets it: a variable that improves
    // prediction can wreck a causal estimate.
    expect(
      JSON.stringify(buildSap(idaPreg).analysis),
    ).not.toContain("LASSO");
  });

  it("3: catches a sample size that assumed a different result", () => {
    const mismatched: FactsSheet = {
      ...idaPreg,
      sample_size: {
        ...idaPreg.sample_size,
        formula_family: "two-proportion power formula",
      },
    };
    const warned = warnings(buildSap(mismatched));
    expect(warned.map((c) => c.id)).toContain("S4-8");
    expect(warned.find((c) => c.id === "S4-8")!.message).toContain(
      "two-proportion power formula",
    );
    // The fixture assumed two means and estimates a mean difference.
    expect(warnings(buildSap(idaPreg)).map((c) => c.id)).not.toContain("S4-8");
  });

  it("5: clusters on the participant where a participant gives several rows", () => {
    // Two eyes, several lesions, each tooth. The rows are alike, and analysing
    // them as separate participants gives standard errors that are too small.
    const eyes: FactsSheet = {
      ...idaPreg,
      unit_of_analysis: { unit: "eye", repeats_within_participant: true },
    };
    const primary = buildSap(eyes).analysis.find((r) => r.objective === "P1a")!;
    expect(primary.adjusted!.model).toContain(
      "random intercept for each participant",
    );
    expect(primary.unit_of_analysis).toBe("per eye");
    expect(primary.count).toBe("more than one eye per participant");
  });

  it("5: states all seven things a mixed model owes", () => {
    const model = buildSap(idaPreg).analysis.find((r) => r.objective === "P1b")!
      .adjusted!.model;
    expect(model).toContain("long format, one row per participant per visit");
    expect(model).toContain("fixed effects for group, visit, the group-by-visit interaction and the baseline value");
    expect(model).toContain("random intercept for each participant");
    expect(model).toContain("visit entered as a category");
    expect(model).toContain("unstructured covariance matrix");
    expect(model).toContain("missing at random");
  });

  it("5: adds a centre level where the study is multicentre", () => {
    expect(
      buildSap(clusterTrial).analysis.find((r) => r.objective === "P1b")!.adjusted!
        .model,
    ).toContain("for each participant and for each centre");
  });

  it("6: catches an exposure that begins after follow-up starts", () => {
    // The treated group had to survive long enough to be treated, so the
    // untreated group carries the early deaths and the treatment looks
    // protective when it does nothing.
    const immortal: FactsSheet = {
      ...idaPreg,
      design: "cohort",
      frame: "PECO",
      guideline: "STROBE",
      allocation: { ratio: "", block: null, strata: [], matched: null },
      exposure_fixed_at_baseline: false,
    };
    const todos = buildSap(immortal).todos.join(" ");
    expect(todos).toContain("time-varying covariate");
    expect(todos).toContain("same time zero");
    expect(buildSap(idaPreg).todos.join(" ")).not.toContain("time-varying");
  });

  it("names the effect measure an ordered scale owes, and refuses the cut", () => {
    const measure = buildSap(idaPreg);
    void measure;
    // Read straight from decision table A, where the wording lives.
    const rows = effectMeasures();
    const ordinal = rows.find((r) => r.Key === "*|ordinal")!;
    expect(ordinal["Effect measure"]).toContain("Common odds ratio");
    expect(ordinal.Never).toContain("cutting the scale into two");
    const nominal = rows.find((r) => r.Key === "*|nominal")!;
    expect(nominal["Effect measure"]).toContain("each category");
  });
});

/** The bugs the sweep found, each held down by the case that showed it. */
describe("what the sweep found", () => {
  const ordinal: FactsSheet = {
    ...idaPreg,
    title: "Effect of intravenous versus oral iron on functional outcome: a randomised controlled trial",
    measures: [
      ...idaPreg.measures,
      {
        name: "mrs",
        label: "Modified Rankin score",
        type: "ordinal",
        unit: null,
        options: ["0", "1", "2", "3", "4", "5"],
        block: null,
        derived_from: [],
        recipe: null,
      },
    ],
    visit_schedule: idaPreg.visit_schedule.map((v) =>
      v.timepoint === "W6" ? { ...v, measures: [...v.measures, "mrs"] } : v,
    ),
    primary: {
      ...idaPreg.primary,
      what: "Functional outcome on the modified Rankin scale",
      type: "ordinal",
      unit: "score",
      time: ["W6"],
      measures: ["mrs"],
      distribution: "unknown",
    },
    secondary: [],
    exploratory_ideas: [],
  };

  it("draws an ordered scale as a distribution, not as a two-by-two", () => {
    // It was drawn with the binary template: "n/N (%)" per arm and a row
    // reading "1 (reference)". That is the plan committing the mistake it
    // warns about, and the table then contradicted its own footnote, which
    // named a cumulative-link model.
    const build = buildSap(ordinal);
    const kinds = build.tables.map((t) => t.kind);
    expect(kinds).toContain("distribution");
    expect(kinds).not.toContain("ratio");

    const table = build.tables.find((t) => t.kind === "distribution")!;
    expect(table.rows.map((r) => r.label)).toEqual([
      "0", "1", "2", "3", "4", "5", "Median (IQR)",
    ]);
    expect(table.columns.join(" ")).not.toContain("n/N");
    expect(JSON.stringify(table.rows)).not.toContain("1 (reference)");
  });

  it("gives a repeated count its trajectory table", () => {
    // The count template had no per-visit or rate-of-change entry, so P1b had
    // an analysis row and no table anywhere in the document.
    const counts: FactsSheet = {
      ...idaPreg,
      primary: {
        ...idaPreg.primary,
        what: "Number of transfusion episodes",
        type: "count",
        unit: "episodes",
      },
      secondary: [],
      exploratory_ideas: [],
    };
    const build = buildSap(counts);
    expect(build.objectives.map((o) => o.id)).toContain("P1b");
    expect(build.tables.some((t) => t.fills.includes("P1b"))).toBe(true);
    expect(build.tables.map((t) => t.kind)).toContain("rate_of_change");
  });

  it("draws no adjusted table where no model was planned", () => {
    // A single-group study was given an "Adjusted comparison" with one row, no
    // covariates and the footnote "descriptive only".
    const single: FactsSheet = {
      ...idaPreg,
      design: "cross_sectional",
      frame: "PECO",
      groups: [],
      allocation: { ratio: "", block: null, strata: [], matched: null },
      secondary: [],
      exploratory_ideas: [],
    };
    const build = buildSap(single);
    for (const table of build.tables.filter((t) => t.kind === "adjusted")) {
      const row = build.analysis.find((r) => table.fills.includes(r.objective))!;
      expect(row.adjusted, `T${table.number}`).toBeTruthy();
    }
    expect(build.tables.filter((t) => t.kind === "overlap")).toEqual([]);
  });

  it("refuses two outcomes that are the same words twice", () => {
    // They became one variable, and the second silently took the first one's
    // definition. Both objectives then pointed at it, so the plan reported the
    // primary's number under the secondary's title, and every check
    // downstream found a variable exactly where it expected one.
    const clash: FactsSheet = {
      ...idaPreg,
      secondary: [
        {
          ...idaPreg.secondary[1],
          what: "Change in haemoglobin",
          how: "A different definition entirely",
        },
      ],
      exploratory_ideas: [],
    };
    const failed = blockers(buildSap(clash));
    expect(failed.map((c) => c.id)).toContain("S2-1");
    expect(failed.find((c) => c.id === "S2-1")!.message).toContain(
      "the same words",
    );
    expect(blockers(buildSap(idaPreg)).map((c) => c.id)).not.toContain("S2-1");
  });

  it("keeps an objective when the decision tables have no row for it", () => {
    // A crossover trial with an ordered outcome asks for ordinal/paired. When
    // that cell was missing the objective was dropped: no analysis row, no
    // table, and a note nobody would read.
    const odd: FactsSheet = {
      ...ordinal,
      design: "crossover_trial",
      title: "A crossover trial of intravenous against oral iron, with functional outcome",
    };
    const build = buildSap(odd);
    expect(build.analysis.map((r) => r.objective)).toContain("P1");
    expect(build.tables.some((t) => t.fills.includes("P1"))).toBe(true);
  });
});
