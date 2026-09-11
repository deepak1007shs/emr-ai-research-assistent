/**
 * The closed lists every later step matches on.
 *
 * These are the words the decision tables are keyed by, so they are values and
 * not free text. A design family that arrives as prose matches no rule, and a
 * data type that arrives as "number" matches no row of decision table B; both
 * failures are silent, which is why the model is made to choose from a list
 * rather than to describe.
 *
 * Kept apart from the objects in `types.ts` because the rule files beside the
 * code (`analysis/tests.md` and the rest) are keyed by exactly these strings,
 * and a reader checking one against the other should have one short file to
 * read rather than a five-hundred-line model.
 */

/**
 * The design, as Stage 1 locks it.
 *
 * Inherited and never re-decided: rule R1. Every later step reads this and no
 * step revisits it, so a study whose design is wrong is wrong everywhere, which
 * is why Gate A refuses to pass one that is only a timing word.
 */
export type DesignFamily =
  | "randomised_trial"
  | "non_inferiority_trial"
  | "crossover_trial"
  | "cluster_trial"
  | "factorial_trial"
  | "non_randomised_interventional"
  | "cohort"
  | "case_control"
  | "cross_sectional"
  | "descriptive_epidemiology"
  | "diagnostic_accuracy"
  | "prognostic_model"
  | "agreement"
  | "qualitative"
  | "mixed_methods"
  | "systematic_review"
  | "economic_evaluation"
  | "case_report";

/** PICO for a study that assigns, PECO for one that observes (Stage 1.7). */
export type Frame = "PICO" | "PECO";

/**
 * What kind of thing an outcome is.
 *
 * Decision table B is keyed on this together with the comparison, so the list
 * is closed and every analysis variable must end up on one of these. `date` and
 * `text` exist for administrative variables, which are never analysed.
 */
export type DataType =
  | "continuous"
  | "count"
  | "binary"
  | "nominal"
  | "ordinal"
  | "date"
  | "text"
  | "time_to_event";

/** Which family an objective belongs to, and therefore which multiplicity rule. */
export type ObjectiveFamily = "primary" | "secondary" | "exploratory";

/**
 * Whether an objective asks for a value or for a shape.
 *
 * An outcome measured more than once gets both: a level question (the value at
 * a point, or the change) and a shape question (how fast it moves). Step 1.15
 * splits them, and check S1-4 refuses a repeated outcome that has only one.
 * A study that asks only the level answers "how much" and never "how fast",
 * which is the question a title promising a "rise" actually made.
 */
export type ObjectiveKind = "level" | "shape" | "single";

/** Where an objective came from, so a reader can tell a promise from a plan. */
export type ObjectiveSource = "objective" | "hypothesis" | "title_promise";

/**
 * What a variable is for, per objective.
 *
 * A variable holds one role per objective and not one role overall: baseline
 * haemoglobin is the outcome for one question and a covariate for another, and
 * a model with one role per variable cannot say that (§2 developer note).
 *
 * `descriptor` and `population_definition` were added because the CRF spec
 * needs them and Step 2's list had neither (gap G2): a baseline characteristic
 * shown so a reader can judge who the results apply to, and a variable that
 * exists only to decide who is in an analysis set.
 */
export type Role =
  | "outcome"
  | "exposure"
  | "covariate"
  | "derived"
  | "descriptor"
  | "population_definition"
  | "administrative";

/** The four blocks of Section 6, in the order they are printed. */
export type Block = "descriptive" | "primary" | "secondary" | "exploratory";

export const BLOCK_ORDER: Block[] = [
  "descriptive",
  "primary",
  "secondary",
  "exploratory",
];

/**
 * The six field types a CRF may use.
 *
 * Five are in the CRF format spec; `single_select_text` is the sixth, which the
 * reference form uses and the spec does not list (gap G8). It is the
 * "No / Yes -> specify:" pattern, and without it that pattern is drawn as a
 * free-text field that nobody can count.
 */
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "single_select"
  | "multi_select"
  | "single_select_text";

/**
 * Which pattern the printed form follows.
 *
 * The four-column table is the house default. A client with their own template
 * gets theirs, recorded at intake (Stage 0.7) and never chosen later.
 */
export type CrfPattern = "four_column" | "numbered_mcq";
