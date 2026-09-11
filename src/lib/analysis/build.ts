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
 * A design that allocates groups rather than people.
 *
 * Everyone in a cluster shares whatever the cluster does, so two people from
 * one ward carry less information than two people from two wards. Ignoring that
 * is the fourth of the deck's eight commonest mistakes, and unlike repeated
 * measurement it is invisible in the data: every row still looks independent.
 */
const clusteredByDesign = (facts: FactsSheet) =>
  facts.design === "cluster_trial";

const covariatesExist = (facts: FactsSheet) => facts.covariates.length > 0;

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
  chain: OutcomeChain,
): string {
  if (exploratory?.kind === "correlation") return "pair";
  // A diagnostic study never compares two groups. Its question is how well one
  // measurement agrees with a reference standard, and that is its own row.
  if (facts.design === "diagnostic_accuracy") return "diagnostic";
  // The one question where the data may choose the variables. Judged by
  // discrimination, calibration and validation rather than by the p value of
  // any one predictor.
  if (facts.question_type === "prediction") return "prediction";
  // A competing event changes the analysis more than the number of groups
  // does, so it is asked first. One minus the Kaplan-Meier estimate overstates
  // the risk whenever something else can get there first, and that is the sixth
  // of the eight commonest mistakes.
  if (chain.type === "time_to_event" && chain.competing_event) return "competing";
  if (objective.kind === "shape") return "repeated";
  // A within-person comparison, however it arose: the same person measured
  // twice, or a case kept with the controls they were matched to. Breaking a
  // matched set apart makes the real effect look smaller than it is.
  if (facts.design === "crossover_trial" || facts.allocation.matched) return "paired";
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
  const total = facts.sample_size.per_group
    ? facts.sample_size.per_group * Math.max(facts.groups.length, 1)
    : null;

  if (!facts.exposure_fixed_at_baseline && facts.groups.length >= 2) {
    todos.push(
      "The exposure is defined by something that happens during follow-up, so everyone in the exposed group had to survive long enough to be exposed. Analysed as a baseline group it makes the exposure look protective when it does nothing. The exposure enters the model as a time-varying covariate, with follow-up counted from the same time zero in both groups; say which time zero that is.",
    );
  }

  if (clusteredByDesign(facts)) {
    todos.push(
      "State how many clusters were randomised and the average cluster size, and the intracluster correlation the sample size assumed. Below about 30 clusters the robust variance is optimistic, and the confidence intervals need a small-sample correction or a cluster bootstrap.",
    );
  }

  for (const objective of objectives) {
    const explore = exploratory.find((e) => e.id === objective.id);
    const outcomeName = explore ? explore.reuses[0] : objective.outcome;
    const variable = byName.get(outcomeName);
    const chain = chainFor(facts, objective, outcomeName);
    if (!variable || !chain) continue;

    const shape = shapeOf(facts, objective, explore, chain);
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
    // Rule from the first fork of the measured-number branch: the adjusted
    // model is an analysis of covariance because the outcome was also measured
    // at baseline. An outcome with no baseline value - blood loss, operating
    // time, a single post-operative score - gets plain linear regression, and
    // naming it ANCOVA promises a column that cannot be filled.
    const hasBaseline = chain.measures.some((measure) =>
      byName.get(measure)?.timepoints.includes(facts.timepoints[0] ?? ""),
    );

    const clusterTrial = clusteredByDesign(facts);

    const { test, fallback } = resolveSkew(
      // A correlation is skewed if either side of it is.
      explore?.kind === "correlation"
        ? explore.reuses.some((n) => skewed.has(n))
        : chain.distribution === "skewed",
      testRow,
    );

    let adjustedModel = testRow["Adjusted model"] || "";
    if (!hasBaseline) {
      adjustedModel = adjustedModel.replace(
        /,\s*as analysis of covariance with the baseline value/,
        "",
      );
    }
    let adjustedFallback = testRow["Adjusted fallback"] || null;

    /* ---- C: for a binary outcome, the model the frequency owes ------ */
    // Decision table C chooses between the risk-ratio models by how common the
    // event is. It has nothing to say about a matched design, whose model is
    // fixed by the matching; about a diagnostic one, which estimates accuracy
    // rather than an effect; or about a prediction model, which is judged by
    // how well it separates people rather than by the size of any one effect.
    const frequencyDecides = !["paired", "diagnostic", "prediction"].includes(shape);

    if (dataType === "binary" && adjustedModel && frequencyDecides) {
      const clustered = variable.timepoints.length > 1 || clusteredByDesign(facts);
      // Ten events per covariate is the floor every one of these models needs.
      // Below it the question is not which risk model to fit but whether any
      // of them will fit at all, and the answer is the penalised one.
      const covariates = Math.max(facts.covariates.length, 1);
      const events =
        total !== null && chain.expected_frequency !== null
          ? chain.expected_frequency * total
          : null;
      const tooFew = events !== null && events / covariates < 10;

      const key = tooFew
        ? "few_events"
        : chain.expected_frequency === null
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

    /* ---- an observational comparison owes a balance method ---------- */
    // Randomisation is what makes two groups alike. Where there was none,
    // adjustment helps and hides how different the groups were to begin with,
    // and the overlap table below is the part of the answer this plan can
    // draw without knowing which method the investigator wants.
    if (
      objective.family === "primary" &&
      !explore &&
      design !== "trial" &&
      facts.groups.length >= 2 &&
      covariatesExist(facts)
    ) {
      todos.push(
        "This is an observational comparison, so the groups were not made alike by randomisation and the sicker patients may be the treated ones. Say which method handles that before the outcome is looked at: matching on the propensity score, inverse probability of treatment weighting, stratification on it, or adjustment for it. Whichever is chosen, the balance table with standardised mean differences before and after is reported, and so is how many participants were dropped.",
      );
    }

    /* ---- the two branches that owe a decision, not a default -------- */
    if (shape === "competing") {
      todos.push(
        `Say which competing-risks model ${objective.id} reports, and pre-specify it. A cause-specific model answers whether the treatment changes the rate of "${chain.what.toLowerCase()}" among those still at risk; a Fine-Gray model answers what share of participants will actually reach it, given that ${chain.competing_event} can get there first. The two hazard ratios are easily confused and are not the same number.`,
      );
    }
    if (dataType === "count") {
      todos.push(
        `Say whether some participants could never have the event counted by "${chain.what.toLowerCase()}". Where that group can be described in clinical words, the plan is a zero-inflated model; where the zeros are simply because the event is uncommon, it is a negative binomial. Report the AIC of each model fitted, in the order they were fitted, rather than the best one alone.`,
      );
    }

    /* ---- the random effects a repeated model owes -------------------- */
    // A multicentre study has a second level above the participant. Everyone in
    // one centre is alike for reasons that have nothing to do with the arm, and
    // a model with only a participant intercept attributes that to the arm.
    if (shape === "repeated" && adjustedModel && clusteredByDesign(facts)) {
      adjustedModel = adjustedModel.replace(
        "a random intercept for each participant",
        "a random intercept for each participant and for each centre",
      );
    }

    /* ---- a row that is not a participant ----------------------------- */
    // Two eyes, several lesions, each tooth. The rows from one participant are
    // alike, and analysing them as separate participants gives standard errors
    // that are too small and p values that are too easily believed.
    if (facts.unit_of_analysis.repeats_within_participant && adjustedModel) {
      if (!/robust|random intercept for each participant/.test(adjustedModel)) {
        adjustedModel = `${adjustedModel}, with a random intercept for each participant because one participant contributes more than one ${facts.unit_of_analysis.unit}`;
      }
    }

    /* ---- a cluster trial's rows are not independent ------------------ */
    // The fourth of the eight commonest mistakes: rows that sit inside clinics,
    // wards or villages analysed as if each were a separate person. It is the
    // design that makes that true, not the outcome, so it applies to every
    // model in the plan.
    if (clusteredByDesign(facts) && adjustedModel && !/robust/i.test(adjustedModel)) {
      adjustedModel = `${adjustedModel}, with robust (sandwich) variance clustered on the randomised unit`;
    }

    /* ---- a study with no comparison has no group term --------------- */
    // A single-group study still asks how its outcome moves over time, and the
    // model for that is a mixed model with time in it. "group by time" in a
    // study with one group names an interaction with nothing.
    if (facts.groups.length < 2 && adjustedModel) {
      adjustedModel = adjustedModel
        .replace(/fixed effects for group, visit, the group-by-visit interaction and /, "fixed effects for visit and ")
        .replace(/with a group-by-time term/, "with time as a fixed effect");
    }

    /* ---- the two exceptions to unadjusted then adjusted ------------- */
    const safety = isSafety(chain);
    const estimation = shape === "single";
    const exception = safety ? "safety" : estimation ? "estimation" : null;

    const predictors = [
      ...(facts.groups.length >= 2 ? [ARM] : []),
      ...(explore ? explore.reuses.slice(1) : []),
    ];

    // A trajectory model in a randomised trial carries no adjustment set, and
    // randomisation is what makes that enough. It still carries the baseline
    // value, which the model names as a fixed effect in its own right. An
    // observational study has no such protection and keeps the whole set.
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
      unit_of_analysis: clusterTrial
        ? `per ${facts.unit_of_analysis.unit}, inside a randomised cluster`
        : `per ${facts.unit_of_analysis.unit}`,
      count:
        shape === "repeated"
          ? `${chain.time.length} readings per participant`
          : facts.unit_of_analysis.repeats_within_participant
            ? `more than one ${facts.unit_of_analysis.unit} per participant`
            : "1 value per participant",
      expected_frequency: chain.expected_frequency,
      effect_measure: safety
        ? facts.groups.length >= 2
          ? "Risk difference"
          : "Proportion"
        : effect,
      absolute: safety ? null : absolute,
      unadjusted: explore && explore.kind !== "correlation"
        ? null
        : safety
          ? {
              // A harm is compared between arms where there are arms, and
              // counted where there are not. Reporting a risk difference in a
              // study with one group names a difference from nothing.
              test:
                facts.groups.length >= 2
                  ? "Fisher's exact test, with the Newcombe confidence interval for the risk difference"
                  : "Proportions with 95% confidence intervals, by the Wilson method",
              fallback: null,
              table: "",
            }
          : {
              // In a cluster trial the individual is not the unit that was
              // allocated, so the unadjusted comparison is made between cluster
              // summaries. Treating the rows as independent people is the
              // fourth of the eight commonest mistakes.
              test: clusterTrial ? `${test}, on cluster-level summary measures` : test,
              fallback,
              table: "",
            },
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
