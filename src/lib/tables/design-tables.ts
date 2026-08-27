import fs from "node:fs";
import path from "node:path";
import type { DesignFamily } from "../sap/types.ts";
import type { TableRole } from "./types.ts";

/**
 * Which tables a design requires.
 *
 * The rules live in `design-tables.md`, as a table anyone can read and edit,
 * exactly as the analysis rules live in `test-rules.md`. That file decides which
 * analysis a row gets; this one decides which tables the document contains.
 *
 * The two are separate because they answer different questions. A binary outcome
 * compared between two groups is analysed the same way whether the study is a
 * trial or a cohort, but the documents are not the same: the trial owes a
 * participant-flow table and a baseline table with no p values, the cohort owes
 * person-time and an incidence rate ratio. Deciding the tables from the data
 * type alone is what produced one document shape for every study.
 */

export type DesignRule = {
  design: string;
  roles: TableRole[];
  /** False where a baseline table must carry no significance test. */
  baselineP: boolean;
  /** What an examiner checks. Printed under the block. */
  check: string;
};

const RULES_PATH = path.join(process.cwd(), "src", "lib", "tables", "design-tables.md");

let cached: DesignRule[] | null = null;

/** Reads the Markdown table. */
export function loadDesignRules(source?: string): DesignRule[] {
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
    .filter((cells) => cells.length === 4)
    .filter((cells) => cells[0] !== "design" && !/^-+$/.test(cells[0]))
    .map(([design, roles, baselineP, check]) => ({
      design,
      roles: roles
        .split(";")
        .map((role) => role.trim())
        .filter(Boolean) as TableRole[],
      baselineP: baselineP !== "no",
      check,
    }));

  if (!source) cached = rules;
  return rules;
}

/**
 * @returns the rule for a design, falling back to the `any` row.
 *
 * A plan that does not classify its design still gets the tables every
 * comparative study needs, rather than no tables at all.
 */
export function designRule(
  design: DesignFamily | undefined,
  rules: DesignRule[] = loadDesignRules(),
): DesignRule {
  return (
    rules.find((rule) => rule.design === design) ??
    rules.find((rule) => rule.design === "any") ?? {
      design: "any",
      roles: ["descriptive", "summary", "effect_unadjusted", "effect_adjusted"],
      baselineP: true,
      check: "",
    }
  );
}
