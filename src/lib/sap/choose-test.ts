import fs from "node:fs";
import path from "node:path";
import type { AnalysisRow } from "./types.ts";

/**
 * Plans the analysis for a row.
 *
 * The rules live in `test-rules.md`, as blocks anyone can read and edit. The
 * model never chooses an analysis: given the same data type and comparison it
 * would not always answer the same way, and a plan whose test depends on the
 * run is not a plan. It may override a rule, but only with a reason that prints
 * in the document.
 *
 * A row returns a plan rather than a test name, because that is what an
 * analysis is: how the data are described, how normality is decided, the test
 * on either side of that decision with its statistic and its effect size, the
 * pairwise test where there are three groups, the model that holds confounders
 * constant, what each of those assumes and how it is checked, and what must not
 * be done. Returning one string was the reason the analysis map read as a
 * lookup table instead of a plan.
 *
 * The two branches matter most. A plan is written before any data exist, so
 * nobody can know yet whether a distribution will be normal. Asked for one
 * test, the plan had to guess; asked for both and the rule that chooses between
 * them, it states what will happen without seeing anything.
 */

/** One side of the normality decision, or the only test where none arises. */
export type Branch = {
  test: string;
  /** The shape the test statistic prints in, with its degrees of freedom. */
  statistic: string | null;
  /** The effect size that must accompany it. */
  effect: string | null;
  /** The model that holds confounders constant, for this branch. */
  adjusted: string | null;
  /** The estimates the effect table prints, one to a row. */
  measures: string[];
};

/** What a test takes for granted, how that is checked, and what to do if it fails. */
export type Assumption = {
  assumption: string;
  how_checked: string;
  if_violated: string;
};

export type Rule = {
  data_type: string;
  comparison: string;
  /** none, paired or repeated. */
  pairing: string;
  /** common or rare, for a binary outcome. */
  frequency: string;
  /** The design family, where the design decides which estimate is valid. */
  design: string;
  why: string;
  summary: string | null;
  /** The test that decides between the branches, and the rule. */
  normality: string | null;
  parametric: Branch | null;
  nonparametric: Branch | null;
  post_hoc: string | null;
  avoid: string | null;
  assumptions: Assumption[];
  adjusted_assumptions: Assumption[];
};

export type AnalysisPlan = {
  why: string;
  /** How the data are described in the descriptive table. */
  summary: string | null;
  /** The normality test and the rule, where the choice arises. */
  normality: string | null;
  parametric: Branch | null;
  nonparametric: Branch | null;
  /** The pairwise test and its correction, for three or more groups. */
  post_hoc: string | null;
  assumptions: Assumption[];
  adjusted_assumptions: Assumption[];
  /** What must not be done here, and why. */
  avoid: string | null;
  overridden: boolean;

  /* ---- the branch taken, composed for anything that prints one line ---- */

  /** The estimate and its interval before adjustment; the conditional where there are two. */
  unadjusted: string | null;
  /** The model that holds confounders constant. */
  adjusted: string | null;
  /** The estimates the effect table prints. */
  measures: string[];
};

const RULES_PATH = path.join(process.cwd(), "src", "lib", "sap", "test-rules.md");

let cached: Rule[] | null = null;

const dash = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t && t !== "-" ? t : null;
};

const splitMeasures = (v: string | null) =>
  (v ?? "")
    .split(";")
    .map((m) => m.trim())
    .filter(Boolean);

function assumption(line: string): Assumption | null {
  const parts = line.split("::").map((p) => p.trim());
  if (parts.length < 3) return null;
  return { assumption: parts[0], how_checked: parts[1], if_violated: parts.slice(2).join(" :: ") };
}

/**
 * Reads the blocks. First matching block wins, so order is meaningful.
 *
 * A heading is a rule only when it carries the match keys, which is what the
 * pipes are. The prose headings that explain the file have none, so they are
 * skipped without needing to be listed.
 */
export function loadRules(source?: string): Rule[] {
  if (!source && cached) return cached;
  const text = source ?? fs.readFileSync(RULES_PATH, "utf8");

  const rules: Rule[] = [];
  let rule: Rule | null = null;
  let branch: Branch | null = null;
  let list: "assumptions" | "adjusted_assumptions" | null = null;

  for (const raw of text.split("\n")) {
    const heading = raw.match(/^##\s+(.*\|.*)$/);
    if (heading) {
      const [data_type, comparison, pairing, frequency, design] = heading[1]
        .split("|")
        .map((c) => c.trim());
      rule = {
        data_type, comparison, pairing, frequency, design,
        why: "", summary: null, normality: null,
        parametric: null, nonparametric: null, post_hoc: null, avoid: null,
        assumptions: [], adjusted_assumptions: [],
      };
      rules.push(rule);
      branch = null;
      list = null;
      continue;
    }
    if (!rule) continue;

    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && list) {
      const parsed = assumption(item[1]);
      if (parsed) rule[list].push(parsed);
      continue;
    }

    const pair = raw.match(/^(\s*)([a-z_]+):\s*(.*)$/);
    if (!pair) continue;
    const [, indent, k, v] = pair;

    if (indent.length && branch) {
      // A sub-key belongs to the branch above it.
      if (k === "statistic") branch.statistic = dash(v);
      else if (k === "effect") branch.effect = dash(v);
      else if (k === "adjusted") branch.adjusted = dash(v);
      else if (k === "measures") branch.measures = splitMeasures(dash(v));
      continue;
    }

    list = null;
    if (k === "parametric" || k === "test") {
      // A dash means there is no test before the model: a trajectory is the
      // model, and nothing is reported ahead of it.
      branch = { test: dash(v) ?? "", statistic: null, effect: null, adjusted: null, measures: [] };
      rule.parametric = branch;
    } else if (k === "nonparametric") {
      branch = { test: dash(v) ?? "", statistic: null, effect: null, adjusted: null, measures: [] };
      rule.nonparametric = branch;
    } else if (k === "assumptions" || k === "adjusted_assumptions") {
      list = k;
      branch = null;
    } else if (k === "why") rule.why = v.trim();
    else if (k === "summary") rule.summary = dash(v);
    else if (k === "normality") rule.normality = dash(v);
    else if (k === "post_hoc") rule.post_hoc = dash(v);
    else if (k === "avoid") rule.avoid = dash(v);
    else if (k === "adjusted") {
      // A rule with one test states its adjusted model at the top level.
      if (rule.parametric && !rule.parametric.adjusted) rule.parametric.adjusted = dash(v);
    } else if (k === "measures") {
      if (rule.parametric && !rule.parametric.measures.length) {
        rule.parametric.measures = splitMeasures(dash(v));
      }
    }
  }

  if (!source) cached = rules;
  return rules;
}

const matches = (ruleValue: string, actual: string) =>
  ruleValue === "any" || ruleValue === actual;

/**
 * The plan as one line, for the analysis map's cell.
 *
 * Where there are two branches it is the conditional, because that is what the
 * plan actually commits to: a named test on each side of a named decision.
 */
function composeUnadjusted(rule: Rule, taken: Branch | null): string | null {
  if (!rule.parametric || !rule.nonparametric) {
    return (taken ?? rule.parametric ?? rule.nonparametric)?.test || null;
  }
  // The test's name is used as a key, by the assumptions and by the reasons
  // printed under the map, so nothing is appended to it. That the row committed
  // to one branch is recorded by `normality` being absent.
  if (taken) return taken.test;
  return `${rule.parametric.test}, where the normality check allows it; otherwise ${rule.nonparametric.test}`;
}

function composeAdjusted(rule: Rule, taken: Branch | null): string | null {
  if (taken) return taken.adjusted;
  const a = rule.parametric?.adjusted;
  const b = rule.nonparametric?.adjusted;
  if (a && b && a !== b) {
    return `${a}; or, where the distribution requires it, ${b[0].toLowerCase()}${b.slice(1)}`;
  }
  return a ?? b ?? null;
}

/**
 * @returns the plan for a row, or null when no rule covers it.
 *   A row nothing covers is a gap in the rules, and must be visible rather than
 *   silently given a plausible-looking default.
 */
/**
 * True where a value is a machine token rather than English.
 *
 * `descriptive_cross_tabulation_only` is a plan telling itself it has no
 * estimate; it is not a phrase to print at a reader.
 */
export function isToken(value: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(value.trim());
}

export function chooseTest(
  row: Pick<
    AnalysisRow,
    | "data_type" | "comparison" | "pairing" | "skewed" | "frequency"
    | "design_family" | "test_override" | "override_reason"
  >,
  rules: Rule[] = loadRules(),
): AnalysisPlan | null {
  // A machine token is not the name of a test. One plan overrode its test with
  // "descriptive_cross_tabulation_only", meaning it had no test to name, and
  // honouring that put the token in a column header of a document handed to an
  // examiner. Ignored here, so every consumer is fixed at once, and reported by
  // TBL31 so the plan is corrected rather than the symptom hidden.
  if (row.test_override && !isToken(row.test_override)) {
    const branch: Branch = {
      test: row.test_override,
      statistic: null,
      effect: null,
      adjusted: null,
      measures: [row.test_override],
    };
    return {
      why: row.override_reason ?? "Departs from the standard rule; no reason was given.",
      summary: null, normality: null,
      parametric: branch, nonparametric: null, post_hoc: null,
      assumptions: [], adjusted_assumptions: [],
      avoid: null, overridden: true,
      unadjusted: row.test_override,
      adjusted: null,
      // An override leaves the rule table behind, so there is no list to read.
      // The override itself becomes the one estimate the effect table prints.
      measures: [row.test_override],
    };
  }

  const hit = rules.find(
    (rule) =>
      matches(rule.data_type, row.data_type) &&
      matches(rule.comparison, row.comparison) &&
      matches(rule.pairing, row.pairing ?? "none") &&
      matches(rule.frequency, row.frequency ?? "unknown") &&
      matches(rule.design, row.design_family ?? "unknown"),
  );

  if (!hit) return null;

  // A distribution already known to be skewed commits to that branch rather
  // than printing a conditional whose answer everyone knows.
  const taken = row.skewed ? (hit.nonparametric ?? hit.parametric) : null;
  const lead = taken ?? hit.parametric ?? hit.nonparametric;

  return {
    why: hit.why,
    summary: hit.summary,
    normality: row.skewed ? null : hit.normality,
    parametric: hit.parametric,
    nonparametric: hit.nonparametric,
    post_hoc: hit.post_hoc,
    assumptions: hit.assumptions,
    adjusted_assumptions: hit.adjusted_assumptions,
    avoid: hit.avoid,
    overridden: false,
    unadjusted: composeUnadjusted(hit, taken),
    adjusted: composeAdjusted(hit, taken),
    measures: lead?.measures ?? [],
  };
}

/**
 * Every method the plan actually names, as a name rather than a sentence.
 *
 * The assumptions are stated per test, and are joined to the plan by this. The
 * composed `unadjusted` line cannot do that job any more: where there are two
 * branches it is a conditional, and nothing can state the assumptions of a
 * conditional. Both branches are returned, because a plan that states the
 * assumptions of only the test it hopes to use has checked half.
 */
export function plannedTests(plan: AnalysisPlan): string[] {
  const names = [
    plan.parametric?.test,
    plan.nonparametric?.test,
    plan.parametric?.adjusted,
    plan.nonparametric?.adjusted,
  ].filter((t): t is string => Boolean(t && t.trim()));
  return [...new Set(names)];
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
 * Ten events per degree of freedom, said out loud.
 *
 * A model the study cannot support is declared exploratory here, before the
 * data arrive, rather than discovered at analysis and reported anyway.
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
