import fs from "node:fs";
import path from "node:path";
import type { SapSpec } from "./types.ts";

/**
 * What a study must record, whatever its protocol said.
 *
 * The companion to `../tables/design-tables.md`, and read the same way: that
 * file says which tables a design owes, this one says which variables. Both
 * exist because a protocol's omissions travel the whole chain in silence. The
 * plan declares what the protocol names, the form collects what the plan
 * declares, and until now nobody asked what the protocol should have named.
 *
 * Two conditions, not one. `when` decides whether a requirement applies to this
 * study at all, because residual disease matters in cancer surgery and nowhere
 * else, and a rule that fires on every study is a rule people learn to scroll
 * past. `match` then decides whether the plan already has it, by the words a
 * plan would use: completeness of cytoreduction, R status and residual disease
 * are one variable under three names.
 */

export type VariableRule = {
  design: string;
  /**
   * Groups of words the study's own text must contain: any word within a group,
   * every group. Empty for a requirement that applies to the whole design.
   *
   * One group is often too blunt. "Reoperation" is owed by a study that cuts
   * people open and then follows their complications, and by neither half
   * alone: keyed on surgery it fires on an operation whose outcome is measured
   * on the table, and keyed on complications it fires on a neonatal trial that
   * reports intraventricular haemorrhage.
   */
  when: string[][];
  requires: string;
  /** Words that identify it among the plan's labels. */
  match: string[];
  why: string;
};

const RULES_PATH = path.join(process.cwd(), "src", "lib", "sap", "design-variables.md");

let cached: VariableRule[] | null = null;

const words = (cell: string) =>
  cell
    .split(";")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

export function loadVariableRules(source?: string): VariableRule[] {
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
    .filter((cells) => cells.length === 5)
    .filter((cells) => cells[0] !== "design" && !/^-+$/.test(cells[0]))
    .map(([design, when, requires, match, why]) => ({
      design,
      when:
        when.toLowerCase() === "always"
          ? []
          : when.split("+").map(words).filter((group) => group.length),
      requires,
      match: words(match),
      why,
    }));

  if (!source) cached = rules;
  return rules;
}

/**
 * The requirements this study has not met.
 *
 * Matched against the plan's own wording rather than its ids, because the
 * question is whether the concept is present, not whether it was given the name
 * this file happens to use.
 */
/**
 * Whether a word appears, as a word.
 *
 * A plain substring test found "harm" inside "pharmacologically" and concluded
 * a trial had recorded its adverse events. Matching starts at a word boundary
 * and a trailing stem is allowed, so "operat" still finds "operative time" and
 * "surg" still finds "surgery", which is what the stems in the file are for.
 */
function mentions(haystack: string, needle: string): boolean {
  return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack);
}

/**
 * A trial variant is still a trial.
 *
 * A non-inferiority trial owes its adverse events exactly as a parallel-group
 * trial does, so `trial` in the design column matches every one of them.
 */
function appliesTo(ruleDesign: string, family: string | undefined): boolean {
  if (ruleDesign === "any") return true;
  if (ruleDesign === "trial") return Boolean(family?.endsWith("_trial"));
  return ruleDesign === family;
}

export function unmetRequirements(
  spec: SapSpec,
  rules: VariableRule[] = loadVariableRules(),
): VariableRule[] {
  // What the study says it is, for deciding which requirements apply. The
  // setting is deliberately left out: a department name says where a study
  // happens and not what it does, and a questionnaire validated in a surgical
  // department was being asked for its patients' ASA grades.
  const about = [spec.title, spec.design, spec.aim, spec.picot?.assembled_question]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // What the plan says it will record, for deciding which are already met. The
  // unit coding is included because a plan often names the concept there:
  // "Yes / No" tells you nothing, "R0 / R1 / R2" tells you everything.
  const declared = [
    ...(spec.variables ?? []).flatMap((v) => [v.label, v.unit_coding]),
    ...(spec.outcomes ?? []).flatMap((o) => [o.what, o.how, o.instrument]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return rules.filter((rule) => {
    if (!appliesTo(rule.design, spec.design_family)) return false;
    if (!rule.when.every((group) => group.some((w) => mentions(about, w)))) return false;
    return !rule.match.some((m) => mentions(declared, m));
  });
}
