/**
 * The analysis model behind the Statistical Analysis Plan.
 *
 * This object owns the registries. Every variable and every outcome is declared
 * once, with an id and a single authoritative label, and the case report form
 * and the shell tables refer to those ids rather than repeating the words. Two
 * documents cannot disagree about a string that exists in one place.
 */

export type DataType =
  | "binary" | "continuous" | "ordinal" | "nominal" | "count" | "time_to_event";

/** What is being compared, which with the data type decides the test. */
export type Comparison =
  | "single_group"      // one proportion or one mean, estimated
  | "two_groups"        // converted versus completed
  | "many_groups"       // three or more
  | "association"       // outcome regressed on predictors
  | "adjusted"          // the same, with confounders held constant
  | "paired"            // before and after in the same patient
  | "correlation"
  | "agreement"
  | "descriptive";      // frequencies, no test

export type Role =
  | "outcome" | "predictor" | "confounder" | "effect_modifier"
  | "mediator" | "collider" | "descriptor";

/** The second classification every outcome carries, from the teaching slide. */
export type Domain =
  | "clinical" | "laboratory" | "radiological" | "functional"
  | "patient_reported" | "economic" | "composite";

export type Objective = {
  /** P1, P2, S1, S2... */
  id: string;
  tier: "primary" | "secondary";
  /** Phrased as a question. */
  question: string;
};

export type Variable = {
  /** var_age, var_bmi. Referenced by the form and the tables. */
  id: string;
  /** The single authoritative wording. Nothing else stores a copy. */
  label: string;
  data_type: DataType;
  unit_coding: string;
  role: Role;
  /** Why a mediator or collider is excluded, printed under the map. */
  exclusion_reason?: string;
};

/**
 * The five questions an outcome must answer, held as five fields rather than one
 * sentence. A sentence can silently omit one; five fields cannot.
 */
export type Outcome = {
  /** out_conversion. Referenced by analyses and by table rows. */
  id: string;
  /** What exactly will be measured. Also the outcome's authoritative label. */
  what: string;
  /** How it will be measured. */
  how: string;
  /** Using which instrument. */
  instrument: string;
  /** At what time. */
  when: string;
  /** In which units. */
  units: string;
  domain: Domain;
  /** The variables that measure it, by id. */
  source_variable_ids: string[];
};

export type AnalysisRow = {
  objective_id: string;
  /** "P1 - conversion rate" */
  label: string;
  /** The outcome this analyses, by id. */
  outcome_id: string;
  /** The predictors, by id. Empty for a single-group estimate. */
  predictor_ids: string[];
  data_type: DataType;
  comparison: Comparison;
  paired: boolean;
  /** True when the data are known to be skewed, which forces a rank test. */
  skewed?: boolean;
  /** T1, T2... the id of the table this fills. */
  table_id: string;
  /** The model may depart from the rule table, but must say why in public. */
  test_override?: string;
  override_reason?: string;
  /** Filled by chooseTest(); never by the model. */
  test?: string;
};

export type SapSpec = {
  title: string;
  design: string;
  guideline: string;
  aim: string;
  objectives: Objective[];
  variables: Variable[];
  outcomes: Outcome[];
  analyses: AnalysisRow[];
  /** Expected events, for the degrees-of-freedom note. */
  expected_events?: number;
  sample_size?: number;
};

/* ---- the registry lookups every document uses --------------------- */

export function variableIndex(spec: SapSpec): Map<string, Variable> {
  return new Map((spec.variables ?? []).map((v) => [v.id, v]));
}

export function outcomeIndex(spec: SapSpec): Map<string, Outcome> {
  return new Map((spec.outcomes ?? []).map((o) => [o.id, o]));
}

/** The authoritative label for a variable, or the id when it does not resolve. */
export function labelOf(spec: SapSpec, variableId: string): string {
  return variableIndex(spec).get(variableId)?.label ?? variableId;
}

/**
 * True when a stored plan carries the ids the case report form and the shell
 * tables link to. A plan built before the three documents were linked has
 * variables with a name and no id; building a form from it would produce a
 * document that only looks linked. Such a plan is rebuilt, not patched.
 */
export function isLinkable(spec: SapSpec | null | undefined): boolean {
  if (!spec) return false;
  const variables = spec.variables ?? [];
  const outcomes = spec.outcomes ?? [];
  if (!variables.length) return false;
  return variables.every((v) => Boolean(v?.id)) && outcomes.every((o) => Boolean(o?.id));
}

/**
 * Folds the five answers into one readable cell.
 *
 * Held as five fields so none can be quietly omitted, and joined here so the
 * table reads as a sentence rather than a form.
 */
export function outcomeCell(outcome: Outcome): string {
  const parts = [outcome.what];
  if (outcome.how && outcome.how !== outcome.what) parts.push(outcome.how);
  if (outcome.instrument) parts.push(`by ${outcome.instrument}`);
  if (outcome.when) parts.push(`at ${outcome.when}`);
  if (outcome.units) parts.push(`in ${outcome.units}`);
  return parts.join(", ");
}
