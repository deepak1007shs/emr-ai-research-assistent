import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet } from "../study/types.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "../variables/build.ts";
import { buildExploratory } from "../variables/exploratory.ts";
import { buildAnalysis } from "./build.ts";

const map = (facts: FactsSheet = idaPreg) => {
  const objectives = buildObjectives(facts);
  const { variables } = buildVariables(facts, objectives);
  const { outcomes } = buildExploratory(facts, objectives, variables);
  return buildAnalysis(facts, objectives, variables, outcomes);
};
const row = (id: string, facts: FactsSheet = idaPreg) =>
  map(facts).rows.find((r) => r.objective === id)!;

describe("Step 4, the Analysis Map", () => {
  it("writes one row per objective, in the order Step 1 wrote them", () => {
    expect(map().rows.map((r) => r.objective)).toEqual([
      "P1a", "P1b", "S1", "S2", "S3", "E1", "E2", "E3",
    ]);
  });

  it("takes the effect measure from the design before the data type", () => {
    expect(row("P1a").effect_measure).toBe("Mean difference");
    expect(row("S1").effect_measure).toBe("Risk ratio");
    expect(row("S1").absolute).toContain("Risk difference");
  });

  it("never plans an odds ratio for a trial's binary outcome", () => {
    // The commonest wrong number in a thesis: an odds ratio reported as though
    // it were a risk ratio, for an outcome that happens to half the sample.
    expect(row("S1").effect_measure).not.toContain("Odds");
  });

  it("plans a logistic model where the event is rare and the study is large", () => {
    // 6% of a thousand women is sixty events, which three covariates can carry.
    const rare: FactsSheet = {
      ...idaPreg,
      sample_size: { ...idaPreg.sample_size, per_group: 500 },
      secondary: idaPreg.secondary.map((o, i) =>
        i === 0 ? { ...o, expected_frequency: 0.06 } : o,
      ),
    };
    expect(row("S1", rare).adjusted!.model).toContain("Logistic regression");
    expect(row("S1", rare).effect_measure).toContain("Odds ratio");
  });

  it("plans Firth where the events are too few for any of the others", () => {
    // Five events between the arms. The question is no longer which risk model
    // to fit but whether one will fit at all, and the penalised model is the
    // answer to that.
    const few: FactsSheet = {
      ...idaPreg,
      secondary: idaPreg.secondary.map((o, i) =>
        i === 0 ? { ...o, expected_frequency: 0.04 } : o,
      ),
    };
    expect(row("S1", few).adjusted!.model).toContain("Firth");
    expect(row("S1", few).adjusted!.fallback).toContain("Fisher's exact");
  });

  it("asks for the frequency rather than choosing silently", () => {
    expect(map().todos.join(" ")).toContain("Anaemia corrected");
    expect(row("S1").expected_frequency).toBeNull();
  });

  it("names the fallback model, not just the first one", () => {
    expect(row("S1").adjusted!.fallback).toContain("Modified Poisson");
  });

  it("tests a trajectory once, not once per visit", () => {
    expect(row("P1b").unadjusted!.test).toContain("no p value");
    expect(row("P1b").adjusted!.model).toContain("group-by-time");
    expect(row("P1b").count).toBe("4 readings per participant");
  });

  it("plans the skewed outcome on its own terms, with no branch left open", () => {
    // The Facts Sheet already says ferritin is skewed, so the plan says
    // Mann-Whitney rather than "t-test, or Mann-Whitney if skewed".
    const s2 = row("S2");
    expect(s2.unadjusted!.test).toBe(
      "Mann-Whitney with the Hodges-Lehmann difference",
    );
    expect(s2.unadjusted!.fallback).toBeNull();
    expect(s2.adjusted!.model).toContain("log scale");
    expect(s2.effect_measure).toBe("Ratio of geometric means");
  });

  it("gives each outcome its own baseline, not the study's favourite one", () => {
    // Baseline haemoglobin belongs in the haemoglobin model. The ferritin
    // model's baseline is ferritin, and a set built by copying gets this wrong
    // in the one place anybody would see it: the footnote.
    expect(row("P1a").adjusted!.covariates.map((c) => c.var)).toEqual([
      "haemoglobin", "gestational_age",
    ]);
    expect(row("S2").adjusted!.covariates.map((c) => c.var)).toEqual([
      "serum_ferritin", "gestational_age",
    ]);
  });

  it("gives every covariate a reason a reader can argue with", () => {
    for (const r of map().rows) {
      for (const c of r.adjusted?.covariates ?? []) {
        expect(c.reason.length).toBeGreaterThan(20);
      }
    }
  });

  it("reports a safety outcome and does not model it", () => {
    const s3 = row("S3");
    expect(s3.exception).toBe("safety");
    expect(s3.adjusted).toBeNull();
    expect(s3.unadjusted!.test).toContain("Fisher's exact");
    expect(s3.effect_measure).toBe("Risk difference");
  });

  it("does not ask for the frequency of a safety outcome it will not model", () => {
    expect(map().todos.join(" ")).not.toContain("Adverse effects");
  });

  it("carries no covariates into a randomised trial's trajectory model", () => {
    expect(row("P1b").adjusted!.covariates).toEqual([]);
  });

  it("keeps the adjustment set in an observational trajectory model", () => {
    const observed: FactsSheet = {
      ...idaPreg,
      design: "cohort",
      allocation: { ratio: "", block: null, strata: [], matched: null },
    };
    expect(row("P1b", observed).adjusted!.covariates.length).toBeGreaterThan(0);
  });

  it("puts the stratification factors in the adjusted model", () => {
    const stratified: FactsSheet = {
      ...idaPreg,
      allocation: { ...idaPreg.allocation, strata: ["residence"] },
    };
    const covariates = row("P1a", stratified).adjusted!.covariates;
    expect(covariates.map((c) => c.var)).toContain("residence");
    expect(covariates.find((c) => c.var === "residence")!.reason).toContain(
      "stratification",
    );
  });

  it("writes an exploratory interaction as one readable model", () => {
    expect(row("E1").adjusted!.model).toBe(
      "Linear regression with an arm-by-gestational age interaction term",
    );
    expect(row("E1").unadjusted).toBeNull();
    expect(row("E1").adjusted!.covariates).toEqual([]);
  });

  it("uses the rank correlation where either side of it is skewed", () => {
    // Baseline ferritin is skewed; the haemoglobin change is not. Pearson
    // would be the wrong coefficient for the pair.
    expect(row("E2").unadjusted!.test).toBe("Spearman correlation");
    expect(row("E2").effect_measure).toBe("Correlation coefficient");
    expect(row("E2").adjusted).toBeNull();
  });

  it("gives a single-group study an estimate and no p value", () => {
    const single: FactsSheet = { ...idaPreg, groups: [], frame: "PECO" };
    expect(row("P1a", single).exception).toBe("estimation");
    expect(row("P1a", single).adjusted).toBeNull();
    expect(row("P1a", single).predictors).toEqual([]);
  });
});
