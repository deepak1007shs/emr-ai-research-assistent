import { describe, expect, it } from "vitest";
import { elastography } from "../facts/fixture-diagnostic.ts";
import { idaPreg } from "../facts/fixture.ts";
import { blockers, buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";

/**
 * A diagnostic accuracy study with the shape of a real one.
 *
 * The first real protocol through the rebuild was a diagnostic accuracy study
 * of an MRI measurement against histopathology, and the plan it produced was
 * wrong in ways the one-line diagnostic fixture in `shapes.test.ts` could not
 * show: several index tests read on the same people, a secondary that
 * correlates them with a grade, a secondary that compares their values between
 * the reference results, several lesions per man, and exploratory questions of
 * three kinds. Each objective became a derived variable named after its
 * sentence, every one of them got a two-by-two, an accuracy table and a
 * calibration table, the tables were titled "by arm", and four checks raised
 * alarms about things that were not wrong.
 *
 * The study is in `facts/fixture-diagnostic.ts`. It is invented, and keeps
 * that protocol's structure exactly.
 */

const build = buildSap(elastography);
const row = (id: string) => build.analysis.find((r) => r.objective === id)!;
const tablesFor = (id: string) =>
  build.tables.filter((t) => t.fills.includes(id)).map((t) => t.kind);
const check = (id: string) => build.checks.find((c) => c.id === id)!;
const measureNames = new Set(elastography.measures.map((m) => m.name));

describe("a diagnostic accuracy study, each objective", () => {
  it("is about a measure the study records, never a variable named after its sentence", () => {
    for (const r of build.analysis) {
      expect(measureNames.has(r.outcome), `${r.objective}: ${r.outcome}`).toBe(true);
    }
    for (const o of build.objectives.filter((o) => o.family !== "exploratory")) {
      expect(measureNames.has(o.outcome), `${o.id}: ${o.outcome}`).toBe(true);
    }
  });

  it("asks accuracy of each index test against the reference standard", () => {
    for (const id of ["P1", "S1"]) {
      expect(row(id).outcome).toBe("malignant");
      expect(row(id).effect_measure).toContain("Sensitivity");
      expect(tablesFor(id).filter((kind) => kind !== "sensitivity")).toEqual(["two_by_two", "accuracy"]);
    }
    expect(row("P1").predictors).toEqual(["ratio_mean", "ratio_max"]);
    expect(row("S1").predictors).toEqual(["stiffness_mean", "ratio_mean"]);
  });

  it("compares the areas where several index tests are read on the same people", () => {
    expect(row("P1").unadjusted!.test).toContain("DeLong's test for correlated curves");
    const accuracy = build.tables.find((t) => t.kind === "accuracy" && t.fills.includes("P1"))!;
    expect(accuracy.columns).toEqual([
      "Measure",
      "Normalised stiffness, mean (95% CI)",
      "Normalised stiffness, maximum (95% CI)",
    ]);
    const twoByTwo = build.tables.find((t) => t.kind === "two_by_two" && t.fills.includes("P1"))!;
    expect(twoByTwo.columns).toEqual(["Index test at its cut-off", "Malignant", "Benign", "Total"]);
    expect(twoByTwo.rows.map((r) => r.label)).toContain("Normalised stiffness, maximum - negative");
  });

  it("correlates the index tests with a grade, and draws no two-by-two for it", () => {
    expect(row("S2").outcome).toBe("bethesda");
    expect(row("S2").effect_measure).toBe("Correlation coefficient");
    expect(row("S2").unadjusted!.test).toContain("Spearman");
    expect(row("S2").predictors).toEqual(["ratio_mean", "stiffness_mean"]);
    expect(tablesFor("S2")).toEqual(["correlation_index"]);
    const table = build.tables.find((t) => t.kind === "correlation_index")!;
    expect(table.columns[1]).toBe("Spearman ρ with Bethesda category");
    expect(row("S2").unadjusted!.test).toContain("with the Bethesda category");
  });

  it("compares the index values between the reference results", () => {
    expect(row("S3").outcome).toBe("stiffness_mean");
    expect(row("S3").unadjusted!.test).toContain("t-test");
    expect(row("S3").unadjusted!.test).toContain("malignant on cytology");
    expect(tablesFor("S3")).toEqual(["by_reference"]);
    const table = build.tables.find((t) => t.kind === "by_reference")!;
    expect(table.columns).toContain("MALIGNANT - Mean ± SD");
    expect(table.rows.map((r) => r.label)).toEqual([
      "Mean stiffness (kPa)",
      "Maximum stiffness (kPa)",
      "Normalised stiffness, mean (ratio)",
    ]);
  });

  it("keeps a participant's nodules together in every interval", () => {
    for (const r of build.analysis) {
      expect(r.unadjusted!.test, r.objective).toContain("resamples participants");
    }
  });
});

describe("a diagnostic accuracy study, what it is not given", () => {
  it("no adjusted model, no covariates, and no request to confirm any", () => {
    for (const r of build.analysis) {
      expect(r.adjusted, r.objective).toBeNull();
      expect(r.exception, r.objective).toBe("diagnostic");
    }
    expect(build.todos.join(" ")).not.toMatch(/as a covariate of the adjusted models/);
  });

  it("no calibration table, and no arm", () => {
    expect(build.tables.map((t) => t.kind)).not.toContain("calibration");
    for (const table of build.tables) {
      expect(table.title, table.number).not.toMatch(/\barm\b/i);
    }
    expect(build.variables.map((v) => v.name)).not.toContain("arm");
    expect(build.tables[0].title).toContain("by reference-standard result");
  });

  it("is analysed on everyone with both results, and its sensitivity rows are about accuracy", () => {
    expect(build.rules.populations.map((p) => p.name)).toEqual(["Diagnostic accuracy set"]);
    expect(build.rules.sensitivity_rows.join(" ")).toContain("Indeterminate");
    expect(build.rules.sensitivity_rows.join(" ")).toContain("One nodule per participant");
    expect(build.rules.sensitivity_rows.join(" ")).not.toContain("tipping-point");
    const sensitivity = build.tables.find((t) => t.kind === "sensitivity")!;
    expect(sensitivity.columns).toContain("Area under the curve (95% CI)");
  });
});

describe("a diagnostic accuracy study, the exploratory questions", () => {
  const exploratory = build.tables.filter((t) => t.block === "exploratory");

  it("asks accuracy within each subgroup", () => {
    const [subgroup] = exploratory.filter((t) => t.fills.includes("E1"));
    expect(subgroup.kind).toBe("accuracy_by_subgroup");
    expect(subgroup.rows.map((r) => r.label)).toEqual([
      "Nodule size - Under 1 cm",
      "Nodule size - 1 cm or more",
    ]);
  });

  it("relates each variable to the reference standard", () => {
    const [related] = exploratory.filter((t) => t.fills.includes("E2"));
    expect(related.columns).toEqual(["Variable", "Malignant", "Benign", "p"]);
    expect(row("E2").unadjusted!.test).toContain("chi-square");
    // An acronym keeps its capitals mid-sentence.
    expect(row("E2").unadjusted!.test).toContain("between serum TSH and");
    expect(related.rows.map((r) => r.label)).toContain(
      "Spearman ρ, serum TSH with normalised stiffness, mean (95% CI)",
    );
  });

  it("compares the alternative definitions of the index test", () => {
    const [derivation] = exploratory.filter((t) => t.fills.includes("E3"));
    expect(derivation.kind).toBe("accuracy");
    expect(row("E3").unadjusted!.test).toContain("DeLong's test for correlated curves");
  });
});

describe("a diagnostic accuracy study, the checks", () => {
  // Each of these reported something that was not wrong on the real protocol.
  it("S6-3 does not take a table with the word sensitivity in its title for the sensitivity table", () => {
    expect(check("S6-3").pass).toBe(true);
    // The real protocol's primary outcome was written "... (sensitivity,
    // specificity, PPV, NPV, accuracy and area under the ROC curve ...)", and
    // any primary table carrying the outcome's name in its title was taken for
    // the sensitivity analyses.
    const insulin = buildSap({
      ...idaPreg,
      primary: { ...idaPreg.primary, what: "Change in insulin sensitivity index" },
    });
    expect(insulin.checks.find((c) => c.id === "S6-3")!.pass).toBe(true);
  });

  it("S4-8 reads a precision formula for sensitivity as agreeing with an accuracy analysis", () => {
    expect(check("S4-8").pass).toBe(true);
  });

  it("S4-3 and S7-9 do not treat an accuracy question as a binary effect", () => {
    for (const id of ["S4-3", "S7-9", "S2-1"]) expect(check(id).pass, id).toBe(true);
  });

  it("S4-6 accepts a grade cut in two where the grade is analysed as a grade beside it", () => {
    expect(check("S4-6").pass).toBe(true);
    // And still warns where it is not.
    const cutOnly = buildSap({ ...elastography, secondary: [elastography.secondary[0]] });
    expect(cutOnly.checks.find((c) => c.id === "S4-6")!.pass).toBe(false);
  });

  it("titles a table by the question it answers, without the reading's asides", () => {
    const titles = buildSap({
      ...elastography,
      secondary: elastography.secondary.map((c, i) =>
        i === 2 ? { ...c, what: `${c.what} (stated only in the statistical analysis section)` } : c,
      ),
    }).tables.map((t) => t.title);
    expect(titles).toContain(
      "Difference in absolute and normalised stiffness between benign and malignant nodules, by reference-standard result",
    );
    expect(titles.join(" ")).not.toContain("stated only");
  });

  it("blocks nothing, and is the same document twice", () => {
    expect(blockers(build).map((c) => c.id)).toEqual([]);
    expect(renderSapMarkdown(buildSap(elastography))).toBe(renderSapMarkdown(build));
  });
});
