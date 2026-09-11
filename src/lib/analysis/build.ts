import type {
  AnalysisRow,
  Covariate,
  ExploratoryOutcome,
  FactsSheet,
  Objective,
  OutcomeChain,
  Variable,
} from "../study/types.ts";
import type { DesignFamily } from "../study/vocabulary.ts";
import { ARM } from "../variables/build.ts";
import { variableName } from "../variables/name.ts";
import { binaryModels, effectMeasures, matchKey, tests } from "./decision-tables.ts";

/**
 * Step 4: the Analysis Map, one row per objective.
 *
 * This is the hinge. Every table in Section 6 exists because a row here asked
 * for it, and every row here exists because Step 1 wrote an objective. Nothing
 * in this file decides anything a decision table does not already say; what it
 * does is choose the key, and the key is made of things already written down.
 *
 * The order the document insists on, and the order this follows: the design
 * picks the effect measure, then the data type picks the test, then - for a
 * binary outcome only - how common the event is picks the model.
 */

export type AnalysisMap = {
  rows: AnalysisRow[];
  todos: string[];
};

/** Which column of decision table A a design reads. */
const DESIGN_CLASS: Record<DesignFamily, string> = {
  randomised_trial: "trial",
  non_inferiority_trial: "trial",
  crossover_trial: "trial",
  cluster_trial: "trial",
  factorial_trial: "trial",
  non_randomised_interventional: "trial",
  cohort: "cohort",
  case_control: "case_control",
  cross_sectional: "cross_sectional",
  descriptive_epidemiology: "cross_sectional",
  diagnostic_accuracy: "diagnostic",
  prognostic_model: "cohort",
  agreement: "other",
  qualitative: "other",
  mixed_methods: "other",
  systematic_review: "other",
  economic_evaluation: "other",
  case_report: "other",
};

const SAFETY = /adverse|safety|side.effect|tolerab|harm|complication/i;

/**
 * The outcome chain a question is asked of.
 *
 * A level question is linked to the derived value, a shape question to the
 * readings it was computed from, and an exploratory question to whichever of
 * the two its idea named. All three lead back to one chain, and the chain is
 * what carries the distribution and the expected frequency.
 */
function chainFor(
  facts: FactsSheet,
  objective: Objective,
  outcomeName: string,
): OutcomeChain | null {
  const all = [facts.primary, ...facts.secondary];
  return (
    all.find((c) => variableName(c.what) === outcomeName) ??
    all.find((c) => c.measures.includes(outcomeName)) ??
    (objective.family === "exploratory" ? facts.primary : null)
  );
}

/** Every name, derived or raw, belonging to an outcome known to be skewed. */
function skewedNames(facts: FactsSheet): Set<string> {
  const names = new Set<string>();
  for (const chain of [facts.primary, ...facts.secondary]) {
    if (chain.distribution !== "skewed") continue;
    names.add(variableName(chain.what));
    for (const measure of chain.measures) names.add(measure);
  }
  return names;
}

/** An outcome that is reported and not modelled (rule 4.11). */
export const isSafety = (chain: OutcomeChain) => SAFETY.test(chain.what);

/** The shape of the comparison, which is half of decision table B's key. */
function shapeOf(
  facts: FactsSheet,
  objective: Objective,
  exploratory: ExploratoryOutcome | undefined,
): string {
  if (exploratory?.kind === "correlation") return "pair";
  if (objective.kind === "shape") return "repeated";
  if (facts.design === "crossover_trial") return "paired";
  if (facts.groups.length > 2) return "many_groups";
  if (facts.groups.length === 2) return "two_groups";
  return "single";
}

/**
 * The unadjusted test, with the fallback the distribution already implies.
 *
 * Decision table B names the fallback as a condition ("Mann-Whitney where the
 * outcome is skewed"). Where the Facts Sheet has already said the outcome is
 * skewed, the fallback is not a fallback: it is the test, and the plan says so
 * rather than making the reader work out which half of the sentence applies.
 */
function resolveSkew(isSkewed: boolean, row: Record<string, string>) {
  const test = row["Unadjusted test"];
  const fallback = row["Unadjusted fallback"] || null;
  if (!isSkewed || !fallback) return { test, fallback };

  const skewed = fallback
    .split(";")
    .map((part) => part.trim())
    .find((part) => /skew/i.test(part));
  if (!skewed) return { test, fallback };

  return {
    test: skewed.replace(/\s*where (the )?(outcome|differences|either)\b.*$/i, "").trim(),
    fallback: null,
  };
}

/**
 * One pre-specified adjustment set for this outcome, with a line per covariate.
 *
 * Not the Facts Sheet's covariate list copied into every row. The list is
 * global and the set is per outcome (rule 4.6), and the difference shows in one
 * place every time: baseline haemoglobin belongs in the haemoglobin model and
 * not in the ferritin model, where the baseline that matters is ferritin's.
 * A set built by copying puts the wrong baseline in the footnote, and the
 * footnote is the only place anyone would ever see it.
 */
function adjustmentSet(
  facts: FactsSheet,
  chain: OutcomeChain,
  objective: Objective,
  variables: Variable[],
): Covariate[] {
  const byName = new Map(variables.map((v) => [v.name, v]));
  const set: Covariate[] = [];

  // The baseline value of this outcome, where it has one.
  const first = facts.timepoints[0];
  for (const measure of chain.measures) {
    const variable = byName.get(measure);
    if (!variable || !variable.timepoints.includes(first)) continue;
    if (variable.roles[objective.id] === "outcome") continue;
    set.push({
      var: measure,
      at: first,
      reason: "The baseline value of the outcome, which is its strongest predictor.",
    });
  }

  // Everything else the Facts Sheet named, minus any other outcome's baseline.
  const outcomeMeasures = new Set(
    [facts.primary, ...facts.secondary].flatMap((c) => c.measures),
  );
  for (const covariate of facts.covariates) {
    const variable = byName.get(covariate.measure);
    if (!variable) continue;
    if (set.some((c) => c.var === covariate.measure)) continue;
    if (outcomeMeasures.has(covariate.measure)) continue;

    set.push({
      var: covariate.measure,
      at: covariate.at,
      reason: covariate.inferred
        ? "A confounder added at Stage 1. The protocol does not name it, and the investigator has been asked to confirm it."
        : "Named by the protocol as a factor to hold constant.",
    });
  }

  // Stratified randomisation puts the stratification factors in the model
  // whether or not anyone listed them as covariates (rule 4.7).
  for (const stratum of facts.allocation.strata) {
    if (set.some((c) => c.var === stratum)) continue;
    set.push({
      var: stratum,
      at: null,
      reason: "A stratification factor of the randomisation.",
    });
  }

  return set;
}

/**
 * An exploratory interaction model, named plainly.
 *
 * The base model only, without the adjustment clause it carries for the
 * confirmatory row: an exploratory table asks whether an effect differs by
 * something, and stacking the primary's covariate phrase onto that produces a
 * sentence nobody can read and a model nobody asked for.
 */
function interactionModel(
  base: string,
  by: string | undefined,
  byName: Map<string, Variable>,
): string {
  const family = base.split(",")[0].trim();
  const label = by ? (byName.get(by)?.label ?? by).toLowerCase() : "the covariate";
  const article = /^[aeiou]/.test(ARM) ? "an" : "a";
  return `${family} with ${article} ${ARM}-by-${label} interaction term`;
}

export function buildAnalysis(
  facts: FactsSheet,
  objectives: Objective[],
  variables: Variable[],
  exploratory: ExploratoryOutcome[],
): AnalysisMap {
  const rows: AnalysisRow[] = [];
  const todos: string[] = [];
  const byName = new Map(variables.map((v) => [v.name, v]));
  const design = DESIGN_CLASS[facts.design];
  const skewed = skewedNames(facts);

  for (const objective of objectives) {
    const explore = exploratory.find((e) => e.id === objective.id);
    const outcomeName = explore ? explore.reuses[0] : objective.outcome;
    const variable = byName.get(outcomeName);
    const chain = chainFor(facts, objective, outcomeName);
    if (!variable || !chain) continue;

    const shape = shapeOf(facts, objective, explore);
    const dataType = variable.type;

    /* ---- A: the effect measure the design owes --------------------- */
    const measureRow = matchKey(effectMeasures(), `${design}|${dataType}`);
    let effect = measureRow?.["Effect measure"] ?? "";
    const absolute = measureRow?.["Absolute measure"] || null;
    if (explore?.kind === "correlation") {
      effect = "Correlation coefficient";
    }

    /* ---- B: the test the data type owes ---------------------------- */
    const testRow = matchKey(tests(), `${dataType}/${shape}`);
    if (!testRow) {
      todos.push(
        `${objective.id} asks about a ${dataType} outcome compared as ${shape.replace(/_/g, " ")}, and no decision table row covers that. Name the test.`,
      );
      continue;
    }
    const { test, fallback } = resolveSkew(
      // A correlation is skewed if either side of it is.
      explore?.kind === "correlation"
        ? explore.reuses.some((n) => skewed.has(n))
        : chain.distribution === "skewed",
      testRow,
    );

    let adjustedModel = testRow["Adjusted model"] || "";
    let adjustedFallback = testRow["Adjusted fallback"] || null;

    /* ---- C: for a binary outcome, the model the frequency owes ------ */
    if (dataType === "binary" && adjustedModel) {
      const clustered = variable.timepoints.length > 1;
      const key =
        chain.expected_frequency === null
          ? clustered
            ? "clustered"
            : "unknown"
          : chain.expected_frequency < 0.1
            ? "rare"
            : clustered
              ? "clustered"
              : "common";
      const modelRow = matchKey(binaryModels(), key);
      if (modelRow) {
        effect = modelRow["Effect measure"];
        adjustedModel = modelRow.Model;
        adjustedFallback = modelRow["Named fallback"] || null;
      }
      if (chain.expected_frequency === null && !isSafety(chain)) {
        todos.push(
          `State the proportion expected to have "${chain.what}". The plan is written for a risk ratio from a log-binomial model, which holds only where the outcome is common; below one in ten it becomes an odds ratio from a logistic model, and the two answer differently.`,
        );
      }
    }

    /* ---- a skewed continuous outcome is modelled on the log scale --- */
    if (dataType === "continuous" && skewed.has(outcomeName) && adjustedModel) {
      adjustedModel = `${adjustedModel} on the log scale`;
      effect = "Ratio of geometric means";
    }

    /* ---- the two exceptions to unadjusted then adjusted ------------- */
    const safety = isSafety(chain);
    const estimation = shape === "single";
    const exception = safety ? "safety" : estimation ? "estimation" : null;

    const predictors = [
      ...(facts.groups.length >= 2 ? [ARM] : []),
      ...(explore ? explore.reuses.slice(1) : []),
    ];

    // A trajectory model in a randomised trial carries no covariates: rule 4.4
    // writes it as outcome by group and time with a random intercept, and
    // randomisation is what makes that enough. An observational study has no
    // such protection and keeps its adjustment set.
    const randomised = design === "trial" && facts.allocation.ratio.trim() !== "";
    const bareTrajectory = objective.kind === "shape" && randomised;

    const covariates =
      exception || objective.family === "exploratory" || bareTrajectory
        ? []
        : adjustmentSet(facts, chain, objective, variables);

    rows.push({
      objective: objective.id,
      outcome: outcomeName,
      predictors,
      data_type: dataType,
      unit_of_analysis: "per participant",
      count:
        shape === "repeated"
          ? `${chain.time.length} readings per participant`
          : "1 value per participant",
      expected_frequency: chain.expected_frequency,
      effect_measure: safety ? "Risk difference" : effect,
      absolute: safety ? null : absolute,
      unadjusted: explore && explore.kind !== "correlation"
        ? null
        : safety
        ? {
            test: "Fisher's exact test, with the Newcombe confidence interval for the risk difference",
            fallback: null,
            table: "",
          }
        : { test, fallback, table: "" },
      adjusted:
        exception || !adjustedModel || explore?.kind === "correlation"
          ? null
          : {
              model: explore
                ? interactionModel(adjustedModel, explore.reuses[1], byName)
                : adjustedModel,
              fallback: adjustedFallback,
              covariates,
              table: "",
              // Numbered in Step 6, which is the only place that knows the
              // order the tables are printed in. Appendix B gives fit tables to
              // the primary and secondary model tables and to no exploratory
              // one, and Step 6 applies that too.
              fit_table: "",
            },
      exception,
    });
  }

  return { rows, todos };
}
