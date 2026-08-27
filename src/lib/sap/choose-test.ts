import fs from "node:fs";
import path from "node:path";
import type { AnalysisRow } from "./types.ts";

/**
 * Plans the analysis for a row.
 *
 * The rules live in `test-rules.md`, as a table anyone can read and edit. The
 * model never chooses an analysis: given the same data type and comparison it
 * would not always answer the same way, and a plan whose test depends on the
 * run is not a plan. It may override a rule, but only with a reason that prints
 * in the document.
 *
 * A row returns a small plan rather than a test name, because that is what an
 * analysis is: an unadjusted estimate, the model that holds confounders
 * constant, and what must not be done. Returning one string was the reason the
 * analysis map read as a lookup table instead of a plan.
 */

export type Rule = {
  data_type: string;
  comparison: string;
  /** none, paired or repeated. */
  pairing: string;
  skewed: string;
  /** common or rare, for a binary outcome. */
  frequency: string;
  unadjusted: string;
  adjusted: string;
  avoid: string;
  why: string;
  measures: string;
};

export type AnalysisPlan = {
  /** The estimate and its interval, before adjustment. */
  unadjusted: string | null;
  /** The model that holds confounders constant, where one applies. */
  adjusted: string | null;
  /** What must not be done here, and why. */
  avoid: string | null;
  why: string;
  /**
   * The estimates the effect table prints, one to a row.
   *
   * `unadjusted` is prose, written for a statistician to read. This is the same
   * decision in a form a table can be laid out from, so the effect measure on a
   * shell table is never invented: a common binary outcome gets a risk ratio
   * because the rule says so, not because a model guessed.
   */
  measures: string[];
  overridden: boolean;
};

const RULES_PATH = path.join(process.cwd(), "src", "lib", "sap", "test-rules.md");

let cached: Rule[] | null = null;

/** Reads the Markdown table. First matching row wins, so order is meaningful. */
export function loadRules(source?: string): Rule[] {
  if (!source && cached) return cached;
  const text = source ?? fs.readFileSync(RULES_PATH, "utf8");

  const rules = text
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 10)
    // Drop the header and the --- separator.
    .filter((cells) => cells[0] !== "data_type" && !/^-+$/.test(cells[0]))
    .map(
      ([
        data_type, comparison, pairing, skewed, frequency,
        unadjusted, adjusted, avoid, why, measures,
      ]) => ({
        data_type,
        comparison,
        pairing,
        skewed,
        frequency,
        unadjusted,
        adjusted,
        avoid,
        why,
        measures,
      }),
    );

  if (!source) cached = rules;
  return rules;
}

const matches = (ruleValue: string, actual: string) =>
  ruleValue === "any" || ruleValue === actual;

/**
 * @returns the named test and the reason, or null when no rule covers the row.
 *   A row nothing covers is a gap in the rules, and must be visible rather than
 *   silently given a plausible-looking default.
 */
export function chooseTest(
  row: Pick<
    AnalysisRow,
    | "data_type" | "comparison" | "pairing" | "skewed" | "frequency"
    | "test_override" | "override_reason"
  >,
  rules: Rule[] = loadRules(),
): AnalysisPlan | null {
  if (row.test_override) {
    return {
      unadjusted: row.test_override,
      adjusted: null,
      avoid: null,
      why: row.override_reason ?? "Departs from the standard rule; no reason was given.",
      // An override leaves the rule table behind, so there is no list to read.
      // The override itself becomes the one estimate the effect table prints,
      // which keeps the table honest: it reports what was actually planned.
      measures: [row.test_override],
      overridden: true,
    };
  }

  const skewed = row.skewed ? "true" : "false";
  const dash = (v: string) => (v && v !== "-" ? v : null);

  const hit = rules.find(
    (rule) =>
      matches(rule.data_type, row.data_type) &&
      matches(rule.comparison, row.comparison) &&
      matches(rule.pairing, row.pairing ?? "none") &&
      matches(rule.skewed, skewed) &&
      matches(rule.frequency, row.frequency ?? "unknown"),
  );

  if (!hit) return null;

  return {
    unadjusted: dash(hit.unadjusted),
    adjusted: dash(hit.adjusted),
    avoid: dash(hit.avoid),
    why: hit.why,
    measures: (dash(hit.measures) ?? "")
      .split(";")
      .map((measure) => measure.trim())
      .filter(Boolean),
    overridden: false,
  };
}

/**
 * The one-line form, for a table cell that has no room for the whole plan.
 * Everything it drops is printed under the map.
 */
export function planSummary(plan: AnalysisPlan): string {
  const parts: string[] = [];
  if (plan.unadjusted) parts.push(`Unadjusted: ${plan.unadjusted}`);
  if (plan.adjusted) parts.push(`Adjusted: ${plan.adjusted}`);
  return parts.join(". ") || plan.why;
}

/**
 * Below ten events per degree of freedom a model overfits. Said before the data
 * arrive, this is a plan; discovered afterwards it is an excuse.
 */
export function degreesOfFreedomNote(
  expectedEvents: number,
  predictorCount: number,
): { affordable: number; overfits: boolean; note: string } {
  const affordable = Math.floor(expectedEvents / 10);
  const overfits = predictorCount > affordable;
  return {
    affordable,
    overfits,
    note: overfits
      ? `Expected events: ${expectedEvents}. At ten events per degree of freedom the model affords ${affordable} predictor${affordable === 1 ? "" : "s"}, but ${predictorCount} are named. The adjusted model is therefore declared exploratory here, before the data arrive, rather than discovered at analysis.`
      : `Expected events: ${expectedEvents}. At ten events per degree of freedom the model affords ${affordable} predictor${affordable === 1 ? "" : "s"}, and ${predictorCount} are named, so the adjusted model is adequately supported.`,
  };
}
