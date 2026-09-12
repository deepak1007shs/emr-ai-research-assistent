import type { FactsSheet, OutcomeChain, VariableName } from "./types.ts";
import { variableName } from "../variables/name.ts";

/**
 * What a diagnostic accuracy study's outcomes actually are.
 *
 * In a trial an outcome is a thing measured, and when its wording names no
 * single measure - "Change in haemoglobin" - it becomes a derived variable with
 * a recipe. In a diagnostic accuracy study the outcomes are not things measured
 * at all. They are relations among things measured: an index test against a
 * reference standard, an index test against a grade, an index value between
 * the reference standard's two results. Every one of them names measures the
 * study already records.
 *
 * The first real protocol through the rebuild - Dr Arunesh's study of
 * normalised ADC in prostate MRI - showed what the trial reading does to that.
 * Each objective became a derived variable named after its sentence
 * ("correlation_of_normalized_adc_with_histopathological_grading..."), every
 * one of them got the accuracy tables, and "the correlation of ADC with the
 * Gleason score" came out as a two-by-two, an accuracy table and a
 * calibration table. Fifteen of its twenty-nine tables were that.
 *
 * The rule here reads the answer off facts the model already records - the
 * outcome's type and the measures it lists - and not off its wording:
 *
 * | Outcome type | The question | The anchor |
 * |---|---|---|
 * | binary | how well each index test finds the reference standard | the reference standard |
 * | ordinal | how each index test tracks a grade | the grade |
 * | anything else | how the index values differ between the reference results | the first index value |
 *
 * Everything in this file is for diagnostic accuracy designs only. For every
 * other design the anchor is the outcome's own name, exactly as before.
 */

export type DiagnosticQuestion = "accuracy" | "correlation" | "comparison";

export const isDiagnostic = (facts: FactsSheet) => facts.design === "diagnostic_accuracy";

/**
 * Whether this outcome is asked how well something identifies it.
 *
 * A whole diagnostic study asks it of every objective; a cohort study can ask it
 * of one. "How accurately do MESS, GANGA, lactate and ischaemia time predict
 * amputation" is the second secondary objective of a trauma cohort, and keying
 * this branch on the design alone sent it to the risk-ratio rows: an area under
 * a curve reported as a relative risk, with no cut-off and no comparison of the
 * four curves.
 */
export const asksAccuracy = (facts: FactsSheet, chain: OutcomeChain) =>
  isDiagnostic(facts) || chain.kind === "accuracy";

const typeOf = (facts: FactsSheet, name: VariableName) =>
  facts.measures.find((m) => m.name === name)?.type;

/** Measured values that can be an index test: a number, a count, a grade. */
const INDEX_TYPES = ["continuous", "count", "ordinal"];

/** Which of the three questions an outcome of a diagnostic study asks. */
export function questionOf(chain: OutcomeChain): DiagnosticQuestion {
  if (chain.type === "binary") return "accuracy";
  if (chain.type === "ordinal") return "correlation";
  return "comparison";
}

/**
 * The reference standard: the binary measure that says who has the condition.
 *
 * Taken from the outcome's own measures first, and otherwise from the primary
 * outcome's, because a secondary question about index values between results
 * does not always list the reference standard it is split by.
 */
export function referenceOf(facts: FactsSheet, chain: OutcomeChain): VariableName | null {
  const binary = (c: OutcomeChain) =>
    c.measures.find((name) => typeOf(facts, name) === "binary") ?? null;
  return binary(chain) ?? binary(facts.primary);
}

/**
 * The variable an objective is about.
 *
 * For a diagnostic study, the measure the question is anchored on; for every
 * other design, the outcome's own name, which Step 2 turns into a variable.
 * Every step that links an objective to its variable calls this, so they
 * cannot disagree.
 */
export function anchorOf(facts: FactsSheet, chain: OutcomeChain): VariableName {
  if (!asksAccuracy(facts, chain)) return variableName(chain.what);
  const question = questionOf(chain);
  const wanted = question === "accuracy" ? "binary" : question === "correlation" ? "ordinal" : null;
  const found = wanted
    ? chain.measures.find((name) => typeOf(facts, name) === wanted)
    : chain.measures.find((name) => INDEX_TYPES.includes(typeOf(facts, name) ?? ""));
  return found ?? variableName(chain.what);
}

/**
 * The index tests an outcome evaluates: its measured values, other than the
 * anchor and the reference standard.
 */
export function indexTestsOf(facts: FactsSheet, chain: OutcomeChain): VariableName[] {
  // Where the outcome names its factors, they are the index tests. A diagnostic
  // study lists them among the outcome's measures; a cohort study asking an
  // accuracy question of one objective carries them as that outcome's
  // exposures, and its `measures` hold only the thing being identified.
  if (chain.exposures.length) {
    return chain.exposures
      .map((exposure) => exposure.measure)
      .filter((name) => INDEX_TYPES.includes(typeOf(facts, name) ?? ""));
  }
  const anchor = anchorOf(facts, chain);
  const reference = referenceOf(facts, chain);
  const measured = chain.measures.filter(
    (name) =>
      name !== reference && INDEX_TYPES.includes(typeOf(facts, name) ?? ""),
  );
  // For a comparison the anchor is itself an index value, and it is kept: the
  // question is about all of them.
  return questionOf(chain) === "comparison"
    ? measured
    : measured.filter((name) => name !== anchor);
}

/** What the Analysis Map says in place of an adjusted model. */
export const DIAGNOSTIC_NOTE =
  "Diagnostic question: estimated against the reference standard and not adjusted, because there is no exposure effect to hold anything constant for.";

/** How the groups are named: arms in a trial, results in a diagnostic study. */
export function groupWord(facts: FactsSheet): string {
  if (isDiagnostic(facts)) return "reference-standard result";
  const trials = [
    "randomised_trial", "non_inferiority_trial", "crossover_trial",
    "cluster_trial", "factorial_trial", "non_randomised_interventional",
  ];
  return trials.includes(facts.design) ? "arm" : "group";
}
