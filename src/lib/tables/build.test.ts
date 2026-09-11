import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import type { FactsSheet, ShellTable } from "../study/types.ts";
import { buildObjectives } from "../objectives/build.ts";
import { buildVariables } from "../variables/build.ts";
import { buildExploratory } from "../variables/exploratory.ts";
import { buildAnalysis } from "../analysis/build.ts";
import { buildRules } from "../rules/build.ts";
import { buildTables, numberTheMap, templates } from "./build.ts";
import { step6Checks } from "./checks.ts";

const build = (facts: FactsSheet = idaPreg) => {
  const objectives = buildObjectives(facts);
  const { variables } = buildVariables(facts, objectives);
  const { outcomes } = buildExploratory(facts, objectives, variables);
  const { rows } = buildAnalysis(facts, objectives, variables, outcomes);
  const { rules } = buildRules(facts, objectives, rows);
  const set = buildTables(facts, objectives, variables, rows, outcomes, rules);
  return { objectives, variables, analysis: rows, rules, ...set };
};
const table = (number: string, facts: FactsSheet = idaPreg) =>
  build(facts).tables.find((t) => t.number === number)!;

describe("Step 6, the shell tables", () => {
  it("draws the register Appendix B pins: 16 tables, 4 fit tables, 1 figure", () => {
    // This is the acceptance test for the whole rebuild. The old build gave
    // 16, 18, 19 and 20 tables on four runs of one protocol.
    const { tables, figures } = build();
    expect(tables.filter((t) => !t.fit_table_of)).toHaveLength(16);
    expect(tables.filter((t) => t.fit_table_of).map((t) => t.number)).toEqual([
      "6a", "8a", "10a", "12a",
    ]);
    expect(figures).toHaveLength(1);
  });

  it("draws the same register twice", () => {
    expect(JSON.stringify(build().tables)).toBe(JSON.stringify(build().tables));
  });

  it("puts the blocks in order and numbers straight through them", () => {
    const numbered = build().tables.filter((t) => !t.fit_table_of);
    expect(numbered.map((t) => t.block)).toEqual([
      "descriptive", "descriptive",
      "primary", "primary", "primary", "primary", "primary", "primary", "primary",
      "secondary", "secondary", "secondary", "secondary",
      "exploratory", "exploratory", "exploratory",
    ]);
    expect(numbered.map((t) => t.number)).toEqual(
      Array.from({ length: 16 }, (_, i) => `${i + 1}`),
    );
  });

  it("never merges two descriptive blocks into one table", () => {
    expect(table("1").title).toBe(
      "Baseline demographic and obstetric characteristics by arm",
    );
    expect(table("2").title).toBe("Baseline haematological and iron profile by arm");
    expect(table("1").variables).not.toContain("haemoglobin");
  });

  it("gives a categorical variable one row per category, in the dictionary's order", () => {
    const labels = table("1").rows.map((r) => r.label);
    expect(labels).toContain("Residence - Urban");
    expect(labels).toContain("Residence - Rural");
    expect(labels.indexOf("Residence - Urban")).toBeLessThan(
      labels.indexOf("Residence - Rural"),
    );
  });

  it("names the unit and the summary type in a continuous row label", () => {
    expect(table("1").rows[0].label).toBe("Age (years) - Mean ± SD");
    // A count is summarised as a median, not a mean.
    expect(table("1").rows.map((r) => r.label)).toContain(
      "Gravidity (pregnancies) - Median (IQR)",
    );
  });

  it("carries the computed variable into the descriptive table, with no field for it", () => {
    expect(table("1").rows.map((r) => r.label)).toContain(
      "Body mass index (kg/m2) - Mean ± SD",
    );
  });

  it("does not test a randomised trial's baseline", () => {
    expect(table("1").footnote).toContain("baseline differences are not tested");
    expect(table("1").columns).not.toContain("p");
  });

  it("tests the baseline of an observational study", () => {
    const cohort: FactsSheet = { ...idaPreg, design: "cohort", frame: "PECO" };
    expect(table("1", cohort).footnote).toContain("chi-square");
  });

  it("draws the repeated-outcome sequence in the order A4 writes it", () => {
    const { tables } = build();
    expect(tables.slice(2, 12).map((t) => `${t.number} ${t.title}`)).toEqual([
      "3 Haemoglobin at day 0 and week 6, and the change, by arm - summary",
      "4 Unadjusted comparison of change in haemoglobin",
      "5 Haemoglobin at each visit by arm (descriptive)",
      "6 Rate of change in haemoglobin over the study period",
      "6a Model fit and assumptions for Table 6",
      "7 Covariate overlap check before adjustment",
      "8 Adjusted comparison of change in haemoglobin",
      "8a Model fit and assumptions for Table 8",
      "9 Sensitivity analyses",
      "10 Anaemia corrected at week 6",
    ]);
  });

  it("reports each visit without a p value, and says where the test is", () => {
    expect(table("5").columns).not.toContain("p");
    expect(table("5").footnote).toContain("tested once, in Table 6");
  });

  it("writes the slope in the unit the visit codes imply", () => {
    // The unit is on the row and not on the column, because the contrast at
    // the last visit is in g/dL and the slopes are in g/dL per week, and one
    // heading cannot be right for both.
    const labels = table("6").rows.map((r) => r.label);
    expect(labels).toContain("Slope, FCM (g/dL per week)");
    expect(labels).toContain(
      "Slope difference, FCM minus Oral (g/dL per week) = arm by visit",
    );
  });

  it("reports how far apart the arms are at the visit the study is about", () => {
    // The interaction says how fast. On its own it never says how far.
    expect(table("6").rows.map((r) => r.label)).toContain(
      "Difference between arms at week 6 (g/dL)",
    );
  });

  it("takes the model's own diagnostics into its fit table", () => {
    const fit = table("6a").rows.map((r) => r.label).join(" ");
    expect(fit).toContain("Intraclass correlation");
    expect(fit).toContain("Normal random effects - met or not met");
    // Convergence is both a thing to report and a thing to check, and the row
    // appears once.
    expect(fit.match(/Convergence/g)).toHaveLength(1);
    // Not the linear-regression diagnostics, which would be the wrong ones.
    expect(fit).not.toContain("Cook's distance");
  });

  it("puts the overlap check immediately before the table that adjusts", () => {
    expect(table("7").rows.map((r) => r.label)).toEqual([
      "Haemoglobin", "Gestational age",
    ]);
    expect(table("8").title).toContain("Adjusted");
  });

  it("closes the primary block with the sensitivity table", () => {
    const primary = build().tables.filter(
      (t) => t.block === "primary" && !t.fit_table_of,
    );
    expect(primary[primary.length - 1].title).toBe("Sensitivity analyses");
    expect(primary[primary.length - 1].rows.length).toBe(6);
  });

  it("gives the binary secondary one ratio table with the absolute measure beside", () => {
    expect(table("10").columns).toEqual([
      "Comparison",
      "FCM n/N (%)",
      "Oral n/N (%)",
      "Risk ratio (95% CI)",
      "Risk difference, and the number needed to treat (95% CI)",
      "p",
    ]);
    expect(table("10").rows.map((r) => r.label)).toContain("Oral - 1 (reference)");
    expect(table("10").footnote).toContain("Log-binomial");
  });

  it("does not take the primary's model into the secondary's footnote", () => {
    // The chain and its rows are linked by objective id. Linking them by the
    // outcome variable pulls the trajectory row about haemoglobin into the
    // anaemia-correction table, whose outcome is computed from haemoglobin.
    expect(table("10").footnote).not.toContain("mixed model");
  });

  it("gives the skewed outcome a median table and a log-scale model", () => {
    expect(table("11").columns).toContain("FCM - Median (IQR)");
    expect(table("11").columns).toContain("Hodges-Lehmann difference (95% CI)");
    expect(table("12").footnote).toContain("log scale");
  });

  it("reports the safety outcome and does not model it", () => {
    expect(table("13").title).toContain("safety set");
    expect(table("13").footnote).toContain("Fisher's exact");
    expect(build().tables.some((t) => t.fit_table_of === "13")).toBe(false);
  });

  it("asks for the subgroup cut-off rather than choosing one", () => {
    expect(table("14").rows[0].label).toContain("**TODO:** state the cut-off");
    expect(build().todos.join(" ")).toContain("A cut-off chosen after the data arrive");
  });

  it("draws the subgroup rows where the variable already has categories", () => {
    expect(table("16").rows.map((r) => r.label)).toEqual([
      "Dietary pattern - Vegetarian",
      "Dietary pattern - Mixed",
      "Dietary pattern - Non-vegetarian",
    ]);
  });

  it("gives no exploratory table a fit table", () => {
    const exploratory = build().tables.filter((t) => t.block === "exploratory");
    expect(exploratory.every((t) => !t.fit_table_of)).toBe(true);
  });

  it("leaves every value cell blank", () => {
    for (const t of build().tables) {
      for (const row of t.rows) expect(row.label).not.toMatch(/\d+\.\d+(?!\s*g)/);
    }
  });

  it("writes the final numbers back into the Analysis Map", () => {
    const { analysis, tables } = build();
    const numbered = numberTheMap(analysis, tables);
    const p1a = numbered.find((r) => r.objective === "P1a")!;
    expect(p1a.unadjusted!.table).toBe("4");
    expect(p1a.adjusted!.table).toBe("8");
    expect(p1a.adjusted!.fit_table).toBe("8a");
    const p1b = numbered.find((r) => r.objective === "P1b")!;
    expect(p1b.adjusted!.table).toBe("6");
    expect(p1b.adjusted!.fit_table).toBe("6a");
  });

  it("has a template for every situation its own keys can produce", () => {
    expect(templates().map((t) => t.Key)).toContain("continuous_repeated");
    expect(templates().map((t) => t.Key)).toContain("binary_common");
  });
});

describe("Step 6 checks", () => {
  const counts = (tables: ShellTable[], figures: unknown[]) => ({
    tables: tables.filter((t) => !t.fit_table_of).length,
    fits: tables.filter((t) => t.fit_table_of).length,
    figures: figures.length,
  });

  it("passes every check on the worked example", () => {
    const { tables, figures } = build();
    expect(
      step6Checks(idaPreg, tables, figures, counts(tables, figures)).filter(
        (r) => !r.pass,
      ),
    ).toEqual([]);
  });

  it("S6-1 catches a value left in a shell table", () => {
    const { tables, figures } = build();
    const filled = tables.map((t) =>
      t.number === "4"
        ? { ...t, rows: [{ label: "Hb change 1.85 (0.9 to 2.8), p = 0.002", variable: null, indent: false }] }
        : t,
    );
    expect(
      step6Checks(idaPreg, filled, figures, counts(filled, figures)).find(
        (r) => r.id === "S6-1",
      )!.pass,
    ).toBe(false);
  });

  it("S6-2 catches a table with no footnote", () => {
    const { tables, figures } = build();
    const bare = tables.map((t) => (t.number === "4" ? { ...t, footnote: "" } : t));
    expect(
      step6Checks(idaPreg, bare, figures, counts(bare, figures)).find(
        (r) => r.id === "S6-2",
      )!.failing,
    ).toEqual(["4"]);
  });

  it("S6-3 catches the sensitivity table moved out of last place", () => {
    const { tables, figures } = build();
    const moved = [...tables];
    const index = moved.findIndex((t) => t.number === "9");
    moved.splice(2, 0, moved.splice(index, 1)[0]);
    expect(
      step6Checks(idaPreg, moved, figures, counts(moved, figures)).find(
        (r) => r.id === "S6-3",
      )!.pass,
    ).toBe(false);
  });

  it("S6-4 catches a model table with no diagnostics", () => {
    const { tables, figures } = build();
    const without = tables.filter((t) => t.number !== "8a");
    expect(
      step6Checks(idaPreg, without, figures, counts(without, figures)).find(
        (r) => r.id === "S6-4",
      )!.failing,
    ).toEqual(["8"]);
  });

  it("S6-5 catches a p column on a randomised trial's baseline table", () => {
    const { tables, figures } = build();
    const tested = tables.map((t) =>
      t.number === "1" ? { ...t, columns: [...t.columns, "p"] } : t,
    );
    expect(
      step6Checks(idaPreg, tested, figures, counts(tested, figures)).find(
        (r) => r.id === "S6-5",
      )!.failing,
    ).toEqual(["1"]);
  });

  it("S6-5 catches a p column on a per-visit table", () => {
    const { tables, figures } = build();
    const tested = tables.map((t) =>
      t.number === "5" ? { ...t, columns: [...t.columns, "p"] } : t,
    );
    expect(
      step6Checks(idaPreg, tested, figures, counts(tested, figures)).find(
        (r) => r.id === "S6-5",
      )!.failing,
    ).toEqual(["5"]);
  });

  it("S6-6 catches a pinned count that is not the count", () => {
    const { tables, figures } = build();
    expect(
      step6Checks(idaPreg, tables, figures, { tables: 18, fits: 4, figures: 1 }).find(
        (r) => r.id === "S6-6",
      )!.pass,
    ).toBe(false);
  });
});
