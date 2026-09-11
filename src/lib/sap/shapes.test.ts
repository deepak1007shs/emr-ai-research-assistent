import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet } from "../study/types.ts";
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
  allocation: { ratio: "", block: null, strata: [] },
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
  allocation: { ratio: "1:1:1", block: 6, strata: [] },
};

const stratified: FactsSheet = {
  ...idaPreg,
  allocation: { ...idaPreg.allocation, strata: ["residence"] },
};

const shapes: [string, FactsSheet][] = [
  ["an observational cohort", observational],
  ["a single-group cross-sectional study", singleGroup],
  ["a time-to-event primary outcome", timeToEvent],
  ["three arms", threeArms],
  ["stratified randomisation", stratified],
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
    expect(shape.adjusted!.model).toContain("time as a fixed effect");
    expect(shape.adjusted!.model).not.toContain("group-by-time");
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
    // Five expected events and two covariates. True, important, and not a
    // reason to refuse to render the plan: the investigator either enlarges
    // the study or drops a covariate, and both are decisions.
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
