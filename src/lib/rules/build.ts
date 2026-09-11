import fs from "node:fs";
import path from "node:path";
import type {
  AnalysisRow,
  FactsSheet,
  Objective,
  Population,
  Rules,
} from "../study/types.ts";
import type { ObjectiveFamily } from "../study/vocabulary.ts";
import { parseTable, type Row } from "../analysis/decision-tables.ts";

/**
 * Step 5: the rules that govern every table.
 *
 * Gap G6, settled here. The population line says missing data are handled "by
 * the general rules", and the printed format the document specifies has no
 * general-rules section for them to live in. The choice was between repeating
 * the rule in sixteen footnotes and printing it once. It is printed once, as a
 * short italic block under the Section 6 heading, because a rule repeated
 * sixteen times is a rule that gets edited in fifteen places.
 *
 * In this house format none of these is printed as a section of its own. They
 * are settled here and then appear inside Section 6: the analysis-population
 * line above the primary block, the multiplicity line under each family
 * heading, the footnote under each table, and the rows of the sensitivity
 * table. That is why they are built as data rather than as prose.
 *
 * Where the protocol is silent the house default is written and the gap becomes
 * a bold TODO. A default is not a guess: "alpha of 0.05, two-sided" is what
 * every one of these studies means when it says nothing, and writing it down is
 * what lets a supervisor disagree with it.
 */

const DIR = path.join(process.cwd(), "src", "lib", "rules");
let assumptionRows: Row[] | null = null;

export function assumptions(): Row[] {
  if (!assumptionRows) {
    assumptionRows = parseTable(
      fs.readFileSync(path.join(DIR, "assumptions.md"), "utf8"),
    );
  }
  return assumptionRows;
}

/** The assumption row for a named test or model, by first substring match. */
export function assumptionFor(named: string): Row | null {
  const text = named.toLowerCase();
  return assumptions().find((row) => text.includes(row.Key)) ?? null;
}

const TRIALS = [
  "randomised_trial",
  "non_inferiority_trial",
  "crossover_trial",
  "cluster_trial",
  "factorial_trial",
  "non_randomised_interventional",
];

/** A bold TODO, in the one form the house style prints. */
const todo = (question: string) => `**TODO:** ${question}`;

/**
 * The analysis populations, and which objective uses which.
 *
 * A trial has three and an observational study has none of them. The commonest
 * error this prevents is an observational study whose plan promises an
 * intention-to-treat analysis, which means nothing where nothing was assigned.
 */
function populationsFor(facts: FactsSheet, rows: AnalysisRow[]): Population[] {
  const safety = rows.filter((r) => r.exception === "safety");
  const confirmatory = rows.filter(
    (r) => !r.objective.startsWith("E"),
  );
  // Every objective is named on the set it is analysed on, observational or
  // not. Check S5-1 reads these lines, and an observational plan that named
  // none of its objectives failed the check while looking complete.
  const efficacy = confirmatory
    .filter((r) => !r.exception)
    .map((r) => r.objective)
    .join(", ");
  const all = confirmatory.map((r) => r.objective).join(", ");

  if (!TRIALS.includes(facts.design)) {
    return [
      {
        name: "Analysis cohort",
        definition: `Every participant meeting the eligibility criteria with the exposure recorded${all ? `: ${all}` : ""}. Each outcome is analysed on its complete cases, and the denominator is stated in each table. There is no intention-to-treat set and no per-protocol set: nothing was assigned.`,
      },
    ];
  }

  const populations: Population[] = [
    {
      name: "Intention to treat",
      definition: `Every randomised participant, analysed in the arm they were randomised to. The primary set for efficacy${efficacy ? `: ${efficacy}` : ""}.`,
    },
    {
      name: "Per protocol",
      definition: `The intention-to-treat set minus the participants with a major protocol deviation. ${todo("state what counts as a major deviation: adherence below a threshold, an incomplete dose, a visit outside its window.")} Supportive only, and a row of the sensitivity table.`,
    },
  ];

  if (safety.length) {
    populations.push({
      name: "Safety set",
      definition: `Everyone who received at least one dose, analysed as treated rather than as randomised${safety.length ? `: ${safety.map((r) => r.objective).join(", ")}` : ""}.`,
    });
  }

  if (facts.design === "non_inferiority_trial") {
    populations.push({
      name: "Co-primary analysis",
      definition:
        "A non-inferiority claim is made only where the intention-to-treat and the per-protocol analyses agree. Dropping non-adherent participants makes the arms look more alike, which is the direction that favours non-inferiority.",
    });
  }

  return populations;
}

/** The multiplicity line each family present owes (5.4). */
function multiplicityFor(
  facts: FactsSheet,
  objectives: Objective[],
  rows: AnalysisRow[],
): Rules["multiplicity"] {
  const lines: Rules["multiplicity"] = {};
  const alpha = facts.stated_rules.alpha ?? "0.05";
  const sided = facts.stated_rules.sided ?? "two";

  const inFamily = (family: ObjectiveFamily) =>
    objectives.filter((o) => o.family === family).map((o) => o.id);

  const primary = inFamily("primary");
  if (primary.length === 1) {
    lines.primary = `Alpha of ${alpha}, ${sided}-sided, for ${primary[0]}.`;
  } else if (primary.length > 1) {
    lines.primary = `Alpha of ${alpha}, ${sided}-sided, spent in a fixed sequence: ${primary.join(" then ")}. Each is tested only where the one before it is significant, so the family-wise error rate is held without splitting alpha.`;
  }

  const allSecondary = inFamily("secondary");
  const tested = allSecondary.filter(
    (id) => !rows.some((r) => r.objective === id && r.exception === "safety"),
  );
  if (tested.length) {
    lines.secondary = `Supportive and hypothesis-generating. Effect estimates with ${facts.stated_rules.ci_level ?? "95%"} confidence intervals, tested in the fixed sequence ${tested.join(" then ")}, with no confirmatory claim from any of them alone.`;
  } else if (allSecondary.length) {
    // Every secondary is a safety outcome. The family still needs its line, and
    // the line is that nothing here is tested for significance at all.
    lines.secondary = `Every secondary outcome here is a safety outcome. None is tested against a threshold, and none supports a confirmatory claim.`;
  }

  if (rows.some((r) => r.exception === "safety")) {
    lines.safety =
      "Every adverse effect is reported whether or not it reaches significance. A safety signal is not something to be corrected away.";
  }

  if (inFamily("exploratory").length) {
    lines.exploratory =
      "Descriptive only, with nominal 95% confidence intervals and no correction. These analyses are not powered, and a positive finding here is a hypothesis for another study.";
  }

  return lines;
}

/** The alternative assumptions the primary estimate is re-run under (5.6). */
function sensitivityFor(facts: FactsSheet, rows: AnalysisRow[]): string[] {
  const list = [
    "Complete case, which is the primary analysis.",
    "Multiple imputation by chained equations, with the arm, the baseline outcome and every covariate in the imputation model.",
    "A tipping-point analysis, to find how far the missing values would have to differ before the conclusion changes.",
  ];

  if (TRIALS.includes(facts.design)) {
    list.push("The per-protocol set in place of the intention-to-treat set.");
  }

  const openDefinition = facts.open_items.some((item) =>
    /cut.?off|threshold|definition|criteri/i.test(item),
  );
  if (openDefinition) {
    list.push(
      "The alternative outcome definition, where the cut-off is still open.",
    );
  }

  if (rows.some((r) => r.adjusted)) {
    list.push("With the influential observations removed, by Cook's distance.");
  }

  return list;
}

export function buildRules(
  facts: FactsSheet,
  objectives: Objective[],
  rows: AnalysisRow[],
): { rules: Rules; todos: string[] } {
  const todos: string[] = [];
  const stated = facts.stated_rules;

  if (!stated.software) {
    todos.push(
      "Name the statistical software and its version. The version belongs in the plan because a procedure's default changes between versions and the result changes with it.",
    );
  }

  const populations = populationsFor(facts, rows);
  const trial = TRIALS.includes(facts.design);
  const flow = trial
    ? "screened, eligible, randomised, analysed"
    : "screened, eligible, analysed";

  // The line that opens the primary block. Short on purpose: the full
  // definitions are above it, and this one is read every time a reader looks
  // at a primary table.
  const populationLine = trial
    ? `Analysis population: intention to treat, every randomised participant analysed as randomised. Complete case for the primary outcome, with the ${flow} flow shown in the results. Missing data are handled by the general rules above.`
    : `Analysis population: the analysis cohort, every eligible participant with the exposure recorded. Complete case for the primary outcome, with the ${flow} flow shown in the results. Missing data are handled by the general rules above.`;

  const rules: Rules = {
    populations,
    population_line: populationLine,
    software: stated.software ?? todo("name the statistical software and its version."),
    alpha: stated.alpha ?? "0.05",
    sided: stated.sided ?? "two",
    ci_level: stated.ci_level ?? "95%",
    summaries:
      "Continuous variables are summarised as the mean with the standard deviation where Shapiro-Wilk and the Q-Q plot show normality, and as the median with the interquartile range where they do not. Categorical variables are summarised as n (%).",
    normality:
      "Normality is decided by Shapiro-Wilk together with a Q-Q plot, never assumed. For every model it is the residuals that are examined, not the raw values.",
    missing_data:
      stated.missing_data ??
      "The primary analysis is complete case, under an assumption of data missing at random. Multiple imputation by chained equations is reported as a sensitivity analysis. The last observation is never carried forward: it assumes the outcome stopped changing at the moment the participant stopped attending, which is the assumption least likely to be true.",
    multiplicity: multiplicityFor(facts, objectives, rows),
    interim: stated.interim ?? "No interim analysis is planned.",
    sensitivity_rows: sensitivityFor(facts, rows),
  };

  return { rules, todos };
}
