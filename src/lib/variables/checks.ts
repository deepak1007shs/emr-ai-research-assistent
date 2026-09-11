import type {
  CheckResult,
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  Variable,
} from "../study/types.ts";
import { variableName } from "./name.ts";

/**
 * The five checks Step 2 owes.
 *
 * These are the ones that catch a table with no data behind it. A covariate
 * named in a model and missing from the list becomes a column nobody collects;
 * a categorical variable with no options becomes a row nobody can count. Both
 * read perfectly well in the finished document.
 */

const ok = (id: string, message: string): CheckResult => ({
  id,
  pass: true,
  failing: [],
  message,
});

const NUMERIC = ["continuous", "count", "time_to_event"];
const CATEGORICAL = ["binary", "nominal", "ordinal"];

export function step2Checks(
  facts: FactsSheet,
  objectives: Objective[],
  variables: Variable[],
): CheckResult[] {
  const results: CheckResult[] = [];
  const names = new Set(variables.map((v) => v.name));

  /* S2-1: every outcome is a variable, and no two outcomes are the same one. */
  const chains = [facts.primary, ...facts.secondary].map((c) => ({
    what: c.what,
    name: variableName(c.what),
  }));
  const missingOutcomes = chains.filter((c) => !names.has(c.name));

  // Two outcomes described in the same words become one variable, and the
  // second one silently inherits the first one's recipe. Both objectives then
  // point at it, and the plan reports the first outcome's number under the
  // second outcome's title. Nothing else catches it: every check downstream
  // finds a variable where it expects one.
  const byShortName = new Map<string, string[]>();
  for (const chain of chains) {
    byShortName.set(chain.name, [...(byShortName.get(chain.name) ?? []), chain.what]);
  }
  const collided = [...byShortName.entries()].filter(([, whats]) => whats.length > 1);

  results.push(
    missingOutcomes.length === 0 && collided.length === 0
      ? ok("S2-1", "Every primary and secondary outcome is its own variable on the list.")
      : {
          id: "S2-1",
          pass: false,
          failing: [
            ...missingOutcomes.map((c) => c.name),
            ...collided.map(([name]) => name),
          ],
          message: collided.length
            ? `${collided.map(([, whats]) => whats.map((w) => `"${w}"`).join(" and ")).join("; ")} are different outcomes written in the same words, so they become one variable and the second takes the first one's definition. Word them apart, or say which one the study actually measures.`
            : `${missingOutcomes.map((c) => `"${c.what}"`).join(", ")} is an outcome with no variable. Its table would have a title and no row.`,
        },
  );

  /* S2-2: every covariate of every adjusted model is a variable. */
  const missingCovariates = facts.covariates.filter(
    (c) => !names.has(c.measure),
  );
  results.push(
    missingCovariates.length === 0
      ? ok("S2-2", "Every covariate of every planned adjusted model is a variable.")
      : {
          id: "S2-2",
          pass: false,
          failing: missingCovariates.map((c) => c.measure),
          message: `${missingCovariates.map((c) => c.measure).join(", ")} is held constant by a model and collected by nothing.`,
        },
  );

  /* S2-3: a derived variable names inputs that exist. */
  const brokenRecipes = variables.filter(
    (v) =>
      v.derived_from.length > 0 &&
      (!v.recipe?.trim() || v.derived_from.some((input) => !names.has(input))),
  );
  const silentDerivations = variables.filter(
    (v) => v.recipe?.trim() && v.derived_from.length === 0,
  );
  const badlyDerived = [...brokenRecipes, ...silentDerivations];
  results.push(
    badlyDerived.length === 0
      ? ok("S2-3", "Every derived variable names its inputs, and every input is itself a variable.")
      : {
          id: "S2-3",
          pass: false,
          failing: badlyDerived.map((v) => v.name),
          message: `${badlyDerived.map((v) => v.name).join(", ")} cannot be computed from the list: the recipe or one of its inputs is missing. Nobody reading the plan could produce the number.`,
        },
  );

  /* S2-4: options for a category, a unit for a number. */
  const undrawable = variables.filter(
    (v) =>
      (NUMERIC.includes(v.type) && !v.unit?.trim()) ||
      (CATEGORICAL.includes(v.type) && (v.options?.length ?? 0) < 2),
  );
  results.push(
    undrawable.length === 0
      ? ok("S2-4", "Every categorical variable lists its options and every numerical variable has a unit.")
      : {
          id: "S2-4",
          pass: false,
          failing: undrawable.map((v) => v.name),
          message: `${undrawable.map((v) => v.name).join(", ")} has neither a unit nor a list of categories. A row cannot be drawn for it and a field cannot collect it.`,
        },
  );

  /* S2-5: nothing is on the list for no reason. */
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const purposeless = variables.filter((v) => {
    const keys = Object.keys(v.roles);
    if (keys.length === 0) return true;
    return !keys.some(
      (key) =>
        key === "study" ||
        objectiveIds.has(key) ||
        objectiveIds.has(key.replace(/^adjust:/, "")),
    );
  });
  results.push(
    purposeless.length === 0
      ? ok("S2-5", "Every variable serves an objective, the descriptive block or a population definition, or is administrative.")
      : {
          id: "S2-5",
          pass: false,
          failing: purposeless.map((v) => v.name),
          message: `${purposeless.map((v) => v.name).join(", ")} answers nothing. Every variable on the list is a field somebody has to fill in for every participant.`,
        },
  );

  return results;
}

/**
 * The one check Step 3 owes.
 *
 * It has two halves that fail in opposite directions. A question naming a
 * variable nothing lists is an analysis that cannot be run; a variable added to
 * the form with no reason recorded is a field somebody has to fill in for every
 * participant and nobody can justify. Both are silent in the finished document.
 */
export function step3Checks(
  variables: Variable[],
  exploratory: ExploratoryOutcome[],
): CheckResult[] {
  const names = new Set(variables.map((v) => v.name));

  const dangling = exploratory.flatMap((e) =>
    e.reuses.filter((name) => !names.has(name)).map((name) => `${e.id}: ${name}`),
  );

  const justified = new Set(
    exploratory
      .filter((e) => e.promoted && e.promoted.reason.trim())
      .map((e) => e.promoted!.variable),
  );
  const unjustified = variables.filter(
    (v) => v.source === "promoted" && !justified.has(v.name),
  );

  const failing = [...dangling, ...unjustified.map((v) => v.name)];
  return [
    {
      id: "S3-1",
      pass: failing.length === 0,
      failing,
      message: dangling.length
        ? `${dangling.join("; ")} ${dangling.length === 1 ? "names a variable" : "name variables"} that is not on the list. The question cannot be answered from anything the study holds.`
        : unjustified.length
          ? `${unjustified.map((v) => v.name).join(", ")} was added to the form and no exploratory question records why. Every field is work somebody does for every participant.`
          : "Every exploratory question reuses variables already listed, and every promotion records its reason.",
    },
  ];
}
