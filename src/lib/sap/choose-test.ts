import fs from "node:fs";
import path from "node:path";
import type { AnalysisRow } from "./types.ts";

/**
 * Names the statistical test for an analysis row.
 *
 * The rules live in `test-rules.md`, as a table anyone can read and edit. The
 * model never chooses a test: given the same data type and comparison it would
 * not always answer the same way, and a plan whose test depends on the run is
 * not a plan. It may override a rule, but only with a reason that prints in the
 * document.
 */

export type Rule = {
  data_type: string;
  comparison: string;
  paired: string;
  skewed: string;
  test: string;
  why: string;
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
    .filter((cells) => cells.length === 6)
    // Drop the header and the --- separator.
    .filter((cells) => cells[0] !== "data_type" && !/^-+$/.test(cells[0]))
    .map(([data_type, comparison, paired, skewed, test, why]) => ({
      data_type,
      comparison,
      paired,
      skewed,
      test,
      why,
    }));

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
  row: Pick<AnalysisRow, "data_type" | "comparison" | "paired" | "skewed" | "test_override" | "override_reason">,
  rules: Rule[] = loadRules(),
): { test: string; why: string; overridden: boolean } | null {
  if (row.test_override) {
    return {
      test: row.test_override,
      why: row.override_reason ?? "Departs from the standard rule; no reason was given.",
      overridden: true,
    };
  }

  const paired = row.paired ? "true" : "false";
  const skewed = row.skewed ? "true" : "false";

  const hit = rules.find(
    (rule) =>
      matches(rule.data_type, row.data_type) &&
      matches(rule.comparison, row.comparison) &&
      matches(rule.paired, paired) &&
      matches(rule.skewed, skewed),
  );

  return hit ? { test: hit.test, why: hit.why, overridden: false } : null;
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
