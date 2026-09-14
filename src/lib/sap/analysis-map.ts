import type { AnalysisRow } from "../study/types.ts";
import { DIAGNOSTIC_NOTE } from "../study/diagnostic.ts";
import { labelOf } from "../variables/name.ts";
import type { SapBuild } from "./build.ts";

/**
 * The Analysis Map as rows any renderer can print.
 *
 * One cell used to do six jobs - the unadjusted test and its fallback, the
 * adjusted model and its covariates, the table, the fit table and the
 * exception - as one paragraph joined by semicolons. It also repeated every
 * shell table's footnote word for word, and printed "per participant, 1 value
 * per participant" on every row alike. Chosen by the investigator on
 * 14 Sep 2026 from three layouts: one line per cell, each column answering one
 * question, and the detail left to the footnote of the table the row names.
 *
 * That last part is a promise, and `tables/footnotes.test.ts` holds the tables
 * to it: every test, model and fallback the map leaves out is in the footnote
 * of a table the row points at.
 *
 * One module behind the markdown, the Word file and the screen, so the three
 * show one map. Nothing here decides an analysis; it chooses words for one the
 * build already decided.
 */

export const MAP_HEADINGS = [
  "Objective",
  "Outcome",
  "Predictor(s)",
  "Unadjusted",
  "Adjusted for",
  "Table",
];

export const MAP_DETAIL_LINE =
  "Each analysis is named here and set out in full in the footnote of the table it points to: the exact test, what is used where its assumptions fail, and how the model is fitted.";

/** Words, never the identifiers code uses. */
const words = (text: string) => text.replace(/_/g, " ");

type Unit = { unit: string; count: string; n: number };

/** Where the unit of analysis and the count are the same, they are said once. */
function commonUnit(analysis: AnalysisRow[]) {
  const tally = new Map<string, Unit>();
  for (const row of analysis) {
    const key = JSON.stringify([row.unit_of_analysis, row.count]);
    const hit = tally.get(key);
    if (hit) hit.n += 1;
    else tally.set(key, { unit: row.unit_of_analysis, count: row.count, n: 1 });
  }
  // The most common pair, and the first seen among equals, so two runs agree.
  let best: Unit | null = null;
  for (const entry of tally.values()) if (!best || entry.n > best.n) best = entry;
  return { unit: best?.unit ?? "", count: best?.count ?? "", uniform: tally.size <= 1 };
}

/** The sentence above the grid naming the unit every row shares. */
export function unitLine(build: SapBuild): string {
  const { unit, count, uniform } = commonUnit(build.analysis);
  if (!unit) return MAP_DETAIL_LINE;
  const rest = uniform ? "" : ", unless the outcome says otherwise";
  return `Unit of analysis: ${unit}, ${count}${rest}. ${MAP_DETAIL_LINE}`;
}

/** What stands in the Adjusted column where there is no model. */
function noModel(row: AnalysisRow, correlation: boolean): string {
  if (row.exception === "safety") return "Not applicable: safety outcome, reported and not modelled";
  if (row.exception === "estimation") return "Not applicable: estimation only";
  if (row.exception === "too_few_events") return "Not applicable: too few events to fit a model";
  if (row.exception === "diagnostic") return DIAGNOSTIC_NOTE;
  // An exploratory question about two variables is answered unadjusted by
  // design. Its test is often not a correlation - a t-test, an analysis of
  // variance - so the cell says why there is no model, not what kind it is.
  if (correlation) return "Not applicable: exploratory, unadjusted only";
  return "None";
}

export function mapRows(build: SapBuild): string[][] {
  const { analysis, objectives, exploratory, variables } = build;
  // A name the variable list does not hold - an exploratory question naming
  // something the study never collects, which S3-1 reports - has no label to
  // print, and its identifier is still not words.
  const label = (name: string) =>
    variables.some((v) => v.name === name) ? labelOf(variables, name) : words(name);
  const { unit, count } = commonUnit(analysis);

  return analysis.map((row) => {
    const family = objectives.find((o) => o.id === row.objective)?.family ?? "";

    // The data type decides the test, so it stays beside the outcome. The unit
    // and the count join it only on a row that differs from the line above.
    const differs = [
      ...(row.unit_of_analysis !== unit ? [row.unit_of_analysis] : []),
      ...(row.count !== count ? [row.count] : []),
    ];
    const outcome = `${label(row.outcome)} (${[words(row.data_type), ...differs].join("; ")})`;

    // `short` is absent from a plan stored before short names existed, which
    // prints the whole sentence rather than nothing.
    const unadjusted = row.unadjusted
      ? (row.unadjusted.short ?? row.unadjusted.test)
      : "None";

    const correlation =
      exploratory.find((e) => e.id === row.objective)?.kind === "correlation";
    let adjusted: string;
    if (row.adjusted) {
      const model = row.adjusted.short ?? row.adjusted.model;
      const covariates = row.adjusted.covariates.map((c) => label(c.var));
      adjusted = covariates.length ? `${model}; ${covariates.join(", ")}` : model;
    } else {
      adjusted = noModel(row, correlation);
    }

    // Fit tables are left out: each is numbered beside its model table in
    // Section 6, as Table 8a is beside Table 8.
    const tables = [
      ...new Set(
        [row.unadjusted?.table, row.adjusted?.table].filter((n): n is string => Boolean(n)),
      ),
    ];

    return [
      `${family.toUpperCase()} - ${row.objective}`,
      outcome,
      row.predictors.map(label).join(", ") || "None",
      unadjusted,
      adjusted,
      tables.length ? tables.map((n) => `T${n}`).join(", ") : "None",
    ];
  });
}
