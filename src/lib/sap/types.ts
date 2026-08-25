/**
 * The analysis model behind the Statistical Analysis Plan.
 *
 * Small on purpose. It holds what the SAP's two sections need, and what the case
 * record form and shell tables will later read, so all three stay in step.
 */

export type DataType =
  | "binary" | "continuous" | "ordinal" | "nominal" | "count" | "time_to_event";

/** What is being compared, which with the data type decides the test. */
export type Comparison =
  | "single_group"      // one proportion or one mean, estimated
  | "two_groups"        // converted versus completed
  | "many_groups"       // three or more
  | "association"       // outcome regressed on predictors
  | "adjusted"          // the same, with confounders
  | "paired"            // before and after in the same patient
  | "correlation"
  | "agreement"
  | "descriptive";      // frequencies, no test

export type Role =
  | "outcome" | "predictor" | "confounder" | "effect_modifier"
  | "mediator" | "collider" | "descriptor";

export type Objective = {
  /** P1, P2, S1, S2... */
  id: string;
  tier: "primary" | "secondary";
  /** Phrased as a question. */
  question: string;
};

export type Variable = {
  name: string;
  data_type: DataType;
  unit_coding: string;
  role: Role;
  /** Why a mediator or collider is excluded, printed under the map. */
  exclusion_reason?: string;
};

export type AnalysisRow = {
  objective_id: string;
  /** "P1 - conversion rate" */
  label: string;
  /** The outcome with its five answers folded in: what, how, instrument, when, units. */
  outcome: string;
  /** "(single-group estimate)" when there are none. */
  predictors: string;
  data_type: DataType;
  comparison: Comparison;
  paired: boolean;
  /** Set to true when the data are known to be skewed, which forces a rank test. */
  skewed?: boolean;
  /** T3, T4... */
  table_ref: string;
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
  analyses: AnalysisRow[];
  /** Expected events, for the degrees-of-freedom note. */
  expected_events?: number;
  sample_size?: number;
};
