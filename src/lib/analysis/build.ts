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
import { chainOfObjective } from "../objectives/build.ts";
import {
  anchorOf,
  asksAccuracy,
  indexTestsOf,
  isDiagnostic,
  questionOf,
  referenceOf,
} from "../study/diagnostic.ts";
import { binaryModels, effectMeasures, matchKey, screens, tests } from "./decision-tables.ts";

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
    names.add(anchorOf(facts, chain));
    for (const measure of chain.measures) names.add(measure);
  }
  return names;
}

/**
 * An outcome that is reported and not modelled (rule 4.11).
 *
 * A harm tally, and not any outcome whose name contains the word complication.
 * "Post-operative complications" graded by Clavien-Dindo and compared between
 * the patients who lost a limb and those who did not is an outcome with a
 * factor, and this rule filed it as a safety set: reported, not modelled, one
 * row, no grades. An outcome the study asks a question of has exposures, and
 * that is the difference the wording cannot see.
 */
export const isSafety = (chain: OutcomeChain) =>
  SAFETY.test(chain.what) && chain.exposures.length === 0;

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
  // What the outcome itself says it is asked about, before anything is read off
  // the number of groups. An observational study compares levels of a factor
  // inside one cohort, and counting its arms says "nothing is compared".
  if (chain.kind === "accuracy" && chain.exposures.length) return "diagnostic";
  if (chain.kind === "association" && chain.exposures.length) return "exposure";
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

  // What this objective holds constant, where it says. The Facts Sheet's list
  // is global and every objective used to take all of it.
  const named = chain.covariates.length ? chain.covariates : facts.covariates;

  // Everything else the Facts Sheet named, minus any other outcome's baseline,
  // and minus this objective's own factors. A study that asks whether amputation
  // is associated with the duration of ischaemia cannot hold the duration of
  // ischaemia constant while it asks: the covariate list is global and the
  // factors are per objective, so the same variable is a confounder of one
  // question and the subject of another.
  const outcomeMeasures = new Set(
    [facts.primary, ...facts.secondary].flatMap((c) => c.measures),
  );
  const estimated = new Set(chain.exposures.map((exposure) => exposure.measure));
  for (const covariate of named) {
    const variable = byName.get(covariate.measure);
    if (!variable) continue;
    if (set.some((c) => c.var === covariate.measure)) continue;
    if (outcomeMeasures.has(covariate.measure)) continue;
    if (estimated.has(covariate.measure)) continue;

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
  against: string,
): string {
  const family = base.split(",")[0].trim();
  const label = by ? (byName.get(by)?.label ?? by).toLowerCase() : "the covariate";
  const article = /^[aeiou]/.test(against) ? "an" : "a";
  return `${family} with ${article} ${against}-by-${label} interaction term`;
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

    // A whole diagnostic study, or one objective of any study that asks how
    // well something identifies its outcome.
    const asked = chainOfObjective(facts, objective.id);
    if (isDiagnostic(facts) || (asked && asksAccuracy(facts, asked))) {
      const row = diagnosticRow(facts, objective, explore, byName, skewed);
      if (row) rows.push(row);
      continue;
    }

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
    // Where the exact combination is not in the table, the nearest row for the
    // same data type is used and the gap is written down. Dropping the
    // objective instead was worse: it left a question in Section 1 with no
    // analysis, no table and nothing but a note to say so.
    let testRow = matchKey(tests(), `${dataType}/${shape}`);
    if (!testRow) {
      testRow =
        matchKey(tests(), `${dataType}/two_groups`) ??
        matchKey(tests(), `${dataType}/single`);
      todos.push(
        `${objective.id} asks about a ${dataType.replace(/_/g, " ")} outcome compared as ${shape.replace(/_/g, " ")}, which is not a combination the decision tables cover. The plan uses the nearest row for a ${dataType.replace(/_/g, " ")} outcome${testRow ? ` and names ${testRow["Unadjusted test"].toLowerCase()}` : ""}. Confirm the test, or name the one this design actually needs.`,
      );
    }
    if (!testRow) {
      todos.push(
        `${objective.id} has no test at all: nothing in the decision tables covers a ${dataType.replace(/_/g, " ")} outcome. Name the analysis.`,
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

    // A correlation is a pair, and a pair has two data types. Table B is keyed
    // on the outcome's alone, so every pairing with a binary outcome landed on
    // `binary/pair` and was reported as the phi coefficient - a measure between
    // two yes-or-no variables - for a MESS score, a serum lactate and a
    // duration in hours alike. Table B2 carries the other side's type.
    const partner = explore?.kind === "correlation" ? (explore.reuses[1] ?? "") : "";
    const paired = partner ? byName.get(partner) : undefined;
    // A correlation whose other side the study does not collect has no test to
    // name. S3-1 already blocks on the dangling name; the row takes the table's
    // stated fallback rather than the phi coefficient, which named a measure
    // between two yes-or-no variables for an injury severity score.
    const pairRow = explore?.kind === "correlation"
      ? matchKey(screens(), `${dataType}|${paired?.type ?? "*"}`)
      : null;
    if (explore?.kind === "correlation" && !paired) {
      todos.push(
        `${objective.id} correlates "${chain.what.toLowerCase()}" with ${partner.replace(/_/g, " ")}, which the study does not collect. Add it to the form or drop the question; until then the plan names the nearest test rather than the right one.`,
      );
    }
    // Whichever table the row came from, the skew rule is the same: where the
    // Facts Sheet already says a side is skewed, the rank test is the test and
    // not the fallback. `resolveSkew` reads decision table B's column names, so
    // a row from table B2 is handed over under them.
    const skewedHere =
      explore?.kind === "correlation"
        ? explore.reuses.some((n) => skewed.has(n))
        : chain.distribution === "skewed";
    const { test, fallback } = resolveSkew(
      skewedHere,
      pairRow
        ? { "Unadjusted test": pairRow.Test, "Unadjusted fallback": pairRow.Fallback ?? "" }
        : testRow,
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
      //
      // Counted against what this objective actually fits, not the Facts
      // Sheet's whole covariate list: a study naming thirteen factors fits four
      // of them in one model, and dividing its events by thirteen condemned
      // every model it has.
      const covariates = Math.max(
        adjustmentSet(facts, chain, objective, variables).length +
          chain.exposures.length,
        1,
      );
      const events =
        total !== null && chain.expected_frequency !== null
          ? chain.expected_frequency * total
          : null;
      const short = events !== null && events / covariates < 10;

      // An association keeps the risk-ratio family and is told to carry fewer
      // factors. Swapping the model instead answers a different question: a
      // penalised odds ratio where the protocol, the sample size and the title
      // all ask for a risk ratio. The shortfall is reported by S4-5 and by the
      // note below, which is what the investigator acts on.
      const tooFew = short && shape !== "exposure";
      if (short && shape === "exposure" && events !== null) {
        todos.push(
          `${objective.id} fits ${covariates} terms on about ${Math.round(events)} events, which is below the ten events per term every risk model needs. Carry the factors the univariate screen supports and say which they are, rather than entering all of them at once. The model family does not change.`,
        );
      }

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
    // An estimation objective is one that estimates a number and compares
    // nothing, which is a thing the reading now says outright. It used to be
    // inferred from the study having fewer than two groups, and a cohort study
    // asking which factors are associated with amputation has none: eleven
    // objectives took this exception, so eleven questions were answered with a
    // proportion and a confidence interval, and thirteen covariates the reading
    // had correctly found were never put in a model.
    const safety = isSafety(chain);
    const estimation = chain.kind === "estimation" || (shape === "single" && !chain.exposures.length);
    const exception = safety ? "safety" : estimation ? "estimation" : null;

    // An exploratory question is asked of the primary's outcome and not of its
    // factors, so the chain's exposures belong to the confirmatory row alone.
    // Appended to both, every exploratory row in a cohort study carried the
    // primary's three factors beside its own.
    const predictors = [
      ...(facts.groups.length >= 2 ? [ARM] : []),
      ...(explore ? [] : chain.exposures.map((exposure) => exposure.measure)),
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
          : shape === "exposure"
            ? screenOf(chain, byName, todos)
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
                ? interactionModel(
                    adjustedModel,
                    explore.reuses[1],
                    byName,
                    // What the effect is said to differ by. An arm where the
                    // study has arms; otherwise its first factor, because
                    // "an arm-by-fasciotomy interaction" names a term that
                    // does not exist in a single-cohort study.
                    facts.groups.length >= 2
                      ? ARM
                      : (chain.exposures[0]?.measure.replace(/_/g, " ") ?? "the exposure"),
                  )
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

/* ---- the unadjusted screen of an observational study -------------------- */

/**
 * One test per factor, each chosen by that factor's own data type.
 *
 * Decision table B is keyed on the outcome and the shape of the comparison,
 * which is enough where the comparison is an arm. Here the factors are of
 * different kinds - a duration in hours, a mechanism with two categories, an
 * anatomical level with several - and one row of table B cannot name a test for
 * all of them. Table B2 carries the factor's type in its key, and this reads it
 * once per factor and writes the sentence a footnote is made of.
 */
function screenOf(
  chain: OutcomeChain,
  byName: Map<string, Variable>,
  todos: string[],
): { test: string; fallback: string | null; table: string } {
  const named: string[] = [];
  const fallbacks: string[] = [];

  for (const exposure of chain.exposures) {
    const variable = byName.get(exposure.measure);
    const label = (variable?.label ?? exposure.measure.replace(/_/g, " ")).toLowerCase();
    const row = matchKey(screens(), `${chain.type}|${variable?.type ?? "continuous"}`);
    if (!row) continue;
    named.push(`${row.Test.toLowerCase()} for ${label}`);
    if (row.Fallback) fallbacks.push(row.Fallback.toLowerCase());
    // The last row of table B2 is a stated fallback, and a pairing it had to
    // catch is a pairing somebody should look at before the data arrive.
    if (row.Key === "*|*") {
      todos.push(
        `Name the test for ${label} against "${chain.what.toLowerCase()}". The decision tables have no row for a ${variable?.type ?? "measured"} factor against a ${chain.type.replace(/_/g, " ")} outcome, so the plan names the nearest one.`,
      );
    }
  }

  const sentence = named.length
    ? `One factor at a time: ${listed(named)}`
    : "One factor at a time, each by the test its data type owes";
  return {
    test: sentence,
    fallback: fallbacks.length ? [...new Set(fallbacks)].join("; ") : null,
    table: "",
  };
}

/* ---- the diagnostic accuracy branch ------------------------------------ */

const NUMBERS = ["continuous", "count", "ordinal"];

/** "a, b and c". */
const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * One row of the map for a diagnostic accuracy study.
 *
 * Kept apart from the loop above because almost nothing in that loop applies.
 * There is no exposure effect, so there is no adjusted model, no adjustment set,
 * no frequency-chosen risk model and no group term. What there is instead is
 * three kinds of question, told apart by facts the reading already records -
 * see `study/diagnostic.ts` - and each takes its test from the decision table
 * like every other row:
 *
 * - accuracy: each index test against the reference standard, from the
 *   `<index type>/diagnostic` row, with the areas compared where there are
 *   several index tests measured on the same people;
 * - correlation: each index test against a grade, from `ordinal/pair`;
 * - comparison: the index values between the reference standard's results,
 *   from `<type>/two_groups`.
 *
 * Before this, every one of them was a binary "outcome" analysed with the
 * accuracy row and calibration as its adjusted model, which gave the
 * correlation of a measurement with the Gleason score a two-by-two table.
 */
function diagnosticRow(
  facts: FactsSheet,
  objective: Objective,
  explore: ExploratoryOutcome | undefined,
  byName: Map<string, Variable>,
  skewed: Set<string>,
): AnalysisRow | null {
  const chain = explore ? facts.primary : chainOfObjective(facts, objective.id);
  if (!chain) return null;

  // Lower-cased at the first letter only: "Serum PSA" is "serum PSA" mid-sentence,
  // and lower-casing it whole wrote "adcp/adcref" for "ADCp/ADCref".
  const labelOf = (name: string) => {
    const text = byName.get(name)?.label ?? name.replace(/_/g, " ");
    return /^[A-Z]{2,}/.test(text) ? text : text[0].toLowerCase() + text.slice(1);
  };
  const typeOf = (name: string) => byName.get(name)?.type ?? "continuous";
  const reference = referenceOf(facts, chain);
  const unit = facts.unit_of_analysis.unit;
  const repeats = facts.unit_of_analysis.repeats_within_participant;
  // Several lesions from one man are not several men. The intervals of every
  // accuracy measure are too narrow unless the resampling keeps them together.
  const clustered = repeats
    ? `, with confidence intervals from a bootstrap that resamples participants, because one participant contributes more than one ${unit}`
    : "";

  const accuracy = (indexTests: string[]) => {
    const row = matchKey(tests(), `${typeOf(indexTests[0] ?? "")}/diagnostic`);
    const compared =
      indexTests.length > 1
        ? "; the areas under the curve of the index tests compared by DeLong's test for correlated curves, since every index test is read on the same participants"
        : "";
    return {
      test: `${row?.["Unadjusted test"] ?? "Sensitivity and specificity with exact binomial confidence intervals"}${compared}${clustered}`,
      fallback: row?.["Unadjusted fallback"] || null,
    };
  };
  const accuracyMeasure =
    matchKey(effectMeasures(), "diagnostic|binary")?.["Effect measure"] ?? "Sensitivity and specificity";

  let outcome = anchorOf(facts, chain);
  let predictors: string[] = [];
  let effect = accuracyMeasure;
  let unadjusted: { test: string; fallback: string | null };

  if (!explore) {
    const question = questionOf(chain);
    const indexTests = indexTestsOf(facts, chain);
    if (question === "accuracy") {
      predictors = indexTests;
      unadjusted = accuracy(indexTests);
    } else if (question === "correlation") {
      predictors = indexTests;
      const row = matchKey(tests(), "ordinal/pair");
      effect = "Correlation coefficient";
      unadjusted = {
        // The grade's label as written: it is usually a surname - Gleason,
        // Bethesda - and a first letter lower-cased reads as a typo.
        test: `${row?.["Unadjusted test"] ?? "Spearman rank correlation with a 95% confidence interval"}, for each index test with the ${byName.get(outcome)?.label ?? outcome}${clustered}`,
        fallback: null,
      };
    } else {
      predictors = [
        ...(reference ? [reference] : []),
        ...indexTests.filter((name) => name !== outcome),
      ];
      const results = byName.get(reference ?? "")?.options?.length ?? facts.groups.length;
      const row = matchKey(tests(), `${typeOf(outcome)}/${results > 2 ? "many_groups" : "two_groups"}`);
      const isSkewed = chain.distribution === "skewed" || skewed.has(outcome);
      const { test, fallback } = row ? resolveSkew(isSkewed, row) : { test: "", fallback: null };
      effect =
        matchKey(effectMeasures(), `other|${typeOf(outcome)}`)?.["Effect measure"] ?? "Mean difference";
      unadjusted = {
        test: `${test}, for each of ${listed(indexTests.map(labelOf))} between the results of ${reference ? labelOf(reference) : "the reference standard"}${clustered}`,
        fallback,
      };
    }
  } else {
    // Exploratory questions are asked of the primary's index tests.
    const indexTests = indexTestsOf(facts, facts.primary);
    const others = explore.reuses.slice(1);
    outcome = explore.reuses[0];
    predictors = others;
    if (explore.kind === "subgroup" || explore.kind === "interaction") {
      unadjusted = {
        test: `The area under the ROC curve of ${listed(indexTests.map(labelOf))}, with a DeLong interval, estimated separately within each category of ${listed(others.map(labelOf))}, and the areas compared between categories by a z-test for independent curves${clustered}`,
        fallback: null,
      };
    } else if (explore.kind === "derivation") {
      unadjusted = accuracy(others.length ? others : indexTests);
    } else {
      const numbers = others.filter((name) => NUMBERS.includes(typeOf(name)));
      const categories = others.filter((name) => !NUMBERS.includes(typeOf(name)));
      const against = reference ? labelOf(reference) : "the reference standard";
      const parts = [
        ...(numbers.length > 1
          ? [`Spearman rank correlation between ${listed(numbers.map(labelOf))}, with 95% confidence intervals`]
          : []),
        ...(numbers.length
          ? [`${listed(numbers.map(labelOf))} compared between the results of ${against} by the Mann-Whitney test`]
          : []),
        ...(categories.length
          ? [
              `${listed(categories.map(labelOf))} compared between the results of ${against} by the chi-square test, and ${labelOf(indexTests[0] ?? "the index test")} compared across their categories by the Mann-Whitney or Kruskal-Wallis test`,
            ]
          : []),
      ];
      const joined = parts.join("; ");
      effect = numbers.length > 1 ? "Correlation coefficient" : "Difference between the reference-standard results";
      unadjusted = {
        test: `${joined[0]?.toUpperCase() ?? ""}${joined.slice(1)}${clustered}`,
        fallback: numbers.length ? null : "Fisher's exact test where any expected count is below 5",
      };
    }
  }

  const variable = byName.get(outcome);
  return {
    objective: objective.id,
    outcome,
    predictors,
    data_type: variable?.type ?? chain.type,
    unit_of_analysis: `per ${unit}`,
    count: repeats ? `more than one ${unit} per participant` : "1 value per participant",
    expected_frequency: chain.expected_frequency,
    effect_measure: effect,
    absolute: null,
    unadjusted: { ...unadjusted, table: "" },
    adjusted: null,
    exception: "diagnostic",
  };
}
