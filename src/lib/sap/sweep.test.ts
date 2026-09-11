import { describe, expect, it } from "vitest";
import { idaPreg } from "../facts/fixture.ts";
import { matchKey, tests as testRows } from "../analysis/decision-tables.ts";
import { templates } from "../tables/build.ts";
import type { FactsSheet } from "../study/types.ts";
import type { DataType, DesignFamily } from "../study/vocabulary.ts";
import { buildSap } from "./build.ts";
import { renderSapMarkdown } from "./markdown.ts";

/**
 * Every design, against every outcome type, at every group count and visit
 * count. Nine hundred and seventy-two plans, built twice each.
 *
 * Written because reading found three bugs and this found seven, all of them in
 * combinations nobody had thought to try. An ordered scale was drawn as a
 * two-by-two ratio table with "1 (reference)" in it, contradicting its own
 * footnote, which named a cumulative-link model; a repeated count lost its
 * trajectory table; a single-group study was given an "Adjusted comparison"
 * with no model behind it; a crossover trial produced two tables numbered 6a.
 *
 * It asserts nothing about what any one plan should say. It asserts the
 * invariants that hold for all of them, which is what a sweep is for.
 */

const DESIGNS: DesignFamily[] = [
  "randomised_trial", "non_inferiority_trial", "crossover_trial", "cluster_trial",
  "factorial_trial", "non_randomised_interventional", "cohort", "case_control",
  "cross_sectional", "descriptive_epidemiology", "diagnostic_accuracy",
  "prognostic_model", "agreement", "qualitative", "mixed_methods",
  "systematic_review", "economic_evaluation", "case_report",
];

const TYPES: DataType[] = [
  "continuous", "count", "binary", "nominal", "ordinal", "time_to_event",
];

const OBSERVED = [
  "cohort", "case_control", "cross_sectional", "descriptive_epidemiology",
  "diagnostic_accuracy", "prognostic_model", "agreement", "qualitative",
  "mixed_methods", "systematic_review", "economic_evaluation", "case_report",
];

function shape(
  design: DesignFamily,
  type: DataType,
  groups: number,
  times: string[],
): FactsSheet {
  return {
    ...idaPreg,
    design,
    frame: OBSERVED.includes(design) ? "PECO" : "PICO",
    groups: [
      ...idaPreg.groups.slice(0, Math.min(groups, 2)),
      ...(groups === 3 ? [{ code: "Third", label: "A third arm" }] : []),
    ],
    allocation:
      groups >= 2
        ? idaPreg.allocation
        : { ratio: "", block: null, strata: [], matched: null },
    timepoints: times,
    visit_schedule: times.map((t, i) => ({
      timepoint: t,
      label: `Visit ${i}`,
      measures: idaPreg.visit_schedule[0].measures,
    })),
    primary: {
      ...idaPreg.primary,
      type,
      time: times,
      measures: ["haemoglobin"],
      unit: type === "binary" ? "Yes / No" : "g/dL",
      expected_frequency: type === "binary" ? 0.3 : null,
    },
    secondary: [],
    exploratory_ideas: [],
  };
}

const VISITS = [["W6"], ["D0", "W6"], ["D0", "W2", "W4", "W6"]];

describe("every design, against every outcome type", () => {
  const problems: string[] = [];

  for (const design of DESIGNS) {
    for (const type of TYPES) {
      for (const groups of [0, 2, 3]) {
        for (const times of VISITS) {
          const label = `${design}/${type}/${groups} groups/${times.length} visits`;
          let built;
          try {
            built = buildSap(shape(design, type, groups, times));
          } catch (error) {
            problems.push(`${label}: threw ${(error as Error).message}`);
            continue;
          }
          const { tables, figures, objectives, variables } = built;
          const markdown = renderSapMarkdown(built);

          if (renderSapMarkdown(buildSap(shape(design, type, groups, times))) !== markdown) {
            problems.push(`${label}: two builds differ`);
          }

          const numbered = tables.filter((t) => !t.fit_table_of).map((t) => t.number);
          const wanted = numbered.map((_, i) => `${i + 1}`);
          if (numbered.join() !== wanted.join()) {
            problems.push(`${label}: numbered ${numbered.join()}`);
          }
          if (new Set(tables.map((t) => t.number)).size !== tables.length) {
            problems.push(`${label}: two tables share a number`);
          }

          const ids = new Set(objectives.map((o) => o.id));
          const names = new Set(variables.map((v) => v.name));
          for (const table of tables) {
            if (!table.rows.length) problems.push(`${label}: T${table.number} has no rows`);
            if (table.columns.length < 2) {
              problems.push(`${label}: T${table.number} has one column`);
            }
            if (!table.footnote.trim()) problems.push(`${label}: T${table.number} has no footnote`);
            for (const fill of table.fills) {
              if (!ids.has(fill)) problems.push(`${label}: T${table.number} fills ${fill}`);
            }
            for (const name of table.variables) {
              if (!names.has(name)) problems.push(`${label}: T${table.number} names ${name}`);
            }
          }
          for (const objective of objectives) {
            if (!tables.some((t) => t.fills.includes(objective.id))) {
              problems.push(`${label}: ${objective.id} reaches no table`);
            }
          }
          for (const figure of figures) {
            const printed = markdown.split(`**Figure ${figure.number}.`).length - 1;
            if (printed !== 1) {
              problems.push(`${label}: Figure ${figure.number} printed ${printed} times`);
            }
            if (!tables.some((t) => t.number === figure.after)) {
              problems.push(`${label}: Figure ${figure.number} follows no table`);
            }
          }
        }
      }
    }
  }

  it("builds 972 plans with no broken invariant", () => {
    expect(problems.slice(0, 12)).toEqual([]);
  });
});

describe("the decision tables and the templates agree with the code", () => {
  it("has no row under a key the code cannot produce", () => {
    // Firth sat in decision table C for a week under the key "separation",
    // which nothing could ever select. A rule nobody can reach is not a rule.
    const SHAPES = [
      "two_groups", "many_groups", "paired", "repeated", "single", "pair",
      "competing", "diagnostic", "prediction",
    ];
    const reachable = new Set(
      TYPES.flatMap((type) => SHAPES.map((s) => `${type}/${s}`)),
    );
    for (const row of testRows()) {
      expect(reachable.has(row.Key), row.Key).toBe(true);
    }
  });

  it("has a drawing case for every table kind a template names", () => {
    const kinds = new Set(
      templates().flatMap((t) => t.Tables.split(",").map((k) => k.trim())),
    );
    // `survival`, `cox`, `two_by_two` and `accuracy` were named in the
    // template file with no case behind them, so a time-to-event study drew
    // two one-row grids that both carried the Kaplan-Meier footnote.
    const build = buildSap({
      ...idaPreg,
      primary: {
        ...idaPreg.primary,
        what: "Time to relapse",
        type: "time_to_event",
        unit: "days",
        time: ["W6"],
      },
      secondary: [],
      exploratory_ideas: [],
    });
    for (const table of build.tables) {
      // `descriptive` and `sensitivity` are placement rules rather than
      // template rows: one table per measured block, and the sensitivity table
      // always last in the primary block.
      const placed = ["descriptive", "sensitivity"];
      expect(kinds.has(table.kind) || placed.includes(table.kind), table.kind).toBe(true);
      // A kind that fell through to the default draws "Item | Value" with one
      // row, which is how the defect looked.
      if (table.kind !== "fit" && table.kind !== "calibration") {
        expect(
          table.columns.join() !== "Item,Value" || table.rows.length > 1,
          `${table.kind} looks like the default case`,
        ).toBe(true);
      }
    }
  });

  it("keys every template the situations can produce", () => {
    const keys = new Set(templates().map((t) => t.Key));
    for (const key of [
      "continuous_repeated", "continuous_single", "skewed_continuous",
      "binary_common", "binary_rare", "binary_few_events", "ordinal_outcome",
      "ordinal_repeated", "nominal_outcome", "count_outcome", "count_repeated",
      "time_to_event", "time_to_event_competing", "diagnostic", "prediction",
      "safety", "estimation",
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
  });

  it("finds a row for every combination the shapes can make", () => {
    for (const type of TYPES) {
      expect(
        matchKey(testRows(), `${type}/two_groups`) ??
          matchKey(testRows(), `${type}/single`),
        type,
      ).toBeTruthy();
    }
  });
});
